# =====================================
# services/event_service.py
# Festival / temple / market-day calendar kept in our own SQLite DB.
# No external API: admins enter the events, this module decides
# which ones affect a route at a given date and time.
# =====================================

import math
import sqlite3
from contextlib import contextmanager
from datetime import datetime, date as date_cls, timedelta

from config import Config

DB_PATH = Config.DATABASE_PATH

EVENT_TYPES = ["festival", "temple", "market", "procession", "concert", "sports", "other"]
IMPACTS = ["Low", "Moderate", "High"]
RECURRENCES = ["once", "weekly", "yearly"]

# Crowds gather before an event starts and take time to clear after it ends
BUILD_UP_MIN = 60
CLEAR_MIN = 30

FIELDS = [
    "name", "event_type", "location_name", "lat", "lon", "radius_km", "impact",
    "recurrence", "start_date", "end_date", "weekday", "start_time", "end_time",
    "notes", "active",
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


def init_events_table():
    with _conn() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        event_type TEXT DEFAULT 'festival',
                        location_name TEXT,
                        lat REAL NOT NULL,
                        lon REAL NOT NULL,
                        radius_km REAL DEFAULT 2,
                        impact TEXT DEFAULT 'Moderate',
                        recurrence TEXT DEFAULT 'once',
                        start_date TEXT,
                        end_date TEXT,
                        weekday INTEGER,
                        start_time TEXT,
                        end_time TEXT,
                        notes TEXT,
                        active INTEGER DEFAULT 1,
                        created_by TEXT,
                        created_at TEXT
                    )""")


# =====================================
# VALIDATION
# =====================================
def _valid_date(s):
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except (TypeError, ValueError):
        return False


def _valid_time(s):
    try:
        datetime.strptime(s, "%H:%M")
        return True
    except (TypeError, ValueError):
        return False


def clean_event(data):
    """Returns (event_dict, error_message)."""
    ev = {k: data.get(k) for k in FIELDS}
    ev["name"] = (ev["name"] or "").strip()
    if not ev["name"]:
        return None, "Event name is required"
    try:
        ev["lat"] = float(ev["lat"])
        ev["lon"] = float(ev["lon"])
    except (TypeError, ValueError):
        return None, "Pick the event location from the search list"
    try:
        ev["radius_km"] = max(0.2, min(50.0, float(ev["radius_km"] or 2)))
    except ValueError:
        return None, "Radius must be a number"

    ev["event_type"] = ev["event_type"] if ev["event_type"] in EVENT_TYPES else "other"
    ev["impact"] = ev["impact"] if ev["impact"] in IMPACTS else "Moderate"
    ev["recurrence"] = ev["recurrence"] if ev["recurrence"] in RECURRENCES else "once"
    ev["active"] = 0 if ev["active"] in (0, False, "0", "false") else 1

    for key in ("start_date", "end_date"):
        ev[key] = ev[key] or None
        if ev[key] and not _valid_date(ev[key]):
            return None, f"{key.replace('_', ' ').title()} must be YYYY-MM-DD"
    for key in ("start_time", "end_time"):
        ev[key] = ev[key] or None
        if ev[key] and not _valid_time(ev[key]):
            return None, f"{key.replace('_', ' ').title()} must be HH:MM"

    if ev["recurrence"] == "weekly":
        try:
            ev["weekday"] = int(ev["weekday"])
            assert 0 <= ev["weekday"] <= 6
        except (TypeError, ValueError, AssertionError):
            return None, "Pick the weekday for a weekly event"
    else:
        ev["weekday"] = None
        if not ev["start_date"]:
            return None, "Start date is required"
        ev["end_date"] = ev["end_date"] or ev["start_date"]
        if ev["recurrence"] == "once" and ev["end_date"] < ev["start_date"]:
            return None, "End date is before start date"

    return ev, None


# =====================================
# CRUD
# =====================================
def list_events():
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM events ORDER BY active DESC, COALESCE(start_date, '9999'), name").fetchall()
    return [dict(r) for r in rows]


def create_event(ev, username):
    cols = FIELDS + ["created_by", "created_at"]
    vals = [ev[k] for k in FIELDS] + [username, datetime.now().strftime("%Y-%m-%d %H:%M:%S")]
    with _conn() as conn:
        cur = conn.execute(f"INSERT INTO events ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", vals)
    return cur.lastrowid


def update_event(event_id, ev):
    with _conn() as conn:
        cur = conn.execute(f"UPDATE events SET {', '.join(f'{k}=?' for k in FIELDS)} WHERE id=?", [ev[k] for k in FIELDS] + [event_id])
    return cur.rowcount > 0


def delete_event(event_id):
    with _conn() as conn:
        cur = conn.execute("DELETE FROM events WHERE id=?", (event_id,))
    return cur.rowcount > 0


# =====================================
# MATCHING: is this event happening, and is it on the route?
# =====================================
def _occurs_on(ev, day):
    rec = ev["recurrence"]
    if rec == "weekly":
        if ev["weekday"] is None or day.weekday() != ev["weekday"]:
            return False
        if ev["start_date"] and day.isoformat() < ev["start_date"]:
            return False
        if ev["end_date"] and day.isoformat() > ev["end_date"]:
            return False
        return True
    if not ev["start_date"]:
        return False
    if rec == "yearly":
        start = ev["start_date"][5:]
        end = (ev["end_date"] or ev["start_date"])[5:]
        md = day.strftime("%m-%d")
        return start <= md <= end if start <= end else (md >= start or md <= end)  # wraps over New Year
    return ev["start_date"] <= day.isoformat() <= (ev["end_date"] or ev["start_date"])


def _to_min(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _in_time_window(ev, minute_of_day):
    """True when the time falls inside the event hours (plus crowd build-up / clearing)."""
    if not ev["start_time"] or not ev["end_time"]:
        return True  # all-day event
    start = _to_min(ev["start_time"]) - BUILD_UP_MIN
    end = _to_min(ev["end_time"]) + CLEAR_MIN
    if ev["end_time"] < ev["start_time"]:  # overnight event, e.g. 20:00 -> 02:00; after midnight is handled in is_active
        end = 1440
    return start <= minute_of_day <= end


def is_active(ev, when):
    if not ev["active"]:
        return False
    minute = when.hour * 60 + when.minute
    if _occurs_on(ev, when.date()) and _in_time_window(ev, minute):
        return True
    # An overnight event that started yesterday
    return bool(ev["start_time"] and ev["end_time"] and ev["end_time"] < ev["start_time"]
                and _occurs_on(ev, when.date() - timedelta(days=1)) and minute <= _to_min(ev["end_time"]) + CLEAR_MIN)


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _distance_to_route_km(ev, points):
    return min(_haversine_km(ev["lat"], ev["lon"], p["latitude"], p["longitude"]) for p in points)


def parse_when(date_str=None, time_str=None):
    now = datetime.now()
    try:
        day = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else now.date()
    except ValueError:
        day = now.date()
    try:
        t = datetime.strptime(time_str, "%H:%M").time() if time_str else now.time()
    except ValueError:
        t = now.time()
    return datetime.combine(day, t)


def describe(ev):
    hours = f"{ev['start_time']}–{ev['end_time']}" if ev["start_time"] and ev["end_time"] else "all day"
    return f"{ev['name']} near {ev['location_name'] or 'the route'} ({hours})"


def events_affecting(points, when):
    """Active events whose crowd zone touches the route. Each gets distance_km."""
    if not points:
        return []
    # Check every 3rd point: plenty for zones of 200 m and more, and keeps long routes fast
    sample = points[::3] + [points[-1]]
    found = []
    for ev in list_events():
        if not is_active(ev, when):
            continue
        d = _distance_to_route_km(ev, sample)
        if d <= ev["radius_km"]:
            found.append({**ev, "distance_km": round(d, 2), "summary": describe(ev)})
    order = {"High": 0, "Moderate": 1, "Low": 2}
    found.sort(key=lambda e: (order.get(e["impact"], 3), e["distance_km"]))
    return found


def upcoming_events(days=7, start=None):
    """Occurrences in the next N days, for the dashboard calendar."""
    start = start or date_cls.today()
    out = []
    for ev in list_events():
        if not ev["active"]:
            continue
        for i in range(days):
            day = start + timedelta(days=i)
            if _occurs_on(ev, day):
                out.append({**ev, "date": day.isoformat(), "summary": describe(ev)})
                break  # list each event once, on its next day
    out.sort(key=lambda e: (e["date"], e["start_time"] or ""))
    return out
