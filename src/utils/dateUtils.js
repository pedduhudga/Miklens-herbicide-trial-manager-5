if (typeof Date !== 'undefined') {
    const originalToLocaleDateString = Date.prototype.toLocaleDateString;
    Date.prototype.toLocaleDateString = function(locale, options) {
        if (options && (options.month || options.weekday || options.year)) {
            return originalToLocaleDateString.call(this, locale, options);
        }
        const day = String(this.getDate()).padStart(2, '0');
        const month = String(this.getMonth() + 1).padStart(2, '0');
        const year = this.getFullYear();
        return `${day}-${month}-${year}`;
    };
}

export function parseCustomDate(str) {
    if (!str) return null;
    const s = String(str).trim();
    // Match DD-MM-YYYY HH:MM AM/PM or similar
    const match = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?)?/i);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        let hour = match[4] ? parseInt(match[4], 10) : 0;
        const minute = match[5] ? parseInt(match[5], 10) : 0;
        const ampm = match[6];
        if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
            if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        }
        return new Date(year, month, day, hour, minute);
    }
    // Fallback to ISO-like YYYY-MM-DD
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10) - 1;
        const day = parseInt(isoMatch[3], 10);
        const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
        const minute = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
        return new Date(year, month, day, hour, minute);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

export function toDateKey (value) {
    if (!value) return '';
    const parsed = parseCustomDate(value);
    if (parsed) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return '';
}

/**
 * Calculate DAA (Days After Application) using normalized calendar dates only.
 */
export function calculateDAA (photoDate, trialDate) {
    try {
        const pKey = toDateKey(photoDate);
        const tKey = toDateKey(trialDate);
        if (!pKey || !tKey) {
            console.warn('[DAA] Invalid date provided:', { photoDate, trialDate });
            return 0;
        }

        const [py, pm, pd] = pKey.split('-').map(Number);
        const [ty, tm, td] = tKey.split('-').map(Number);
        const pUTC = Date.UTC(py, pm - 1, pd);
        const tUTC = Date.UTC(ty, tm - 1, td);

        const daa = Math.floor((pUTC - tUTC) / (1000 * 60 * 60 * 24));
        return Math.max(0, daa);
    } catch (e) {
        console.error('[DAA] Calculation failed:', e);
        return 0;
    }
}

export function formatPhotoDate(dateStr) {
    return formatDateTime(dateStr);
}

export function formatDateTime(dateInput) {
    if (!dateInput) return '';
    const d = parseCustomDate(dateInput);
    if (!d) return String(dateInput);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = String(hours).padStart(2, '0');

    return `${day}-${month}-${year} ${hoursStr}:${minutes} ${ampm}`;
}

export function formatDate(dateInput) {
    if (!dateInput) return '';
    const d = parseCustomDate(dateInput);
    if (!d) return String(dateInput);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${day}-${month}-${year}`;
}

export function toDatetimeLocal(dateInput) {
    const d = dateInput ? (parseCustomDate(dateInput) || new Date()) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
}