from flask import Blueprint, jsonify, request

from ..services import gnani_prisma
from ..services.gnani_prisma import GnaniError

bp = Blueprint("voice", __name__)


def _error(type_, message, status):
    return jsonify({"success": False, "error": {"type": type_, "message": message}}), status


@bp.post("/api/voice/transcribe")
def transcribe():
    f = request.files.get("audio")
    if f is None:
        return _error("MISSING_AUDIO", "Send the recording in a form field named 'audio'.", 400)

    audio = f.read()
    if not audio:
        return _error("EMPTY_AUDIO", "The recording is empty.", 400)

    lang = request.form.get("lang", "auto")

    try:
        result = gnani_prisma.transcribe(
            audio, f.filename or "audio.wav", f.mimetype or "audio/wav", lang
        )
    except GnaniError as e:
        return _error(e.code, str(e), e.status)

    return jsonify({"success": True, **result})