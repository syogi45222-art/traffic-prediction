# =====================================
# services/weather_service.py
# =====================================

import os
import requests

from dotenv import load_dotenv


load_dotenv()


API_KEY = os.getenv(
    "OPENWEATHER_API_KEY"
)


BASE_URL = (
    "https://api.openweathermap.org/data/2.5/weather"
)



# =====================================
# GET WEATHER DATA
# =====================================

def get_weather(city):

    try:


        if not API_KEY:

            print(
                "OPENWEATHER_API_KEY missing"
            )

            return None



        params = {

            "q":
            city,

            "appid":
            API_KEY,

            "units":
            "metric"

        }



        response = requests.get(
            BASE_URL,
            params=params,
            timeout=10
        )


        if response.status_code != 200:

            print(
                "Weather API Error:",
                response.text
            )

            return None



        data = response.json()



        return {


            "city":

            data.get(
                "name",
                city
            ),



            "temp":

            data["main"]["temp"],



            "humidity":

            data["main"]["humidity"],



            "wind":

            data["wind"]["speed"],



            "rain_1h":

            data.get(
                "rain",
                {}
            ).get(
                "1h",
                0
            ),



            "clouds_all":

            data["clouds"]["all"],



            "weather_main":

            data["weather"][0]["main"],



            "description":

            data["weather"][0]["description"],



            "visibility":

            round(
                data.get(
                    "visibility",
                    0
                ) / 1000,
                2
            )

        }



    except Exception as e:


        print(
            "Weather Service Error:",
            e
        )


        return None