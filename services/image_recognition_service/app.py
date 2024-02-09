# app.py
from fastapi import FastAPI, File, UploadFile, HTTPException
from PIL import Image
import pytesseract
from io import BytesIO

app = FastAPI()

@app.post("/extract_text/")
async def extract_text(image: UploadFile = File(...)):
    try:
        content = await image.read()
        img = Image.open(BytesIO(content))
        text = pytesseract.image_to_string(img, lang="spa")

        if not text:
            raise HTTPException(status_code=404, detail="No text found in the image. Try to improve the image quality.")

        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
