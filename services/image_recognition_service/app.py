import asyncio
import base64
import logging
import multiprocessing as mp
import os
from io import BytesIO
from queue import Empty
from typing import Iterator

import easyocr
import numpy as np
import requests
import sentry_sdk
from fastapi import FastAPI, HTTPException, Request, UploadFile
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError
from PIL.ExifTags import TAGS
from pydantic import ValidationError
from sentry_sdk.integrations.fastapi import FastApiIntegration

app = FastAPI()
logger = logging.getLogger("zentra.ocr")
logging.basicConfig(level=os.environ.get("OCR_LOG_LEVEL", "INFO"))

EASYOCR_MODEL_STORAGE_DIRECTORY = os.environ.get("EASYOCR_MODULE_PATH", "/root/.EasyOCR")
MAX_IMAGE_DIMENSION = int(os.environ.get("OCR_MAX_IMAGE_DIMENSION", "1600"))
OCR_SENTRY_DSN = os.environ.get("OCR_SENTRY_DSN")
SENTRY_ENVIRONMENT = os.environ.get("SENTRY_ENVIRONMENT", "development")
SENTRY_RELEASE = os.environ.get("SENTRY_RELEASE")
SENTRY_TRACES_SAMPLE_RATE = float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0"))
OCR_READTEXT_TIMEOUT_SECONDS = int(os.environ.get("OCR_READTEXT_TIMEOUT_SECONDS", "40"))
OCR_ENABLE_EXTRA_VARIANTS = os.environ.get("OCR_ENABLE_EXTRA_VARIANTS", "false").lower() in ("1", "true", "yes", "on")


if OCR_SENTRY_DSN:
    sentry_sdk.init(
        dsn=OCR_SENTRY_DSN,
        environment=os.environ.get("SENTRY_ENVIRONMENT") or os.environ.get("NODE_ENV") or "development",
        release=os.environ.get("SENTRY_RELEASE") or None,
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0")),
        integrations=[FastApiIntegration()],
        send_default_pii=False,
    )


class OcrWorkerTimeoutError(Exception):
    pass


class OcrWorkerCrashedError(Exception):
    pass


def _ocr_readtext_worker(image_bytes: bytes, queue: mp.Queue, request_id: str | None = None) -> None:
    try:
        with Image.open(BytesIO(image_bytes)) as variant:
            variant_array = np.array(variant)

        local_reader = easyocr.Reader(["en", "es"], gpu=False, model_storage_directory=EASYOCR_MODEL_STORAGE_DIRECTORY)
        results = local_reader.readtext(variant_array, detail=1, paragraph=False)

        detections: list[tuple[str, float]] = []
        for result in results:
            if len(result) < 3:
                continue

            _, text, confidence = result
            normalized_text = " ".join(str(text).split()).strip()
            if not normalized_text:
                continue

            detections.append((normalized_text, float(confidence)))

        queue.put({"ok": True, "detections": detections})
    except Exception as exc:
        queue.put(
            {
                "ok": False,
                "error": str(exc),
                "error_type": type(exc).__name__,
                "request_id": request_id,
            }
        )


def run_readtext_isolated(variant: Image.Image, request_id: str | None, variant_index: int) -> list[tuple[str, float]]:
    buffer = BytesIO()
    variant.convert("RGB").save(buffer, format="PNG")
    payload = buffer.getvalue()

    context = mp.get_context("spawn")
    queue: mp.Queue = context.Queue()
    process = context.Process(
        target=_ocr_readtext_worker,
        args=(payload, queue, request_id),
        daemon=True,
    )
    process.start()

    try:
        process.join(timeout=OCR_READTEXT_TIMEOUT_SECONDS)

        if process.is_alive():
            process.terminate()
            process.join(timeout=5)
            raise OcrWorkerTimeoutError(
                f"OCR worker timed out after {OCR_READTEXT_TIMEOUT_SECONDS}s for variant {variant_index}."
            )

        if process.exitcode not in (0, None):
            raise OcrWorkerCrashedError(
                f"OCR worker crashed with exit code {process.exitcode} on variant {variant_index}."
            )

        try:
            result = queue.get(timeout=1)
        except Empty as exc:
            raise OcrWorkerCrashedError(
                f"OCR worker exited without returning detections for variant {variant_index}."
            ) from exc

        if not result.get("ok"):
            error_message = result.get("error", "Unknown OCR worker failure")
            error_type = result.get("error_type", "WorkerError")
            raise OcrWorkerCrashedError(f"{error_type}: {error_message}")

        detections = result.get("detections", [])
        normalized: list[tuple[str, float]] = []
        for text, confidence in detections:
            normalized_text = " ".join(str(text).split()).strip()
            if not normalized_text:
                continue
            normalized.append((normalized_text, float(confidence)))

        return normalized
    finally:
        queue.close()
        queue.join_thread()


@app.on_event("startup")
async def preload_easyocr_models():
    logger.info("OCR service startup complete", extra={"sentry_enabled": bool(OCR_SENTRY_DSN)})


@app.get("/health")
async def health():
    return {"status": "ok"}


def extract_image_metadata(img: Image.Image) -> dict:
    metadata: dict[str, str | None] = {
        "capturedAt": None,
        "deviceModel": None,
        "deviceMake": None,
    }

    exif = img.getexif()
    if not exif:
        return metadata

    exif_map = {TAGS.get(tag, str(tag)): value for tag, value in exif.items()}

    captured_at = exif_map.get("DateTimeOriginal") or exif_map.get("DateTime")
    device_model = exif_map.get("Model")
    device_make = exif_map.get("Make")

    metadata["capturedAt"] = str(captured_at) if captured_at else None
    metadata["deviceModel"] = str(device_model) if device_model else None
    metadata["deviceMake"] = str(device_make) if device_make else None

    return metadata


def limit_image_size(img: Image.Image) -> Image.Image:
    limited = img.copy()
    limited.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
    return limited


def preprocess_image_variants(img: Image.Image, request_id: str | None = None) -> Iterator[Image.Image]:
    base_image = ImageOps.exif_transpose(img).convert("RGB")
    limited_base = limit_image_size(base_image)
    width, height = limited_base.size

    logger.info(
        "OCR preprocessing base image",
        extra={
            "request_id": request_id,
            "width": width,
            "height": height,
            "mode": limited_base.mode,
        },
    )

    yield limited_base

    if not OCR_ENABLE_EXTRA_VARIANTS:
        return

    grayscale = ImageOps.grayscale(limited_base)
    autocontrast = ImageOps.autocontrast(grayscale)
    sharpened = autocontrast.filter(ImageFilter.SHARPEN)

    yield autocontrast
    yield sharpened


def extract_text_from_variants(img: Image.Image, request_id: str | None = None) -> str:
    detections: list[tuple[str, float]] = []

    for index, variant in enumerate(preprocess_image_variants(img, request_id=request_id), start=1):
        logger.info(
            "OCR variant processing started",
            extra={
                "request_id": request_id,
                "variant_index": index,
                "variant_mode": variant.mode,
                "variant_size": f"{variant.size[0]}x{variant.size[1]}",
            },
        )
        logger.info(
            "OCR readtext starting",
            extra={
                "request_id": request_id,
                "variant_index": index,
                "variant_mode": variant.mode,
                "variant_size": f"{variant.size[0]}x{variant.size[1]}",
            },
        )
        variant_detections = run_readtext_isolated(variant, request_id=request_id, variant_index=index)
        logger.info(
            "OCR readtext completed",
            extra={
                "request_id": request_id,
                "variant_index": index,
                "results_count": len(variant_detections),
            },
        )
        detections.extend(variant_detections)

    if not detections:
        return ""

    merged_lines: list[str] = []
    best_by_line: dict[str, float] = {}

    for text, confidence in detections:
        lowered_line = text.lower()
        if lowered_line not in best_by_line or confidence > best_by_line[lowered_line]:
            best_by_line[lowered_line] = confidence

    for text, _ in detections:
        lowered_line = text.lower()
        if lowered_line not in best_by_line:
            continue
        merged_lines.append(text)
        del best_by_line[lowered_line]

    return "\n".join(merged_lines)


def load_image_bytes(image_source: str) -> bytes:
    if image_source.startswith("data:image/"):
        try:
            _, encoded_image = image_source.split(",", 1)
        except ValueError as exc:
            raise ValueError("Invalid base64 image payload.") from exc

        return base64.b64decode(encoded_image)

    response = requests.get(image_source, stream=True, timeout=30)
    response.raise_for_status()
    return response.content


async def read_upload_file(upload: UploadFile) -> bytes:
    content = await upload.read()
    await upload.close()
    return content


async def resolve_request_image(request: Request) -> tuple[bytes, str]:
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        uploaded_image = form.get("image")

        logger.info(
            "OCR multipart form parsed",
            extra={
                "request_id": request.headers.get("x-request-id"),
                "form_keys": list(form.keys()),
                "image_field_type": type(uploaded_image).__name__ if uploaded_image is not None else None,
            },
        )

        if uploaded_image is None:
            raise HTTPException(status_code=400, detail="No receipt image file provided.")

        if isinstance(uploaded_image, str):
            raise HTTPException(status_code=400, detail="Receipt image field must be a file upload.")

        if not hasattr(uploaded_image, "read"):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported multipart image field type: {type(uploaded_image).__name__}",
            )

        content = await read_upload_file(uploaded_image)
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded receipt image is empty.")

        filename = getattr(uploaded_image, "filename", None) or "upload"
        return content, f"multipart:{filename}"

    try:
        payload = await request.json()
    except (ValueError, ValidationError) as exc:
        raise HTTPException(status_code=400, detail="Invalid OCR request payload.") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid OCR request payload.")

    image_source = payload.get("image")
    if not isinstance(image_source, str) or not image_source.strip():
        raise HTTPException(status_code=400, detail="No image provided.")

    return load_image_bytes(image_source), "json:image-source"


@app.post("/extract-text")
@app.post("/extract-text/")
async def extract_text(request: Request):
    request_id = request.headers.get("x-request-id")
    content_length = request.headers.get("content-length")
    content_type = request.headers.get("content-type")

    logger.info(
        "OCR request received",
        extra={
            "request_id": request_id,
            "content_type": content_type,
            "content_length": content_length,
        },
    )

    try:
        content, source_type = await resolve_request_image(request)
        logger.info(
            "OCR image payload resolved",
            extra={
                "request_id": request_id,
                "source_type": source_type,
                "byte_length": len(content),
            },
        )

        logger.info(
            "OCR opening image bytes",
            extra={
                "request_id": request_id,
                "byte_length": len(content),
                "source_type": source_type,
            },
        )

        with Image.open(BytesIO(content)) as img:
            logger.info(
                "OCR image opened",
                extra={
                    "request_id": request_id,
                    "image_mode": img.mode,
                    "image_size": f"{img.size[0]}x{img.size[1]}",
                    "image_format": img.format,
                },
            )
            processed = img.copy()
            metadata = extract_image_metadata(img)
        try:
            text = await asyncio.to_thread(extract_text_from_variants, processed, request_id)
        finally:
            processed.close()

        if not text:
            raise HTTPException(status_code=422, detail="No text found in the image. Try to improve the image quality.")

        return {"text": text, "metadata": metadata}
    except HTTPException as exc:
        log_method = logger.error if exc.status_code >= 500 else logger.warning
        log_method(
            "OCR request failed",
            extra={
                "request_id": request_id,
                "status_code": exc.status_code,
                "detail": exc.detail,
                "content_type": content_type,
                "content_length": content_length,
            },
        )
        if exc.status_code >= 500 and OCR_SENTRY_DSN:
            sentry_sdk.capture_exception(exc)
        raise
    except UnidentifiedImageError as exc:
        logger.warning(
            "OCR received unsupported image payload",
            extra={
                "request_id": request_id,
                "content_type": content_type,
                "content_length": content_length,
            },
        )
        raise HTTPException(status_code=415, detail="Unsupported or corrupted image file.") from exc
    except OcrWorkerTimeoutError as exc:
        logger.error(
            "OCR worker timed out | request_id=%s | timeout_seconds=%s | content_type=%s | content_length=%s | error=%s",
            request_id,
            OCR_READTEXT_TIMEOUT_SECONDS,
            content_type,
            content_length,
            str(exc),
        )
        if OCR_SENTRY_DSN:
            sentry_sdk.capture_exception(exc)
        raise HTTPException(
            status_code=503,
            detail="OCR processing timed out. Please retry with a clearer or smaller image.",
        ) from exc
    except OcrWorkerCrashedError as exc:
        logger.error(
            "OCR worker crashed during extraction | request_id=%s | content_type=%s | content_length=%s | error=%s",
            request_id,
            content_type,
            content_length,
            str(exc),
        )
        if OCR_SENTRY_DSN:
            sentry_sdk.capture_exception(exc)
        raise HTTPException(
            status_code=503,
            detail="OCR engine failed while processing the image. Please retry.",
        ) from exc
    except Exception as exc:
        logger.exception(
            "Unexpected OCR extraction failure",
            extra={
                "request_id": request_id,
                "content_type": content_type,
                "content_length": content_length,
            },
        )
        if OCR_SENTRY_DSN:
            with sentry_sdk.push_scope() as scope:
                scope.set_tag("service", "ocr")
                if request_id:
                    scope.set_tag("request_id", request_id)
                    scope.set_extra("request_id", request_id)
                scope.set_extra("content_type", content_type)
                scope.set_extra("content_length", content_length)
                sentry_sdk.capture_exception(exc)
                sentry_sdk.flush(timeout=2.0)
        raise HTTPException(status_code=500, detail="Failed to process receipt image.") from exc
