import { canonicalizeWeedSpecies } from './weedUtils.js';

export function safeJsonParse(str, fallback = null) {
    try {
        return str ? JSON.parse(str) : fallback;
    } catch (e) {
        return fallback;
    }
}

export function truncateText(text, length) {
    if (!text) return '';
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

export function escapeHtml(text) {
    if (!text) return '';
    // We shouldn't use document.createElement in a pure util file. Use regex replace instead.
    return text.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
export function extractMetricValue (observation, project) {
                if (!observation) return null;

                // Otherwise use weed cover
                if (observation.weedDetails && observation.weedDetails.length > 0) {
                    // Try to match target weed species
                    const targetWeed = project.TargetWeed || project.WeedSpecies;

                    if (targetWeed) {
                        const targetCanonical = canonicalizeWeedSpecies(targetWeed);
                        const matchedWeed = observation.weedDetails.find(w => {
                            if (!w.species) return false;
                            const speciesCanonical = canonicalizeWeedSpecies(w.species);
                            // Case-insensitive partial match
                            return speciesCanonical === targetCanonical ||
                                speciesCanonical.toLowerCase().includes(targetCanonical.toLowerCase()) ||
                                targetCanonical.toLowerCase().includes(speciesCanonical.toLowerCase());
                        });

                        if (matchedWeed) {
                            const v = parseFloat(matchedWeed.cover);
                            return isFinite(v) ? v : null;
                        } else {
                            console.warn(`Target weed "${targetWeed}" not found, using first weed`);
                        }
                    }

                    // Fallback: use first weed
                    const v = parseFloat(observation.weedDetails[0].cover);
                    return isFinite(v) ? v : null;
                }

                return null;
            };