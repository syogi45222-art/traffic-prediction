import hashlib
import sqlite3
from flask import Blueprint, jsonify, request
from db import db

auth_bp = Blueprint("auth_bp", __name__)


@auth_bp.route("/api/register", methods=["POST"])
def register():
    try:
        data = request.get_json() or {}
        username = data.get("username", "").strip()
        password = data.get("password", "")

        if not username or not password:
            return jsonify({"error": "Username and password required"}), 400

        hashed_pw = hashlib.sha256(password.encode()).hexdigest()

        with db() as conn:
            conn.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (username, hashed_pw)
            )

        return jsonify({"status": "success", "message": "Account created! Please login."})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username already exists"}), 400
    except Exception as e:
        print("Register Error:", e)
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/api/login", methods=["POST"])
def login():
    try:
        data = request.get_json() or {}
        username = data.get("username", "").strip()
        password = data.get("password", "")

        if not username or not password:
            return jsonify({"error": "Username and password required"}), 400

        hashed_pw = hashlib.sha256(password.encode()).hexdigest()

        with db() as conn:
            user = conn.execute(
                "SELECT * FROM users WHERE username=? AND password=?",
                (username, hashed_pw)
            ).fetchone()

        if user:
            return jsonify({
                "status": "success",
                "user_id": user["id"],
                "username": user["username"],
                "role": user["role"] or "user"
            })
        else:
            return jsonify({"error": "Invalid username or password"}), 401
    except Exception as e:
        print("Login Error:", e)
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/api/role", methods=["GET"])
def user_role():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"role": "user"})
    try:
        with db() as conn:
            row = conn.execute("SELECT role FROM users WHERE id=?", (user_id,)).fetchone()
        return jsonify({"role": row["role"] if row and row["role"] else "user"})
    except Exception as e:
        print("Role API Error:", e)
        return jsonify({"role": "user"})
