import requests
from flask import current_app

LANG_HINTS = {"en": "en-IN", "te": "te-IN,en-IN", "kn": "kn-IN,en-IN"}


class GnaniError(Exception):
    def __init__(self, message, status=502, code="GNANI_ERROR"):
        super().__init__(message)
        self.status = status
        self.code = code


def transcribe(audio_bytes, filename, content_type, lang="auto"):
    cfg = current_app.config
    if not cfg["GNANI_API_KEY"]:
        raise GnaniError("Gnani API key is not configured", 500, "NO_API_KEY")

    language_code = LANG_HINTS.get(lang, "indic-auto")

    try:
        r = requests.post(
            cfg["GNANI_STT_URL"],
            headers={"X-API-Key-ID": cfg["GNANI_API_KEY"]},
            files={"audio_file": (filename, audio_bytes, content_type)},
            data={
                "model": "prisma-v3.0",
                "language_code": language_code,
                "format": "transcribe",
            },
            timeout=30,
        )
    except requests.Timeout:
        raise GnaniError("Gnani speech service timed out", 504, "TIMEOUT")
    except requests.RequestException:
        raise GnaniError("Could not reach Gnani speech service", 502, "UNREACHABLE")

    try:
        body = r.json()
    except ValueError:
        body = {}

    if r.status_code != 200:
        detail = body.get("detail") if isinstance(body.get("detail"), dict) else {}
        err = body.get("error") if isinstance(body.get("error"), dict) else {}
        code = detail.get("error_code") or err.get("type") or body.get("code") or "GNANI_ERROR"
        msg = detail.get("message") or err.get("message") or body.get("message") or "Gnani request failed"
        status = r.status_code if 400 <= r.status_code < 600 else 502
        if status in (401, 403):
            status = 502  # our own login errors must not be confused with Gnani key errors
        raise GnaniError(msg, status, code)

    return {
        "transcript": body.get("transcript", ""),
        "detected_language_code": body.get("detected_language_code"),
        "truncated": bool(body.get("truncated")),
        "model": body.get("model"),
    }