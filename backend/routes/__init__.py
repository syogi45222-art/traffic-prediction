from routes.auth_routes import auth_bp
from routes.traffic_routes import traffic_bp
from routes.map_routes import map_bp
from routes.event_routes import event_bp
from routes.school_routes import school_bp
from routes.service_routes import service_bp


def register_routes(app):
    """Registers all route blueprints onto the Flask application."""
    app.register_blueprint(auth_bp)
    app.register_blueprint(traffic_bp)
    app.register_blueprint(map_bp)
    app.register_blueprint(event_bp)
    app.register_blueprint(school_bp)
    app.register_blueprint(service_bp)
