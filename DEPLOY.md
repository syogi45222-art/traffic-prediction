# Deploying Smart Traffic

The app has two parts deployed separately:

| Part | Folder | Host | Why |
|---|---|---|---|
| React frontend | `/` (Vite) | **Vercel** | Static site, edge distribution |
| Flask backend + ML model + SQLite | `backend/` | **Render** (or Railway) | Long-lived Python server with ML model & writable SQLite database |

---

## 1. Backend File Structure Overview

The backend is modularized for production reliability on Render:

```text
backend/
├── app.py              # Application factory & CORS/error handling
├── wsgi.py             # WSGI production entrypoint for Gunicorn
├── config.py           # Centralized configuration & environment loader
├── db.py               # Database connection manager & table initialization
├── Procfile            # Deployment start command for Render
├── render.yaml         # Render Blueprint configuration
├── requirements.txt    # Python dependencies
├── .env.example        # Environment variable template
├── routes/             # Modular API routes (Blueprints)
│   ├── auth_routes.py      # /api/register, /api/login, /api/role
│   ├── traffic_routes.py   # /predict, /traffic_history, /traffic_realtime
│   ├── map_routes.py       # /search_places, /api/reverse_geocode, /api/reroute
│   ├── event_routes.py     # /api/events/*
│   ├── school_routes.py    # /api/schools/*
│   └── service_routes.py   # /api/weather, /api/accident, /api/train_info, /api/tts, history
├── services/           # External API & business logic services
│   ├── accident_service.py
│   ├── event_service.py
│   ├── school_service.py
│   ├── tomtom_service.py
│   ├── traffic_cause_analyzer.py
│   ├── train_service.py
│   └── weather_service.py
├── ml/                 # Machine learning models
│   ├── model.pkl
│   └── weather_encoder.pkl
└── data/               # Static dataset CSVs
    ├── Metro_Interstate_Traffic_Volume.csv
    └── isl_wise_train_detail_03082015_v1.csv
```

---

## 2. Deploying Backend on Render

You can deploy using either **Blueprint (Recommended)** or **Manual Web Service**.

### Option A: 1-Click Blueprint (Recommended)
1. Push your repository to GitHub.
2. In Render dashboard, click **New +** → **Blueprint**.
3. Select your repository. Render automatically reads `render.yaml` with the build and start commands configured.
4. Fill in your environment variables when prompted.
5. Click **Apply**.

### Option B: Manual Web Service
1. In Render dashboard, click **New +** → **Web Service** → connect your GitHub repo.
2. Configure settings:
   - **Name:** `smart-traffic-backend`
   - **Region:** Choose closest to your users (e.g. Singapore or Frankfurt)
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn wsgi:app --workers 2 --timeout 120`
   - **Health Check Path:** `/health`
3. Add **Environment Variables** (under Environment tab):
   - `OPENWEATHER_API_KEY`: Your OpenWeatherMap key
   - `TOMTOM_API_KEY`: Your TomTom developer key
   - `RAPIDAPI_KEY`: Your RapidAPI key
   - `FRONTEND_ORIGINS`: Your Vercel frontend URL (e.g., `https://smart-traffic.vercel.app`)
   - `FLASK_DEBUG`: `0`
4. Click **Deploy Web Service**.
5. Test your deployment:
   ```bash
   curl https://<your-render-service>.onrender.com/health
   # Returns: {"project":"Smart Traffic Prediction","status":"running"}
   ```

---

## 3. Persistent Storage for SQLite on Render

On Render's free tier, the filesystem is ephemeral and resets upon redeploy.

To persist user logins, search history, custom events, and school zones:
1. In Render, go to your Web Service → **Disks** → **Add Disk**.
2. Mount path: `/var/data` (e.g. size 1 GB).
3. In **Environment Variables**, add:
   ```text
   DATABASE_PATH=/var/data/traffic.db
   ```
4. On startup, the backend will automatically use the persistent disk.

---

## 4. Frontend on Vercel

1. In Vercel dashboard, click **Add New...** → **Project** → import the repository.
2. Framework Preset: **Vite** (auto-detected).
3. Under **Environment Variables**, set:
   - `VITE_API_URL` = your Render URL without trailing slash (e.g., `https://smart-traffic-backend.onrender.com`).
4. Click **Deploy**.
5. Once deployed, copy your Vercel URL (e.g. `https://smart-traffic-xyz.vercel.app`) and set it in Render's `FRONTEND_ORIGINS` environment variable so CORS requests succeed.

---

## 5. Security Checklist Before Pushing

- Ensure `backend/.env` is NOT committed (it is listed in `.gitignore`).
- Ensure no real API keys are committed in code.
- Ensure large backup files are excluded.
