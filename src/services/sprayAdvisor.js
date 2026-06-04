/**
 * AI Spray Window Advisor
 * Analyzes weather conditions to recommend optimal herbicide application windows
 */

/**
 * Fetch hourly + daily forecast from Open-Meteo (free, no key required)
 * @param {number} lat
 * @param {number} lon
 * @param {number} days - number of forecast days (1–16)
 */
async function fetchWeatherForecast(lat, lon, days = 3) {
  const hourlyVars = 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,precipitation_probability';
  const dailyVars = 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${hourlyVars}&daily=${dailyVars}&forecast_days=${days}&timezone=auto&wind_speed_unit=kmh`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const data = await res.json();

  return {
    hourly: data.hourly,
    daily: data.daily,
    location: { lat, lon, timezone: data.timezone }
  };
}

// Optimal spray conditions
const OPTIMAL_CONDITIONS = {
  temperature: { min: 15, max: 25, ideal: 20 }, // °C
  humidity: { min: 50, max: 85, ideal: 70 }, // %
  windSpeed: { min: 3, max: 15, ideal: 8 }, // km/h
  precipitation: { max: 0.2 }, // mm/h
  deltaT: { min: 2, max: 8, ideal: 4 } // Delta T for droplet evaporation
};

// Risk thresholds
const RISK_LEVELS = {
  LOW: { score: 80, label: 'Excellent', color: 'emerald', icon: 'check' },
  MODERATE: { score: 60, label: 'Good', color: 'amber', icon: 'alert' },
  HIGH: { score: 40, label: 'Fair', color: 'orange', icon: 'warning' },
  UNSUITABLE: { score: 0, label: 'Do Not Spray', color: 'red', icon: 'ban' }
};

/**
 * Calculate Delta T (temperature - wet bulb temperature proxy)
 * Simple approximation using temperature and relative humidity
 */
function calculateDeltaT(temp, humidity) {
  // Simplified delta T approximation
  // More accurate calculation would use wet bulb temperature
  const wetBulbApprox = temp * Math.atan(0.151977 * Math.sqrt(humidity + 8.313659)) +
    Math.atan(temp + humidity) - Math.atan(humidity - 1.676331) +
    0.00391838 * Math.pow(humidity, 1.5) * Math.atan(0.023101 * humidity) - 4.686035;
  return temp - wetBulbApprox;
}

/**
 * Calculate spray window score (0-100)
 */
function calculateSprayScore(conditions) {
  const { temperature, humidity, windSpeed, precipitation } = conditions;
  
  let score = 100;
  const issues = [];
  
  // Temperature scoring
  if (temperature < 10 || temperature > 30) {
    score -= 30;
    issues.push(temperature < 10 ? 'Too cold - poor herbicide uptake' : 'Too hot - risk of volatilization');
  } else if (temperature < 15 || temperature > 25) {
    score -= 15;
    issues.push(temperature < 15 ? 'Cool conditions' : 'Warm conditions');
  }
  
  // Humidity scoring
  if (humidity < 40 || humidity > 90) {
    score -= 25;
    issues.push(humidity < 40 ? 'Low humidity - droplets evaporate quickly' : 'High humidity - slow drying');
  } else if (humidity < 50 || humidity > 85) {
    score -= 10;
  }
  
  // Wind scoring
  if (windSpeed < 2 || windSpeed > 20) {
    score -= 30;
    issues.push(windSpeed < 2 ? 'No wind - inversion risk' : 'Too windy - drift risk');
  } else if (windSpeed < 3 || windSpeed > 15) {
    score -= 15;
    issues.push(windSpeed < 3 ? 'Light wind - use caution' : 'Breezy - watch for drift');
  }
  
  // Precipitation scoring
  if (precipitation > 0.5) {
    score -= 40;
    issues.push('Rain expected - washoff risk');
  } else if (precipitation > 0.2) {
    score -= 20;
    issues.push('Light rain possible');
  }
  
  // Delta T check
  const deltaT = calculateDeltaT(temperature, humidity);
  if (deltaT > 10) {
    score -= 25;
    issues.push('High Delta T - droplet evaporation risk');
  } else if (deltaT < 2) {
    score -= 15;
    issues.push('Low Delta T - slow drying conditions');
  }
  
  return { score: Math.max(0, score), issues, deltaT };
}

/**
 * Get risk level from score
 */
function getRiskLevel(score) {
  if (score >= 80) return RISK_LEVELS.LOW;
  if (score >= 60) return RISK_LEVELS.MODERATE;
  if (score >= 40) return RISK_LEVELS.HIGH;
  return RISK_LEVELS.UNSUITABLE;
}

/**
 * Analyze spray conditions for a specific time
 */
export async function analyzeSprayWindow(lat, lon, targetTime = null) {
  try {
    const forecast = await fetchWeatherForecast(lat, lon, 3);
    
    if (!forecast || !forecast.hourly) {
      return { error: 'Unable to fetch weather data' };
    }
    
    const { hourly } = forecast;
    const currentHour = new Date().getHours();
    
    // Find best windows in next 72 hours
    const windows = [];
    
    for (let i = 0; i < hourly.time.length; i++) {
      const hourTime = new Date(hourly.time[i]);
      const hour = hourTime.getHours();
      
      // Skip nighttime hours (typically not spraying hours)
      if (hour < 6 || hour > 20) continue;
      
      const conditions = {
        temperature: hourly.temperature_2m[i],
        humidity: hourly.relative_humidity_2m[i],
        windSpeed: hourly.wind_speed_10m[i],
        precipitation: hourly.precipitation[i] || 0
      };
      
      const analysis = calculateSprayScore(conditions);
      const riskLevel = getRiskLevel(analysis.score);
      
      // Only include windows with at least FAIR conditions
      if (analysis.score >= 40) {
        windows.push({
          time: hourTime,
          hour,
          score: analysis.score,
          riskLevel,
          conditions,
          deltaT: analysis.deltaT,
          issues: analysis.issues,
          dayLabel: getDayLabel(hourTime)
        });
      }
    }
    
    // Sort by score descending
    windows.sort((a, b) => b.score - a.score);
    
    // Group by day
    const groupedByDay = groupWindowsByDay(windows);
    
    // Get best overall window
    const bestWindow = windows[0] || null;
    
    return {
      current: getCurrentConditions(hourly, currentHour),
      bestWindow,
      allWindows: windows.slice(0, 20), // Top 20 windows
      groupedByDay,
      location: forecast.location,
      recommendation: generateRecommendation(bestWindow, windows)
    };
    
  } catch (error) {
    console.error('[SprayAdvisor] Analysis failed:', error);
    return { error: error.message || 'Failed to analyze spray conditions' };
  }
}

/**
 * Get current weather conditions
 */
function getCurrentConditions(hourly, currentHour) {
  const idx = hourly.time.findIndex(t => {
    const h = new Date(t).getHours();
    return h === currentHour;
  });
  
  if (idx === -1) return null;
  
  const conditions = {
    temperature: hourly.temperature_2m[idx],
    humidity: hourly.relative_humidity_2m[idx],
    windSpeed: hourly.wind_speed_10m[idx],
    precipitation: hourly.precipitation[idx] || 0
  };
  
  const analysis = calculateSprayScore(conditions);
  
  return {
    conditions,
    score: analysis.score,
    riskLevel: getRiskLevel(analysis.score),
    issues: analysis.issues,
    deltaT: analysis.deltaT
  };
}

/**
 * Get day label for window
 */
function getDayLabel(date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dateStr = date.toDateString();
  
  if (dateStr === today.toDateString()) return 'Today';
  if (dateStr === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Group windows by day
 */
function groupWindowsByDay(windows) {
  const grouped = {};
  
  windows.forEach(w => {
    const day = w.dayLabel;
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(w);
  });
  
  return grouped;
}

/**
 * Generate human-readable recommendation
 */
function generateRecommendation(bestWindow, allWindows) {
  if (!bestWindow) {
    return {
      summary: 'No suitable spray windows found in the next 72 hours.',
      advice: 'Weather conditions are unfavorable. Consider postponing application or consult local weather forecasts.',
      urgency: 'low'
    };
  }
  
  const { score, riskLevel, time, issues } = bestWindow;
  const timeStr = time.toLocaleString('en-US', { 
    weekday: 'short', 
    hour: 'numeric',
    hour12: true 
  });
  
  let summary, advice, urgency;
  
  if (score >= 80) {
    summary = `Excellent spray conditions expected ${timeStr === 'Today' ? 'today' : timeStr}.`;
    advice = 'Ideal conditions for herbicide application. Proceed with confidence.';
    urgency = 'high';
  } else if (score >= 60) {
    summary = `Good spray window available ${timeStr === 'Today' ? 'this afternoon' : timeStr}.`;
    advice = 'Favorable conditions. Monitor wind direction and adjust nozzle selection if needed.';
    urgency = 'medium';
  } else if (score >= 40) {
    summary = `Marginal spray window ${timeStr === 'Today' ? 'later today' : timeStr}.`;
    advice = 'Conditions are acceptable but not ideal. Consider lower application rates or drift-reduction nozzles.';
    urgency = 'low';
  } else {
    summary = 'No optimal spray windows identified.';
    advice = 'Consider waiting for better conditions or consult with your agronomist.';
    urgency = 'low';
  }
  
  // Add specific issue warnings
  if (issues.length > 0 && score < 70) {
    advice += ` Note: ${issues.slice(0, 2).join('; ')}.`;
  }
  
  return { summary, advice, urgency, bestTime: timeStr };
}

/**
 * Get extended spray forecast (7 days)
 */
export async function getExtendedSprayForecast(lat, lon) {
  try {
    const forecast = await fetchWeatherForecast(lat, lon, 7);
    
    if (!forecast || !forecast.daily) {
      return { error: 'Unable to fetch extended forecast' };
    }
    
    const dailyAnalysis = [];
    
    for (let i = 0; i < forecast.daily.time.length; i++) {
      const date = new Date(forecast.daily.time[i]);
      
      // Calculate average conditions for the day
      const conditions = {
        maxTemp: forecast.daily.temperature_2m_max[i],
        minTemp: forecast.daily.temperature_2m_min[i],
        avgHumidity: forecast.daily.relative_humidity_2m_mean?.[i] || 65,
        maxWind: forecast.daily.wind_speed_10m_max[i],
        precipitation: forecast.daily.precipitation_sum[i] || 0
      };
      
      // Simple daily score based on extremes
      let dayScore = 100;
      const dayIssues = [];
      
      if (conditions.maxTemp > 28) {
        dayScore -= 20;
        dayIssues.push('Hot conditions expected');
      }
      if (conditions.minTemp < 8) {
        dayScore -= 15;
        dayIssues.push('Cool morning temperatures');
      }
      if (conditions.maxWind > 20) {
        dayScore -= 25;
        dayIssues.push('Windy conditions');
      }
      if (conditions.precipitation > 5) {
        dayScore -= 30;
        dayIssues.push('Rain expected');
      }
      
      dailyAnalysis.push({
        date,
        dayLabel: getDayLabel(date),
        conditions,
        score: Math.max(0, dayScore),
        riskLevel: getRiskLevel(dayScore),
        issues: dayIssues
      });
    }
    
    return {
      daily: dailyAnalysis,
      bestDays: dailyAnalysis.filter(d => d.score >= 70).slice(0, 3),
      avoidDays: dailyAnalysis.filter(d => d.score < 40)
    };
    
  } catch (error) {
    console.error('[SprayAdvisor] Extended forecast failed:', error);
    return { error: error.message };
  }
}

// Window exports
if (typeof window !== 'undefined') {
  window.analyzeSprayWindow = analyzeSprayWindow;
  window.getExtendedSprayForecast = getExtendedSprayForecast;
}

export default {
  analyzeSprayWindow,
  getExtendedSprayForecast,
  calculateDeltaT,
  RISK_LEVELS
};
