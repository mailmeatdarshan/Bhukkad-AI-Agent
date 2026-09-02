"""Speech-to-text across providers. The browser provider is handled client-side
(Web Speech API); here we serve OpenAI, Gemini, and ElevenLabs.

Input audio is transcoded to 16 kHz mono WAV first so every provider gets a
format it accepts. Returns transcript + asr_ms.
"""
from __future__ import annotations

import base64
import os
import time

import httpx

from app import audio

_TIMEOUT = httpx.Timeout(60.0, connect=10.0)

PROVIDERS = ("openai", "gemini", "elevenlabs")
_OPENAI_MODEL = "gpt-4o-transcribe"
_GEMINI_MODEL = "gemini-2.5-flash"
_ELEVEN_MODEL = "scribe_v1"


def _key(provider: str, override: str | None) -> str:
    env = {"openai": "OPENAI_API_KEY", "gemini": "GEMINI_API_KEY", "elevenlabs": "ELEVENLABS_API_KEY"}[provider]
    key = override or os.getenv(env)
    if not key:
        raise RuntimeError(f"Missing {provider} API key for ASR.")
    return key


def _openai(wav: bytes, key: str) -> str:
    r = httpx.post(
        "https://api.openai.com/v1/audio/transcriptions",
        headers={"Authorization": f"Bearer {key}"},
        files={"file": ("audio.wav", wav, "audio/wav")},
        data={"model": _OPENAI_MODEL, "response_format": "json"},
        timeout=_TIMEOUT,
    )
    if r.status_code != 200:
        raise RuntimeError(f"OpenAI ASR error {r.status_code}: {r.text[:200]}")
    return r.json().get("text", "").strip()


def _elevenlabs(wav: bytes, key: str) -> str:
    r = httpx.post(
        "https://api.elevenlabs.io/v1/speech-to-text",
        headers={"xi-api-key": key},
        files={"file": ("audio.wav", wav, "audio/wav")},
        data={"model_id": _ELEVEN_MODEL},
        timeout=_TIMEOUT,
    )
    if r.status_code != 200:
        raise RuntimeError(f"ElevenLabs ASR error {r.status_code}: {r.text[:200]}")
    return r.json().get("text", "").strip()


def _gemini(wav: bytes, key: str) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{_GEMINI_MODEL}:generateContent?key={key}"
    body = {
        "contents": [{"role": "user", "parts": [
            {"text": "Transcribe this audio verbatim. Return only the transcript text."},
            {"inline_data": {"mime_type": "audio/wav", "data": base64.b64encode(wav).decode()}},
        ]}]
    }
    r = httpx.post(url, json=body, timeout=_TIMEOUT)
    if r.status_code != 200:
        raise RuntimeError(f"Gemini ASR error {r.status_code}: {r.text[:200]}")
    cand = (r.json().get("candidates") or [{}])[0]
    parts = cand.get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts).strip()


def transcribe(raw_audio: bytes, provider: str, api_key: str | None = None) -> dict:
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown ASR provider '{provider}'. Use one of {PROVIDERS}.")
    t0 = time.perf_counter()
    wav = audio.to_wav(raw_audio)
    key = _key(provider, api_key)
    text = {"openai": _openai, "gemini": _gemini, "elevenlabs": _elevenlabs}[provider](wav, key)
    return {"text": text, "asr_ms": round((time.perf_counter() - t0) * 1000.0, 2), "provider": provider}
