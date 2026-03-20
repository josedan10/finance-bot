FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive \
    EASYOCR_MODULE_PATH=/root/.EasyOCR

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN pip install --upgrade pip \
  && pip install -r requirements.txt \
  && mkdir -p "$EASYOCR_MODULE_PATH/model" \
  && python -c "import easyocr; easyocr.Reader(['en','es'], gpu=False, model_storage_directory='$EASYOCR_MODULE_PATH')"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "4000"]
