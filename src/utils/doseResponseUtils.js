/**
 * Dose-Response Curve Utilities
 * Implements 4-parameter log-logistic model (LL.4) — industry standard for herbicide ED50/GR50
 *
 * Model: f(x) = c + (d - c) / (1 + (x / e)^b)
 *   b = slope (Hill coefficient)
 *   c = lower asymptote (min response)
 *   d = upper asymptote (max response)
 *   e = ED50 (dose at 50% response between c and d)
 */

/**
 * 4-parameter log-logistic function
 */
export function ll4(dose, b, c, d, e) {
  if (dose <= 0) return d;
  return c + (d - c) / (1 + Math.pow(dose / e, b));
}

/**
 * Compute residual sum of squares with parameter constraints/penalties
 */
function constrainedRss(params, data) {
  const [b, c, d, e] = params;
  let penalty = 0;
  
  // c and d should be between 0 and 100
  if (c < 0) penalty += Math.pow(c, 2) * 1000;
  if (c > 100) penalty += Math.pow(c - 100, 2) * 1000;
  if (d < 0) penalty += Math.pow(d, 2) * 1000;
  if (d > 100) penalty += Math.pow(d - 100, 2) * 1000;
  
  // e (ED50) must be positive
  if (e <= 0.001) penalty += Math.pow(e - 0.001, 2) * 100000;
  
  // Slope b should not be extremely close to 0
  if (Math.abs(b) < 0.05) penalty += 10000;
  
  let sum = 0;
  for (const { dose, response } of data) {
    const predicted = ll4(dose, b, c, d, e);
    if (isNaN(predicted) || !isFinite(predicted)) {
      sum += 1e6;
    } else {
      sum += Math.pow(response - predicted, 2);
    }
  }
  return sum + penalty;
}

/**
 * Nelder-Mead simplex optimiser (pure JS, no dependencies)
 */
function nelderMead(fn, initialParams, options = {}) {
  const {
    maxIter = 5000,
    tol = 1e-8,
    alpha = 1.0,
    gamma = 2.0,
    rho = 0.5,
    sigma = 0.5
  } = options;

  const n = initialParams.length;
  let simplex = [initialParams.slice()];
  for (let i = 0; i < n; i++) {
    const point = initialParams.slice();
    point[i] = point[i] !== 0 ? point[i] * 1.05 : 0.00025;
    simplex.push(point);
  }

  const evaluate = p => ({ p, v: fn(p) });
  let pts = simplex.map(evaluate);

  for (let iter = 0; iter < maxIter; iter++) {
    pts.sort((a, b) => a.v - b.v);
    const vBest = pts[0].v;
    const vWorst = pts[pts.length - 1].v;
    if (Math.abs(vBest - vWorst) < tol) break;

    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += pts[i].p[j];
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    const reflected = centroid.map((c, j) => c + alpha * (c - pts[n].p[j]));
    const rEval = evaluate(reflected);

    if (rEval.v < pts[0].v) {
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      const eEval = evaluate(expanded);
      pts[n] = eEval.v < rEval.v ? eEval : rEval;
    } else if (rEval.v < pts[n - 1].v) {
      pts[n] = rEval;
    } else {
      const contracted = centroid.map((c, j) => c + rho * (pts[n].p[j] - c));
      const cEval = evaluate(contracted);
      if (cEval.v < pts[n].v) {
        pts[n] = cEval;
      } else {
        const best = pts[0].p;
        pts = pts.map((pt, i) => i === 0 ? pt : evaluate(best.map((b, j) => b + sigma * (pt.p[j] - b))));
      }
    }
  }

  pts.sort((a, b) => a.v - b.v);
  return { params: pts[0].p, value: pts[0].v };
}

/**
 * Fit 4-parameter log-logistic model to dose-response data
 */
export function fitDoseResponse(data) {
  if (!data || data.length < 3) {
    return { error: 'Need at least 3 data points to fit a curve' };
  }

  const valid = data.filter(d => d.dose >= 0 && d.response >= 0 && d.response <= 100);
  if (valid.length < 3) {
    return { error: 'Need at least 3 valid data points (dose ≥ 0, response 0–100)' };
  }

  const responses = valid.map(d => d.response);
  const dMin = Math.min(...responses);
  const dMax = Math.max(...responses);
  const doses = valid.filter(d => d.dose > 0).map(d => d.dose);
  const midDose = doses.length > 0
    ? Math.exp(doses.map(Math.log).reduce((a, b) => a + b, 0) / doses.length)
    : 100;

  // Determine direction: if high doses have higher response, it is an increasing curve (slope b should be negative)
  // if high doses have lower response, it is a decaying curve (slope b should be positive)
  const isIncreasing = responses[responses.length - 1] > responses[0];
  const initialSlope = isIncreasing ? -2.0 : 2.0;

  const starts = [
    [initialSlope, dMin, dMax, midDose],
    [initialSlope, 0, 100, midDose],
    [initialSlope * 1.5, dMin, dMax, midDose * 0.5],
    [initialSlope * 0.5, dMin, dMax, midDose * 2],
  ];

  let best = null;
  for (const init of starts) {
    try {
      const result = nelderMead(p => constrainedRss(p, valid), init);
      if (!best || result.value < best.value) {
        best = result;
      }
    } catch (_) {}
  }

  if (!best) return { error: 'Optimisation failed' };

  let [b, c, d, e] = best.params;

  // Enforce parameter boundaries post-fit
  c = Math.max(0, Math.min(c, 100));
  d = Math.max(0, Math.min(d, 100));
  e = Math.max(0.001, e);

  // Calculate goodness of fit (R²)
  const predicted = valid.map(pt => ll4(pt.dose, b, c, d, e));
  const meanResp = responses.reduce((a, x) => a + x, 0) / responses.length;
  const ssTot = responses.reduce((a, x) => a + Math.pow(x - meanResp, 2), 0);
  const ssRes = valid.reduce((a, pt, i) => a + Math.pow(pt.response - predicted[i], 2), 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  // ED values: dose giving x% response between c and d
  const computeED = (pct) => {
    if (pct <= 0 || pct >= 100) return null;
    const ratio = (100 - pct) / pct;
    const ed = e * Math.pow(ratio, 1 / b);
    return isNaN(ed) || !isFinite(ed) ? null : ed;
  };

  const ed10 = computeED(10);
  const ed50 = computeED(50);
  const ed90 = computeED(90);

  const selectivityIndex = ed10 && ed90 ? ed90 / ed10 : null;

  // Generate smooth curve points for plotting (log scale)
  const maxDose = Math.max(...doses, e * 4);
  const minDose = Math.min(...doses.filter(d => d > 0), e / 10);
  const curvePoints = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const logMin = Math.log10(Math.max(0.01, minDose));
    const logMax = Math.log10(maxDose * 1.5);
    const dose = Math.pow(10, logMin + (i / steps) * (logMax - logMin));
    curvePoints.push({ dose, response: ll4(dose, b, c, d, e) });
  }

  return {
    params: { b, c, d, e },
    ed10: ed10 ? Math.round(ed10 * 100) / 100 : null,
    ed50: ed50 ? Math.round(ed50 * 100) / 100 : null,
    ed90: ed90 ? Math.round(ed90 * 100) / 100 : null,
    selectivityIndex: selectivityIndex ? Math.round(selectivityIndex * 10) / 10 : null,
    r2: Math.round(r2 * 1000) / 1000,
    curvePoints,
    dataPoints: valid,
    residuals: valid.map((pt, i) => ({
      dose: pt.dose,
      observed: pt.response,
      predicted: Math.round(predicted[i] * 10) / 10,
      residual: Math.round((pt.response - predicted[i]) * 10) / 10
    }))
  };
}


/**
 * Extract dose-response data from app trials for a given formulation + weed species
 *
 * @param {Array} trials
 * @param {string} formulationName
 * @param {string} weedSpecies
 * @param {number} targetDaa - DAA observation to use (latest if null)
 * @returns {Array<{dose, response, trialId, location, date}>}
 */
export function extractDoseResponseData(trials, formulationName, weedSpecies, targetDaa = null) {
  const points = [];

  for (const trial of trials) {
    if (!trial.Dosage) continue;
    if (formulationName && (trial.FormulationName || '').toLowerCase() !== formulationName.toLowerCase()) continue;
    if (weedSpecies && (trial.WeedSpecies || '').toLowerCase() !== weedSpecies.toLowerCase()) continue;

    const dose = parseFloat(trial.Dosage);
    if (isNaN(dose) || dose < 0) continue;

    let efficacy = null;

    try {
      const obsData = JSON.parse(trial.EfficacyDataJSON || '[]');
      if (obsData.length === 0) continue;

      let obs;
      if (targetDaa !== null) {
        obs = obsData.find(o => Math.abs((o.daa || 0) - targetDaa) <= 3);
      } else {
        obs = obsData.filter(o => (o.daa || 0) > 0).sort((a, b) => b.daa - a.daa)[0];
      }

      if (!obs) continue;

      // Prefer explicit controlPct, otherwise compute from weedCover
      if (obs.controlPct !== undefined && obs.controlPct !== null) {
        efficacy = parseFloat(obs.controlPct);
      } else if (obs.weedCover !== undefined) {
        const baseline = obsData[0]?.weedCover;
        if (baseline > 0) {
          efficacy = Math.max(0, ((baseline - parseFloat(obs.weedCover)) / baseline) * 100);
        }
      }
    } catch (_) {
      continue;
    }

    if (efficacy === null || isNaN(efficacy)) continue;

    points.push({
      dose,
      response: Math.min(100, Math.max(0, efficacy)),
      trialId: trial.ID,
      location: trial.Location || '',
      date: trial.Date || '',
      replication: trial.Replication || ''
    });
  }

  return points;
}

/**
 * Compare dose-response curves between two formulations
 * Returns relative potency (RP = ED50_ref / ED50_test)
 */
export function compareDoseResponseCurves(fit1, fit2) {
  if (!fit1?.ed50 || !fit2?.ed50) return null;
  const relativePotency = fit1.ed50 / fit2.ed50;
  return {
    relativePotency: Math.round(relativePotency * 100) / 100,
    interpretation: relativePotency > 1
      ? `Formulation 2 is ${relativePotency.toFixed(1)}x more potent than Formulation 1`
      : `Formulation 1 is ${(1 / relativePotency).toFixed(1)}x more potent than Formulation 2`
  };
}
