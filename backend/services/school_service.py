# =====================================
# services/school_service.py
# School zones with bell-time windows, kept in our own SQLite DB.
# A zone only matters during its morning / afternoon windows on school days,
# so drivers are warned at 8 AM but not at 11 PM.
# =====================================

import csv
import io
import math
import sqlite3
from contextlib import contextmanager
from datetime import datetime

from config import Config

DB_PATH = Config.DATABASE_PATH

FIELDS = [
    "name", "location_name", "lat", "lon", "radius_m", "speed_limit",
    "morning_start", "morning_end", "afternoon_start", "afternoon_end",
    "school_days", "notes", "active",
]


@contextmanager
def _conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schools_table():
    with _conn() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS school_zones (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            location_name TEXT,
                            lat REAL NOT NULL,
                            lon REAL NOT NULL,
                            radius_m INTEGER DEFAULT 300,
                            speed_limit INTEGER DEFAULT 25,
                            morning_start TEXT DEFAULT '08:00',
                            morning_end TEXT DEFAULT '09:00',
                            afternoon_start TEXT DEFAULT '15:30',
                            afternoon_end TEXT DEFAULT '16:30',
                            school_days TEXT DEFAULT '0,1,2,3,4',
                            notes TEXT,
                            active INTEGER DEFAULT 1,
                            created_by TEXT,
                            created_at TEXT
                        )""")
        # Box lookups ("schools near this route / in this map view") stay fast at 10,000+ rows
        conn.execute("CREATE INDEX IF NOT EXISTS idx_school_lat_lon ON school_zones(lat, lon)")


def _valid_time(s):
    try:
        datetime.strptime(s, "%H:%M")
        return True
    except (TypeError, ValueError):
        return False


def clean_zone(data):
    """Returns (zone_dict, error_message)."""
    z = {k: data.get(k) for k in FIELDS}
    z["name"] = (z["name"] or "").strip()
    if not z["name"]:
        return None, "School name is required"
    try:
        z["lat"] = float(z["lat"])
        z["lon"] = float(z["lon"])
    except (TypeError, ValueError):
        return None, "Latitude/longitude missing or not a number"
    try:
        z["radius_m"] = int(max(100, min(1000, float(z["radius_m"] or 300))))
        z["speed_limit"] = int(max(10, min(50, float(z["speed_limit"] or 25))))
    except ValueError:
        return None, "Radius and speed limit must be numbers"

    for start, end, label in (("morning_start", "morning_end", "Morning"), ("afternoon_start", "afternoon_end", "Afternoon")):
        z[start] = z[start] or None
        z[end] = z[end] or None
        if bool(z[start]) != bool(z[end]):
            return None, f"{label} window needs both a start and an end time"
        if z[start] and not (_valid_time(z[start]) and _valid_time(z[end])):
            return None, f"{label} times must be HH:MM"
        if z[start] and z[end] <= z[start]:
            return None, f"{label} end time must be after the start time"
    if not z["morning_start"] and not z["afternoon_start"]:
        return None, "Add at least one time window (morning or afternoon)"

    days = data.get("school_days")
    if isinstance(days, list):
        days = ",".join(str(int(d)) for d in days if str(d).isdigit() and 0 <= int(d) <= 6)
    days = ",".join(sorted(set(d for d in str(days or "").split(",") if d.strip().isdigit() and 0 <= int(d) <= 6)))
    if not days:
        return None, "Pick at least one school day"
    z["school_days"] = days
    z["notes"] = (z["notes"] or "").strip() or None
    z["active"] = 0 if z["active"] in (0, False, "0", "false") else 1
    return z, None


def list_zones(bbox=None, q=None, limit=2000):
    """bbox = (min_lat, min_lon, max_lat, max_lon); q = name search."""
    sql, args = "SELECT * FROM school_zones WHERE 1=1", []
    if bbox:
        sql += " AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?"
        args += [bbox[0], bbox[2], bbox[1], bbox[3]]
    if q:
        sql += " AND (name LIKE ? OR location_name LIKE ?)"
        args += [f"%{q}%", f"%{q}%"]
    sql += " ORDER BY active DESC, name LIMIT ?"
    args.append(limit)
    with _conn() as conn:
        rows = conn.execute(sql, args).fetchall()
    return [dict(r) for r in rows]


def zone_stats(now=None):
    now = now or datetime.now()
    with _conn() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM school_zones").fetchall()]
    return {
        "total": len(rows),
        "switched_on": sum(1 for z in rows if z["active"]),
        "active_now": sum(1 for z in rows if is_active_at(z, now)),
    }


def create_zone(z, username):
    cols = FIELDS + ["created_by", "created_at"]
    vals = [z[k] for k in FIELDS] + [username, datetime.now().strftime("%Y-%m-%d %H:%M:%S")]
    with _conn() as conn:
        cur = conn.execute(f"INSERT INTO school_zones ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", vals)
    return cur.lastrowid


def update_zone(zone_id, z):
    with _conn() as conn:
        cur = conn.execute(f"UPDATE school_zones SET {', '.join(f'{k}=?' for k in FIELDS)} WHERE id=?", [z[k] for k in FIELDS] + [zone_id])
    return cur.rowcount > 0


def delete_zone(zone_id):
    with _conn() as conn:
        cur = conn.execute("DELETE FROM school_zones WHERE id=?", (zone_id,))
    return cur.rowcount > 0


# =====================================
# MATCHING
# =====================================
def is_active_at(z, when):
    """True on a school day inside the morning or afternoon window."""
    if not z["active"] or str(when.weekday()) not in z["school_days"].split(","):
        return False
    t = when.strftime("%H:%M")
    return any(z[s] and z[s] <= t <= z[e] for s, e in (("morning_start", "morning_end"), ("afternoon_start", "afternoon_end")))


def _distance_to_route_m(lat, lon, points):
    """Shortest distance from a point to the route line (segments, not just vertices,
    because highway route points can be hundreds of metres apart)."""
    kx = math.cos(math.radians(lat)) * 111320.0
    ky = 110540.0
    xy = [((p["longitude"] - lon) * kx, (p["latitude"] - lat) * ky) for p in points]
    if len(xy) == 1:
        return math.hypot(*xy[0])
    best = float("inf")
    for (ax, ay), (bx, by) in zip(xy, xy[1:]):
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg2))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def zones_on_route(points, when):
    """Every enabled zone the route passes through, with active_at_travel_time.
    Navigation re-checks the clock live, so inactive zones are returned too."""
    if not points:
        return []
    # Only schools inside the route's bounding box (+1 km, the largest allowed radius)
    pad = 0.01
    bbox = (min(p["latitude"] for p in points) - pad, min(p["longitude"] for p in points) - pad,
            max(p["latitude"] for p in points) + pad, max(p["longitude"] for p in points) + pad)
    out = []
    for z in list_zones(bbox=bbox, limit=100000):
        if not z["active"]:
            continue
        d = _distance_to_route_m(z["lat"], z["lon"], points)
        if d <= z["radius_m"]:
            out.append({**z, "distance_m": round(d), "active_at_travel_time": is_active_at(z, when)})
    return out


# =====================================
# CSV IMPORT
# =====================================
# Accepted header names for each field (case-insensitive)
COLUMN_ALIASES = {
    "name": ["name", "school_name", "school", "schoolname"],
    "lat": ["lat", "latitude", "y"],
    "lon": ["lon", "lng", "long", "longitude", "x"],
    "location_name": ["location_name", "location", "area", "address", "locality", "district"],
    "radius_m": ["radius_m", "radius"],
    "speed_limit": ["speed_limit", "speed", "limit"],
    "morning_start": ["morning_start"],
    "morning_end": ["morning_end"],
    "afternoon_start": ["afternoon_start"],
    "afternoon_end": ["afternoon_end"],
    "school_days": ["school_days", "days"],
    "notes": ["notes", "note", "remarks"],
}
DEFAULTS = {
    "radius_m": 300, "speed_limit": 25, "morning_start": "08:00", "morning_end": "09:00",
    "afternoon_start": "15:30", "afternoon_end": "16:30", "school_days": "0,1,2,3,4", "active": 1,
}
DAY_NAMES = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


def _parse_days(text):
    """'Mon-Fri', 'Mon-Sat', 'Mon,Wed,Fri' or '0,1,2,3,4' -> '0,1,2,3,4'."""
    t = str(text or "").strip().lower()
    if not t:
        return None
    if "-" in t and "," not in t:
        a, b = [x.strip()[:3] for x in t.split("-", 1)]
        if a in DAY_NAMES and b in DAY_NAMES and DAY_NAMES[a] <= DAY_NAMES[b]:
            return ",".join(str(i) for i in range(DAY_NAMES[a], DAY_NAMES[b] + 1))
    out = []
    for part in t.replace(";", ",").replace(" ", ",").split(","):
        part = part.strip()
        if part.isdigit():
            out.append(part)
        elif part[:3] in DAY_NAMES:
            out.append(str(DAY_NAMES[part[:3]]))
    return ",".join(out) or None


def _dup_key(name, lat, lon):
    # Same name within roughly 100 m counts as the same school
    return (name.strip().lower(), round(lat, 3), round(lon, 3))


def import_csv(text, username, dry_run=True):
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    # "School Name", "school-name" and "SCHOOL_NAME" all mean school_name
    headers = {h.strip().lower().replace(" ", "_").replace("-", "_"): h for h in (reader.fieldnames or []) if h}
    mapping = {}
    for field, aliases in COLUMN_ALIASES.items():
        for a in aliases:
            if a in headers:
                mapping[field] = headers[a]
                break
    missing = [f for f in ("name", "lat", "lon") if f not in mapping]
    if missing:
        return {"error": f"CSV must have columns for: {', '.join(missing)}. Found: {', '.join(reader.fieldnames or []) or 'none'}"}

    with _conn() as conn:
        existing = {_dup_key(r["name"], r["lat"], r["lon"]) for r in conn.execute("SELECT name, lat, lon FROM school_zones")}

    valid, skipped, duplicates, seen = [], [], 0, set()
    for line_no, row in enumerate(reader, start=2):
        data = dict(DEFAULTS)
        for field, header in mapping.items():
            value = (row.get(header) or "").strip()
            if value:
                data[field] = value
        if "school_days" in mapping and row.get(mapping["school_days"]):
            data["school_days"] = _parse_days(row[mapping["school_days"]]) or DEFAULTS["school_days"]
        z, err = clean_zone(data)
        if err:
            if len(skipped) < 200:
                skipped.append({"line": line_no, "name": data.get("name", ""), "reason": err})
            else:
                skipped.append(None)
            continue
        key = _dup_key(z["name"], z["lat"], z["lon"])
        if key in existing or key in seen:
            duplicates += 1
            continue
        seen.add(key)
        valid.append(z)

    result = {
        "valid": len(valid),
        "skipped": len(skipped),
        "duplicates": duplicates,
        "skipped_rows": [s for s in skipped if s][:50],
        "columns": mapping,
        "sample": [{k: z[k] for k in ("name", "location_name", "lat", "lon")} for z in valid[:5]],
        "imported": 0,
    }
    if not dry_run and valid:
        created = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cols = FIELDS + ["created_by", "created_at"]
        with _conn() as conn:
            conn.executemany(
                f"INSERT INTO school_zones ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                [[z[k] for k in FIELDS] + [username, created] for z in valid],
            )
        result["imported"] = len(valid)
    return result
