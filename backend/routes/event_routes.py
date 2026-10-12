from flask import Blueprint, jsonify, request
from db import get_admin_user
from services import event_service

event_bp = Blueprint("event_bp", __name__)


@event_bp.route("/api/events", methods=["GET"])
def events_list():
    return jsonify(event_service.list_events())


@event_bp.route("/api/events/upcoming", methods=["GET"])
def events_upcoming():
    days = request.args.get("days", 7, type=int)
    return jsonify(event_service.upcoming_events(max(1, min(days, 60))))


@event_bp.route("/api/events", methods=["POST"])
def events_create():
    admin = get_admin_user()
    if not admin:
        return jsonify({"error": "Admin access required"}), 403
    ev, err = event_service.clean_event(request.get_json() or {})
    if err:
        return jsonify({"error": err}), 400
    return jsonify({"status": "success", "id": event_service.create_event(ev, admin)})


@event_bp.route("/api/events/<int:event_id>", methods=["PUT"])
def events_update(event_id):
    if not get_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    ev, err = event_service.clean_event(request.get_json() or {})
    if err:
        return jsonify({"error": err}), 400
    if not event_service.update_event(event_id, ev):
        return jsonify({"error": "Event not found"}), 404
    return jsonify({"status": "success"})


@event_bp.route("/api/events/<int:event_id>", methods=["DELETE"])
def events_delete(event_id):
    if not get_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    if not event_service.delete_event(event_id):
        return jsonify({"error": "Event not found"}), 404
    return jsonify({"status": "success"})
