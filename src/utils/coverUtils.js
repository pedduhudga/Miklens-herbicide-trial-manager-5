import { isMixedWeedPlaceholder } from './weedUtils.js';
import { safeJsonParse } from './helpers.js';

function _filterValidEfficacy(efficacy) {
  if (!Array.isArray(efficacy)) return [];
  return efficacy.filter(o => {
    if (!o || typeof o !== 'object') return false;
    const daa = typeof o.daa === 'number' ? o.daa : parseFloat(o.daa);
    return isFinite(daa) && daa >= 0;
  });
}

export function computeObservationTotalCover (obs, trial) {
                const clamp01 = (v) => Math.max(0, Math.min(100, v));
                const toNum0 = (v) => {
                    if (v === null || v === undefined || v === '') return null;
                    const n = typeof v === 'number' ? v : parseFloat(v);
                    return isFinite(n) ? n : null;
                };

                const inferCoverFromDetails = (details) => {
                    if (!Array.isArray(details) || details.length === 0) return null;
                    const covers = details
                        .filter(w => {
                            const species = String(w?.species || w?.name || w?.weed || w?.weedSpecies || '').trim();
                            if (!species) return false;
                            if (species.toLowerCase() === 'total') return false;
                            if (isMixedWeedPlaceholder && isMixedWeedPlaceholder(species)) return false;
                            return true;
                        })
                        .map(w => toNum0(w?.cover))
                        .filter(v => v !== null)
                        .map(v => clamp01(v));
                    if (!covers.length) return null;

                    const additive = covers.reduce((s, v) => s + v, 0);
                    if (additive <= 100) return clamp01(additive);

                    // Overlap-aware total cover (independence assumption).
                    const unionProb = 1 - covers.reduce((p, v) => p * (1 - (v / 100)), 1);
                    return clamp01(unionProb * 100);
                };

                if (obs && String(obs.weedCoverMode || '').toLowerCase() === 'grid-manual' && obs.weedCover !== undefined && obs.weedCover !== null && obs.weedCover !== '') {
                    const v = toNum0(obs.weedCover);
                    return v === null ? null : clamp01(v);
                }

                if (obs && obs.weedCover !== undefined && obs.weedCover !== null && obs.weedCover !== '') {
                    const v = toNum0(obs.weedCover);
                    return v === null ? null : clamp01(v);
                }
                if (obs && obs.cover !== undefined && obs.cover !== null && obs.cover !== '') {
                    const v = toNum0(obs.cover);
                    return v === null ? null : clamp01(v);
                }
                if (obs && Array.isArray(obs.weedDetails) && obs.weedDetails.length > 0) {
                    return inferCoverFromDetails(obs.weedDetails);
                }
                if (trial && trial.WeedSpecies) {
                    return null;
                }
                return null;
            };

            export function computeControlCoverReference (trial, daa) {
                const pid = String(trial?.ProjectID || '').trim();
                if (!pid || !Array.isArray(state?.trials)) return null;
                const targetDaa = typeof daa === 'number' ? daa : parseFloat(daa);
                if (!isFinite(targetDaa)) return null;

                const controls = allTrials.filter(t =>
                    String(t?.ProjectID || '').trim() === pid &&
                    String(t?.IsControl || '').toLowerCase() === 'true' &&
                    String(t?.ID || '') !== String(trial?.ID || '')
                );
                if (!controls.length) return null;

                const coverVals = [];
                controls.forEach(ct => {
                    const eff = _filterValidEfficacy(safeJsonParse(ct.EfficacyDataJSON, []));
                    let best = null;
                    let bestDelta = Infinity;
                    eff.forEach(o => {
                        const d = parseFloat(o?.daa);
                        if (!isFinite(d)) return;
                        const delta = Math.abs(d - targetDaa);
                        if (delta < bestDelta) {
                            bestDelta = delta;
                            best = o;
                        }
                    });
                    if (!best || bestDelta > 1) return;
                    const c = computeObservationTotalCover(best, ct);
                    if (c !== null && c !== undefined) coverVals.push(c);
                });
                if (!coverVals.length) return null;
                return coverVals.reduce((a, b) => a + b, 0) / coverVals.length;
            };

            export function computeControlPercentFromCover (trial, obs) {
                const treatedCover = computeObservationTotalCover(obs, trial);
                if (treatedCover === null || treatedCover === undefined) return null;
                const daa = typeof obs?.daa === 'number' ? obs.daa : parseFloat(obs?.daa);
                if (isFinite(daa) && daa <= 0) return 0;
                const refControl = computeControlCoverReference(trial, daa);

                let ref = refControl;
                if (ref === null || ref === undefined) {
                    const eff = _filterValidEfficacy(safeJsonParse(trial?.EfficacyDataJSON, []));
                    const flagged = eff.find(o => String(o?.isBaseline).toLowerCase() === 'true');
                    if (flagged) {
                        ref = computeObservationTotalCover(flagged, trial);
                    } else {
                        const byDate = eff.filter(o => o?.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
                        const baseline = byDate.length ? byDate[0] : eff.slice().sort((a, b) => (a?.daa || 0) - (b?.daa || 0))[0];
                        ref = baseline ? computeObservationTotalCover(baseline, trial) : null;
                    }
                }
                if (ref === null || ref === undefined) return null;
                if (!isFinite(ref) || ref <= 0) return null;

                const pct = (1 - (treatedCover / ref)) * 100;
                return Math.max(0, Math.min(100, pct));
            };