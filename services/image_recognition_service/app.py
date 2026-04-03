# app.py
import base64
import os
from io import BytesIO
from typing import Iterator

import easyocr
import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image, ImageFilter, ImageOps
from PIL.ExifTags import TAGS
from pydantic import BaseModel
import requests
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

app = FastAPI()
reader: easyocr.Reader | None = None
EASYOCR_MODEL_STORAGE_DIRECTORY = os.environ.get("EASYOCR_MODULE_PATH", "/root/.EasyOCR")
MAX_IMAGE_DIMENSION = int(os.environ.get("OCR_MAX_IMAGE_DIMENSION", "1600"))
SENTRY_DSN = os.environ.get("SENTRY_DSN")
SENTRY_ENVIRONMENT = os.environ.get("SENTRY_ENVIRONMENT", "development")
SENTRY_RELEASE = os.environ.get("SENTRY_RELEASE")
SENTRY_TRACES_SAMPLE_RATE = float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0"))

if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=SENTRY_ENVIRONMENT,
        release=SENTRY_RELEASE,
        integrations=[FastApiIntegration()],
        traces_sample_rate=SENTRY_TRACES_SAMPLE_RATE,
    )
    sentry_sdk.set_tag("service", "ocr-image-recognition")

class ImageData(BaseModel):
    image: str


def get_reader() -> easyocr.Reader:
    global reader

    if reader is None:
        reader = easyocr.Reader(["en", "es"], gpu=False, model_storage_directory=EASYOCR_MODEL_STORAGE_DIRECTORY)

    return reader


@app.on_event("startup")
async def preload_easyocr_models():
    get_reader()


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


@app.post("/extract-text")
@app.post("/extract-text/")
async def extract_text(image: ImageData):
    try:
        if reader is None:
            get_reader()
        content = load_image_bytes(image.image)
        with Image.open(BytesIO(content)) as img:
            text = extract_text_from_variants(img)
            metadata = extract_image_metadata(img)

        if not text:
            raise HTTPException(status_code=404, detail="No text found in the image. Try to improve the image quality.")

        return {"text": text, "metadata": metadata}
    except Exception as e:
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("ocr.endpoint", "extract-text")
            scope.set_extra("has_image_payload", bool(image.image))
            scope.set_extra("image_payload_length", len(image.image) if image.image else 0)
            scope.set_extra("is_data_url", image.image.startswith("data:image/"))
            sentry_sdk.capture_exception(e)
        print(e)
        raise HTTPException(status_code=500, detail=str(e))
