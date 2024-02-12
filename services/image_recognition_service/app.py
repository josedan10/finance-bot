# app.py
from fastapi import FastAPI, HTTPException
from PIL import Image
import pytesseract
from io import BytesIO
import requests
from pydantic import BaseModel

app = FastAPI()

class ImageData(BaseModel):
    image: str

@app.post("/extract-text/")
async def extract_text(image: ImageData):
    try:
        response = requests.get(image.image, stream=True)
        content = response.content
        img = Image.open(BytesIO(content))
        text = pytesseract.image_to_string(img, lang="spa")

        if not text:
            raise HTTPException(status_code=404, detail="No text found in the image. Try to improve the image quality.")

        return {"text": text}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))
