/**
 * Advanced Statistical Analysis Utilities
 * ANOVA, Tukey HSD, Dunnett's Test, and other agricultural trial statistics
 */

import { safeJsonParse } from './helpers.js';

/**
 * Calculate basic statistics: mean, variance, std dev
 */
export function calculateStats(values) {
  const n = values.length;
  if (n === 0) return { mean: 0, variance: 0, stdDev: 0, n: 0 };
  
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  
  return { mean, variance, stdDev, n, min: Math.min(...values), max: Math.max(...values) };
}

/**
 * One-way ANOVA for RCBD (Randomized Complete Block Design)
 * Returns complete ANOVA table and significance test
 */
export function performANOVA(trials, options = {}) {
  const { metric = 'controlPct', daa = null, species = null } = options;
  
  // Group trials by treatment
  const treatments = {};
  const blocks = new Set();
  
  trials.forEach(trial => {
    const trt = trial.FormulationName || 'Unknown';
    const blockId = trial.BlockID || trial.Replication || '1';
    blocks.add(blockId);
    
    if (!treatments[trt]) treatments[trt] = {};
    if (!treatments[trt][blockId]) treatments[trt][blockId] = [];
    
    // Extract value from efficacy data
    const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
    const observations = daa 
      ? efficacy.filter(e => e.daa === daa || e.daysAfterApplication === daa)
      : efficacy;
    
    if (observations.length > 0) {
      const latest = observations[observations.length - 1];
      const value = latest[metric] ?? latest.controlPct ?? latest.wce ?? latest.weedCover;
      if (value !== null && !isNaN(value)) {
        treatments[trt][blockId].push(parseFloat(value));
      }
    }
  });
  
  const blockIds = [...blocks];
  const treatmentNames = Object.keys(treatments);
  
  if (treatmentNames.length < 2) {
    return { error: 'Need at least 2 treatments for ANOVA', fStatistic: null, pValue: null };
  }
  
  // Calculate means
  const grandSum = [];
  const treatmentMeans = {};
  const blockMeans = {};
  
  treatmentNames.forEach(trt => {
    const trtValues = [];
    blockIds.forEach(block => {
      const vals = treatments[trt][block] || [];
      trtValues.push(...vals);
      grandSum.push(...vals);
      
      if (!blockMeans[block]) blockMeans[block] = [];
      if (vals.length > 0) {
        const blockMean = vals.reduce((a, b) => a + b, 0) / vals.length;
        blockMeans[block].push(blockMean);
      }
    });
    
    if (trtValues.length > 0) {
      treatmentMeans[trt] = trtValues.reduce((a, b) => a + b, 0) / trtValues.length;
    }
  });
  
  const grandMean = grandSum.reduce((a, b) => a + b, 0) / grandSum.length;
  const N = grandSum.length;
  const t = treatmentNames.length;
  const b = blockIds.length;
  
  // Calculate Sum of Squares
  let ssTotal = 0;
  let ssTreatments = 0;
  let ssBlocks = 0;
  
  // SSTotal
  grandSum.forEach(y => {
    ssTotal += Math.pow(y - grandMean, 2);
  });
  
  // SSTreatments
  treatmentNames.forEach(trt => {
    const nTrt = Object.values(treatments[trt]).flat().length;
    ssTreatments += nTrt * Math.pow(treatmentMeans[trt] - grandMean, 2);
  });
  
  // SSBlocks
  blockIds.forEach(block => {
    const blockValues = blockMeans[block] || [];
    if (blockValues.length > 0) {
      const blockMean = blockValues.reduce((a, b) => a + b, 0) / blockValues.length;
      ssBlocks += t * Math.pow(blockMean - grandMean, 2);
    }
  });
  
  // SSError = SSTotal - SSTreatments - SSBlocks
  const ssError = ssTotal - ssTreatments - ssBlocks;
  
  // Degrees of freedom
  const dfTreatments = t - 1;
  const dfBlocks = b - 1;
  const dfError = (t - 1) * (b - 1);
  const dfTotal = N - 1;
  
  // Mean Squares
  const msTreatments = ssTreatments / dfTreatments;
  const msBlocks = ssBlocks / dfBlocks;
  const msError = ssError / dfError;
  
  // F-statistic
  const fStatistic = msTreatments / msError;
  
  // Approximate p-value using F-distribution
  const pValue = approximatePValue(fStatistic, dfTreatments, dfError);
  
  return {
    anovaTable: {
      source: ['Treatments', 'Blocks', 'Error', 'Total'],
      ss: [ssTreatments, ssBlocks, ssError, ssTotal],
      df: [dfTreatments, dfBlocks, dfError, dfTotal],
      ms: [msTreatments, msBlocks, msError, null],
      f: [fStatistic, null, null, null],
      p: [pValue, null, null, null]
    },
    fStatistic,
    pValue,
    significant: pValue < 0.05,
    treatmentMeans,
    grandMean,
    treatments: treatmentNames,
    blocks: blockIds
  };
}

/**
 * Tukey's HSD (Honestly Significant Difference) Test
 * For pairwise comparisons after significant ANOVA
 */
export function performTukeyHSD(trials, options = {}) {
  const { metric = 'controlPct', alpha = 0.05 } = options;
  
  const anova = performANOVA(trials, options);
  if (anova.error) return anova;
  
  const { treatmentMeans, anovaTable, treatments } = anova;
  const msError = anovaTable.ms[2]; // Error MS
  const dfError = anovaTable.df[2];
  const n = anovaTable.df[0] + 1; // Number of treatments
  const r = Math.round(anovaTable.df[1] + 1); // Number of replications
  
  // Get critical q value from Studentized Range Distribution
  const qCritical = getStudentizedRangeCritical(alpha, n, dfError);
  
  // Calculate HSD
  const hsd = qCritical * Math.sqrt(msError / r);
  
  // Pairwise comparisons
  const comparisons = [];
  const trtNames = Object.keys(treatmentMeans);
  
  for (let i = 0; i < trtNames.length; i++) {
    for (let j = i + 1; j < trtNames.length; j++) {
      const trtA = trtNames[i];
      const trtB = trtNames[j];
      const meanA = treatmentMeans[trtA];
      const meanB = treatmentMeans[trtB];
      const diff = Math.abs(meanA - meanB);
      
      comparisons.push({
        treatmentA: trtA,
        treatmentB: trtB,
        meanA,
        meanB,
        difference: diff,
        significant: diff > hsd,
        hsd
      });
    }
  }
  
  // Group treatments (letter display)
  const groups = assignLetterGroups(trtNames, comparisons, hsd);
  
  return {
    ...anova,
    hsd,
    qCritical,
    comparisons,
    groups,
    test: 'Tukey HSD',
    alpha
  };
}

/**
 * Dunnett's Test - Compare all treatments vs control
 */
export function performDunnettTest(trials, controlName, options = {}) {
  const { metric = 'controlPct', alpha = 0.05 } = options;
  
  const anova = performANOVA(trials, options);
  if (anova.error) return anova;
  
  const { treatmentMeans, anovaTable } = anova;
  const msError = anovaTable.ms[2];
  const dfError = anovaTable.df[2];
  const r = Math.round(anovaTable.df[1] + 1);
  
  const k = Object.keys(treatmentMeans).length - 1; // Number of treatments excluding control
  const dCritical = getDunnettCritical(alpha, k, dfError);
  const dsd = dCritical * Math.sqrt(2 * msError / r); // Dunnett's significant difference
  
  const comparisons = [];
  const controlMean = treatmentMeans[controlName];
  
  Object.keys(treatmentMeans).forEach(trt => {
    if (trt !== controlName) {
      const trtMean = treatmentMeans[trt];
      const diff = trtMean - controlMean;
      const tStatistic = diff / Math.sqrt(2 * msError / r);
      
      comparisons.push({
        treatment: trt,
        control: controlName,
        treatmentMean: trtMean,
        controlMean,
        difference: diff,
        tStatistic,
        significant: Math.abs(tStatistic) > dCritical,
        dsd,
        percentChange: ((diff / controlMean) * 100).toFixed(1)
      });
    }
  });
  
  return {
    ...anova,
    controlName,
    controlMean,
    dCritical,
    dsd,
    comparisons,
    test: "Dunnett's Test",
    alpha
  };
}

/**
 * Assign letter groups for treatment means display
 */
function assignLetterGroups(treatments, comparisons, hsd) {
  const sorted = [...treatments].sort((a, b) => {
    // This is a placeholder - we'd need actual means passed in
    return 0;
  });
  
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const groups = {};
  
  treatments.forEach((trt, i) => {
    groups[trt] = letters[i] || '*';
  });
  
  return groups;
}

/**
 * Studentized Range Q-table (simplified critical values)
 */
const Q_TABLE_05 = {
  1: [17.97, 26.98, 32.82, 37.08, 40.41, 43.12, 45.4, 47.36, 49.07, 50.59],
  2: [6.08, 8.33, 9.8, 10.88, 11.74, 12.44, 13.03, 13.54, 13.99, 14.39],
  3: [4.5, 5.91, 6.82, 7.5, 8.04, 8.48, 8.85, 9.18, 9.46, 9.72],
  4: [3.93, 5.04, 5.76, 6.29, 6.71, 7.05, 7.35, 7.6, 7.83, 8.03],
  5: [3.64, 4.6, 5.22, 5.67, 6.03, 6.33, 6.58, 6.8, 6.99, 7.17],
  6: [3.46, 4.34, 4.9, 5.3, 5.63, 5.9, 6.12, 6.32, 6.49, 6.65],
  7: [3.34, 4.16, 4.68, 5.06, 5.36, 5.61, 5.82, 6, 6.16, 6.3],
  8: [3.26, 4.04, 4.53, 4.89, 5.17, 5.4, 5.6, 5.77, 5.92, 6.05],
  9: [3.2, 3.95, 4.41, 4.76, 5.02, 5.24, 5.43, 5.59, 5.74, 5.87],
  10: [3.15, 3.88, 4.33, 4.65, 4.91, 5.12, 5.3, 5.46, 5.6, 5.72],
  11: [3.11, 3.82, 4.26, 4.57, 4.82, 5.03, 5.2, 5.35, 5.49, 5.61],
  12: [3.08, 3.77, 4.2, 4.51, 4.75, 4.95, 5.12, 5.27, 5.4, 5.51],
  13: [3.06, 3.73, 4.15, 4.45, 4.69, 4.88, 5.05, 5.19, 5.32, 5.43],
  14: [3.03, 3.7, 4.11, 4.41, 4.64, 4.83, 4.99, 5.13, 5.25, 5.36],
  15: [3.01, 3.67, 4.08, 4.37, 4.59, 4.78, 4.94, 5.08, 5.2, 5.31],
  16: [3, 3.65, 4.05, 4.33, 4.56, 4.74, 4.9, 5.03, 5.15, 5.26],
  17: [2.98, 3.63, 4.02, 4.3, 4.52, 4.7, 4.86, 4.99, 5.11, 5.21],
  18: [2.97, 3.61, 4, 4.28, 4.49, 4.67, 4.82, 4.96, 5.07, 5.17],
  19: [2.96, 3.59, 3.98, 4.25, 4.47, 4.65, 4.79, 4.92, 5.04, 5.14],
  20: [2.95, 3.58, 3.96, 4.23, 4.45, 4.62, 4.77, 4.9, 5.01, 5.11],
  "inf": [2.77, 3.31, 3.63, 3.86, 4.03, 4.17, 4.29, 4.39, 4.47, 4.55]
};

/**
 * Get critical q-value for Tukey HSD
 */
function getStudentizedRangeCritical(alpha, k, df) {
  const table = alpha <= 0.01 ? Q_TABLE_01 : Q_TABLE_05;
  const dfKey = df >= 120 ? "inf" : (df >= 60 ? 60 : (df >= 40 ? 40 : (df >= 30 ? 30 : (df >= 24 ? 24 : (df >= 20 ? 20 : (df >= 15 ? 15 : (df >= 12 ? 12 : (df >= 10 ? 10 : (df >= 9 ? 9 : (df >= 8 ? 8 : (df >= 6 ? 6 : 5)))))))))));
  const kIndex = Math.min(Math.max(Math.round(k), 2), 20) - 2;
  const dfEntry = table[dfKey] || table["inf"];
  return dfEntry[Math.min(kIndex, dfEntry.length - 1)] || 4.0;
}

/**
 * Simplified Dunnett's critical values (one-sided, alpha=0.05)
 */
const DUNNETT_TABLE_05 = {
  5: [2.57, 3.03, 3.29, 3.48, 3.62, 3.73, 3.82, 3.9, 3.97],
  6: [2.45, 2.86, 3.1, 3.26, 3.39, 3.49, 3.57, 3.64, 3.71],
  7: [2.36, 2.75, 2.97, 3.12, 3.24, 3.33, 3.41, 3.47, 3.53],
  8: [2.31, 2.67, 2.88, 3.02, 3.13, 3.22, 3.29, 3.35, 3.41],
  9: [2.26, 2.61, 2.81, 2.95, 3.05, 3.14, 3.2, 3.26, 3.32],
  10: [2.23, 2.57, 2.76, 2.89, 2.99, 3.07, 3.14, 3.19, 3.24],
  11: [2.2, 2.53, 2.72, 2.84, 2.94, 3.02, 3.08, 3.14, 3.19],
  12: [2.18, 2.5, 2.68, 2.81, 2.9, 2.98, 3.04, 3.09, 3.14],
  13: [2.16, 2.48, 2.65, 2.77, 2.87, 2.94, 3, 3.06, 3.1],
  14: [2.14, 2.46, 2.63, 2.75, 2.84, 2.91, 2.97, 3.02, 3.07],
  15: [2.13, 2.44, 2.61, 2.73, 2.82, 2.89, 2.95, 3, 3.05],
  16: [2.12, 2.42, 2.59, 2.71, 2.8, 2.87, 2.92, 2.98, 3.02],
  17: [2.11, 2.41, 2.58, 2.69, 2.78, 2.85, 2.9, 2.96, 3],
  18: [2.1, 2.4, 2.56, 2.68, 2.76, 2.83, 2.89, 2.94, 2.98],
  19: [2.09, 2.39, 2.55, 2.66, 2.75, 2.81, 2.87, 2.92, 2.97],
  20: [2.09, 2.38, 2.54, 2.65, 2.73, 2.8, 2.86, 2.9, 2.95],
  30: [2.04, 2.32, 2.47, 2.58, 2.66, 2.72, 2.77, 2.82, 2.86],
  40: [2.02, 2.29, 2.44, 2.54, 2.62, 2.68, 2.73, 2.78, 2.82],
  60: [2, 2.27, 2.41, 2.51, 2.58, 2.64, 2.69, 2.73, 2.77],
  120: [1.98, 2.24, 2.38, 2.47, 2.55, 2.6, 2.65, 2.69, 2.73],
  "inf": [1.96, 2.21, 2.35, 2.44, 2.51, 2.57, 2.61, 2.65, 2.69]
};

const Q_TABLE_01 = {
  1: [90, 135, 164, 185, 202, 216, 227, 237, 246, 253],
  2: [14.9, 19.02, 22.29, 24.72, 26.63, 28.2, 29.53, 30.68, 31.69, 32.59],
  3: [8.26, 10.62, 12.17, 13.33, 14.24, 15, 15.64, 16.2, 16.69, 17.13],
  4: [6.51, 8.12, 9.17, 9.96, 10.58, 11.1, 11.55, 11.93, 12.27, 12.57],
  5: [5.7, 6.98, 7.8, 8.42, 8.91, 9.32, 9.67, 9.97, 10.24, 10.48],
  6: [5.24, 6.33, 7.03, 7.56, 7.97, 8.32, 8.61, 8.87, 9.1, 9.3],
  7: [4.95, 5.92, 6.54, 7.01, 7.37, 7.68, 7.94, 8.17, 8.37, 8.55],
  8: [4.75, 5.64, 6.2, 6.62, 6.96, 7.24, 7.47, 7.68, 7.86, 8.03],
  9: [4.6, 5.43, 5.96, 6.35, 6.66, 6.91, 7.13, 7.33, 7.49, 7.65],
  10: [4.48, 5.27, 5.77, 6.14, 6.43, 6.67, 6.87, 7.05, 7.21, 7.36],
  "inf": [3.64, 4.12, 4.4, 4.6, 4.76, 4.88, 4.99, 5.08, 5.16, 5.23]
};

function getDunnettCritical(alpha, k, df) {
  const table = alpha <= 0.01 ? DUNNETT_TABLE_01 : DUNNETT_TABLE_05;
  const dfKey = df >= 120 ? "inf" : (df >= 60 ? 60 : (df >= 40 ? 40 : (df >= 30 ? 30 : (df >= 20 ? 20 : (df >= 15 ? 15 : 10)))));
  const kIndex = Math.min(Math.max(k - 1, 0), 8);
  const dfEntry = table[dfKey] || table["inf"];
  return dfEntry ? dfEntry[kIndex] : 2.5;
}

const DUNNETT_TABLE_01 = {
  5: [4.03, 4.63, 4.98, 5.22, 5.41, 5.56, 5.69, 5.8, 5.89],
  6: [3.71, 4.22, 4.51, 4.71, 4.87, 5, 5.1, 5.2, 5.28],
  7: [3.5, 3.95, 4.21, 4.39, 4.53, 4.64, 4.74, 4.82, 4.89],
  8: [3.36, 3.77, 4, 4.17, 4.29, 4.4, 4.48, 4.56, 4.62],
  9: [3.25, 3.63, 3.85, 4.01, 4.12, 4.22, 4.3, 4.37, 4.43],
  10: [3.17, 3.53, 3.74, 3.88, 3.99, 4.08, 4.16, 4.22, 4.28],
  11: [3.11, 3.45, 3.65, 3.79, 3.89, 3.98, 4.05, 4.11, 4.16],
  12: [3.05, 3.39, 3.58, 3.71, 3.81, 3.89, 3.96, 4.02, 4.07],
  13: [3.01, 3.33, 3.52, 3.65, 3.74, 3.82, 3.89, 3.94, 3.99],
  14: [2.98, 3.29, 3.47, 3.59, 3.69, 3.76, 3.83, 3.88, 3.93],
  15: [2.95, 3.25, 3.43, 3.55, 3.64, 3.71, 3.78, 3.83, 3.88],
  16: [2.92, 3.22, 3.39, 3.51, 3.6, 3.67, 3.73, 3.78, 3.83],
  17: [2.9, 3.19, 3.36, 3.47, 3.56, 3.63, 3.69, 3.74, 3.79],
  18: [2.88, 3.17, 3.33, 3.44, 3.53, 3.6, 3.66, 3.71, 3.75],
  19: [2.86, 3.15, 3.31, 3.42, 3.5, 3.57, 3.63, 3.68, 3.72],
  20: [2.85, 3.13, 3.29, 3.4, 3.48, 3.55, 3.6, 3.65, 3.69],
  30: [2.75, 3.01, 3.15, 3.25, 3.33, 3.39, 3.44, 3.49, 3.52],
  40: [2.7, 2.95, 3.09, 3.19, 3.26, 3.32, 3.37, 3.41, 3.44],
  60: [2.66, 2.9, 3.03, 3.12, 3.19, 3.25, 3.29, 3.33, 3.37],
  120: [2.62, 2.86, 2.98, 3.07, 3.14, 3.2, 3.24, 3.28, 3.31],
  "inf": [2.58, 2.81, 2.93, 3.02, 3.09, 3.14, 3.18, 3.22, 3.25]
};

/**
 * Approximate p-value from F-distribution using incomplete beta function approximation
 */
function approximatePValue(f, df1, df2) {
  // Simplified approximation using F-distribution properties
  if (f <= 0) return 1;
  if (f > 100) return 0;
  
  // Approximate using ratio
  const x = (df1 * f) / (df1 * f + df2);
  
  // Beta function approximation (simplified)
  const betaApprox = (a, b, x) => {
    // Incomplete beta approximation
    return Math.pow(x, a) * Math.pow(1 - x, b) / (a * Math.exp(a + b));
  };
  
  // This is a rough approximation - in production use a proper statistical library
  const p = 1 - betaApprox(df1 / 2, df2 / 2, x);
  return Math.max(0, Math.min(1, p));
}

/**
 * Export window bindings
 */
if (typeof window !== 'undefined') {
  window.performANOVA = performANOVA;
  window.performTukeyHSD = performTukeyHSD;
  window.performDunnettTest = performDunnettTest;
  window.calculateStats = calculateStats;
}

export default {
  performANOVA,
  performTukeyHSD,
  performDunnettTest,
  calculateStats
};
