from flask import Blueprint, g, jsonify

from ..utils.auth import require_store

bp = Blueprint("me", __name__)


@bp.get("/api/me")
@require_store
def me():
    return jsonify({"success": True, "store_id": g.store_id, "store_name": g.store_name})