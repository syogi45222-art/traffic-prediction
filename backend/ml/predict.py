import joblib
import pandas as pd

model = joblib.load("ml/model.pkl")

sample = pd.DataFrame([{
    "temp": 300,
    "rain_1h": 0,
    "snow_1h": 0,
    "clouds_all": 40,
    "hour": 18,
    "weather_main": 1
}])

prediction = model.predict(sample)

print("Prediction:", prediction[0])