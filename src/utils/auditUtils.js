/**
 * Data Quality Audit and Recovery Utilities
 * Handles validation, auditing, and AI-assisted chart recovery for trials
 */

import { safeJsonParse } from './helpers.js';
import { validateEfficacyData } from './analysisUtils.js';
import { calculateDAA, toDateKey } from './dateUtils.js';
import { computeObservationTotalCover } from './coverUtils.js';

/**
 * Calculate Weed Control Efficacy (WCE) using Abbott's formula
 * Returns percentage of weed control (0-100+)
 */
function calculateWCE(baselineCover, currentCover) {
    if (!isFinite(baselineCover) || !isFinite(currentCover) || baselineCover <= 0) return null;
    const wce = ((baselineCover - currentCover) / baselineCover) * 100;
    return Math.max(-100, Math.min(200, wce)); // Clamp to reasonable range
}

/**
 * Run a comprehensive data quality audit on a project
 * Returns array of issues found
 */
export async function runAuditScan(projectId, state) {
    if (!projectId || !state) return [];

    const project = (state.projects || []).find(p => p.ID === projectId);
    if (!project) return [{ type: 'error', message: 'Project not found' }];

    const projectTrials = (state.trials || []).filter(t => t.ProjectID === projectId);
    const blocks = (state.blocks || []).filter(b => b.ProjectID === projectId);
    const issues = [];

    // 1. Check for trials with no efficacy data
    const noEfficacy = projectTrials.filter(t => {
        const data = safeJsonParse(t.EfficacyDataJSON, []);
        return data.length === 0;
    });
    if (noEfficacy.length > 0) {
        issues.push({
            type: 'warning',
            category: 'Data Completeness',
            message: `${noEfficacy.length} trial(s) have no efficacy observations`,
            details: noEfficacy.map(t => ({ id: t.ID, name: t.FormulationName })),
            suggestion: 'Add efficacy observations to these trials'
        });
    }

    // 2. Check for trials with inconsistent DAA values (missing days)
    const inconsistentDAA = projectTrials.filter(t => {
        const data = validateEfficacyData(safeJsonParse(t.EfficacyDataJSON, []));
        if (data.length < 2) return false;
        // Check for large gaps in DAA
        for (let i = 1; i < data.length; i++) {
            const gap = data[i].daa - data[i-1].daa;
            if (gap > 14) return true; // Gap larger than 2 weeks
        }
        return false;
    });
    if (inconsistentDAA.length > 0) {
        issues.push({
            type: 'warning',
            category: 'Observation Frequency',
            message: `${inconsistentDAA.length} trial(s) have gaps >14 days between observations`,
            details: inconsistentDAA.map(t => ({ id: t.ID, name: t.FormulationName })),
            suggestion: 'Consider adding intermediate observations'
        });
    }

    // 3. Check for trials with no photos
    const noPhotos = projectTrials.filter(t => {
        const photos = safeJsonParse(t.PhotoURLs, []);
        return photos.length === 0;
    });
    if (noPhotos.length > projectTrials.length * 0.5) {
        issues.push({
            type: 'info',
            category: 'Documentation',
            message: `${noPhotos.length} trial(s) have no photographic evidence`,
            details: [],
            suggestion: 'Consider adding photos for visual documentation'
        });
    }

    // 4. Check RCBD balance
    const treatments = [...new Set(projectTrials.map(t => t.FormulationName).filter(Boolean))];
    const blockIds = [...new Set(blocks.map(b => b.ID))];

    blockIds.forEach(blockId => {
        const blockTrials = projectTrials.filter(t => t.BlockID === blockId);
        const blockTreatments = [...new Set(blockTrials.map(t => t.FormulationName).filter(Boolean))];
        const missing = treatments.filter(t => !blockTreatments.includes(t));
        if (missing.length > 0) {
            issues.push({
                type: 'error',
                category: 'Design Integrity',
                message: `Block ${blocks.find(b => b.ID === blockId)?.Name || blockId} missing ${missing.length} treatment(s)`,
                details: [{ blockId, missing }],
                suggestion: 'Complete block design before analysis'
            });
        }
    });

    // 5. Check for missing control plots
    const controls = projectTrials.filter(t => t.IsControl || t.FormulationName?.toLowerCase().includes('control'));
    if (controls.length === 0) {
        issues.push({
            type: 'error',
            category: 'Design Integrity',
            message: 'No control plot detected in project',
            details: [],
            suggestion: 'Add at least one untreated control plot per block'
        });
    }

    // 6. Check for incomplete trials (not marked complete but have data)
    const incomplete = projectTrials.filter(t => {
        const data = safeJsonParse(t.EfficacyDataJSON, []);
        return data.length >= 3 && !t.IsCompleted;
    });
    if (incomplete.length > 0) {
        issues.push({
            type: 'info',
            category: 'Status',
            message: `${incomplete.length} trial(s) have sufficient data but are not marked complete`,
            details: incomplete.map(t => ({ id: t.ID, name: t.FormulationName })),
            suggestion: 'Mark trials as complete when observations are finished'
        });
    }

    // 7. Check for extreme outliers in efficacy data
    const outliers = [];
    projectTrials.forEach(t => {
        const data = validateEfficacyData(safeJsonParse(t.EfficacyDataJSON, []));
        data.forEach(obs => {
            if (obs.weedCover != null) {
                // Flag values outside 0-100 range or sudden jumps
                if (obs.weedCover < 0 || obs.weedCover > 100) {
                    outliers.push({ trial: t.FormulationName, daa: obs.daa, value: obs.weedCover });
                }
            }
        });
    });
    if (outliers.length > 0) {
        issues.push({
            type: 'warning',
            category: 'Data Quality',
            message: `${outliers.length} observations have unusual weed cover values`,
            details: outliers.slice(0, 5),
            suggestion: 'Review and correct data entry errors'
        });
    }

    // 8. Check for missing weather data
    const noWeather = projectTrials.filter(t =>
        !t.Temperature && !t.Humidity && !t.Windspeed && !t.Rain
    );
    if (noWeather.length > projectTrials.length * 0.5) {
        issues.push({
            type: 'info',
            category: 'Environmental Data',
            message: `${noWeather.length} trial(s) have no weather data`,
            details: [],
            suggestion: 'Add application weather conditions for context'
        });
    }

    return issues;
}

/**
 * Attempt to recover/fix chart data using AI-assisted analysis
 * Modes: 'efficacy', 'photos', 'all'
 */
export async function attemptChartRecovery(trialId, mode = 'all', state) {
    if (!trialId || !state) return { success: false, error: 'Missing trial ID or state' };

    const trial = (state.trials || []).find(t => t.ID === trialId);
    if (!trial) return { success: false, error: 'Trial not found' };

    const results = {
        success: true,
        trialId,
        mode,
        actions: [],
        warnings: []
    };

    try {
        // 1. Efficacy data recovery - normalize and validate
        if (mode === 'efficacy' || mode === 'all') {
            let efficacyData = safeJsonParse(trial.EfficacyDataJSON, []);

            if (efficacyData.length > 0) {
                // Sort by DAA
                efficacyData.sort((a, b) => (a.daa || 0) - (b.daa || 0));

                // Fill in missing dates if possible
                efficacyData = efficacyData.map((obs, idx) => {
                    if (!obs.date && trial.Date && obs.daa != null) {
                        const baseDate = new Date(trial.Date);
                        baseDate.setDate(baseDate.getDate() + obs.daa);
                        obs.date = baseDate.toISOString().split('T')[0];
                        results.actions.push(`Filled missing date for DAA ${obs.daa}`);
                    }
                    return obs;
                });

                // Recalculate WCE if baseline exists
                const baseline = efficacyData.find(o => o.daa === 0) || efficacyData[0];
                if (baseline && baseline.weedCover != null) {
                    efficacyData = efficacyData.map(obs => ({
                        ...obs,
                        wce: obs.daa === baseline.daa ? null : calculateWCE(baseline.weedCover, obs.weedCover)
                    }));
                    results.actions.push('Recalculated WCE values');
                }

                trial.EfficacyDataJSON = JSON.stringify(efficacyData);
            }
        }

        // 2. Photo recovery - validate URLs and structure
        if (mode === 'photos' || mode === 'all') {
            let photos = safeJsonParse(trial.PhotoURLs, []);

            if (photos.length > 0) {
                // Filter out invalid entries
                const validPhotos = photos.filter(p => p && (p.url || p.fileData || p.id));
                if (validPhotos.length !== photos.length) {
                    results.actions.push(`Removed ${photos.length - validPhotos.length} invalid photo entries`);
                }
                trial.PhotoURLs = JSON.stringify(validPhotos);
            }
        }

        // 3. Statistics repair
        if (mode === 'all') {
            const efficacyData = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []));
            if (efficacyData.length > 0) {
                // Ensure StatisticsJSON exists and has basic structure
                let stats = safeJsonParse(trial.StatisticsJSON, {});
                if (!stats.observations || stats.observations !== efficacyData.length) {
                    stats.observations = efficacyData.length;
                    stats.lastCalculated = new Date().toISOString();
                    trial.StatisticsJSON = JSON.stringify(stats);
                    results.actions.push('Updated statistics metadata');
                }
            }
        }

        // Return the repaired trial data
        results.repairedTrial = trial;

    } catch (err) {
        results.success = false;
        results.error = err.message;
    }

    return results;
}

/**
 * Build species continuity table for reports
 */
export function buildSpeciesContinuityTable(efficacyData) {
    const rows = [];
    const ordered = validateEfficacyData(Array.isArray(efficacyData) ? efficacyData : [])
        .slice()
        .sort((a, b) => (a.daa || 0) - (b.daa || 0));

    if (ordered.length === 0) {
        return { rows: [], summary: 'No efficacy data available' };
    }

    // Find max weed cover for normalization
    const maxCover = Math.max(...ordered.map(o => o.weedCover || 0).filter(v => v > 0), 1);

    ordered.forEach((obs, i) => {
        const prev = i > 0 ? ordered[i - 1] : null;
        const cover = obs.weedCover || 0;
        const change = prev ? cover - (prev.weedCover || 0) : 0;
        const trend = change < -5 ? 'Declining' : change > 5 ? 'Increasing' : 'Stable';

        rows.push({
            daa: obs.daa,
            weedCover: cover,
            change: change.toFixed(1),
            trend,
            wce: obs.wce != null ? `${obs.wce.toFixed(1)}%` : 'N/A'
        });
    });

    // Calculate summary stats
    const first = ordered[0].weedCover || 0;
    const last = ordered[ordered.length - 1].weedCover || 0;
    const totalChange = (last - first).toFixed(1);

    return {
        rows,
        summary: `Initial: ${first}%, Final: ${last}%, Total Change: ${totalChange}%`,
        totalObservations: ordered.length
    };
}

/**
 * Build environmental suitability index
 */
export function buildEnvironmentalSuitabilityIndex(trial) {
    if (!trial) {
        return { score: 0, className: 'Unavailable', note: 'No trial data available' };
    }

    const factors = [];
    let score = 50; // Base score

    // Temperature factor (optimal 15-25°C)
    if (trial.Temperature) {
        const temp = parseFloat(trial.Temperature);
        if (temp >= 15 && temp <= 25) {
            factors.push({ name: 'Temperature', value: temp, rating: 'Optimal', impact: +15 });
            score += 15;
        } else if (temp >= 10 && temp <= 30) {
            factors.push({ name: 'Temperature', value: temp, rating: 'Acceptable', impact: +5 });
            score += 5;
        } else {
            factors.push({ name: 'Temperature', value: temp, rating: 'Suboptimal', impact: -10 });
            score -= 10;
        }
    }

    // Humidity factor (optimal 50-70%)
    if (trial.Humidity) {
        const hum = parseFloat(trial.Humidity);
        if (hum >= 50 && hum <= 70) {
            factors.push({ name: 'Humidity', value: `${hum}%`, rating: 'Optimal', impact: +10 });
            score += 10;
        } else if (hum >= 30 && hum <= 80) {
            factors.push({ name: 'Humidity', value: `${hum}%`, rating: 'Acceptable', impact: +5 });
            score += 5;
        } else {
            factors.push({ name: 'Humidity', value: `${hum}%`, rating: 'Suboptimal', impact: -5 });
            score -= 5;
        }
    }

    // Wind factor (optimal <15 km/h)
    if (trial.Windspeed) {
        const wind = parseFloat(trial.Windspeed);
        if (wind < 10) {
            factors.push({ name: 'Wind Speed', value: `${wind} km/h`, rating: 'Optimal', impact: +10 });
            score += 10;
        } else if (wind < 15) {
            factors.push({ name: 'Wind Speed', value: `${wind} km/h`, rating: 'Acceptable', impact: +5 });
            score += 5;
        } else if (wind > 20) {
            factors.push({ name: 'Wind Speed', value: `${wind} km/h`, rating: 'High - Risk of drift', impact: -15 });
            score -= 15;
        }
    }

    // Rain factor (no rain preferred)
    if (trial.Rain) {
        const rain = parseFloat(trial.Rain);
        if (rain === 0) {
            factors.push({ name: 'Rainfall', value: 'None', rating: 'Optimal', impact: +10 });
            score += 10;
        } else if (rain < 2) {
            factors.push({ name: 'Rainfall', value: `${rain}mm`, rating: 'Light', impact: +2 });
            score += 2;
        } else {
            factors.push({ name: 'Rainfall', value: `${rain}mm`, rating: 'Excessive - Washoff risk', impact: -10 });
            score -= 10;
        }
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    // Determine class
    let className = 'Unknown';
    let note = '';
    if (score >= 80) {
        className = 'Excellent';
        note = 'Application conditions were highly favorable for efficacy.';
    } else if (score >= 60) {
        className = 'Good';
        note = 'Conditions were generally suitable with minor limitations.';
    } else if (score >= 40) {
        className = 'Marginal';
        note = 'Some suboptimal conditions may have affected performance.';
    } else {
        className = 'Poor';
        note = 'Application conditions were challenging. Results may be atypical.';
    }

    return { score, className, note, factors };
}

/**
 * Build statistical significance block for reports
 */
export function buildStatisticalSignificanceBlock(anovaTable) {
    if (!anovaTable || !anovaTable.fRatio || !anovaTable.pValue) {
        return {
            text: 'Statistical analysis not available.',
            significant: false,
            pVal: null,
            fVal: null,
            etaSquared: null
        };
    }

    const { fRatio, pValue, dfTreatment, dfError, msTreatment, msError } = anovaTable;
    const significant = pValue < 0.05;

    // Calculate eta-squared (effect size)
    const ssTreatment = (msTreatment || 0) * (dfTreatment || 1);
    const ssError = (msError || 0) * (dfError || 1);
    const etaSquared = ssTreatment + ssError > 0 ? ssTreatment / (ssTreatment + ssError) : 0;

    let interpretation = '';
    if (pValue < 0.001) {
        interpretation = 'Highly significant differences between treatments (p < 0.001).';
    } else if (pValue < 0.01) {
        interpretation = 'Very significant differences between treatments (p < 0.01).';
    } else if (pValue < 0.05) {
        interpretation = 'Significant differences between treatments (p < 0.05).';
    } else {
        interpretation = 'No statistically significant differences detected (p ≥ 0.05).';
    }

    const text = `ANOVA Results: F(${dfTreatment || '?'},${dfError || '?'}) = ${fRatio.toFixed(2)}, p = ${pValue.toFixed(4)}. ${interpretation} Effect size (η²) = ${etaSquared.toFixed(3)}.`;

    return {
        text,
        significant,
        pVal: pValue,
        fVal: fRatio,
        etaSquared
    };
}

/**
 * Build evidence traceability matrix for regulatory reports
 */
export function buildEvidenceTraceabilityMatrix(trial, allTrials = [], hasStats = false) {
    const rows = [];

    // Photo evidence
    const photos = safeJsonParse(trial.PhotoURLs, []);
    rows.push({
        type: 'Photographic',
        description: `Trial photographs (${photos.length} images)`,
        status: photos.length > 0 ? 'Present' : 'Missing',
        verified: photos.length > 0,
        confidence: photos.length >= 3 ? 'High' : photos.length > 0 ? 'Medium' : 'Low'
    });

    // Efficacy observations
    const efficacy = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []));
    rows.push({
        type: 'Observation',
        description: `Efficacy observations (${efficacy.length} records)`,
        status: efficacy.length >= 3 ? 'Sufficient' : efficacy.length > 0 ? 'Limited' : 'Missing',
        verified: efficacy.length >= 2,
        confidence: efficacy.length >= 5 ? 'High' : efficacy.length >= 3 ? 'Medium' : 'Low'
    });

    // Weather data
    const hasWeather = trial.Temperature || trial.Humidity || trial.Windspeed || trial.Rain;
    rows.push({
        type: 'Environmental',
        description: 'Application weather conditions',
        status: hasWeather ? 'Recorded' : 'Missing',
        verified: !!hasWeather,
        confidence: (trial.Temperature && trial.Humidity && trial.Windspeed) ? 'High' : hasWeather ? 'Medium' : 'Low'
    });

    // Soil data
    const hasSoil = trial.SoilPH || trial.SoilClay || trial.SoilSand || trial.SoilOC;
    rows.push({
        type: 'Soil',
        description: 'Soil characteristics',
        status: hasSoil ? 'Recorded' : 'Missing',
        verified: !!hasSoil,
        confidence: hasSoil ? 'Medium' : 'Low'
    });

    // Statistical validation
    if (hasStats) {
        rows.push({
            type: 'Statistical',
            description: 'ANOVA/LSD statistical analysis',
            status: 'Completed',
            verified: true,
            confidence: 'High'
        });
    }

    // GPS coordinates
    rows.push({
        type: 'Geospatial',
        description: 'GPS coordinates',
        status: (trial.Lat && trial.Lon) ? 'Recorded' : 'Missing',
        verified: !!(trial.Lat && trial.Lon),
        confidence: (trial.Lat && trial.Lon) ? 'High' : 'Low'
    });

    return rows;
}

/**
 * Build confidence bands for species response
 */
export function buildSpeciesConfidenceBands(efficacyData, confidence = 0.95) {
    const data = validateEfficacyData(Array.isArray(efficacyData) ? efficacyData : []);
    if (data.length < 3) return null;

    const z = confidence === 0.99 ? 2.576 : confidence === 0.95 ? 1.96 : 1.645;

    // Group by DAA
    const byDAA = {};
    data.forEach(obs => {
        if (!byDAA[obs.daa]) byDAA[obs.daa] = [];
        byDAA[obs.daa].push(obs.weedCover || 0);
    });

    const bands = Object.entries(byDAA).map(([daa, values]) => {
        const n = values.length;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
        const se = Math.sqrt(variance / n);
        const margin = z * se;

        return {
            daa: parseInt(daa),
            mean: mean.toFixed(1),
            lower: Math.max(0, mean - margin).toFixed(1),
            upper: Math.min(100, mean + margin).toFixed(1),
            n
        };
    });

    return {
        bands,
        confidence: `${(confidence * 100).toFixed(0)}%`,
        totalObservations: data.length
    };
}

// Expose to window for compatibility with services/weather.js and sync.js
if (typeof window !== 'undefined') {
    window.runAuditScan = (projectId, state) => runAuditScan(projectId, state);
    window.attemptChartRecovery = (trialId, mode, state) => attemptChartRecovery(trialId, mode, state);
    window.buildSpeciesContinuityTable = buildSpeciesContinuityTable;
    window.buildEnvironmentalSuitabilityIndex = buildEnvironmentalSuitabilityIndex;
    window.buildStatisticalSignificanceBlock = buildStatisticalSignificanceBlock;
    window.buildEvidenceTraceabilityMatrix = buildEvidenceTraceabilityMatrix;
    window.buildSpeciesConfidenceBands = buildSpeciesConfidenceBands;
    // Utility functions needed by sync.js and ai.js
    window.calculateDAA = calculateDAA;
    window.toDateKey = toDateKey;
    window.computeObservationTotalCover = computeObservationTotalCover;
}
