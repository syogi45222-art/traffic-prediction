import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Ensure backend directory is in sys.path so modules resolve correctly regardless of launch location
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Load .env file
env_file = BASE_DIR / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    load_dotenv()


class Config:
    BASE_DIR = BASE_DIR
    PORT = int(os.getenv("PORT", 5000))
    FLASK_DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"

    # Database
    DATABASE_PATH = os.getenv("DATABASE_PATH", str(BASE_DIR / "traffic.db"))
    ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "yogi")

    # Machine Learning Models
    MODEL_PATH = os.getenv("MODEL_PATH", str(BASE_DIR / "ml" / "model.pkl"))
    WEATHER_ENCODER_PATH = os.getenv("WEATHER_ENCODER_PATH", str(BASE_DIR / "ml" / "weather_encoder.pkl"))

    # Datasets
    METRO_TRAFFIC_CSV = os.getenv("METRO_TRAFFIC_CSV", str(BASE_DIR / "data" / "Metro_Interstate_Traffic_Volume.csv"))
    TRAIN_DATA_CSV = os.getenv("TRAIN_DATA_CSV", str(BASE_DIR / "data" / "isl_wise_train_detail_03082015_v1.csv"))

    # API Keys & Services
    OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
    TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY", "")
    RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY") or os.getenv("TRAIN_API_KEY", "")
    RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "irctc1.p.rapidapi.com")

    # CORS Frontend Origins
    _raw_origins = os.getenv("FRONTEND_ORIGINS", "")
    _configured_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    
    ALLOWED_ORIGINS = list({
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:4173",
        *_configured_origins,
    })
