# traffic-prediction

Smart Traffic Prediction & Real-Time Navigation System built with React (Vite) and Flask (ML + SQLite).

## Overview

A full-stack intelligent traffic prediction platform that calculates route congestion, predicts delays using machine learning and environmental factors (weather, train crossings, accidents, school zones, and festival events), and provides live navigation.

- **Frontend**: React + Vite + Tailwind CSS + Lucide Icons + Leaflet (deployed on Vercel)
- **Backend**: Flask API + Scikit-Learn ML Model + SQLite (deployed on Render)

## Project Structure

- `src/` — React frontend components, pages, navigation, and API integration
- `backend/` — Modular Flask REST API:
  - `routes/` — Modular route blueprints (auth, traffic, map, school zones, events, services)
  - `services/` — Integrations for TomTom, OpenWeatherMap, IRCTC train schedules, and accident detection
  - `ml/` — Scikit-learn traffic prediction model and encoders
  - `data/` — Static traffic and train dataset CSV files
  - `render.yaml` & `Procfile` — Ready for 1-click deployment on Render

## Deployment

See [DEPLOY.md](DEPLOY.md) for full deployment instructions:
- **Backend:** Render (Web Service using `gunicorn wsgi:app`)
- **Frontend:** Vercel
