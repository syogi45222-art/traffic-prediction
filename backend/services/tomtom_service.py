# =====================================
# services/tomtom_service.py
# =====================================

import os
import re
import requests

from dotenv import load_dotenv
from urllib.parse import quote


load_dotenv()

API_KEY = os.getenv("TOMTOM_API_KEY")

BASE_URL = "https://api.tomtom.com"


if not API_KEY:
    print("Warning: TOMTOM_API_KEY missing in .env - TomTom route queries will fail until provided.")


# =====================================
# SEARCH PLACES
# =====================================

def search_places(query, lat=None, lon=None):

    try:

        encoded = quote(query)

        url = (
            f"{BASE_URL}/search/2/search/"
            f"{encoded}.json"
            f"?key={API_KEY}"
            f"&limit=10"
            f"&language=en-US"
            f"&countrySet=IN"
        )
        if lat and lon:
            url += f"&lat={lat}&lon={lon}&radius=10000"


        response = requests.get(
            url,
            timeout=10
        )

        response.raise_for_status()

        data = response.json()

        places = []
        seen = set()

        for item in data.get("results", []):

            address = item.get(
                "address",
                {}
            )

            position = item.get(
                "position",
                {}
            )

            poi = item.get(
                "poi",
                {}
            )


            if address.get("countryCode") != "IN":
                continue


            name = (
                address.get("municipality")
                or poi.get("name")
                or address.get("freeformAddress")
            )


            if not name:
                continue


            key = (
                name.lower(),
                position.get("lat"),
                position.get("lon")
            )


            if key in seen:
                continue


            seen.add(key)


            places.append({

                "name": name,

                "address":
                address.get(
                    "freeformAddress",
                    ""
                ),

                "lat":
                position.get("lat"),

                "lon":
                position.get("lon")

            })


        return places


    except Exception as e:

        print(
            "Search Error:",
            e
        )

        return []



# =====================================
# GEOCODE
# =====================================

_COORD_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")


def geocode_place(place):

    # "lat,lon" strings (from GPS or a picked suggestion) need no lookup
    match = _COORD_RE.match(str(place))
    if match:
        return {"lat": float(match.group(1)), "lon": float(match.group(2))}

    try:

        encoded = quote(place)

        url = (
            f"{BASE_URL}/search/2/geocode/"
            f"{encoded}.json"
            f"?key={API_KEY}"
            f"&countrySet=IN"
        )


        response = requests.get(
            url,
            timeout=10
        )

        response.raise_for_status()

        data = response.json()


        if not data.get("results"):
            return None


        position = data["results"][0]["position"]


        return {

            "lat":
            position["lat"],

            "lon":
            position["lon"]

        }


    except Exception as e:

        print(
            "Geocode Error:",
            e
        )

        return None



# =====================================
# REVERSE GEOCODE (GPS -> place name)
# =====================================

def reverse_geocode(lat, lon):

    try:

        url = (
            f"{BASE_URL}/search/2/reverseGeocode/"
            f"{lat},{lon}.json"
            f"?key={API_KEY}"
            f"&language=en-US"
        )

        response = requests.get(url, timeout=10)
        response.raise_for_status()
        results = response.json().get("addresses", [])

        if not results:
            return None

        address = results[0].get("address", {})

        return {
            "name": (
                address.get("municipalitySubdivision")
                or address.get("municipality")
                or address.get("streetName")
                or address.get("freeformAddress")
            ),
            "city": address.get("municipality") or address.get("countrySecondarySubdivision"),
            "address": address.get("freeformAddress", ""),
            "lat": float(lat),
            "lon": float(lon)
        }

    except Exception as e:

        print("Reverse Geocode Error:", e)

        return None



# =====================================
# ROUTE
# =====================================

def get_route(
    source,
    destination,
    avoid_areas=None
):

    try:

        start = geocode_place(source)

        end = geocode_place(destination)


        if not start or not end:
            return None

        headers = {"Content-Type": "application/json"}
        url = (
            f"{BASE_URL}/routing/1/"
            f"calculateRoute/"
            f"{start['lat']},{start['lon']}:"
            f"{end['lat']},{end['lon']}"
            f"/json"
            f"?key={API_KEY}"
            f"&traffic=true"
            f"&routeType=fastest"
            f"&maxAlternatives=2"
            f"&instructionsType=text"
            f"&language=en-GB"
        )

        body = {}
        if avoid_areas and isinstance(avoid_areas, list) and len(avoid_areas) > 0:
            body = {
                "avoidAreas": {
                    "rectangles": avoid_areas
                }
            }
            response = requests.post(url, json=body, headers=headers, timeout=15)
        else:
            response = requests.get(url, timeout=15)

        response.raise_for_status()

        data = response.json()

        if not data.get("routes"):
            return None

        route = data["routes"][0]
        summary = route["summary"]

        points = [
            {"latitude": p["latitude"], "longitude": p["longitude"]}
            for p in route["legs"][0]["points"]
        ]

        instructions = [
            {
                "offset_m": ins.get("routeOffsetInMeters", 0),
                "point_index": ins.get("pointIndex", 0),
                "maneuver": ins.get("maneuver", ""),
                "street": ins.get("street", ""),
                "road_numbers": ins.get("roadNumbers", []),
                "exit_number": ins.get("roundaboutExitNumber"),
                "message": ins.get("message", ""),
            }
            for ins in route.get("guidance", {}).get("instructions", [])
        ]

        alternate_route = None
        if len(data["routes"]) > 1:
            alt = data["routes"][1]
            alt_summary = alt["summary"]
            alt_points = [
                {"latitude": p["latitude"], "longitude": p["longitude"]}
                for p in alt["legs"][0]["points"]
            ]
            alternate_route = {
                "distance_km": round(alt_summary["lengthInMeters"] / 1000, 2),
                "travel_time_min": round(alt_summary["travelTimeInSeconds"] / 60, 2),
                "traffic_delay_sec": alt_summary.get("trafficDelayInSeconds", 0),
                "points": alt_points
            }

        return {
            "source": source,
            "destination": destination,
            "distance_km": round(summary["lengthInMeters"] / 1000, 2),
            "travel_time_min": round(summary["travelTimeInSeconds"] / 60, 2),
            "traffic_delay_sec": summary.get("trafficDelayInSeconds", 0),
            "points": points,
            "instructions": instructions,
            "alternate_route": alternate_route
        }


    except Exception as e:

        print(
            "Route Error:",
            e
        )

        return None



# =====================================
# ACCIDENT / TRAFFIC INCIDENTS
# =====================================

def get_route_accidents(bbox):

    try:

        url = (

            f"{BASE_URL}/traffic/services/5/"
            f"incidentDetails"

        )


        params = {
            "key": API_KEY,
            "bbox": bbox
        }


        response = requests.get(
            url,
            params=params,
            timeout=10
        )


        response.raise_for_status()


        data = response.json()


        return data.get(
            "incidents",
            []
        )


    except Exception as e:

        print(
            "Accident API Error:",
            e
        )

        return []