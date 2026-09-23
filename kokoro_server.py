from __future__ import annotations

import io
import threading
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from kokoro import KPipeline


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

HOST = "127.0.0.1"
PORT = 5001

# Kokoro official example uses:
#   lang_code='a'
#   voice='af_heart'
#
# 'a' = American English, 'b' = British English (Kokoro v1 language codes).
# `bf_emma` is the British English female voice. Configurable so it can be
# switched later without touching the pipeline code.
KOKORO_LANG_CODE = "b"
KOKORO_VOICE = "bf_emma"

LANG_CODE = KOKORO_LANG_CODE
DEFAULT_VOICE = KOKORO_VOICE

SAMPLE_RATE = 24000
MAX_TEXT_LENGTH = 5000


# ---------------------------------------------------------
# App / model
# ---------------------------------------------------------

app = FastAPI(title="Local Kokoro TTS Server")

print("Loading Kokoro model...")
pipeline = KPipeline(lang_code=LANG_CODE)
print("Kokoro model loaded.")

# Protect model inference from simultaneous requests.
generation_lock = threading.Lock()


# ---------------------------------------------------------
# Request schema
# ---------------------------------------------------------

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)
    voice: Optional[str] = DEFAULT_VOICE
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


# ---------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "engine": "kokoro",
        "voice": DEFAULT_VOICE,
        "sampleRate": SAMPLE_RATE,
    }


# ---------------------------------------------------------
# Text-to-speech endpoint
# ---------------------------------------------------------

@app.post("/tts")
def text_to_speech(request: TTSRequest):
    text = request.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")

    voice = request.voice or DEFAULT_VOICE

    try:
        chunks: list[np.ndarray] = []

        with generation_lock:
            generator = pipeline(
                text,
                voice=voice,
                speed=request.speed,
                split_pattern=r"\n+",
            )

            for _, _, audio in generator:
                if audio is None:
                    continue

                # Convert torch tensor / numpy array safely.
                if hasattr(audio, "detach"):
                    audio = audio.detach().cpu().numpy()

                audio = np.asarray(audio, dtype=np.float32).reshape(-1)

                if audio.size:
                    chunks.append(audio)

        if not chunks:
            raise RuntimeError("Kokoro produced no audio.")

        combined = np.concatenate(chunks)

        wav_buffer = io.BytesIO()

        sf.write(
            wav_buffer,
            combined,
            SAMPLE_RATE,
            format="WAV",
            subtype="PCM_16",
        )

        return Response(
            content=wav_buffer.getvalue(),
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store",
            },
        )

    except Exception as exc:
        print(f"Kokoro TTS error: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Kokoro failed to generate speech.",
        ) from exc


# ---------------------------------------------------------
# Local entry point
# ---------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
    )