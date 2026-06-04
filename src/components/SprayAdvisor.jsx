/**
 * Spray Advisor Component
 * AI-powered weather-based spray window recommendations
 */

import { useState, useEffect, useCallback } from 'react';
import { analyzeSprayWindow, getExtendedSprayForecast } from '../services/sprayAdvisor.js';
import { 
  CloudRain, Wind, Thermometer, Droplets, 
  CheckCircle, AlertTriangle, XCircle, Clock,
  MapPin, RefreshCw, ChevronRight, Calendar
} from 'lucide-react';

export default function SprayAdvisor({ lat, lon, locationName = 'Current Location' }) {
  const [analysis, setAnalysis] = useState(null);
  const [extendedForecast, setExtendedForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('current');

  const loadAnalysis = useCallback(async () => {
    if (!lat || !lon) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [sprayAnalysis, extended] = await Promise.all([
        analyzeSprayWindow(lat, lon),
        getExtendedSprayForecast(lat, lon)
      ]);
      
      if (sprayAnalysis.error) {
        setError(sprayAnalysis.error);
      } else {
        setAnalysis(sprayAnalysis);
      }
      
      if (!extended.error) {
        setExtendedForecast(extended);
      }
    } catch (err) {
      setError(err.message || 'Failed to load spray analysis');
    } finally {
      setLoading(false);
    }
  }, [lat, lon]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
    if (score >= 40) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Unsuitable';
  };

  const getScoreIcon = (score) => {
    if (score >= 80) return <CheckCircle className="w-5 h-5 text-emerald-600" />;
    if (score >= 60) return <AlertTriangle className="w-5 h-5 text-amber-600" />;
    if (score >= 40) return <AlertTriangle className="w-5 h-5 text-orange-600" />;
    return <XCircle className="w-5 h-5 text-red-600" />;
  };

  if (!lat || !lon) {
    return (
      <div className="bg-slate-50 rounded-xl p-6 text-center">
        <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600">Location required for spray analysis</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudRain className="w-6 h-6" />
            <h3 className="font-bold text-lg">AI Spray Advisor</h3>
          </div>
          <button 
            onClick={loadAnalysis}
            disabled={loading}
            className="p-2 hover:bg-white/20 rounded-lg transition disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-emerald-100 text-sm mt-1 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {locationName}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {[
          { id: 'current', label: 'Current', icon: Clock },
          { id: 'best', label: 'Best Windows', icon: CheckCircle },
          { id: 'forecast', label: '7-Day Forecast', icon: Calendar }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-sm font-medium transition ${
              activeTab === tab.id 
                ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {loading && (
          <div className="py-8 text-center">
            <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Analyzing weather conditions...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && analysis && (
          <>
            {/* Current Conditions Tab */}
            {activeTab === 'current' && analysis.current && (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border-2 ${getScoreColor(analysis.current.score)}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getScoreIcon(analysis.current.score)}
                      <span className="font-bold text-lg">
                        {getScoreLabel(analysis.current.score)}
                      </span>
                    </div>
                    <span className="text-2xl font-bold">{analysis.current.score}/100</span>
                  </div>
                  
                  {analysis.current.issues.length > 0 && (
                    <ul className="space-y-1 text-sm mt-2">
                      {analysis.current.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Current Weather Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                      <Thermometer className="w-4 h-4" /> Temperature
                    </div>
                    <p className="font-semibold text-slate-800">
                      {analysis.current.conditions.temperature}°C
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                      <Droplets className="w-4 h-4" /> Humidity
                    </div>
                    <p className="font-semibold text-slate-800">
                      {analysis.current.conditions.humidity}%
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                      <Wind className="w-4 h-4" /> Wind Speed
                    </div>
                    <p className="font-semibold text-slate-800">
                      {analysis.current.conditions.windSpeed} km/h
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                      <CloudRain className="w-4 h-4" /> Precipitation
                    </div>
                    <p className="font-semibold text-slate-800">
                      {analysis.current.conditions.precipitation} mm
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Delta T:</strong> {analysis.current.deltaT?.toFixed(1)}°C
                    <span className="text-blue-600 ml-2">
                      ({analysis.current.deltaT > 10 ? 'High evaporation risk' : 
                        analysis.current.deltaT < 2 ? 'Slow drying' : 'Optimal range'})
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Best Windows Tab */}
            {activeTab === 'best' && (
              <div className="space-y-4">
                {analysis.recommendation && (
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
                    <h4 className="font-bold text-emerald-800 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      AI Recommendation
                    </h4>
                    <p className="text-emerald-900 font-medium">{analysis.recommendation.summary}</p>
                    <p className="text-emerald-700 text-sm mt-2">{analysis.recommendation.advice}</p>
                  </div>
                )}

                {analysis.bestWindow ? (
                  <div className={`p-4 rounded-xl border-2 ${getScoreColor(analysis.bestWindow.score)}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold">Best Window</span>
                      <span className="text-2xl font-bold">{analysis.bestWindow.score}/100</span>
                    </div>
                    <p className="text-lg font-semibold">
                      {analysis.bestWindow.dayLabel}, {analysis.bestWindow.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs">
                      <span className="px-2 py-1 bg-white/50 rounded">
                        {analysis.bestWindow.conditions.temperature}°C
                      </span>
                      <span className="px-2 py-1 bg-white/50 rounded">
                        {analysis.bestWindow.conditions.humidity}% RH
                      </span>
                      <span className="px-2 py-1 bg-white/50 rounded">
                        {analysis.bestWindow.conditions.windSpeed} km/h wind
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500">
                    <XCircle className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p>No optimal spray windows found</p>
                  </div>
                )}

                {/* Other Good Windows */}
                {analysis.allWindows && analysis.allWindows.length > 1 && (
                  <div>
                    <h4 className="font-semibold text-slate-700 mb-3">Alternative Windows</h4>
                    <div className="space-y-2">
                      {analysis.allWindows.slice(1, 6).map((window, i) => (
                        <div 
                          key={i} 
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                              window.score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                              window.score >= 60 ? 'bg-amber-100 text-amber-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {window.score}
                            </span>
                            <div>
                              <p className="font-medium text-slate-800">
                                {window.dayLabel}, {window.time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </p>
                              <p className="text-xs text-slate-500">
                                {window.conditions.temperature}°C • {window.conditions.windSpeed} km/h
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 7-Day Forecast Tab */}
            {activeTab === 'forecast' && extendedForecast && (
              <div className="space-y-4">
                {extendedForecast.daily && (
                  <div className="space-y-2">
                    {extendedForecast.daily.map((day, i) => (
                      <div 
                        key={i}
                        className={`p-3 rounded-lg border ${
                          day.score >= 70 ? 'bg-emerald-50 border-emerald-200' :
                          day.score >= 40 ? 'bg-amber-50 border-amber-200' :
                          'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                              day.score >= 70 ? 'bg-emerald-100 text-emerald-700' :
                              day.score >= 40 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {day.score}
                            </span>
                            <div>
                              <p className="font-semibold text-slate-800">{day.dayLabel}</p>
                              <p className="text-xs text-slate-500">
                                {day.conditions.minTemp}°C - {day.conditions.maxTemp}°C • 
                                {' '}{day.conditions.precipitation}mm rain
                              </p>
                            </div>
                          </div>
                          <span className={`text-sm font-medium ${
                            day.score >= 70 ? 'text-emerald-700' :
                            day.score >= 40 ? 'text-amber-700' :
                            'text-red-700'
                          }`}>
                            {getScoreLabel(day.score)}
                          </span>
                        </div>
                        
                        {day.issues.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-black/5">
                            <p className="text-xs text-slate-600">
                              {day.issues.join(' • ')}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!loading && !error && !analysis && (
          <div className="text-center py-8 text-slate-500">
            <CloudRain className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Click refresh to analyze spray conditions</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
        <p className="text-xs text-slate-500 text-center">
          Based on Open-Meteo weather data • Always verify conditions locally before spraying
        </p>
      </div>
    </div>
  );
}
