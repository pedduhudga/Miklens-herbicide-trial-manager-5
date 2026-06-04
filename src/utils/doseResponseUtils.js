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
  if (dose <= 0) return d; // zero dose = untreated = max weed cover
  return c + (d - c) / (1 + Math.pow(dose / e, b));
}

/**
 * Compute residual sum of squares for given parameters vs data
 */
function rss(params, data) {
  const [b, c, d, e] = params;
  let sum = 0;
  for (const { dose, response } of data) {
    const predicted = ll4(dose, b, c, d, e);
    sum += Math.pow(response - predicted, 2);
  }
  return sum;
}

/**
 * Nelder-Mead simplex optimiser (pure JS, no dependencies)
 * Minimises fn(params) given initial guess
 */
function nelderMead(fn, initialParams, options = {}) {
  const {
    maxIter = 5000,
    tol = 1e-8,
    alpha = 1.0,   // reflection
    gamma = 2.0,   // expansion
    rho = 0.5,     // contraction
    sigma = 0.5    // shrink
  } = options;

  const n = initialParams.length;

  // Build initial simplex
  let simplex = [initialParams.slice()];
  for (let i = 0; i < n; i++) {
    const point = initialParams.slice();
    point[i] = point[i] !== 0 ? point[i] * 1.05 : 0.00025;
    simplex.push(point);
  }

  const evaluate = p => ({ p, v: fn(p) });
  let pts = simplex.map(evaluate);

  for (let iter = 0; iter < maxIter; iter++) {
    // Sort by function value
    pts.sort((a, b) => a.v - b.v);

    // Check convergence
    const vBest = pts[0].v;
    const vWorst = pts[pts.length - 1].v;
    if (Math.abs(vBest - vWorst) < tol) break;

    // Centroid of all but worst
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += pts[i].p[j];
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    // Reflection
    const reflected = centroid.map((c, j) => c + alpha * (c - pts[n].p[j]));
    const rEval = evaluate(reflected);

    if (rEval.v < pts[0].v) {
      // Expansion
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      const eEval = evaluate(expanded);
      pts[n] = eEval.v < rEval.v ? eEval : rEval;
    } else if (rEval.v < pts[n - 1].v) {
      pts[n] = rEval;
    } else {
      // Contraction
      const contracted = centroid.map((c, j) => c + rho * (pts[n].p[j] - c));
      const cEval = evaluate(contracted);
      if (cEval.v < pts[n].v) {
        pts[n] = cEval;
      } else {
        // Shrink
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
 *
 * @param {Array<{dose: number, response: number}>} data
 *   dose: application rate (g ai/ha or L/ha)
 *   response: % weed control (0–100) or % biomass reduction
 * @returns {Object} fitted parameters + derived metrics
 */
export function fitDoseResponse(data) {
  if (!data || data.length < 3) {
    return { error: 'Need at least 3 data points to fit a curve' };
  }

  // Filter valid points
  const valid = data.filter(d => d.dose >= 0 && d.response >= 0 && d.response <= 100);
  if (valid.length < 3) {
    return { error: 'Need at least 3 valid data points (dose ≥ 0, response 0–100)' };
  }

  // Initial parameter estimates
  const responses = valid.map(d => d.response);
  const dMin = Math.min(...responses);
  const dMax = Math.max(...responses);
  const doses = valid.filter(d => d.dose > 0).map(d => d.dose);
  const midDose = doses.length > 0
    ? Math.exp(doses.map(Math.log).reduce((a, b) => a + b, 0) / doses.length)
    : 100;

  // Try multiple starting points to avoid local minima
  const starts = [
    [2, dMin, dMax, midDose],
    [1.5, 0, 100, midDose],
    [3, dMin, dMax, midDose * 0.5],
    [1, dMin, dMax, midDose * 2],
  ];

  let best = null;
  for (const init of starts) {
    try {
      const result = nelderMead(p => rss(p, valid), init);
      if (!best || result.value < best.value) {
        best = result;
      }
    } catch (_) {}
  }

  if (!best) return { error: 'Optimisation failed' };

  let [b, c, d, e] = best.params;

  // Enforce physical constraints
  b = Math.abs(b); // slope must be positive
  c = Math.max(0, Math.min(c, 99));
  d = Math.max(c + 1, Math.min(d, 100));
  e = Math.max(0.001, e);

  // Calculate goodness of fit (R²)
  const predicted = valid.map(pt => ll4(pt.dose, b, c, d, e));
  const meanResp = responses.reduce((a, x) => a + x, 0) / responses.length;
  const ssTot = responses.reduce((a, x) => a + Math.pow(x - meanResp, 2), 0);
  const ssRes = valid.reduce((a, pt, i) => a + Math.pow(pt.response - predicted[i], 2), 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  // ED values: dose giving x% response between c and d
  const computeED = (pct) => {
    // Solve: pct/100 * (d - c) + c = ll4(dose)
    // => dose = e * ((d - c) / (response - c) - 1)^(1/b)
    const target = (pct / 100) * (d - c) + c;
    if (target <= c || target >= d) return null;
    return e * Math.pow((d - c) / (target - c) - 1, -1 / b);
  };

  const ed10 = computeED(10);
  const ed50 = computeED(50); // = e for standard LL.4
  const ed90 = computeED(90);

  // Selectivity index (ED90/ED10) — measures steepness of curve
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
