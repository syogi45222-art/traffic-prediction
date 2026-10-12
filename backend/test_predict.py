import requests

payload = {
    "source": "New York",
    "destination": "Boston",
    "date": "2026-09-15",
    "time": "18:00"
}
response = requests.post("http://localhost:5000/predict", json=payload)
print(response.json())
