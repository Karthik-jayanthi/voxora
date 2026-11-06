from flask import Blueprint, current_app, jsonify

bp = Blueprint("health", __name__)


@bp.get("/api/health")
def health():
    cfg = current_app.config
    return jsonify(
        {
            "status": "ok",
            "gnani_key_configured": bool(cfg["GNANI_API_KEY"]),
            "supabase_configured": bool(cfg["SUPABASE_URL"] and cfg["SUPABASE_SERVICE_ROLE_KEY"]),
        }
    )