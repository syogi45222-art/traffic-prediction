import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
import joblib

# Load dataset
df = pd.read_csv("data/Metro_Interstate_Traffic_Volume.csv")

# Convert datetime
df["date_time"] = pd.to_datetime(df["date_time"])

# Extract hour
df["hour"] = df["date_time"].dt.hour

# Create traffic categories
def traffic_level(volume):
    if volume < 2000:
        return "low"
    elif volume < 5000:
        return "medium"
    else:
        return "high"

df["traffic_level"] = df["traffic_volume"].apply(traffic_level)

# Encode weather_main
weather_encoder = LabelEncoder()
df["weather_main"] = weather_encoder.fit_transform(df["weather_main"])

# Features
X = df[
    [
        "temp",
        "rain_1h",
        "snow_1h",
        "clouds_all",
        "hour",
        "weather_main"
    ]
]

# Target
y = df["traffic_level"]

# Split dataset
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

# Train model
model = RandomForestClassifier(
    n_estimators=100,
    max_depth=12,  # unbounded trees overfit (76% acc, ~265 MB RAM); depth 12 gives ~80% at ~11 MB
    random_state=42
)

model.fit(X_train, y_train)

# Evaluate
accuracy = model.score(X_test, y_test)

print(f"Accuracy: {accuracy:.4f}")

# Save model
joblib.dump(model, "ml/model.pkl", compress=("xz", 6))

# Save weather encoder
joblib.dump(weather_encoder, "ml/weather_encoder.pkl")

print("Model saved: ml/model.pkl")
print("Weather encoder saved: ml/weather_encoder.pkl")
print("Training completed successfully.")