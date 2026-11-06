from flask import Blueprint, jsonify, request

from ..services import gnani_prisma
from ..services.gnani_prisma import GnaniError
from ..utils.auth import require_store
from ..utils.errors import api_error

bp = Blueprint("voice", __name__)


@bp.post("/api/voice/transcribe")
@require_store
def transcribe():
    f = request.files.get("audio")
    if f is None:
        return api_error("MISSING_AUDIO", "Send the recording in a form field named 'audio'.", 400)

    audio = f.read()
    if not audio:
        return api_error("EMPTY_AUDIO", "The recording is empty.", 400)

    lang = request.form.get("lang", "auto")

    try:
        result = gnani_prisma.transcribe(
            audio, f.filename or "audio.wav", f.mimetype or "audio/wav", lang
        )
    except GnaniError as e:
        return api_error(e.code, str(e), e.status)

    return jsonify({"success": True, **result})