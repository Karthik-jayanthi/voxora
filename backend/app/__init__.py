from flask import Flask
from flask_cors import CORS

from .config import Config


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, resources={r"/api/*": {"origins": [app.config["FRONTEND_ORIGIN"]]}})

    from .routes import health

    app.register_blueprint(health.bp)

    return app