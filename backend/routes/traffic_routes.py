import math
import random
from datetime import datetime, timedelta
import joblib
import pandas as pd
from flask import Blueprint, jsonify, request

from config import Config
from services.weather_service import get_weather
from services.tomtom_service import get_route
from services.accident_service import get_accident_info
from services.train_service import search_train_routes
from services.traffic_cause_analyzer import analyze_traffic_causes
from services import event_service, school_service

traffic_bp = Blueprint("traffic_bp", __name__)

# Load ML model & weather encoder with fail-safe error handling
model = None
weather_encoder = None

try:
    model = joblib.load(Config.MODEL_PATH)
    weather_encoder = joblib.load(Config.WEATHER_ENCODER_PATH)
    print("ML model and weather encoder loaded successfully.")
except Exception as e:
    print(f"Warning: Failed to load ML model from {Config.MODEL_PATH}: {e}")


def _get_hourly_base_volumes():
    try:
        df = pd.read_csv(Config.METRO_TRAFFIC_CSV)
        df["date_time"] = pd.to_datetime(df["date_time"])
        hourly = df.groupby(df["date_time"].dt.hour)["traffic_volume"].mean().reset_index()
        return dict(zip(hourly["date_time"].astype(int).tolist(), hourly["traffic_volume"].round(0).astype(int).tolist()))
    except Exception as e:
        print(f"Warning: Could not read base volumes CSV ({Config.METRO_TRAFFIC_CSV}): {e}")
        return {h: 500 for h in range(24)}


_base_hourly_volumes = _get_hourly_base_volumes()


# =====================================
# TRAFFIC PREDICTION
# =====================================
@traffic_bp.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data received"}), 400

        source = data.get("source")
        destination = data.get("destination")
        user_date = data.get("date")
        user_time = data.get("time")
        manual_weather = data.get("weather")

        def coord_query(c, fallback):
            try:
                return f"{float(c['lat'])},{float(c['lon'])}"
            except (TypeError, KeyError, ValueError):
                return fallback

        source_q = coord_query(data.get("source_coords"), source)
        destination_q = coord_query(data.get("destination_coords"), destination)

        # WEATHER: Use manual weather if provided, else fetch from source
        if manual_weather:
            weather = {
                "weather_main": manual_weather,
                "temp": 290.0,
                "rain_1h": 5.0 if manual_weather in ["Rain", "Drizzle", "Thunderstorm"] else 0.0,
                "snow_1h": 5.0 if manual_weather == "Snow" else 0.0,
                "clouds_all": 80 if "Clouds" in manual_weather or "Rain" in manual_weather else 20
            }
        elif source:
            weather = get_weather(source)
            if weather is None:
                return jsonify({"error": "Unable to fetch weather data"}), 500
        else:
            return jsonify({"error": "Source or Weather is required"}), 400

        # ROUTE: Only fetch if both source and destination exist
        has_route = False
        if source and destination:
            route = get_route(source_q, destination_q)
            if route is None:
                return jsonify({"error": "Unable to calculate route"}), 500
            has_route = True
        else:
            route = {
                "distance_km": 0,
                "travel_time_min": 0,
                "traffic_delay_sec": 0,
                "no_traffic_time_min": 0,
                "points": []
            }

        # TIME FEATURE
        if user_time:
            try:
                hour = int(user_time.split(":")[0])
            except Exception:
                hour = datetime.now().hour
        else:
            hour = datetime.now().hour

        # ML PREDICTION
        if model and weather_encoder:
            try:
                weather_code = weather_encoder.transform([weather["weather_main"]])[0]
            except Exception:
                weather_code = weather_encoder.transform(["Clear"])[0]

            input_df = pd.DataFrame([{
                "temp": weather.get("temp", 290.0),
                "rain_1h": weather.get("rain_1h", 0.0),
                "snow_1h": weather.get("snow_1h", 0.0),
                "clouds_all": weather.get("clouds_all", 20),
                "hour": hour,
                "weather_main": weather_code
            }])
            base_prediction = str(model.predict(input_df)[0])
        else:
            base_prediction = "Moderate"

        # =====================================
        # HYBRID FACTORS COLLECTION
        # =====================================
        acc_info = None
        train_info = None
        reasons = []
        factors = {
            "weather": weather.get("weather_main", "Clear"),
            "tomtom_delay_minutes": 0,
            "accident": False,
            "train_crossing": False
        }
        score = 0

        pred_lower = base_prediction.lower()
        if "high" in pred_lower or "heavy" in pred_lower:
            score += 2
        elif "medium" in pred_lower or "moderate" in pred_lower:
            score += 1

        # 1. Weather Factor
        bad_weather = ["Rain", "Snow", "Thunderstorm", "Drizzle"]
        if factors["weather"] in bad_weather:
            score += 1
            reasons.append(f"{factors['weather']} may reduce traffic speed")

        # =====================================
        # TRAFFIC METRICS & DELAY FACTOR
        # =====================================
        if has_route:
            distance_km = float(route.get("distance_km", 0))
            travel_time_min = float(route.get("travel_time_min", 0))
            traffic_delay_sec = float(route.get("traffic_delay_sec", 0))
            no_traffic_time_min = float(route.get("no_traffic_time_min", travel_time_min))

            delay = traffic_delay_sec / 60.0
            factors["tomtom_delay_minutes"] = round(delay, 1)

            if delay > 10.0:
                score += 1
                reasons.append("High TomTom traffic delay")

            average_speed = (distance_km / travel_time_min) * 60.0 if travel_time_min > 0 else 0.0
            free_flow_speed = (distance_km / no_traffic_time_min) * 60.0 if no_traffic_time_min > 0 else average_speed

            if no_traffic_time_min > 0 and travel_time_min > 0:
                congestion_ratio = (travel_time_min / no_traffic_time_min) * 100.0
                traffic_index = min(100.0, max(0.0, congestion_ratio - 100.0))
            else:
                traffic_index = 0.0

            vehicle_count = int(distance_km * (30 * 2) * (traffic_index / 100.0)) if traffic_index > 50 else int(distance_km * (30 * 2) * 0.4)

            if traffic_index > 50:
                congestion_level = "Heavy"
            elif traffic_index > 20:
                congestion_level = "Moderate"
            else:
                congestion_level = "Light"
        else:
            delay = 0.0
            average_speed = 0.0
            free_flow_speed = 0.0
            traffic_index = 0.0
            distance_km = 0.0
            travel_time_min = 0.0
            no_traffic_time_min = 0.0
            congestion_level = "Light"
            vehicle_count = 1500

        # 2. Accident Factor
        if has_route and source and destination:
            try:
                acc_info = get_accident_info(source_q, destination_q)
                if acc_info.get("has_accident"):
                    factors["accident"] = True
                    score += 4  # Force High traffic
                    reasons.append("Heavy traffic accident detected on route")
                elif acc_info.get("has_hazard"):
                    factors["accident"] = True
                    score += 2
                    reasons.append("Relevant traffic hazard detected")
            except Exception as e:
                print("Error checking accidents in hybrid:", e)

        # 3. Train Crossing Factor
        if has_route and source and destination:
            try:
                train_info = search_train_routes(source, destination, user_time, user_date)
                if train_info and train_info.get("trains") and len(train_info["trains"]) > 0:
                    factors["train_crossing"] = True
                    score += 1
                    reasons.append("Train crossing overlaps expected arrival time")
            except Exception as e:
                print("Error checking trains in hybrid:", e)

        # 4. Festival / market-day factor
        events = []
        try:
            when = event_service.parse_when(user_date, user_time)
            if has_route:
                events = event_service.events_affecting(route.get("points", []), when)
            elif data.get("source_coords"):
                c = data["source_coords"]
                events = event_service.events_affecting([{"latitude": float(c["lat"]), "longitude": float(c["lon"])}], when)
        except Exception as e:
            print("Error checking events in hybrid:", e)
        factors["event"] = bool(events)

        # 5. School zones
        school_zones = []
        try:
            if has_route:
                school_zones = school_service.zones_on_route(route.get("points", []), event_service.parse_when(user_date, user_time))
                active_now = [z for z in school_zones if z["active_at_travel_time"]]
                if active_now:
                    reasons.append(f"{len(active_now)} school zone(s) on your route at this time — speed limit {min(z['speed_limit'] for z in active_now)} km/h")
        except Exception as e:
            print("Error checking school zones:", e)

        if events:
            top = events[0]
            score += {"High": 4, "Moderate": 2, "Low": 1}.get(top["impact"], 1)
            reasons.append(f"{top['summary']} — expect heavy crowds")

        # =====================================
        # FINAL HYBRID PREDICTION
        # =====================================
        if score >= 4:
            final_prediction = "High"
            congestion_level = "Heavy"
        elif score >= 2:
            final_prediction = "Moderate"
            congestion_level = "Moderate"
        else:
            final_prediction = "Low"
            congestion_level = "Light"

        if not has_route:
            if final_prediction == "High":
                vehicle_count = 5500
            elif final_prediction == "Moderate":
                vehicle_count = 3500
            else:
                vehicle_count = 1500

        traffic_metrics = {
            "average_speed": round(average_speed, 2),
            "free_flow_speed": round(free_flow_speed, 2),
            "travel_time": round(travel_time_min, 2),
            "no_traffic_time": round(no_traffic_time_min, 2),
            "delay": round(delay, 2),
            "traffic_index": round(traffic_index, 2),
            "vehicle_count": vehicle_count,
            "distance": round(distance_km, 2),
            "congestion_level": congestion_level
        }

        # Traffic Cause Analyzer
        cause_analysis = analyze_traffic_causes(base_prediction, route if has_route else None, weather, acc_info, train_info, events)

        # Departure Time Optimizer
        suggested_departure = None
        if final_prediction in ["High", "Moderate"] and user_time:
            try:
                dt = datetime.strptime(user_time, "%H:%M")
                now_dt = datetime.strptime(datetime.now().strftime("%H:%M"), "%H:%M")
                offset = 45 if final_prediction == "High" else 20

                if (dt - now_dt).total_seconds() < (offset * 60):
                    delay_mins = 60 if final_prediction == "High" else 30
                    suggested_dt = dt + timedelta(minutes=delay_mins)
                else:
                    suggested_dt = dt - timedelta(minutes=offset)

                suggested_departure = suggested_dt.strftime("%H:%M")
                traffic_text = "Heavy traffic" if final_prediction == "High" else "Moderate traffic"
                reasons.append(f"{traffic_text} expected. We suggest leaving around {suggested_departure} to minimize delay.")
            except Exception:
                pass

        return jsonify({
            "source": source if source else "General Area",
            "destination": destination if destination else "N/A",
            "date": user_date,
            "time": user_time,
            "traffic_prediction": final_prediction,
            "cause_analysis": cause_analysis,
            "factors": factors,
            "reasons": reasons,
            "traffic_metrics": traffic_metrics,
            "weather": weather,
            "route": route,
            "suggested_departure": suggested_departure,
            "events": events,
            "school_zones": school_zones
        })

    except Exception as e:
        print("Prediction Error:", e)
        return jsonify({"error": str(e)}), 500


# =====================================
# TRAFFIC HISTORY & REALTIME
# =====================================
@traffic_bp.route("/traffic_history", methods=["GET"])
def traffic_history():
    try:
        now = datetime.now()
        current_hour = now.hour
        noise_seed = now.minute // 5

        hours = list(range(24))
        traffic = []
        for h in hours:
            base = _base_hourly_volumes.get(h, 500)
            variation = int(base * 0.08 * math.sin(noise_seed + h * 0.5))
            time_decay = 1.0 + 0.15 * math.sin((now.hour - h) * math.pi / 12)
            if h == current_hour:
                live_boost = int(base * 0.12 * math.sin(now.second * 0.1))
                traffic.append(max(0, int(base * time_decay + variation + live_boost)))
            else:
                traffic.append(max(0, int(base * time_decay + variation)))

        peak_idx = traffic.index(max(traffic))

        return jsonify({
            "hours": hours,
            "traffic": traffic,
            "peak_hour": peak_idx,
            "peak_volume": max(traffic),
            "current_hour": current_hour,
            "current_volume": traffic[current_hour],
            "timestamp": now.strftime("%Y-%m-%d %H:%M:%S")
        })
    except Exception as e:
        print("Traffic History Error:", e)
        return jsonify({"hours": [], "traffic": [], "error": str(e)}), 500


@traffic_bp.route("/traffic_realtime", methods=["GET"])
def traffic_realtime():
    try:
        now = datetime.now()
        current_hour = now.hour
        base = _base_hourly_volumes.get(current_hour, 500)
        noise_seed = now.minute * 60 + now.second

        current_volume = max(0, int(base + base * 0.15 * math.sin(noise_seed * 0.05)))
        avg_volume = int(sum(_base_hourly_volumes.values()) / 24)
        congestion_ratio = current_volume / avg_volume if avg_volume > 0 else 1.0

        if congestion_ratio > 1.4:
            congestion_level = "Heavy"
            status_color = "red"
        elif congestion_ratio > 1.1:
            congestion_level = "Moderate"
            status_color = "orange"
        else:
            congestion_level = "Light"
            status_color = "green"

        active_vehicles = int(current_volume * (0.6 + 0.4 * math.sin(now.minute * 0.3)))
        road_occupancy = min(98, max(5, int(congestion_ratio * 45 + 10 * math.sin(now.second * 0.2))))
        avg_speed = max(8, int(70 - congestion_ratio * 25 + 5 * math.sin(now.second * 0.15)))
        incidents = random.randint(0, 3) if congestion_level == "Heavy" else random.randint(0, 1)

        return jsonify({
            "current_volume": current_volume,
            "avg_volume": avg_volume,
            "congestion_level": congestion_level,
            "status_color": status_color,
            "active_vehicles": active_vehicles,
            "road_occupancy": road_occupancy,
            "avg_speed": avg_speed,
            "incidents": incidents,
            "current_hour": current_hour,
            "timestamp": now.strftime("%Y-%m-%d %H:%M:%S")
        })
    except Exception as e:
        print("Traffic Realtime Error:", e)
        return jsonify({"error": str(e)}), 500
