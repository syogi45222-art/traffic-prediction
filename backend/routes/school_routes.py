from flask import Blueprint, jsonify, request
from db import get_admin_user
from services import school_service

school_bp = Blueprint("school_bp", __name__)


@school_bp.route("/api/schools", methods=["GET"])
def schools_list():
    bbox = None
    if request.args.get("bbox"):
        try:
            bbox = [float(x) for x in request.args["bbox"].split(",")]
            assert len(bbox) == 4
        except (ValueError, AssertionError):
            return jsonify({"error": "bbox must be min_lat,min_lon,max_lat,max_lon"}), 400
    limit = max(1, min(request.args.get("limit", 2000, type=int), 5000))
    return jsonify(school_service.list_zones(bbox=bbox, q=request.args.get("q", "").strip() or None, limit=limit))


@school_bp.route("/api/schools/stats", methods=["GET"])
def schools_stats():
    return jsonify(school_service.zone_stats())


@school_bp.route("/api/schools/import", methods=["POST"])
def schools_import():
    admin = get_admin_user()
    if not admin:
        return jsonify({"error": "Admin access required"}), 403
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Choose a CSV file"}), 400
    raw = file.read()
    if len(raw) > 20 * 1024 * 1024:
        return jsonify({"error": "File is larger than 20 MB"}), 400
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    result = school_service.import_csv(text, admin, dry_run=request.args.get("dry_run", "1") != "0")
    return jsonify(result), (400 if "error" in result else 200)


@school_bp.route("/api/schools", methods=["POST"])
def schools_create():
    admin = get_admin_user()
    if not admin:
        return jsonify({"error": "Admin access required"}), 403
    z, err = school_service.clean_zone(request.get_json() or {})
    if err:
        return jsonify({"error": err}), 400
    return jsonify({"status": "success", "id": school_service.create_zone(z, admin)})


@school_bp.route("/api/schools/<int:zone_id>", methods=["PUT"])
def schools_update(zone_id):
    if not get_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    z, err = school_service.clean_zone(request.get_json() or {})
    if err:
        return jsonify({"error": err}), 400
    if not school_service.update_zone(zone_id, z):
        return jsonify({"error": "School zone not found"}), 404
    return jsonify({"status": "success"})


@school_bp.route("/api/schools/<int:zone_id>", methods=["DELETE"])
def schools_delete(zone_id):
    if not get_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    if not school_service.delete_zone(zone_id):
        return jsonify({"error": "School zone not found"}), 404
    return jsonify({"status": "success"})
