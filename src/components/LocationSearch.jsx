import React, { useState, useEffect, useRef } from 'react';
import { searchPlaces } from '../api/api';
import useDebounce from '../hooks/useDebounce';

const searchCache = new Map();

function getPlaceIcon(type) {
  if (!type) return '📍';
  const t = String(type).toLowerCase();
  if (t.includes('city') || t.includes('municipality')) return '🏙';
  if (t.includes('town')) return '🏘';
  if (t.includes('hospital')) return '🏥';
  if (t.includes('school')) return '🏫';
  return '📍';
}

export default function LocationSearch({ id, label, onSelect, placeholder, value }) {
  const [query, setQuery] = useState(value?.name || '');
  const [places, setPlaces] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const ref = useRef(null);

  useEffect(() => {
    if (value === null || value === undefined) {
      setQuery('');
    } else if (value.name && value.name !== query) {
      setQuery(value.name);
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setPlaces([]);
      setShowDropdown(false);
      return;
    }

    const cached = searchCache.get(debouncedQuery.toLowerCase());
    if (cached) {
      setPlaces(cached);
      setShowDropdown(true);
      return;
    }

    setLoading(true);
    searchPlaces(debouncedQuery).then((results) => {
      searchCache.set(debouncedQuery.toLowerCase(), results);
      setPlaces(results);
      setShowDropdown(true);
      setLoading(false);
    });
  }, [debouncedQuery]);

  function handleSelect(place) {
    setQuery(place.name);
    setShowDropdown(false);
    onSelect({
      name: place.name,
      address: place.address || '',
      lat: place.lat,
      lon: place.lon
    });
  }

  return (
    <div className="search-container" ref={ref}>
      <label htmlFor={id}>{label}</label>
      <div className="search-box">
        <i className="fa-solid fa-magnifying-glass search-icon"></i>
        <input
          id={id}
          type="text"
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            if (!val.trim()) {
              onSelect(null);
            } else {
              onSelect({ name: val.trim() });
            }
          }}
          onFocus={() => { if (places.length > 0) setShowDropdown(true); }}
        />
        {loading && <div className="loader"></div>}
      </div>
      {showDropdown && (
        <div className="suggestions show">
          {places.length === 0 ? (
            <div className="no-result">No locations found</div>
          ) : (
            places.map((place, i) => (
              <div
                key={i}
                className="suggestion-item"
                onClick={() => handleSelect(place)}
              >
                <div className="suggestion-icon">{getPlaceIcon(place.type)}</div>
                <div className="place-info">
                  <div className="place-title">{place.name}</div>
                  <div className="place-address">{place.address || ''}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}