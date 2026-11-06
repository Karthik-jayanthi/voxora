import requests
from flask import current_app

from .gnani_prisma import GnaniError
from .spoken_text import LANG_CODES

VOICE = "Shivani"  # verified for en-IN, te-IN and kn-IN with scripts/test_gnani.py


def synthesize(text: str, lang: str) -> bytes:
    cfg = current_app.config
    if not cfg["GNANI_API_KEY"]:
        raise GnaniError("Gnani API key is not configured", 500, "NO_API_KEY")

    try:
        r = requests.post(
            cfg["GNANI_TTS_URL"],
            headers={"X-API-Key-ID": cfg["GNANI_API_KEY"], "Content-Type": "application/json"},
            json={
                "text": text,
                "voice": VOICE,
                "model": "timbre-v3.0",
                "language": LANG_CODES.get(lang, "en-IN"),
                "speed": 1.0,
                "audio_config": {"container": "wav", "sample_rate": 24000},
            },
            timeout=30,
        )
    except requests.Timeout:
        raise GnaniError("Gnani voice service timed out", 504, "TIMEOUT")
    except requests.RequestException:
        raise GnaniError("Could not reach Gnani voice service", 502, "UNREACHABLE")

    if r.status_code != 200:
        try:
            body = r.json()
        except ValueError:
            body = {}
        detail = body.get("detail") if isinstance(body.get("detail"), dict) else {}
        err = body.get("error") if isinstance(body.get("error"), dict) else {}
        code = detail.get("error_code") or err.get("type") or body.get("code") or "GNANI_ERROR"
        msg = detail.get("message") or err.get("message") or body.get("message") or "Gnani voice request failed"
        status = r.status_code if 400 <= r.status_code < 600 else 502
        if status in (401, 403):
            status = 502  # our own login errors must not be confused with Gnani key errors
        raise GnaniError(msg, status, code)

    if len(r.content) < 100:
        raise GnaniError("Gnani returned no audio", 502, "EMPTY_AUDIO")
    return r.content