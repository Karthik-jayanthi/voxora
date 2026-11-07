from flask import Flask
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from .config import Config
from .utils.errors import api_error


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    origins = [o.strip().rstrip("/") for o in app.config["FRONTEND_ORIGIN"].split(",") if o.strip()]

    CORS(
        app,
        resources={r"/api/*": {"origins": origins}},
        allow_headers=["Authorization", "Content-Type"],
    )

    from .routes import health, me, orders, voice

    app.register_blueprint(health.bp)
    app.register_blueprint(me.bp)
    app.register_blueprint(orders.bp)
    app.register_blueprint(voice.bp)

    @app.errorhandler(Exception)
    def handle_unexpected(e):
        if isinstance(e, HTTPException):
            return e
        app.logger.exception("Unhandled error")
        if app.debug:
            return api_error("SERVER_ERROR", f"{type(e).__name__}: {e}", 500)
        return api_error("SERVER_ERROR", "Something went wrong on the server. Try again.", 500)

    return app