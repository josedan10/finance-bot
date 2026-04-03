import base64
import logging
import os
from io import BytesIO
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

reader: easyocr.Reader | None = None
EASYOCR_MODEL_STORAGE_DIRECTORY = os.environ.get("EASYOCR_MODULE_PATH", "/root/.EasyOCR")
MAX_IMAGE_DIMENSION = int(os.environ.get("OCR_MAX_IMAGE_DIMENSION", "1600"))
OCR_SENTRY_DSN = os.environ.get("OCR_SENTRY_DSN")
SENTRY_ENVIRONMENT = os.environ.get("SENTRY_ENVIRONMENT", "development")
SENTRY_RELEASE = os.environ.get("SENTRY_RELEASE")
SENTRY_TRACES_SAMPLE_RATE = float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0"))


if OCR_SENTRY_DSN:
    sentry_sdk.init(
        dsn=OCR_SENTRY_DSN,
        environment=os.environ.get("SENTRY_ENVIRONMENT") or os.environ.get("NODE_ENV") or "development",
        release=os.environ.get("SENTRY_RELEASE") or None,
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0")),
        integrations=[FastApiIntegration()],
        send_default_pii=False,
    )


def get_reader() -> easyocr.Reader:
    global reader

    if reader is None:
        reader = easyocr.Reader(["en", "es"], gpu=False, model_storage_directory=EASYOCR_MODEL_STORAGE_DIRECTORY)

    return reader


@app.on_event("startup")
async def preload_easyocr_models():
    get_reader()
    logger.info("OCR service startup complete", extra={"sentry_enabled": bool(OCR_SENTRY_DSN)})


@app.get("/health")
async def health():
    get_reader()
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


def preprocess_image_variants(img: Image.Image) -> Iterator[Image.Image]:
    base_image = ImageOps.exif_transpose(img).convert("RGB")
    limited_base = limit_image_size(base_image)
    width, height = limited_base.size

    if max(width, height) < 1000:
        upscale_factor = 1.5
        resized = limited_base.resize(
            (int(width * upscale_factor), int(height * upscale_factor)),
            Image.Resampling.LANCZOS,
        )
    else:
        resized = limited_base

    grayscale = ImageOps.grayscale(resized)
    autocontrast = ImageOps.autocontrast(grayscale)
    sharpened = autocontrast.filter(ImageFilter.SHARPEN)

    yield resized
    yield autocontrast
    yield sharpened


def extract_text_from_variants(img: Image.Image) -> str:
    detections: list[tuple[str, float]] = []
    ocr_reader = get_reader()

    for variant in preprocess_image_variants(img):
        variant_array = np.array(variant)
        results = ocr_reader.readtext(variant_array, detail=1, paragraph=False)
        del variant_array

        for result in results:
            if len(result) < 3:
                continue

            _, text, confidence = result
            normalized_text = " ".join(str(text).split()).strip()

            if not normalized_text:
                continue

            detections.append((normalized_text, float(confidence)))

        variant.close()

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

        if not isinstance(uploaded_image, UploadFile):
            raise HTTPException(status_code=400, detail="No receipt image file provided.")

        content = await read_upload_file(uploaded_image)
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded receipt image is empty.")

        return content, f"multipart:{uploaded_image.filename or 'upload'}"

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
        if reader is None:
            get_reader()

        content, source_type = await resolve_request_image(request)
        logger.info(
            "OCR image payload resolved",
            extra={
                "request_id": request_id,
                "source_type": source_type,
                "byte_length": len(content),
            },
        )

        with Image.open(BytesIO(content)) as img:
            text = extract_text_from_variants(img)
            metadata = extract_image_metadata(img)

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
