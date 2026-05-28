/**
 * Smart Alerts Dashboard Component
 * Displays AI-generated alerts for regrowth, efficacy decline, and rescue recommendations
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { generateAllAlerts, getAlertCounts, ALERT_TYPES, ALERT_SEVERITY } from '../services/alertsService.js';
import { 
  AlertTriangle, AlertCircle, CheckCircle, Info,
  TrendingDown, Sprout, Clock, MapPin, ChevronRight,
  X, Bell, Filter
} from 'lucide-react';

export default function SmartAlerts({ onViewTrial, compact = false }) {
  const { state } = useAppState();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, critical, rescue, observation
  const [dismissed, setDismissed] = useState(new Set());

  // Load alerts
  useEffect(() => {
    const loadAlerts = () => {
      setLoading(true);
      const allAlerts = generateAllAlerts(state);
      setAlerts(allAlerts);
      setLoading(false);
    };

    loadAlerts();
    
    // Refresh every 5 minutes
    const interval = setInterval(loadAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [state]);

  // Get alert counts
  const counts = useMemo(() => getAlertCounts(alerts), [alerts]);

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    let filtered = alerts.filter(a => !dismissed.has(a.id));
    
    switch (filter) {
      case 'critical':
        filtered = filtered.filter(a => a.severity.level >= 3);
        break;
      case 'rescue':
        filtered = filtered.filter(a => a.type === ALERT_TYPES.RESCUE_RECOMMENDED);
        break;
      case 'observation':
        filtered = filtered.filter(a => a.type === ALERT_TYPES.OBSERVATION_DUE);
        break;
      case 'regrowth':
        filtered = filtered.filter(a => a.type === ALERT_TYPES.REGROWTH_DETECTED);
        break;
    }
    
    return filtered;
  }, [alerts, filter, dismissed]);

  // Dismiss alert
  const handleDismiss = useCallback((alertId) => {
    setDismissed(prev => new Set([...prev, alertId]));
  }, []);

  // Get alert icon
  const getAlertIcon = (type, severity) => {
    const iconClass = `w-5 h-5 ${severity.color === 'red' ? 'text-red-500' : severity.color === 'orange' ? 'text-orange-500' : severity.color === 'amber' ? 'text-amber-500' : 'text-blue-500'}`;
    
    switch (type) {
      case ALERT_TYPES.REGROWTH_DETECTED:
        return <Sprout className={iconClass} />;
      case ALERT_TYPES.EFFICACY_DECLINE:
        return <TrendingDown className={iconClass} />;
      case ALERT_TYPES.RESCUE_RECOMMENDED:
        return <AlertTriangle className={iconClass} />;
      case ALERT_TYPES.OBSERVATION_DUE:
        return <Clock className={iconClass} />;
      default:
        return <Info className={iconClass} />;
    }
  };

  // Get severity badge
  const getSeverityBadge = (severity) => {
    const colors = {
      red: 'bg-red-100 text-red-700 border-red-200',
      orange: 'bg-orange-100 text-orange-700 border-orange-200',
      amber: 'bg-amber-100 text-amber-700 border-amber-200',
      blue: 'bg-blue-100 text-blue-700 border-blue-200'
    };
    
    return (
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${colors[severity.color]}`}>
        {severity.label}
      </span>
    );
  };

  // Compact view
  if (compact) {
    const criticalCount = counts.critical + counts.high;
    
    if (alerts.length === 0) {
      return (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-800">All Clear</p>
            <p className="text-xs text-emerald-600">No alerts requiring attention</p>
          </div>
        </div>
      );
    }

    return (
      <div className={`${criticalCount > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'} border rounded-xl p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${criticalCount > 0 ? 'bg-red-100' : 'bg-amber-100'}`}>
              <Bell className={`w-5 h-5 ${criticalCount > 0 ? 'text-red-600' : 'text-amber-600'}`} />
            </div>
            <div>
              <p className={`font-bold ${criticalCount > 0 ? 'text-red-800' : 'text-amber-800'}`}>
                {alerts.length} Alert{alerts.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-slate-600">
                {counts.critical > 0 && `${counts.critical} critical • `}
                {counts.high > 0 && `${counts.high} high priority • `}
                {filteredAlerts.length} requiring attention
              </p>
            </div>
          </div>
          <button 
            onClick={() => window.location.href = '#/alerts'}
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            View <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-6 h-6" />
            <h3 className="font-bold text-lg">Smart Alerts</h3>
          </div>
          {alerts.length > 0 && (
            <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-semibold">
              {alerts.length} active
            </span>
          )}
        </div>
        <p className="text-amber-100 text-sm mt-1">
          AI-powered monitoring for regrowth, efficacy decline, and rescue opportunities
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {[
          { id: 'all', label: 'All', count: alerts.length - dismissed.size },
          { id: 'critical', label: 'Critical', count: counts.critical },
          { id: 'rescue', label: 'Rescue', count: alerts.filter(a => a.type === ALERT_TYPES.RESCUE_RECOMMENDED && !dismissed.has(a.id)).length },
          { id: 'observation', label: 'Due', count: alerts.filter(a => a.type === ALERT_TYPES.OBSERVATION_DUE && !dismissed.has(a.id)).length },
          { id: 'regrowth', label: 'Regrowth', count: alerts.filter(a => a.type === ALERT_TYPES.REGROWTH_DETECTED && !dismissed.has(a.id)).length }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition ${
              filter === tab.id
                ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                filter === tab.id ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Alert List */}
      <div className="p-4">
        {loading ? (
          <div className="py-8 text-center">
            <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Analyzing trials...</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center py-12">
            {alerts.length === 0 ? (
              <>
                <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700">All Trials Looking Good</p>
                <p className="text-sm text-slate-500 mt-1">No alerts detected at this time</p>
              </>
            ) : (
              <>
                <Filter className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700">No {filter !== 'all' ? filter : ''} alerts</p>
                <p className="text-sm text-slate-500 mt-1">Try changing the filter</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map(alert => (
              <div 
                key={alert.id}
                className={`p-4 rounded-xl border-2 transition hover:shadow-md ${
                  alert.severity.color === 'red' ? 'bg-red-50 border-red-200' :
                  alert.severity.color === 'orange' ? 'bg-orange-50 border-orange-200' :
                  alert.severity.color === 'amber' ? 'bg-amber-50 border-amber-200' :
                  'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      alert.severity.color === 'red' ? 'bg-red-100' :
                      alert.severity.color === 'orange' ? 'bg-orange-100' :
                      alert.severity.color === 'amber' ? 'bg-amber-100' :
                      'bg-blue-100'
                    }`}>
                      {getAlertIcon(alert.type, alert.severity)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-slate-800">{alert.title}</h4>
                        {getSeverityBadge(alert.severity)}
                      </div>
                      <p className="text-sm text-slate-600">{alert.message}</p>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {alert.trialName}
                      </p>
                      
                      {/* Actionable details */}
                      {alert.details && (
                        <div className="mt-2 text-xs text-slate-600 bg-white/50 p-2 rounded">
                          {alert.type === ALERT_TYPES.REGROWTH_DETECTED && (
                            <>
                              Weed cover increased from {alert.details.minCover?.toFixed(1)}% to {alert.details.currentCover?.toFixed(1)}% over {alert.details.daysSinceMin} days
                            </>
                          )}
                          {alert.type === ALERT_TYPES.RESCUE_RECOMMENDED && (
                            <>
                              <strong>Reason:</strong> {alert.details.reason}
                              <br />
                              <strong>Recommended window:</strong> {alert.details.recommendedWindow}
                            </>
                          )}
                          {alert.type === ALERT_TYPES.OBSERVATION_DUE && (
                            <>
                              Last observation: {alert.details.lastDAA} DAA
                              <br />
                              Target: {alert.details.recommendedDAA} DAA
                              {alert.details.overdue && (
                                <span className="text-red-600 font-semibold"> • {alert.details.daysOverdue} days overdue</span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      
                      {/* Action buttons */}
                      {alert.actionable && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => window.location.href = `#/trials?focus=${alert.trialId}`}
                            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                          >
                            View Trial
                          </button>
                          <button
                            onClick={() => window.location.href = `#/trials?focus=${alert.trialId}`}
                            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition"
                          >
                            {alert.actionLabel}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="p-1.5 hover:bg-black/5 rounded-lg text-slate-400 hover:text-slate-600 transition"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary Footer */}
      {!loading && alerts.length > 0 && (
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            {counts.critical > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" /> {counts.critical} Critical
              </span>
            )}
            {counts.high > 0 && (
              <span className="flex items-center gap-1 text-orange-600 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> {counts.high} High
              </span>
            )}
            {counts.medium > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <Info className="w-3.5 h-3.5" /> {counts.medium} Medium
              </span>
            )}
            <span className="ml-auto text-slate-400">
              Last updated: {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
