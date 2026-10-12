def analyze_traffic_causes(base_prediction, route, weather, acc_info, train_info, events=None):
    factors = []
    
    # 1. Historical
    hist_score = 10
    hist_status = "available"
    if not base_prediction:
        hist_status = "unavailable"
    else:
        p_lower = base_prediction.lower()
        if "high" in p_lower or "heavy" in p_lower: hist_score = 75
        elif "medium" in p_lower or "moderate" in p_lower: hist_score = 50
        else: hist_score = 10
        
    factors.append({
        "type": "historical",
        "label": "Historical Impact",
        "score": hist_score,
        "status": hist_status,
        "icon": "📊"
    })
    
    # 2. Weather
    weather_score = 5
    weather_status = "available"
    if not weather or weather.get("error"):
        weather_status = "unavailable"
    else:
        w_main = weather.get("weather_main", "").lower()
        if w_main in ["thunderstorm", "snow"]: weather_score = 85
        elif w_main in ["rain"]: weather_score = 65
        elif w_main in ["drizzle", "mist", "fog"]: weather_score = 40
        else: weather_score = 5
        
    factors.append({
        "type": "weather",
        "label": "Weather Impact",
        "score": weather_score,
        "status": weather_status,
        "icon": "🌧️" if weather_score > 40 else "🌤️"
    })
    
    # 3. Traffic Delay (TomTom)
    delay_score = 5
    delay_status = "available"
    if not route:
        delay_status = "unavailable"
    else:
        delay_minutes = route.get("traffic_delay_sec", 0) / 60.0
        if delay_minutes > 20: delay_score = 90
        elif delay_minutes > 10: delay_score = 70
        elif delay_minutes > 5: delay_score = 40
        else: delay_score = 10
        
    factors.append({
        "type": "traffic",
        "label": "Traffic Delay",
        "score": delay_score,
        "status": delay_status,
        "icon": "🚦"
    })
    
    # 4. Accident
    acc_score = 5
    acc_status = "available"
    if acc_info is None or acc_info.get("error"):
        acc_status = "unavailable"
    else:
        accidents = acc_info.get("accidents", [])
        if accidents:
            max_acc_score = 50
            for a in accidents:
                mag = a.get("magnitudeOfDelay", 0)
                delay = a.get("delay", 0)
                dist = a.get("distance_from_source", 999)
                
                s = 60
                if mag > 0: s += mag * 10
                if delay > 300: s += 15
                if dist < 5.0: s += 10
                if s > max_acc_score: max_acc_score = s
            acc_score = min(95, max_acc_score)
            
    factors.append({
        "type": "accident",
        "label": "Accident Impact",
        "score": acc_score,
        "status": acc_status,
        "icon": "🚨"
    })
    
    # 5. Railway
    train_score = 5
    train_status = "available"
    if train_info is None or train_info.get("error"):
        train_status = "unavailable"
    elif train_info.get("route_type") == "not_found":
        train_score = 5
    else:
        trains = train_info.get("trains", [])
        if trains:
            train_score = 80
            
    factors.append({
        "type": "train",
        "label": "Railway Impact",
        "score": train_score,
        "status": train_status,
        "icon": "🚆"
    })
    
    # 6. Festival / market-day events from our own calendar
    event_score = 5
    event_label = "Festival / Event"
    if events:
        top = events[0]  # already sorted by impact
        event_score = {"High": 85, "Moderate": 60, "Low": 30}.get(top.get("impact"), 30)
        event_label = top.get("name") or event_label

    factors.append({
        "type": "event",
        "label": event_label,
        "score": event_score,
        "status": "available",
        "icon": "🎉"
    })

    # Avoid Double Counting: Accident vs Traffic Delay
    acc_factor = next(f for f in factors if f["type"] == "accident")
    traf_factor = next(f for f in factors if f["type"] == "traffic")
    if acc_factor["score"] > 50 and traf_factor["score"] > 40:
        if acc_factor["score"] <= traf_factor["score"]:
            acc_factor["score"] = traf_factor["score"] + 5
        traf_factor["score"] = acc_factor["score"] - 10
        
    # Categorize Impacts
    for f in factors:
        if f["status"] == "unavailable":
            f["impact"] = "UNAVAILABLE"
            f["score"] = 0
        elif f["score"] >= 70: f["impact"] = "HIGH"
        elif f["score"] >= 40: f["impact"] = "MEDIUM"
        elif f["score"] >= 20: f["impact"] = "LOW"
        else: f["impact"] = "NONE"
        
    # Select Main Cause
    valid_factors = [f for f in factors if f["status"] == "available" and f["score"] >= 20]
    valid_factors.sort(key=lambda x: x["score"], reverse=True)
    
    main_cause = valid_factors[0] if valid_factors else {
        "type": "none",
        "label": "Normal Traffic",
        "score": 0,
        "impact": "NONE",
        "icon": "✅"
    }
    
    # Explain
    explanation = ""
    mc_type = main_cause["type"]
    if mc_type == "accident":
        explanation = "A traffic incident detected near the selected route is the main contributing factor to the predicted congestion."
    elif mc_type == "weather":
        explanation = "Adverse weather conditions are contributing significantly to the predicted traffic level."
    elif mc_type == "train":
        explanation = "A train-time overlap near a railway crossing may cause temporary traffic buildup."
    elif mc_type == "traffic":
        explanation = "Current traffic delay is the strongest contributing factor to the predicted congestion."
    elif mc_type == "event":
        explanation = f"{main_cause['label']} is drawing crowds near the route, so expect slow traffic and parking congestion."
    elif mc_type == "historical":
        explanation = "Historical traffic patterns indicate typical congestion for this route at this time."
    else:
        explanation = "Traffic is flowing normally with no significant disruptive factors detected."
        
    high_factors = [f for f in valid_factors if f["impact"] == "HIGH"]
    if len(high_factors) >= 2 and mc_type != "none":
        labels = [f["label"].lower() for f in high_factors]
        explanation = f"The prediction is heavily influenced by a combination of {', '.join(labels)}."
        
    return {
        "main_cause": main_cause,
        "factors": factors,
        "explanation": explanation
    }
