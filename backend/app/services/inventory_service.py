import requests
from flask import current_app


class InventoryError(Exception):
    pass


class ConfirmError(Exception):
    def __init__(self, raw: str):
        super().__init__(raw)
        self.raw = raw


def _base_and_key():
    cfg = current_app.config
    return cfg["SUPABASE_URL"].rstrip("/"), cfg["SUPABASE_SERVICE_ROLE_KEY"]


def fetch_products(store_id: str) -> list[dict]:
    base, key = _base_and_key()
    try:
        r = requests.get(
            f"{base}/rest/v1/products",
            params={
                "store_id": f"eq.{store_id}",
                "select": "id,name,price,unit,stock_quantity,aliases",
                "order": "name",
            },
            headers={"apikey": key},
            timeout=10,
        )
    except requests.RequestException:
        raise InventoryError("Could not reach the database.")
    if r.status_code != 200:
        raise InventoryError("Could not load products.")
    return r.json()


def confirm_order(store_id, idempotency_key, customer_name, language, items):
    base, key = _base_and_key()
    try:
        r = requests.post(
            f"{base}/rest/v1/rpc/confirm_order",
            headers={"apikey": key, "Content-Type": "application/json"},
            json={
                "p_store_id": store_id,
                "p_idempotency_key": idempotency_key,
                "p_customer_name": customer_name or None,
                "p_language": language or None,
                "p_discount": 0,
                "p_items": items,
            },
            timeout=15,
        )
    except requests.RequestException:
        raise InventoryError("Could not reach the database.")

    if r.status_code == 200:
        return r.json()

    try:
        raw = str(r.json().get("message", ""))
    except ValueError:
        raw = ""
    print("CONFIRM_ORDER FAILED:", r.status_code, raw[:200], flush=True)
    raise ConfirmError(raw)