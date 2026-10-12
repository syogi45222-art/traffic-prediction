import io
from datetime import datetime
from flask import Blueprint, jsonify, request, send_file
from gtts import gTTS

from db import db
from services.weather_service import get_weather
from services.accident_service import get_accident_info
from services.train_service import search_train_routes

service_bp = Blueprint("service_bp", __name__)


# =====================================
# WEATHER
# =====================================
@service_bp.route("/api/weather", methods=["POST"])
def weather_api():
    try:
        data = request.get_json() or {}
        city = data.get("city")
        if not city:
            return jsonify({"error": "City name required"}), 400
        weather = get_weather(city)
        if not weather:
            return jsonify({"error": "Unable to fetch weather"}), 500
        return jsonify(weather)
    except Exception as e:
        print("Weather API Error:", e)
        return jsonify({"error": str(e)}), 500


# =====================================
# ACCIDENT MODULE
# =====================================
@service_bp.route("/api/accident", methods=["POST"])
def accident_api():
    try:
        data = request.get_json() or {}
        source = data.get("source")
        destination = data.get("destination")
        if not source or not destination:
            return jsonify({"error": "Source and Destination are required"}), 400
        result = get_accident_info(source, destination)
        return jsonify(result)
    except Exception as e:
        print("Accident Module Error:", e)
        return jsonify({"error": str(e)}), 500


# =====================================
# TRAIN INFO
# =====================================
@service_bp.route("/api/train_info", methods=["GET"])
def train_info():
    try:
        source = request.args.get("source", "").strip()
        destination = request.args.get("destination", "").strip()
        query_time = request.args.get("time", "").strip() or None
        query_date = request.args.get("date", "").strip() or None

        if not source or not destination or destination == "undefined":
            return jsonify({"route_type": "not_found", "trains": [], "summary": ""})

        res = search_train_routes(source, destination, query_time=query_time, query_date=query_date)
        return jsonify(res)
    except Exception as e:
        print("Train API Error:", e)
        return jsonify({"route_type": "error", "summary": "Error fetching data.", "trains": []})


# =====================================
# SEARCH HISTORY
# =====================================
@service_bp.route("/api/save_history", methods=["POST"])
def save_history():
    try:
        data = request.get_json() or {}
        user_id = data.get("user_id")

        with db() as conn:
            conn.execute(
                "INSERT INTO search_history (user_id, timestamp, source, destination, prediction, delay, distance) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    user_id,
                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    data.get("source"),
                    data.get("destination"),
                    data.get("prediction"),
                    data.get("delay"),
                    data.get("distance"),
                ),
            )
        return jsonify({"status": "success"})
    except Exception as e:
        print("Save History Error:", e)
        return jsonify({"error": str(e)}), 500


@service_bp.route("/api/get_history", methods=["GET"])
def get_history():
    try:
        user_id = request.args.get("user_id")
        if not user_id:
            return jsonify({"error": "Unauthorized. User ID required."}), 401
        with db() as conn:
            rows = conn.execute(
                "SELECT * FROM search_history WHERE user_id=? ORDER BY timestamp DESC LIMIT 50",
                (user_id,),
            ).fetchall()
        return jsonify([dict(row) for row in rows])
    except Exception as e:
        print("Get History Error:", e)
        return jsonify([]), 500


# =====================================
# TEXT TO SPEECH (TTS)
# =====================================
@service_bp.route("/api/tts", methods=["GET"])
def text_to_speech():
    text = request.args.get("text", "")
    lang = request.args.get("lang", "en")
    translate = request.args.get("translate", "1") != "0"

    lang_code = "ta" if "ta" in lang else "en"

    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        translated_text = text
        if lang_code == "ta" and translate:
            try:
                from googletrans import Translator
                translator = Translator()
                result = translator.translate(text, dest="ta")
                translated_text = result.text
            except Exception as tr_e:
                print("Translation Error:", tr_e)

        tts = gTTS(text=translated_text, lang=lang_code, slow=False)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        return send_file(fp, mimetype="audio/mpeg")
    except Exception as e:
        print("TTS Error:", e)
        return jsonify({"error": str(e)}), 500


# =====================================
# JOURNEY MANAGEMENT
# =====================================
@service_bp.route("/api/journey/temporary-stop", methods=["POST"])
def temporary_stop():
    data = request.get_json() or {}
    original_source = data.get("source")
    original_destination = data.get("destination")
    stop_location = data.get("stop_location")
    duration_minutes = data.get("duration", 10)

    return jsonify({
        "status": "success",
        "message": "Temporary stop added",
        "journey": {
            "original_source": original_source,
            "original_destination": original_destination,
            "active_destination": stop_location,
            "stop_duration": duration_minutes,
            "state": "temporary_stop"
        },
        "detour_impact": {
            "estimated_detour_minutes": 5,
            "total_stop_minutes": duration_minutes,
            "total_delay": duration_minutes + 5
        }
    })


@service_bp.route("/api/journey/continue", methods=["POST"])
def continue_journey():
    data = request.get_json() or {}
    current_location = data.get("current_location")
    original_destination = data.get("original_destination")

    return jsonify({
        "status": "success",
        "message": "Journey continued",
        "journey": {
            "source": current_location,
            "destination": original_destination,
            "state": "active"
        }
    })


@service_bp.route("/api/journey/recalculate", methods=["POST"])
def recalculate_journey():
    return jsonify({
        "status": "success",
        "message": "Journey recalculated with latest traffic data"
    })
