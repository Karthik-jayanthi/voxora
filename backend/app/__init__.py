from flask import Flask
from flask_cors import CORS

from .config import Config


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(
        app,
        resources={r"/api/*": {"origins": [app.config["FRONTEND_ORIGIN"]]}},
        allow_headers=["Authorization", "Content-Type"],
    )

    from .routes import health, me, voice

    app.register_blueprint(health.bp)
    app.register_blueprint(me.bp)
    app.register_blueprint(voice.bp)

    return app