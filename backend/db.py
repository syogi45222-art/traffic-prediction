import sqlite3
from contextlib import contextmanager
from flask import request
from config import Config


@contextmanager
def db():
    """SQLite connection that commits on success, rolls back on error, and is always closed."""
    conn = sqlite3.connect(Config.DATABASE_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initializes tables for users, search history, events, and school zones."""
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                role TEXT DEFAULT 'user'
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                timestamp TEXT,
                source TEXT,
                destination TEXT,
                prediction TEXT,
                delay REAL,
                distance REAL
            )
        """)

        # Ensure role column exists if upgrading older database
        cursor = conn.cursor()
        cols = [r[1] for r in cursor.execute("PRAGMA table_info(users)").fetchall()]
        if "role" not in cols:
            cursor.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")

        # Ensure admin user has role 'admin'
        cursor.execute(
            "UPDATE users SET role = CASE WHEN username = ? THEN 'admin' ELSE 'user' END",
            (Config.ADMIN_USERNAME,)
        )

    # Initialize domain-specific tables
    from services import event_service, school_service
    event_service.init_events_table()
    school_service.init_schools_table()


def get_admin_user():
    """Returns the username if requester is an admin (via X-User-Id header), else None."""
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return None
    try:
        with db() as conn:
            row = conn.execute("SELECT username, role FROM users WHERE id=?", (user_id,)).fetchone()
        return row["username"] if row and row["role"] == "admin" else None
    except Exception:
        return None
