from flask import Blueprint, jsonify, request
from services.tomtom_service import search_places, reverse_geocode, get_route

map_bp = Blueprint("map_bp", __name__)


@map_bp.route("/search_places", methods=["GET"])
def search_places_api():
    query = request.args.get("q", "").strip()
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    if not query:
        return jsonify([])
    try:
        results = search_places(query, lat, lon)
        return jsonify(results)
    except Exception as e:
        print("Search API Error:", e)
        return jsonify([])


@map_bp.route("/api/reverse_geocode", methods=["GET"])
def reverse_geocode_api():
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    if lat is None or lon is None:
        return jsonify({"error": "lat and lon are required"}), 400
    try:
        place = reverse_geocode(lat, lon)
        if not place:
            return jsonify({"name": f"{lat:.5f}, {lon:.5f}", "city": None, "address": "", "lat": lat, "lon": lon})
        return jsonify(place)
    except Exception as e:
        print("Reverse Geocode Error:", e)
        return jsonify({"name": f"{lat:.5f}, {lon:.5f}", "city": None, "address": "", "lat": lat, "lon": lon})


@map_bp.route("/api/reroute", methods=["POST"])
def reroute_api():
    data = request.get_json() or {}
    try:
        origin = f"{float(data['lat'])},{float(data['lon'])}"
        dest = data.get("destination_coords")
        destination = f"{float(dest['lat'])},{float(dest['lon'])}" if dest else data["destination"]
    except (TypeError, KeyError, ValueError):
        return jsonify({"error": "lat, lon and destination are required"}), 400

    try:
        route = get_route(origin, destination)
        if route is None:
            return jsonify({"error": "Unable to calculate route"}), 500
        return jsonify(route)
    except Exception as e:
        print("Reroute Error:", e)
        return jsonify({"error": str(e)}), 500
