import base64

from flask import Blueprint, g, jsonify, request

from ..services import gnani_prisma, gnani_timbre, inventory_service
from ..services.gnani_prisma import GnaniError
from ..services.inventory_service import InventoryError
from ..services.order_parser import validate_items
from ..services.spoken_text import LANG_CODES, build_confirmation_text
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


@bp.post("/api/voice/synthesize")
@require_store
def synthesize():
    data = request.get_json(silent=True) or {}

    items = data.get("items")
    if not isinstance(items, list) or not items or len(items) > 50 or not all(isinstance(i, dict) for i in items):
        return api_error("INVALID_ITEMS", "Send between 1 and 50 items.", 400)

    lang = data.get("language")
    if lang not in LANG_CODES:
        lang = "en"

    try:
        products = inventory_service.fetch_products(g.store_id)
    except InventoryError as e:
        return api_error("DB_ERROR", str(e), 502)

    # the spoken sentence is built here from checked data, never from text sent by the browser
    results, subtotal, ok = validate_items(items, products)
    if not ok:
        return api_error("ORDER_NOT_READY", "Fix the flagged items before reading the order aloud.", 422)

    text = build_confirmation_text(results, subtotal, lang)

    try:
        audio = gnani_timbre.synthesize(text, lang)
    except GnaniError as e:
        return api_error(e.code, str(e), e.status)

    return jsonify({
        "success": True,
        "text": text,
        "language": lang,
        "mime": "audio/wav",
        "audio_base64": base64.b64encode(audio).decode("ascii"),
    })