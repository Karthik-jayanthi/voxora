from flask import Blueprint, g, jsonify, request

from ..services import inventory_service
from ..services.billing_service import money
from ..services.inventory_service import ConfirmError, InventoryError
from ..services.order_parser import parse_transcript, validate_items
from ..utils.auth import require_store
from ..utils.errors import api_error

bp = Blueprint("orders", __name__)


def _respond(raw_items, products):
    items, subtotal, can_confirm = validate_items(raw_items, products)
    return jsonify({
        "success": True,
        "items": items,
        "subtotal": money(subtotal),
        "can_confirm": can_confirm,
    })


def _confirm_failure(raw: str):
    parts = raw.split(":")
    code = parts[0]
    if code == "INSUFFICIENT_STOCK" and len(parts) >= 3:
        name = ":".join(parts[1:-1])
        return code, f"Not enough {name} in stock. Available: {parts[-1]}. Nothing was saved.", 409
    if code == "PRODUCT_NOT_FOUND":
        return code, "A product in this order no longer exists. Refresh and try again.", 409
    if code in ("NO_ITEMS", "INVALID_QUANTITY", "INVALID_DISCOUNT", "MISSING_IDEMPOTENCY_KEY"):
        return code, "The order details were not valid.", 400
    return "ORDER_FAILED", "The order could not be saved. Nothing was changed. Try again.", 502


def _clean_items(data):
    items = data.get("items")
    if not isinstance(items, list) or not items or len(items) > 50 or not all(isinstance(i, dict) for i in items):
        return None
    return items


@bp.post("/api/orders/parse")
@require_store
def parse():
    data = request.get_json(silent=True) or {}
    transcript = str(data.get("transcript", "")).strip()
    if not transcript:
        return api_error("EMPTY_TRANSCRIPT", "There is no text to read an order from.", 400)
    if len(transcript) > 2000:
        return api_error("TRANSCRIPT_TOO_LONG", "The text is too long.", 400)

    try:
        products = inventory_service.fetch_products(g.store_id)
    except InventoryError as e:
        return api_error("DB_ERROR", str(e), 502)

    return _respond(parse_transcript(transcript, products), products)


@bp.post("/api/orders/validate")
@require_store
def validate():
    data = request.get_json(silent=True) or {}
    items = data.get("items")
    if not isinstance(items, list) or len(items) > 50 or not all(isinstance(i, dict) for i in items):
        return api_error("INVALID_ITEMS", "Send up to 50 items as a list.", 400)

    try:
        products = inventory_service.fetch_products(g.store_id)
    except InventoryError as e:
        return api_error("DB_ERROR", str(e), 502)

    return _respond(items, products)


@bp.post("/api/orders")
@require_store
def confirm():
    data = request.get_json(silent=True) or {}

    key = str(data.get("idempotency_key", "")).strip()
    if not (8 <= len(key) <= 100):
        return api_error("INVALID_KEY", "Missing order key. Refresh the page and try again.", 400)

    raw_items = _clean_items(data)
    if raw_items is None:
        return api_error("INVALID_ITEMS", "Send between 1 and 50 items.", 400)

    customer = str(data.get("customer_name") or "").strip()[:100]
    language = str(data.get("language") or "").strip()[:20]

    try:
        products = inventory_service.fetch_products(g.store_id)
    except InventoryError as e:
        return api_error("DB_ERROR", str(e), 502)

    # prices, units and stock are re-checked here; the browser's numbers are never trusted
    items, _subtotal, can_confirm = validate_items(raw_items, products)
    if not can_confirm:
        return api_error("ORDER_NOT_READY", "Fix the flagged items before confirming.", 422)

    payload = [{"product_id": i["product_id"], "quantity": i["quantity"]} for i in items]

    try:
        result = inventory_service.confirm_order(g.store_id, key, customer, language, payload)
    except ConfirmError as e:
        code, message, status = _confirm_failure(e.raw)
        return api_error(code, message, status)
    except InventoryError as e:
        return api_error("DB_ERROR", str(e), 502)

    return jsonify({"success": True, **result})