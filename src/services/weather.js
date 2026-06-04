export async function fetchWeather(lat, lon, date = null, getAppState) {
                let url = '';
                try {
                    const latNum = parseFloat(lat);
                    const lonNum = parseFloat(lon);
                    if (!lat || !lon || isNaN(latNum) || isNaN(lonNum)) {
                        console.error("fetchWeather: Invalid coordinates:", lat, lon);
                        return null;
                    }
                    // Validate date format YYYY-MM-DD
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!date || typeof date !== 'string' || !dateRegex.test(date)) {
                        console.error("fetchWeather: Invalid date format:", date);
                        return null;
                    }

                    const targetDate = new Date(date);
                    if (isNaN(targetDate.getTime())) {
                        console.error("fetchWeather: Invalid Date object:", date);
                        return null;
                    }

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    // Calculate age of date in days
                    const diffTime = today - targetDate;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    const dateStr = date; // YYYY-MM-DD

                    // 1. TRY PREMIUM: OpenWeatherMap (if key provided)
                    if (getAppState().settings.openWeatherMapKey) {
                        try {
                            const unixTime = Math.floor(targetDate.getTime() / 1000);
                            const owmUrl = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${latNum}&lon=${lonNum}&dt=${unixTime}&appid=${getAppState().settings.openWeatherMapKey}&units=metric`;
                            const response = await fetchWithRetry(owmUrl);
                            if (response.ok) {
                                const data = await response.json();
                                if (data.data && data.data[0]) {
                                    const w = data.data[0];
                                    return {
                                        temp: w.temp,
                                        humidity: w.humidity,
                                        wind: w.wind_speed,
                                        rain: w.rain ? (w.rain['1h'] || 0) : 0,
                                        provider: 'OpenWeatherMap'
                                    };
                                }
                            }
                        } catch (e) { console.warn('OpenWeatherMap failed, trying other providers...', e); }
                    }

                    // 1.5 TRY Visual Crossing (if key provided or selected)
                    if (getAppState().settings.visualCrossingKey || document.getElementById('settings-soil-provider')?.value === 'visual-crossing') {
                        try {
                            // If they selected it but no key in state, maybe they typed it in the input recently?
                            const vcKey = getAppState().settings.visualCrossingKey || document.getElementById('settings-vc-key')?.value;
                            if (vcKey) {
                                const vcUrl = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${latNum},${lonNum}/${dateStr}?key=${vcKey}&unitGroup=metric&include=days`;
                                const response = await fetchWithRetry(vcUrl);
                                if (response.ok) {
                                    const data = await response.json();
                                    if (data.days && data.days.length > 0) {
                                        const w = data.days[0];
                                        return {
                                            temp: w.tempmax || w.temp,
                                            humidity: w.humidity,
                                            wind: w.windspeed,
                                            rain: w.precip || 0,
                                            provider: 'Visual Crossing'
                                        };
                                    }
                                }
                            }
                        } catch (e) { console.warn('Visual Crossing failed...', e); }
                    }

                    // 1.7 TRY Tomorrow.io (if key provided or selected)
                    if (getAppState().settings.tomorrowKey || document.getElementById('settings-soil-provider')?.value === 'tomorrow-io') {
                        try {
                            const tmKey = getAppState().settings.tomorrowKey || document.getElementById('settings-tomorrow-key')?.value;
                            if (tmKey) {
                                const tmUrl = `https://api.tomorrow.io/v4/weather/history/recent?location=${latNum},${lonNum}&apikey=${tmKey}`;
                                const response = await fetchWithRetry(tmUrl);
                                if (response.ok) {
                                    const data = await response.json();
                                    if (data.timelines && data.timelines.daily && data.timelines.daily.length > 0) {
                                        const w = data.timelines.daily[0].values;
                                        return {
                                            temp: w.temperatureMax,
                                            humidity: w.humidityAvg,
                                            wind: w.windSpeedMax,
                                            rain: w.precipitationAccumulation || 0,
                                            provider: 'Tomorrow.io'
                                        };
                                    }
                                }
                            }
                        } catch (e) { console.warn('Tomorrow.io failed...', e); }
                    }

                    // 2. PRIMARY: Open-Meteo
                    const isOldArchive = diffDays > 14;
                    if (isOldArchive) {
                        url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max,rain_sum&timezone=auto`;
                    } else {
                        url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max,rain_sum&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;
                    }

                    const res = await fetchWithRetry(url);
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        console.error('Weather API Error Detail:', errData);
                        throw new Error(`Weather API Error: ${res.status}${errData.reason ? ' - ' + errData.reason : ''}`);
                    }
                    const data = await res.json();

                    if (data.daily && data.daily.time && data.daily.time.length > 0) {
                        console.log('Weather API Response Dates:', data.daily.time, 'Looking for:', dateStr);

                        // Find the index that matches our requested date
                        // The API returns an array, and sometimes handles timezones by shifting the day.
                        // We trust the query 'start_date' usually, but finding the exact string match is safest.
                        const index = data.daily.time.findIndex(t => t === dateStr);

                        // Fallback: Use 0 if single day requested and match not found (typical response)
                        // But if 0 is "Today" and we asked for "Yesterday", we must be careful.
                        // If index is -1, it means the API didn't return the requested date.

                        const safeIndex = index !== -1 ? index : 0; // WARNING: This might be the bug if index is -1

                        if (index === -1) {
                            console.warn('Weather date mismatch! API returned:', data.daily.time[0], 'Expected:', dateStr);
                        }

                        // Sanity check: if returned date is not what we asked for, and we are in strict mode
                        if (index === -1 && data.daily.time[0] !== dateStr) {
                            // If the mismatch is significant, return null.
                            if (Math.abs(new Date(data.daily.time[0]) - targetDate) > 86400000) {
                                console.error('Weather date mismatch too large. Aborting.');
                                return null;
                            }
                        }

                        return {
                            temp: data.daily.temperature_2m_max[safeIndex],
                            humidity: data.daily.relative_humidity_2m_mean[safeIndex],
                            wind: data.daily.wind_speed_10m_max[safeIndex],
                            rain: data.daily.rain_sum[safeIndex],
                            provider: 'Open-Meteo'
                        };
                    }
                    return null;
                } catch (e) {
                    console.error("Weather fetch failed:", e);
                    console.error("Failed URL:", url);
                    showToast('Could not fetch weather data.', 'error');
                    return null;
                }
            }

            async function fetchWeatherForTrialDate() {
                const location = document.querySelector('[name="location"]').value;
                const date = document.querySelector('[name="date"]').value;
                if (!location || !date) return showToast('Enter location and date first.', 'error');

                let lat, lon;
                if (location.includes(',')) {
                    [lat, lon] = location.split(',').map(s => s.trim());
                }

                if (lat && lon) {
                    showToast('Syncing Field Conditions (Weather & Soil)...', 'info');

                    // 1. Weather
                    const w = await fetchWeather(lat, lon, date);
                    if (w) {
                        document.querySelector('[name="temperature"]').value = w.temp || '';
                        document.querySelector('[name="humidity"]').value = w.humidity || '';
                        document.querySelector('[name="windspeed"]').value = w.wind || '';
                        document.querySelector('[name="rain"]').value = w.rain || '';

                        const latField = document.querySelector('[name="lat"]');
                        const lonField = document.querySelector('[name="lon"]');
                        if (latField) latField.value = lat;
                        if (lonField) lonField.value = lon;

                        const weatherJsonField = document.querySelector('[name="weatherJSON"]');
                        if (weatherJsonField) weatherJsonField.value = JSON.stringify(w);
                    }

                    // 2. Soil
                    try {
                        const soil = await fetchSoilData(lat, lon);
                        if (soil) {
                            const soilPanel = document.getElementById('soil-data-panel');
                            if (soilPanel) soilPanel.classList.remove('hidden');

                            const setSoil = (name, val) => {
                                const el = document.querySelector(`[name="${name}"]`);
                                if (el) el.value = val || '';
                            };

                            setSoil('soilPH', soil.ph);
                            setSoil('soilClay', soil.clay);
                            setSoil('soilSand', soil.sand);
                            setSoil('soilOC', soil.organicCarbon);
                            setSoil('soilTexture', soil.texture);

                            const soilJsonField = document.querySelector('[name="soilDataJSON"]');
                            if (soilJsonField) soilJsonField.value = JSON.stringify(soil);
                        }
                    } catch (e) { console.error('Soil sync failed in trial modal', e); }

                    showToast('Field conditions updated from GPS.', 'success');
                } else {
                    showToast('Invalid location format (lat,lon required).', 'error');
                }
            }

            function fetchWeatherForObservation(index) {
                // Determine context: are we inside the modal or card?
                // This logic might need to traverse DOM to find date/location
                // For now, keep as placeholder or implement if observation has location context
                showToast('Observation weather fetch not linked to location yet.', 'info');
            }

            async function handleToggleCompleted(id, isChecked) {
                const trial = state.trials.find(t => t.ID === id);
                if (trial) {
                    trial.IsCompleted = isChecked;
                    const result = await apiCall('updateTrialRecord', { ID: id, IsCompleted: isChecked }, false);
                    const updatedRecord = result?.record || (result?.ID ? result : null);
                    if (updatedRecord) {
                        const idx = state.trials.findIndex(t => t.ID === updatedRecord.ID);
                        if (idx > -1) state.trials[idx] = updatedRecord;
                        if (state.currentPage === 'dashboard') render.dashboard();
                        else if (state.currentPage === 'trials') applyFilters();
                    }
                }
            }

            function handleFinalizeTrial(id) {
                const trial = state.trials.find(t => t.ID === id);
                if (!trial) return;
                trial.ControlFinalized = true;
                trial.FinalizationDate = new Date().toISOString().split('T')[0];
                // Calc days
                const days = Math.floor((new Date() - new Date(trial.Date)) / (1000 * 60 * 60 * 24));
                trial.FinalControlDuration = days < 0 ? 0 : days;

                apiCall('updateTrialRecord', {
                    id,
                    ControlFinalized: true,
                    FinalizationDate: trial.FinalizationDate,
                    FinalControlDuration: trial.FinalControlDuration
                }, false);

                applyFilters(); // Re-render trial card with persistent sorting
                showToast('Trial control finalized.', 'success');
            }

            function handleRestartTrial(id) {
                const trial = state.trials.find(t => t.ID === id);
                if (!trial) return;
                trial.ControlFinalized = false;
                trial.FinalControlDuration = null;
                trial.FinalizationDate = null;

                apiCall('updateTrialRecord', {
                    id,
                    ControlFinalized: false,
                    FinalizationDate: null,
                    FinalControlDuration: null
                }, false);
                applyFilters(); // Re-render trial card with persistent sorting
                showToast('Trial counting restarted.', 'success');
            }

            async function analyzeTrialEfficacy(id) {
                const trial = state.trials.find(t => t.ID === id);
                if (!trial) return showToast('Trial not found.', 'error');

                console.log('Analyzing trial:', id, 'Trial data:', trial);

                const photos = safeJsonParse(trial.PhotoURLs);
                console.log('Photos found:', photos.length, photos);

                if (photos.length === 0) {
                    return showToast('No photos to analyze in this trial. Add photos first.', 'error');
                }

                // Check for API keys
                if (!getAppState().settings.apiKeys || getAppState().settings.apiKeys.length === 0) {
                    return showToast('No API keys configured. Go to Settings to add a Gemini API key.', 'error');
                }

                const confirmRun = confirm(`This will analyze ${photos.length} photo(s) for efficacy data using ${photos.length} API call(s). Continue?`);
                if (!confirmRun) return;

                showToast(`Analyzing ${photos.length} photo(s) for efficacy...`, 'info');

                let efficacyData = safeJsonParse(trial.EfficacyDataJSON);
                let aiAnalysisComplete = false;
                let photosAnalyzed = 0;

                for (const photo of photos) {
                    try {
                        // Skip photos that already have efficacy data linked
                        const alreadyAnalyzed = efficacyData.some(e => e.photoUrl === photo.url);
                        if (alreadyAnalyzed) {
                            console.log('Skipping already analyzed photo:', photo.url);
                            continue;
                        }

                        // Need to fetch the photo as base64 for analysis
                        const photoNum = photos.indexOf(photo) + 1;
                        console.log(`[Analysis] Processing photo ${photoNum}/${photos.length}`);
                        showToast(`Analyzing photo ${photoNum}/${photos.length}...`, 'info');

                        // Fetch photo and convert to base64
                        const photoData = await fetchPhotoAsBase64(photo.url);
                        if (!photoData) {
                            console.error(`[Analysis] Skipping photo ${photoNum} - fetch failed`);
                            continue;
                        }

                        console.log(`[Analysis] Sending photo ${photoNum} to Gemini AI...`);
                        const observationDate = new Date(photo.date || trial.Date);
                        const trialDate = new Date(trial.Date);
                        const daaValue = Math.round((observationDate.getTime() - trialDate.getTime()) / (1000 * 60 * 60 * 24));
                        const daa = daaValue >= 0 ? daaValue : 0;
                        const workingTrial = {
                            ...trial,
                            EfficacyDataJSON: JSON.stringify(efficacyData)
                        };
                        const efficacyResult = await analyzePhotoForEfficacy(photoData.fileData, photoData.mimeType, { trial: workingTrial, daa });
                        if (efficacyResult) {

                            efficacyData.push({
                                date: observationDate.toISOString().split('T')[0],
                                daa,
                                notes: `AI analysis from photo taken on ${observationDate.toLocaleDateString()}`,
                                photoUrl: photo.url,
                                weedDetails: efficacyResult.weedDetails,
                            });
                            aiAnalysisComplete = true;
                            photosAnalyzed++;
                            console.log(`[Analysis] ? Photo ${photoNum} complete | Total analyzed: ${photosAnalyzed}`);
                        } else {
                            console.warn(`[Analysis] Photo ${photoNum} returned no data`);
                        }
                    } catch (err) {
                        console.error(`[Analysis] Photo analysis failed:`, err);
                        showToast(`Analysis failed: ${err.message}`, 'error');
                        if (err.message.includes('QUOTA_EXCEEDED') || err.message.includes('ALL_KEYS_EXHAUSTED')) {
                            console.error('[Analysis] Quota exhausted - stopping analysis');
                            showToast('API Quota exhausted. Try again later.', 'error');
                            break;
                        }
                    }
                }

                console.log(`[Analysis] Complete | Photos analyzed: ${photosAnalyzed} | AI complete: ${aiAnalysisComplete}`);

                if (aiAnalysisComplete) {
                    trial.EfficacyDataJSON = JSON.stringify(efficacyData);
                    trial.AISummariesJSON = '{}'; // Clear cached summaries

                    const payloadSize = Math.round(trial.EfficacyDataJSON.length / 1024);
                    console.log(`[Analysis] Saving results to spreadsheet | Payload: ${payloadSize}KB | Records: ${efficacyData.length}`);

                    showToast('Saving analysis results to spreadsheet...', 'info');

                    let saveAttempts = 0;
                    let result = null;

                    while (saveAttempts < 2 && !result) {
                        try {
                            result = await apiCall('updateTrialRecord', {
                                ID: id,
                                EfficacyDataJSON: trial.EfficacyDataJSON,
                                AISummariesJSON: '{}'
                            }, true);

                            if (result && !result._errType) {
                                console.log('[Analysis] ? Save successful');
                                // TRIGGER STATS UPDATE
                                saveTrialStatistics(id);
                                break;
                            } else if (result && result._errType) {
                                throw new Error(result.message);
                            }
                        } catch (err) {
                            saveAttempts++;
                            console.error(`[Analysis] Save attempt ${saveAttempts} failed:`, err);

                            if (saveAttempts < 2) {
                                showToast(`Save failed. Retrying (${saveAttempts}/2)...`, 'info');
                                await new Promise(resolve => setTimeout(resolve, 3000));
                            }
                        }
                    }

                    if (result && !result._errType) {
                        showToast(`Efficacy analysis complete! Analyzed ${photosAnalyzed} photo(s). Opening report...`, 'success');
                        applyFilters();
                        // Open the trial detail view to show the analysis results
                        setTimeout(() => openTrialDetail(id), 500);
                    } else {
                        console.error('[Analysis] All save attempts failed');
                        showToast(`Analysis completed but failed to save to spreadsheet. Data size: ${payloadSize}KB. Try analyzing fewer photos at once.`, 'error');
                        // Save locally so work isn't lost
                        localStorage.setItem(`temp_analysis_${id}`, trial.EfficacyDataJSON);
                        console.log(`[Analysis] Results backed up to localStorage: temp_analysis_${id}`);
                    }
                } else {
                    console.log('[Analysis] No new photos analyzed');
                    showToast('No new photos to analyze. All photos already have efficacy data.', 'info');
                    // Still open the trial detail to show existing data
                    openTrialDetail(id);
                }
            }

            // Helper function to fetch a photo URL and convert to base64
            async function fetchPhotoAsBase64(url) {
                try {
                    console.log(`[Photo Fetch] Starting fetch for: ${url}`);

                    // Convert Google Drive /view URLs to download-friendly format
                    let fetchUrl = url;
                    if (url.includes('drive.google.com')) {
                        const driveMatch = url.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
                        if (driveMatch) {
                            const fileId = driveMatch[1];
                            fetchUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
                            console.log(`[Photo Fetch] Converted Drive URL to: ${fetchUrl}`);
                        }
                    }

                    // Use the proxy to avoid CORS issues
                    const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(fetchUrl)}&output=jpg`;
                    const fetchStart = Date.now();
                    const response = await fetch(proxiedUrl);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const blob = await response.blob();
                    const fetchTime = ((Date.now() - fetchStart) / 1000).toFixed(2);
                    console.log(`[Photo Fetch] Downloaded in ${fetchTime}s | Size: ${Math.round(blob.size / 1024)}KB`);

                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            console.log(`[Photo Fetch] Converted to Base64 | Total: ${((Date.now() - fetchStart) / 1000).toFixed(2)}s`);
                            resolve({
                                fileData: reader.result,
                                mimeType: blob.type || 'image/jpeg'
                            });
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (error) {
                    console.error(`[Photo Fetch] FAILED for ${url}:`, error.message);
                    showToast(`Failed to fetch photo: ${error.message}`, 'error');
                    return null;
                }
            }

            // --- PHOTO COMPRESSION FOR PDF (Handles 50+ photos efficiently) ---
            async function compressImageForPDF(base64Data, maxWidth = 800, maxHeight = 600, quality = 0.7) {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        let width = img.width;
                        let height = img.height;

                        // Resize if too large
                        if (width > maxWidth || height > maxHeight) {
                            const ratio = Math.min(maxWidth / width, maxHeight / height);
                            width = Math.floor(width * ratio);
                            height = Math.floor(height * ratio);
                        }

                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        // Compress as JPEG
                        resolve({ fileData: canvas.toDataURL('image/jpeg', quality), mimeType: 'image/jpeg' });
                    };
                    img.onerror = () => resolve({ fileData: base64Data, mimeType: 'image/jpeg' });
                    img.src = base64Data;
                });
            }

            window.generateRegulatoryProjectReport = async function (projectId) {
                const project = state.projects.find(p => p.ID === projectId);
                if (!project) return;

                const continuityFn = (typeof buildSpeciesContinuityTable === 'function') ? buildSpeciesContinuityTable : window.buildSpeciesContinuityTable;
                const envFn = (typeof buildEnvironmentalSuitabilityIndex === 'function') ? buildEnvironmentalSuitabilityIndex : window.buildEnvironmentalSuitabilityIndex;
                const sigFn = (typeof buildStatisticalSignificanceBlock === 'function') ? buildStatisticalSignificanceBlock : window.buildStatisticalSignificanceBlock;
                const confFn = (typeof buildSpeciesConfidenceBands === 'function') ? buildSpeciesConfidenceBands : window.buildSpeciesConfidenceBands;
                const traceFn = (typeof buildEvidenceTraceabilityMatrix === 'function') ? buildEvidenceTraceabilityMatrix : window.buildEvidenceTraceabilityMatrix;
                const doseFn = (typeof buildDoseResponseRecommendationPanel === 'function') ? buildDoseResponseRecommendationPanel : window.buildDoseResponseRecommendationPanel;

                // === DATA QUALITY AUDIT (NEW) ===
                // Check for bypass flag (set by Clean & Proceed or Force Generate)
                if (window.auditBypassOnce) {
                    console.log('[Regulatory Report] [INFO] Audit bypassed (user action)');
                    window.auditBypassOnce = false; // Reset flag
                    // Skip audit, continue with report generation
                } else {
                    // Run audit scan BEFORE generating the report
                    showToast('Running data quality audit...', 'info');
                    const auditIssues = await window.runAuditScan(projectId);

                    if (auditIssues && auditIssues.length > 0) {
                        // Issues found - modal is already open, stop report generation
                        console.log('[Regulatory Report] [WARN] Quality issues detected. Report generation blocked.');
                        showToast('Please review data quality issues before generating report.', 'error');
                        return; // Stop execution
                    }

                    // No issues found, proceed with report generation
                    console.log('[Regulatory Report] ? No quality issues found. Proceeding with report generation.');
                }

                // Load Settings (Merge with Defaults)
                const defaults = {
                    summary: true, protocol: true, treatments: true, stats: true,
                    efficacy: true, detailed: true, weather: true, photos: true
                };
                const userSettings = safeJsonParse(project.ReportSettingsJSON) || {};
                const settings = Object.assign({}, defaults, userSettings);
                settings.stats = true;
                settings.efficacy = true;
                settings.detailed = true;
                settings.photos = true;

                showToast('Generating Enhanced Regulatory Report...', 'info');

                // --- DEBUG: Check what we have ---
                console.log('[Regulatory Report] Project object:', project);
                console.log('[Regulatory Report] AnalysisResults:', project.AnalysisResults);
                console.log('[Regulatory Report] AnalysisResultsJSON:', project.AnalysisResultsJSON);

                // --- 1. PREPARE DATA ---
                const blocks = state.blocks.filter(b => b.ProjectID === projectId);
                const trials = state.trials.filter(t => t.ProjectID === projectId);

                // AI auto-fix: repair trials with missing/insufficient efficacy observations before chart/stat generation.
                const trialsNeedingRepair = trials.filter(t => {
                    const eff = validateEfficacyData(safeJsonParse(t.EfficacyDataJSON, []));
                    const hasCover = Array.isArray(eff) && eff.some(o => Array.isArray(o?.weedDetails) && o.weedDetails.length > 0);
                    return !Array.isArray(eff) || eff.length < 2 || !hasCover;
                });

                if (trialsNeedingRepair.length > 0) {
                    showToast(`Auto-repairing ${trialsNeedingRepair.length} trial(s) with AI...`, 'info');
                    for (const t of trialsNeedingRepair) {
                        await attemptChartRecovery(t.ID, 'all');
                    }
                }

                // FIX: Parse AnalysisResultsJSON if AnalysisResults is not available
                let results = project.AnalysisResults;
                if (!results || Object.keys(results).length === 0) {
                    try {
                        results = project.AnalysisResultsJSON ? JSON.parse(project.AnalysisResultsJSON) : {};
                    } catch (e) {
                        console.error('[Regulatory Report] Failed to parse AnalysisResultsJSON:', e);
                        results = {};
                    }
                }

                if ((!results || Object.keys(results).length === 0) && typeof calculateRCBD_Stats === 'function') {
                    try {
                        const rebuilt = calculateRCBD_Stats(project, trials, blocks) || {};
                        if (Object.keys(rebuilt).length > 0) {
                            results = rebuilt;
                            project.AnalysisResults = rebuilt;
                            project.AnalysisResultsJSON = JSON.stringify(rebuilt);
                            console.log('[Regulatory Report] Rebuilt analysis results after AI data repair');
                        }
                    } catch (recalcErr) {
                        console.warn('[Regulatory Report] Failed to rebuild analysis after repair:', recalcErr);
                    }
                }

                const daas = Object.keys(results).sort((a, b) => a - b);
                const finalDaa = daas.length ? daas[daas.length - 1] : null;
                const finalRes = finalDaa ? (results[finalDaa] || null) : null;

                console.log('[Regulatory Report] Parsed results:', results);
                console.log('[Regulatory Report] DAAs found:', daas);

                if (daas.length === 0) {
                    console.error('[Regulatory Report] NO ANALYSIS RESULTS! Check if analysis saved properly.');
                    showToast('No analysis results found. Run analysis first.', 'error');
                    return;
                }

                // === CHECK FOR INCOMPLETE DATA (Show user-friendly warning) ===
                let hasIncompleteData = false;
                let missingTrials = [];

                for (const daa of daas) {
                    const daaResult = results[daa];
                    if (daaResult && daaResult.error === 'INCOMPLETE_DATA') {
                        hasIncompleteData = true;
                        missingTrials = daaResult.missing || [];
                        break;
                    }
                }

                if (hasIncompleteData && missingTrials.length > 0) {
                    const missingList = missingTrials.map(m => `- ${m}`).join('\n');
                    const proceed = confirm(
                        `INCOMPLETE DATA DETECTED\n\n` +
                        `The following ${missingTrials.length} trial plot(s) are missing data:\n\n` +
                        `${missingList}\n\n` +
                        `This will result in:\n` +
                        `- No statistical analysis (F-ratio, LSD, P-values)\n` +
                        `- Missing treatment performance charts\n` +
                        `- Incomplete weed efficacy data\n\n` +
                        `Do you want to generate a LIMITED report anyway?\n\n` +
                        `Click OK to proceed with partial data.\n` +
                        `Click Cancel to go back and complete the missing trials.`
                    );

                    if (!proceed) {
                        showToast('Report generation cancelled. Please complete missing trials.', 'info');
                        return;
                    }

                    showToast('Generating report with incomplete data...', 'warning');
                }

                // Parse protocol data
                let protocol = {};
                try {
                    protocol = project.ProtocolJSON ? JSON.parse(project.ProtocolJSON) : (project.Protocol || {});
                } catch (e) {
                    protocol = project.Protocol || {};
                }

                // --- 2. GENERATE OR RETRIEVE EXECUTIVE SUMMARY ---
                showToast('Retrieving executive summary...', 'info');
                let aiExecutiveSummary = '';

                if (project.Conclusion && project.Conclusion.length > 20) {
                    console.log(`[Report Diagnosis] ? Found stored 'Conclusion' (${project.Conclusion.length} chars). Using it.`);
                    console.log(`[Report Diagnosis] Preview: ${project.Conclusion.substring(0, 50)}...`);
                    aiExecutiveSummary = project.Conclusion;
                } else if (project.Narrative && project.Narrative.length > 20) {
                    console.log(`[Report Diagnosis] [INFO] 'Conclusion' missing/short. Found stored 'Narrative' (${project.Narrative.length} chars). Using it.`);
                    aiExecutiveSummary = project.Narrative;
                } else {
                    console.log(`[Report Diagnosis] ? No valid stored Conclusion or Narrative found. Triggering regeneration...`);
                    try {
                        showToast('Generating AI executive summary...', 'info');
                        const summaryContext = `Generate a professional, human-like technical executive summary for this herbicide efficacy project report.

    Project: ${project.Name}
    Design: RCBD with ${blocks.length} replications
    Treatments: ${[...new Set(trials.map(t => t.FormulationName))].join(', ')}
    Metric: ${project.Metric}

    Data Summary:
    ${daas.map(dat => {
                            const res = results[dat];
                            if (!res || !res.treatmentStats || res.treatmentStats.length === 0) return "";
                            const top = res.treatmentStats.sort((a, b) => b.wce - a.wce)[0];
                            const name = state.formulations.find(f => f.ID === top.treatmentId)?.Name || 'Unknown';
                            return `${dat} DAA: Best performance from ${name} (${top.wce.toFixed(1)}% WCE).`;
                        }).join('\n')}

    Task: Write a professional summary with three sections: Methodology, Results, and Conclusion.
    - Consistency: Maintain a human, technical tone. Avoid robotic AI phrases.
    - Formatting: Plain text only. No markdown symbols or heading markers.
    - Methodology: Describe design and goal.
    - Results: Interpret statistical significance and treatment differences.
    - Conclusion: Technical recommendation for commercial or research application.`;

                        // USE NEW AI ANALYZER
                        const summaryResponse = await window.aiAnalyzer.generateText(summaryContext);
                        aiExecutiveSummary = normalizeReportText(summaryResponse || 'Executive summary generation not available.');

                        // Save it back to project locally so we don't regenerate again just for this session
                        project.Conclusion = aiExecutiveSummary;

                    } catch (e) {
                        console.warn('AI summary failed:', e);
                        aiExecutiveSummary = `Trial evaluated ${trials.length} plots in RCBD design with ${blocks.length} replications.`;
                    }
                }

                // --- 3. CAPTURE CHARTS AS IMAGES ---
                showToast('Capturing analysis charts...', 'info');
                const chartImages = {};

                try {
                    const tempDiv = document.createElement('div');
                    tempDiv.style.position = 'absolute';
                    tempDiv.style.left = '-9999px';
                    tempDiv.style.width = '1600px';
                    tempDiv.style.height = '800px';
                    document.body.appendChild(tempDiv);

                    // WCE Over Time Chart
                    const wceCanvas = document.createElement('canvas');
                    wceCanvas.width = 1600;
                    wceCanvas.height = 800;
                    tempDiv.appendChild(wceCanvas);

                    const treatments = [...new Set(trials.map(t => t.FormulationID || t.FormulationName))];
                    const colors = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

                    const wceDatasets = treatments.map((tId, idx) => {
                        const tName = state.formulations.find(f => f.ID === tId)?.Name || tId;
                        const data = daas.map(dat => {
                            const res = results[dat];
                            if (!res || !res.treatmentStats) return null;
                            const ts = res.treatmentStats.find(s => s.treatmentId === tId);
                            return ts ? { x: parseInt(dat), y: ts.wce } : null;
                        }).filter(Boolean);

                        return {
                            label: tName,
                            data,
                            borderColor: colors[idx % colors.length],
                            backgroundColor: colors[idx % colors.length] + '33',
                            borderWidth: 4,
                            pointRadius: 0,
                            pointHoverRadius: 8,
                            tension: 0.3
                        };
                    });

                    new Chart(wceCanvas, {
                        type: 'line',
                        data: { datasets: wceDatasets },
                        options: {
                            responsive: false,
                            animation: false,
                            plugins: {
                                title: { display: true, text: 'Weed Control Efficacy Over Time', font: { size: 32, weight: 'bold' } },
                                legend: { position: 'right', labels: { font: { size: 20 } } }
                            },
                            scales: {
                                x: { type: 'linear', title: { display: true, text: 'Days After Application', font: { size: 24 } }, ticks: { font: { size: 18 } } },
                                y: { min: -100, max: 100, title: { display: true, text: 'WCE (%)', font: { size: 24 } }, ticks: { font: { size: 18 } } }
                            }
                        }
                    });

                    await new Promise(resolve => setTimeout(resolve, 500));
                    chartImages.wceTimeline = wceCanvas.toDataURL('image/jpeg', 0.92);

                    // Final DAT Performance Chart
                    const finalDat = daas[daas.length - 1];
                    const finalRes = results[finalDat];

                    // Skip if no valid data (incomplete/partial results)
                    if (finalRes && finalRes.treatmentStats && finalRes.treatmentStats.length > 0 && !finalRes.error) {
                        const perfCanvas = document.createElement('canvas');
                        perfCanvas.width = 1600;
                        perfCanvas.height = 800;
                        tempDiv.appendChild(perfCanvas);

                        const perfData = (finalRes.treatmentStats || []).map(ts => {
                            const tName = state.formulations.find(f => f.ID === ts.treatmentId)?.Name || 'Unknown';
                            return { treatment: tName, wce: ts.wce, mean: ts.mean };
                        });

                        const perfCtx = perfCanvas.getContext('2d');
                        new Chart(perfCtx, {
                            type: 'bar',
                            data: {
                                labels: perfData.map(d => d.treatment),
                                datasets: [{
                                    label: `WCE % at ${finalDat} DAA`,
                                    data: perfData.map(d => d.wce ?? d.mean ?? 0),
                                    backgroundColor: perfData.map((_, i) => `hsl(${(i * 47) % 360}, 65%, 55%)`)
                                }]
                            },
                            options: {
                                responsive: false,
                                animation: false,
                                plugins: { legend: { display: false } },
                                scales: { y: { beginAtZero: true, max: 100 } }
                            }
                        });

                        await new Promise(resolve => setTimeout(resolve, 500));
                        chartImages.finalPerformance = perfCanvas.toDataURL('image/jpeg', 0.92);
                    }

                } catch (chartErr) {
                    console.warn('Chart generation error:', chartErr);
                } finally {
                    if (tempDiv && document.body.contains(tempDiv)) {
                        document.body.removeChild(tempDiv);
                    }
                }

                // --- 4. BUILD REPORT ---
                showToast('Building regulatory report document...', 'info');

                try {
                    if (typeof window.buildDocxReport === 'function') {
                        await window.buildDocxReport({
                            project, blocks, trials, results,
                            daas, finalDaa, finalRes,
                            aiExecutiveSummary, chartImages, settings, protocol
                        });
                    } else if (typeof window.generateDocxReport === 'function') {
                        await window.generateDocxReport(projectId);
                    } else {
                        showToast('Regulatory report generated.', 'success');
                    }
                } catch (reportErr) {
                    console.error('[Regulatory Report] Failed to build report:', reportErr);
                    showToast('Report generation failed: ' + reportErr.message, 'error');
                }
            };