/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import { Train, Bus, Clock, MapPin, Settings, RefreshCw, AlertCircle, Plus, Trash2, ChevronDown, ChevronUp, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInMinutes, parseISO, subMinutes } from 'date-fns';
import { fetchRoutes, fetchStops, fetchPredictionsForStop, fetchAllStops, Route, Stop, Prediction } from './services/mbta';
import { calculateDistance, estimateWalkTime } from './utils/geo';

interface StationConfig {
  id: string;
  routeId: string;
  routeType: number;
  stopId: string;
  directionId: number;
  walkTime: number;
  routeName: string;
  stopName: string;
  directionName: string;
  color: string;
}

interface UserSettings {
  stations: StationConfig[];
  bufferTime: number;
  showDebug: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  stations: [],
  bufferTime: 2,
  showDebug: false,
};

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction[]>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('mbta_commuter_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration: add routeType if missing (default to 0 for old subway stations)
        if (parsed.stations) {
          parsed.stations = parsed.stations.map((s: any) => ({
            ...s,
            routeType: s.routeType ?? 0
          }));
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse settings', e);
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  // Station Picker State
  const [isAdding, setIsAdding] = useState(false);
  const [routeTypeFilter, setRouteTypeFilter] = useState<number>(0); // 0: Subway, 3: Bus
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [availableStops, setAvailableStops] = useState<Stop[]>([]);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<number>(0);
  const [walkTime, setWalkTime] = useState(10);
  const [isLocating, setIsLocating] = useState(false);
  const [isLocatingClosest, setIsLocatingClosest] = useState(false);
  const [suggestedStation, setSuggestedStation] = useState<StationConfig | null>(null);
  const [suggestedPredictions, setSuggestedPredictions] = useState<Prediction[]>([]);

  const updatePredictions = useCallback(async () => {
    setLoading(true);
    const newPredictions: Record<string, Prediction[]> = {};
    
    const tasks = settings.stations.map(async (station) => {
      const data = await fetchPredictionsForStop(station.stopId, station.directionId);
      newPredictions[station.id] = data;
    });

    if (suggestedStation) {
      tasks.push((async () => {
        const data = await fetchPredictionsForStop(suggestedStation.stopId, suggestedStation.directionId);
        setSuggestedPredictions(data);
      })());
    }

    await Promise.all(tasks);

    setPredictions(newPredictions);
    setLastUpdated(new Date());
    setLoading(false);
  }, [settings.stations, suggestedStation]);

  useEffect(() => {
    const loadRoutes = async () => {
      const data = await fetchRoutes();
      setRoutes(data);
    };
    loadRoutes();
  }, []);

  const findClosestStation = useCallback(async (force: boolean = false) => {
    if (!force && settings.stations.length > 0) {
      setSuggestedStation(null);
      return;
    }

    setIsLocatingClosest(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        const allStops = await fetchAllStops();
        const allRoutes = await fetchRoutes();

        let closest = null;
        let minDistance = Infinity;

        for (const stop of allStops) {
          const dist = calculateDistance(latitude, longitude, stop.latitude, stop.longitude);
          if (dist < minDistance) {
            minDistance = dist;
            closest = stop;
          }
        }

        if (closest) {
          let routeId = closest.routeIds[0];
          
          if (!routeId) {
            // Fallback: search for this stop in all routes
            // Only search subway/light rail routes to avoid bus route performance issues
            const subwayRoutes = allRoutes.filter(r => r.type === 0 || r.type === 1);
            for (const route of subwayRoutes) {
              const stops = await fetchStops(route.id);
              if (stops.some(s => s.id === closest.id)) {
                routeId = route.id;
                break;
              }
            }
          }

          if (routeId) {
            const route = allRoutes.find(r => r.id === routeId);
            if (route) {
              const walkTime = estimateWalkTime(minDistance);
              setSuggestedStation({
                id: 'suggested',
                routeId: route.id,
                routeType: route.type,
                stopId: closest.id,
                directionId: 1, // Default to Northbound/Inbound
                walkTime: walkTime,
                routeName: route.name,
                stopName: closest.name,
                directionName: route.directionNames[1] || 'Inbound',
                color: route.color
              });
            }
          }
        }
      } catch (error) {
        console.error('Error finding closest station:', error);
      } finally {
        setIsLocatingClosest(false);
      }
    }, (error) => {
      console.error('Geolocation error:', error);
      setIsLocatingClosest(false);
    });
  }, [settings.stations.length]);

  useEffect(() => {
    findClosestStation();
  }, [findClosestStation]);

  useEffect(() => {
    updatePredictions();
    const interval = setInterval(updatePredictions, 30000);
    return () => clearInterval(interval);
  }, [updatePredictions]);

  useEffect(() => {
    localStorage.setItem('mbta_commuter_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (selectedRoute) {
      const loadStops = async () => {
        const data = await fetchStops(selectedRoute.id);
        setAvailableStops(data);
      };
      loadStops();
    } else {
      setAvailableStops([]);
    }
  }, [selectedRoute]);

  const addStation = () => {
    if (!selectedRoute || !selectedStop) return;

    const newStation: StationConfig = {
      id: crypto.randomUUID(),
      routeId: selectedRoute.id,
      routeType: selectedRoute.type,
      stopId: selectedStop.id,
      directionId: selectedDirection,
      walkTime: walkTime,
      routeName: selectedRoute.name,
      stopName: selectedStop.name,
      directionName: selectedRoute.directionNames[selectedDirection],
      color: selectedRoute.color
    };

    setSettings(prev => ({
      ...prev,
      stations: [...prev.stations, newStation]
    }));

    setIsAdding(false);
    setSelectedRoute(null);
    setSelectedStop(null);
  };

  const removeStation = (id: string) => {
    setSettings(prev => ({
      ...prev,
      stations: prev.stations.filter(s => s.id !== id)
    }));
  };

  const updateStationWalkTime = (id: string, newTime: number) => {
    setSettings(prev => ({
      ...prev,
      stations: prev.stations.map(s => s.id === id ? { ...s, walkTime: newTime } : s)
    }));
  };

  const moveStation = (id: string, direction: 'up' | 'down') => {
    setSettings(prev => {
      const index = prev.stations.findIndex(s => s.id === id);
      if (index === -1) return prev;
      
      const newStations = [...prev.stations];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      
      if (targetIndex < 0 || targetIndex >= newStations.length) return prev;
      
      [newStations[index], newStations[targetIndex]] = [newStations[targetIndex], newStations[index]];
      
      return {
        ...prev,
        stations: newStations
      };
    });
  };

  const handleUseMyLocation = () => {
    if (!selectedStop) return;
    
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const distance = calculateDistance(
          latitude,
          longitude,
          selectedStop.latitude,
          selectedStop.longitude
        );
        const estimatedTime = estimateWalkTime(distance);
        setWalkTime(estimatedTime);
        setIsLocating(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Could not get your location. Please check your permissions.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const saveSuggestedStation = () => {
    if (!suggestedStation) return;
    const newStation = { ...suggestedStation, id: `station-${Date.now()}` };
    setSettings(prev => ({
      ...prev,
      stations: [...prev.stations, newStation]
    }));
    setSuggestedStation(null);
  };

  const getLeaveByTime = (arrivalTimeStr: string | null, walkTime: number) => {
    if (!arrivalTimeStr) return null;
    const arrival = parseISO(arrivalTimeStr);
    return subMinutes(arrival, walkTime + settings.bufferTime);
  };

  const renderStationCard = (station: StationConfig, stationPredictions: Prediction[], isSuggested: boolean = false) => {
    const catchableTrain = stationPredictions.find(p => {
      const leaveBy = getLeaveByTime(p.arrivalTime, station.walkTime);
      return leaveBy && differenceInMinutes(leaveBy, new Date()) >= 0;
    });

    const targetTrain = catchableTrain || stationPredictions[0];
    const leaveBy = targetTrain ? getLeaveByTime(targetTrain.arrivalTime, station.walkTime) : null;
    const minutesUntilLeave = leaveBy ? differenceInMinutes(leaveBy, new Date()) : null;
    const isBus = station.routeType === 3;
    const Icon = isBus ? Bus : Train;

    return (
      <motion.div 
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        key={station.id} 
        className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${isSuggested ? 'border-blue-200 ring-4 ring-blue-50' : 'border-black/5'}`}
      >
        <div className="p-4 flex justify-between items-center" style={{ backgroundColor: station.color, color: 'white' }}>
          <div className="flex items-center gap-2">
            <Icon size={18} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-lg leading-tight">{station.stopName}</h2>
                {isSuggested && (
                  <span className="bg-white/20 text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest">Closest</span>
                )}
              </div>
              <p className="text-[10px] opacity-80 uppercase tracking-widest font-bold">
                {station.routeName} • {station.directionName}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-80 uppercase tracking-wider font-bold">
              {station.walkTime}m walk
            </div>
          </div>
        </div>
        
        <div className="p-4 space-y-4">
          {targetTrain ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    {catchableTrain ? `Catchable ${isBus ? 'Bus' : 'Train'}` : `Next ${isBus ? 'Bus' : 'Train'} (Missed)`}
                  </p>
                  <p className="text-3xl font-bold text-gray-900">
                    {targetTrain.arrivalTime ? format(parseISO(targetTrain.arrivalTime), 'h:mm a') : 'Unknown'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Leave By</p>
                  <p className={`text-3xl font-bold ${minutesUntilLeave !== null && minutesUntilLeave < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                    {leaveBy ? format(leaveBy, 'h:mm a') : '--:--'}
                  </p>
                </div>
              </div>

              {minutesUntilLeave !== null && (
                <div className={`p-3 rounded-xl flex items-center gap-3 ${
                  minutesUntilLeave < 0 
                    ? 'bg-red-50 text-red-700' 
                    : minutesUntilLeave < 5 
                      ? 'bg-amber-50 text-amber-700' 
                      : 'bg-emerald-50 text-emerald-700'
                }`}>
                  <Clock size={18} />
                  <span className="font-bold text-sm">
                    {minutesUntilLeave < 0 
                      ? `Missed it by ${Math.abs(minutesUntilLeave)}m` 
                      : minutesUntilLeave === 0 
                        ? 'Leave NOW!' 
                        : `Leave in ${minutesUntilLeave} minutes`}
                  </span>
                </div>
              )}

            {stationPredictions.length > 0 ? (
              <div className="pt-2 border-t border-gray-100">
                <div className="space-y-2">
                  {stationPredictions.slice(0, 5).map((p) => {
                    const isTarget = p.id === targetTrain.id;
                    const leaveBy = getLeaveByTime(p.arrivalTime, station.walkTime);
                    const minutesUntilLeave = leaveBy ? differenceInMinutes(leaveBy, new Date()) : null;
                    const isMissed = minutesUntilLeave !== null && minutesUntilLeave < 0;

                    return (
                      <div key={p.id} className="flex flex-col">
                        <div className={`flex justify-between items-center text-sm p-1.5 rounded-lg ${isTarget ? 'bg-gray-50 font-bold' : 'text-gray-500'}`}>
                          <div className="flex items-center gap-2">
                            <Icon size={14} style={{ color: station.color }} className={isMissed ? 'opacity-30' : ''} />
                            <div className="flex flex-col">
                              <span className={isMissed ? 'line-through opacity-50' : ''}>{station.directionName}</span>
                              {isTarget && <span className="text-[8px] uppercase tracking-tighter text-emerald-600 font-black">Target</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-xs">{p.arrivalTime ? format(parseISO(p.arrivalTime), 'h:mm a') : 'N/A'}</p>
                            {leaveBy && (
                              <p className={`text-[9px] font-bold uppercase ${isMissed ? 'text-red-300' : 'text-gray-400'}`}>
                                Leave {format(leaveBy, 'h:mm')}
                              </p>
                            )}
                          </div>
                        </div>
                        {settings.showDebug && (
                          <div className="px-2 pb-1 text-[8px] font-mono text-gray-300 flex justify-between">
                            <span>ID: {p.id}</span>
                            <span>Status: {p.status || 'N/A'}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="pt-4 border-t border-gray-100 text-center py-8">
                <AlertCircle size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No upcoming {isBus ? 'buses' : 'trains'} found</p>
                <button 
                  onClick={() => updatePredictions()}
                  className="mt-2 text-xs text-blue-500 hover:underline"
                >
                  Try refreshing
                </button>
              </div>
            )}
            </>
          ) : (
            <div className="py-8 text-center text-gray-400">
              <AlertCircle size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">No upcoming {isBus ? 'buses' : 'trains'} found</p>
            </div>
          )}

          {isSuggested && (
            <button 
              onClick={saveSuggestedStation}
              className="w-full mt-4 bg-blue-600 text-white p-4 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Save This Station
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 font-sans p-4 md:p-8">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase italic">MBTA Commute</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">Real-time Departures</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => findClosestStation(true)}
              disabled={isLocatingClosest}
              className={`p-2.5 rounded-full bg-white shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors text-gray-600 ${isLocatingClosest ? 'animate-pulse text-blue-500' : ''}`}
              title="Find Closest Station"
            >
              <Navigation size={18} />
            </button>
            <button 
              onClick={updatePredictions}
              className="p-2.5 rounded-full bg-white shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors text-gray-600"
              title="Refresh"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2.5 rounded-full bg-white shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors text-gray-600"
              title="Settings"
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 space-y-6 mb-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-sm uppercase tracking-widest flex items-center gap-2">
                    <Settings size={16} /> Configuration
                  </h3>
                  <button 
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest bg-black text-white px-3 py-1.5 rounded-full hover:bg-gray-800"
                  >
                    <Plus size={12} /> Add Station
                  </button>
                </div>

                {/* Station List in Settings */}
                <div className="space-y-3">
                  {settings.stations.map((station, index) => (
                    <div key={station.id} className="flex flex-col p-3 bg-gray-50 rounded-xl border border-gray-100 gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full" style={{ backgroundColor: station.color, color: 'white' }}>
                            {station.routeType === 3 ? <Bus size={14} /> : <Train size={14} />}
                          </div>
                          <div>
                            <p className="text-xs font-bold">{station.stopName}</p>
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">{station.routeName} • {station.directionName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="flex flex-col gap-0.5 mr-2">
                            <button 
                              onClick={() => moveStation(station.id, 'up')}
                              disabled={index === 0}
                              className="p-1 text-gray-400 hover:text-black disabled:opacity-10"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button 
                              onClick={() => moveStation(station.id, 'down')}
                              disabled={index === settings.stations.length - 1}
                              className="p-1 text-gray-400 hover:text-black disabled:opacity-10"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <button 
                            onClick={() => removeStation(station.id)}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Walk Time (min)</label>
                        <input 
                          type="number" 
                          min="1"
                          max="60"
                          value={station.walkTime}
                          onChange={(e) => updateStationWalkTime(station.id, parseInt(e.target.value) || 1)}
                          className="w-16 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Global Buffer Time (min)</label>
                  <input 
                    type="number" 
                    value={settings.bufferTime}
                    onChange={(e) => setSettings({ ...settings, bufferTime: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Debug Mode</span>
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, showDebug: !prev.showDebug }))}
                      className={`w-10 h-5 rounded-full transition-colors relative ${settings.showDebug ? 'bg-emerald-500' : 'bg-gray-200'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.showDebug ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">Show raw prediction IDs and status</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Station Modal-like Overlay */}
        <AnimatePresence>
          {isAdding && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
              onClick={() => setIsAdding(false)}
            >
              <motion.div 
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                exit={{ y: 100 }}
                className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-black text-lg uppercase tracking-tight italic">Add Station</h3>
                  <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-black">
                    <ChevronDown size={24} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Type</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setRouteTypeFilter(0); setSelectedRoute(null); }}
                        className={`flex-1 p-3 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-2 ${
                          routeTypeFilter === 0 
                            ? 'border-black bg-black text-white' 
                            : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                        }`}
                      >
                        <Train size={14} /> Subway
                      </button>
                      <button
                        onClick={() => { setRouteTypeFilter(3); setSelectedRoute(null); }}
                        className={`flex-1 p-3 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-2 ${
                          routeTypeFilter === 3 
                            ? 'border-black bg-black text-white' 
                            : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                        }`}
                      >
                        <Bus size={14} /> Bus
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Line</label>
                    {routeTypeFilter === 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {routes.filter(r => r.type === 0 || r.type === 1).map(r => (
                          <button
                            key={r.id}
                            onClick={() => setSelectedRoute(r)}
                            className={`p-3 rounded-xl text-xs font-bold border-2 transition-all ${
                              selectedRoute?.id === r.id 
                                ? 'border-black bg-black text-white' 
                                : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                            }`}
                          >
                            {r.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <select 
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold focus:outline-none"
                        onChange={(e) => setSelectedRoute(routes.find(r => r.id === e.target.value) || null)}
                        value={selectedRoute?.id || ''}
                      >
                        <option value="">Choose a bus line...</option>
                        {routes.filter(r => r.type === 3).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {selectedRoute && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Station</label>
                        <select 
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold focus:outline-none"
                          onChange={(e) => setSelectedStop(availableStops.find(s => s.id === e.target.value) || null)}
                          value={selectedStop?.id || ''}
                        >
                          <option value="">Choose a station...</option>
                          {availableStops.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Direction</label>
                        <div className="flex gap-2">
                          {selectedRoute.directionNames.map((name, idx) => (
                            <button
                              key={name}
                              onClick={() => setSelectedDirection(idx)}
                              className={`flex-1 p-3 rounded-xl text-xs font-bold border-2 transition-all ${
                                selectedDirection === idx 
                                  ? 'border-black bg-black text-white' 
                                  : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                              }`}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Walk Time (min)</label>
                          {selectedStop && (
                            <button 
                              onClick={handleUseMyLocation}
                              disabled={isLocating}
                              className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1 hover:text-blue-600 disabled:opacity-50"
                            >
                              <Navigation size={10} className={isLocating ? 'animate-pulse' : ''} />
                              {isLocating ? 'Locating...' : 'Use My Location'}
                            </button>
                          )}
                        </div>
                        <input 
                          type="number" 
                          value={walkTime}
                          onChange={(e) => setWalkTime(parseInt(e.target.value) || 0)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold focus:outline-none"
                        />
                      </div>

                      <button 
                        onClick={addStation}
                        disabled={!selectedStop}
                        className="w-full bg-black text-white p-4 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-800 disabled:opacity-20 transition-all"
                      >
                        Confirm Station
                      </button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stations Display */}
        <div className="space-y-6">
          {isLocatingClosest && (
            <div className="py-20 text-center space-y-4">
              <RefreshCw size={32} className="mx-auto text-blue-500 animate-spin" />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Finding closest station...</p>
            </div>
          )}

          {suggestedStation && renderStationCard(suggestedStation, suggestedPredictions, true)}

          {settings.stations.length === 0 && !suggestedStation && !isLocatingClosest ? (
            <div className="py-20 text-center space-y-4">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                <Plus size={32} className="text-gray-300" />
              </div>
              <div>
                <p className="font-bold text-gray-400">No stations added yet</p>
                <button 
                  onClick={() => { setShowSettings(true); setIsAdding(true); }}
                  className="text-xs font-black uppercase tracking-widest text-black underline mt-2"
                >
                  Add your first station
                </button>
              </div>
            </div>
          ) : (
            settings.stations.map(station => renderStationCard(station, predictions[station.id] || []))
          )}
        </div>

        {/* Footer */}
        <footer className="pt-8 text-center">
          <p className="text-[10px] text-gray-300 font-black uppercase tracking-[0.3em]">
            Synced: {format(lastUpdated, 'h:mm:ss a')}
          </p>
        </footer>
      </div>
    </div>
  );
}
