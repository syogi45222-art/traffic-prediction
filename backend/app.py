import os
import sys
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS

# Add backend directory to sys.path so imports work from any working directory
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from config import Config
from db import init_db
from routes import register_routes


def create_app():
    """Application factory for the Flask backend."""
    app = Flask(__name__)

    # Configure CORS for Vite local dev and deployed frontend domains.
    # supports_credentials=True requires an explicit origin (not wildcard).
    CORS(
        app,
        origins=Config.ALLOWED_ORIGINS,
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    )

    # Initialize Database Schema & Admin Role
    try:
        init_db()
    except Exception as e:
        print(f"Warning: Database initialization issue: {e}")

    # Register Blueprints
    register_routes(app)

    # Health Check (Used by Render / monitoring services)
    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({
            "status": "running",
            "project": "Smart Traffic Prediction"
        })

    # Error Handlers
    @app.errorhandler(404)
    def page_not_found(error):
        return jsonify({"error": "404", "message": "Page Not Found"}), 404

    @app.errorhandler(500)
    def internal_server(error):
        return jsonify({"error": "500", "message": "Internal Server Error"}), 500

    return app


# Production instance (used by Gunicorn: "gunicorn app:app")
app = create_app()


if __name__ == "__main__":
    print("=" * 60)
    print(" SMART TRAFFIC PREDICTION API")
    print("=" * 60)
    print(f" API  : http://0.0.0.0:{Config.PORT}")
    print(f" Mode : {'Debug' if Config.FLASK_DEBUG else 'Production'}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.FLASK_DEBUG)
