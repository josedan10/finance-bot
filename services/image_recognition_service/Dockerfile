FROM python:3.11

ENV PYHTONUNBUFFERED=1
RUN apt-get update \
  && apt-get -y install tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa -y \
  && apt-get -y install ffmpeg libsm6 libxext6 -y

WORKDIR /app

COPY . .

RUN pip install -r requirements.txt

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "4000", "--reload"]
