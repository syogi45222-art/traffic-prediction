import React, { createContext, useContext, useState } from 'react';
const TrafficContext = createContext();

export function TrafficProvider({ children }) {
  const [sourceLocation, setSourceLocation] = useState(null);
  const [destinationLocation, setDestinationLocation] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [accidentData, setAccidentData] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardView, setDashboardView] = useState('search');
  const [isJourneyActive, setIsJourneyActive] = useState(false);



  return (
    <TrafficContext.Provider value={{
      sourceLocation,
      setSourceLocation,
      destinationLocation,
      setDestinationLocation,
      predictionData,
      setPredictionData,
      accidentData,
      setAccidentData,
      selectedDate,
      setSelectedDate,
      selectedTime,
      setSelectedTime,
      activeTab,
      setActiveTab,
      dashboardView,
      setDashboardView,
      isJourneyActive,
      setIsJourneyActive
    }}>
      {children}
    </TrafficContext.Provider>
  );
}

export function useTraffic() {
  return useContext(TrafficContext);
}
