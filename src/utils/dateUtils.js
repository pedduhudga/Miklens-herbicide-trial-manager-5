export function toDateKey (value) {
                if (!value) return '';

                if (value instanceof Date && !isNaN(value.getTime())) {
                    const y = value.getFullYear();
                    const m = String(value.getMonth() + 1).padStart(2, '0');
                    const d = String(value.getDate()).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                }

                const raw = String(value).trim();
                if (!raw) return '';

                // Keep plain date strings as-is. Datetime strings are parsed below
                // to avoid timezone drift when users expect local calendar dates.
                const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (isoDateOnly) return `${isoDateOnly[1]}-${isoDateOnly[2]}-${isoDateOnly[3]}`;

                const slashLike = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
                if (slashLike) {
                    let a = parseInt(slashLike[1], 10);
                    let b = parseInt(slashLike[2], 10);
                    let y = parseInt(slashLike[3], 10);
                    if (y < 100) y += 2000;

                    let month = a;
                    let day = b;
                    if (a > 12 && b <= 12) {
                        month = b;
                        day = a;
                    }

                    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                        return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    }
                }

                const parsed = new Date(raw);
                if (!isNaN(parsed.getTime())) {
                    const y = parsed.getFullYear();
                    const m = String(parsed.getMonth() + 1).padStart(2, '0');
                    const d = String(parsed.getDate()).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                }

                return '';
            };

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
            };

            export function formatPhotoDate(dateStr) {
                if (!dateStr) return '';
                // If it already has AM/PM, it is already formatted
                if (/AM|PM|am|pm/i.test(dateStr)) return dateStr;
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                
                let hours = d.getHours();
                const minutes = String(d.getMinutes()).padStart(2, '0');
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12;
                hours = hours ? hours : 12;
                
                return `${y}-${m}-${day} ${hours}:${minutes}${ampm}`;
            }

            export function toDatetimeLocal(dateInput) {
                const d = dateInput ? new Date(dateInput) : new Date();
                if (isNaN(d.getTime())) return '';
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const h = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                return `${y}-${m}-${day}T${h}:${min}`;
            }