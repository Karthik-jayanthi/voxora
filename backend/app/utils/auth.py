import functools

import requests
from flask import current_app, g, request

from .errors import api_error


def require_store(fn):
    """Checks the Supabase login token and finds the store that belongs to that user."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return api_error("UNAUTHENTICATED", "Please log in.", 401)
        token = header[7:].strip()

        cfg = current_app.config
        base = cfg["SUPABASE_URL"].rstrip("/")
        key = cfg["SUPABASE_SERVICE_ROLE_KEY"]
        if not base or not key:
            return api_error("SERVER_MISCONFIGURED", "Supabase is not configured on the server.", 500)

        try:
            u = requests.get(
                f"{base}/auth/v1/user",
                headers={"apikey": key, "Authorization": f"Bearer {token}"},
                timeout=10,
            )
        except requests.RequestException:
            return api_error("AUTH_UNAVAILABLE", "Could not reach the login service.", 503)
        if u.status_code != 200:
            print("SUPABASE AUTH CHECK FAILED:", u.status_code, u.text[:300], flush=True)
            return api_error("UNAUTHENTICATED", "Your session is invalid or expired. Log in again.", 401)

        user_id = u.json().get("id")

        try:
            s = requests.get(
                f"{base}/rest/v1/stores",
                params={"owner_id": f"eq.{user_id}", "select": "id,store_name"},
                headers={"apikey": key},
                timeout=10,
            )
        except requests.RequestException:
            return api_error("DB_UNAVAILABLE", "Could not reach the database.", 503)
        if s.status_code != 200:
            return api_error("DB_ERROR", "Could not load your store.", 502)

        rows = s.json()
        if not rows:
            return api_error("NO_STORE", "No store found for this account.", 403)

        g.user_id = user_id
        g.store_id = rows[0]["id"]
        g.store_name = rows[0]["store_name"]
        return fn(*args, **kwargs)

    return wrapper