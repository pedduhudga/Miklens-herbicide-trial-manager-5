import { apiCall } from './db.js';
let _isSyncProcessing = false;

export async function processSyncQueue(getAppState, updateAppState, showToast, renderSyncStatus) {
                const state = getAppState();
                if (_isSyncProcessing || state.syncQueue.length === 0) return;

                const now = Date.now();
                if (now - _lastSyncAttempt < SYNC_MIN_INTERVAL) {
                    console.log('[HighTechSync] Rate-limiting: Skipping rapid re-trigger');
                    return;
                }

                _isSyncProcessing = true;
                _lastSyncAttempt = now;

                const queueStartTime = Date.now();
                console.log(`%c[HighTechSync] [INFO] Starting Sync Process | Queue: ${getAppState().syncQueue.length} items`, "color: #0d9488; font-weight: bold; font-size: 1.1em;");
                renderSyncStatus();

                let itemsToProcess = getAppState().syncQueue.filter(item =>
                    item.status === 'pending' ||
                    item.status === 'uploading' ||
                    (item.status === 'failed' && !item.noRetry)
                );

                let isFirstItem = true;

                for (const item of itemsToProcess) {
                    if (item.cancelRequested || item.status === 'cancelled') {
                        console.log(`[HighTechSync] ? Skipping cancelled item: ${getSyncItemLabel(item)}`);
                        removeSyncPlaceholderFromTrial(item);
                        getAppState().syncQueue = getAppState().syncQueue.filter(i => i.id !== item.id);
                        updateAppState({ syncQueue: getAppState().syncQueue });
                        renderSyncStatus();
                        continue;
                    }

                    if (!navigator.onLine) {
                        console.warn("[HighTechSync] [WARN] Offline detected. Pausing sync.");
                        break;
                    }

                    // SAFETY: Check if we've been processing for too long (processing one item shouldn't exceed 1 minute)
                    if (Date.now() - _lastSyncAttempt > SYNC_STUCK_TIMEOUT) {
                        console.warn('[HighTechSync] [WARN] Processing timeout detected. Breaking to prevent hang.');
                        break;
                    }

                    const itemStartTime = Date.now();
                    const itemLabel = item.action ? `Action: ${item.action}` : (item.photo?.fileName || item.id);

                    if (!isFirstItem || (item.attempts || 0) > 0) {
                        const waitTime = Math.min(10000, (isFirstItem ? 0 : 500) + ((item.attempts || 0) * 2000));
                        if (waitTime > 0 && item.action) { // Actions have priority, but we still backoff on repeats
                            console.log(`[HighTechSync] Waiting ${waitTime}ms (backoff)...`);
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                        }
                    }
                    isFirstItem = false;

                    // --- NEW: DATA ACTION SYNC PATH ---
                    if (item.action) {
                        try {
                            item.status = 'uploading';
                            updateAppState({ syncQueue: getAppState().syncQueue });
                            renderSyncStatus();

                            console.log(`[HighTechSync] [INFO] Syncing Action: ${item.action}`);
                            const result = await apiCall(item.action, item.payload, false);

                            if (item.cancelRequested) {
                                console.log(`[HighTechSync] ? Cancelled after request: ${item.action}`);
                                getAppState().syncQueue = getAppState().syncQueue.filter(i => i.id !== item.id);
                                updateAppState({ syncQueue: getAppState().syncQueue });
                                continue;
                            }

                            if (result && result._errType) throw new Error(result.message);

                            console.log(`%c? Action Synced: ${item.action}`, "color: #16a34a;");
                            item.status = 'completed';
                            getAppState().syncQueue = getAppState().syncQueue.filter(i => i.id !== item.id);
                            updateAppState({ syncQueue: getAppState().syncQueue });
                            continue;
                        } catch (e) {
                            console.error(`[HighTechSync] ? Action Fail: ${item.action}`, e);
                            item.status = 'failed';
                            item.attempts = (item.attempts || 0) + 1;
                            updateAppState({ syncQueue: getAppState().syncQueue });
                            continue;
                        }
                    }

                    // --- PHOTO UPLOAD SYNC PATH ---
                    // CRITICAL FIX: Dedup check - MUST work even if URL is empty (first upload attempt)
                    const trial = state.trials.find(t => t.ID === item.trialId);
                    if (trial && item.photo.tempId) {
                        const isWeed = item.type === 'weed_upload';
                        let photos = isWeed ? safeJsonParse(trial.WeedPhotosJSON) : safeJsonParse(trial.PhotoURLs);

                        // Check if this exact tempId already exists in photos AND either:
                        // 1) Has a URL (already uploaded successfully), OR
                        // 2) Another sync item is CURRENTLY uploading it (to prevent parallel uploads)
                        const existingPhoto = photos.find(p => p.tempId === item.photo.tempId);
                        if (existingPhoto && existingPhoto.url) {
                            console.log(`[HighTechSync] ? DUPLICATE BLOCKED: Photo already uploaded: ${item.photo.tempId}`);
                            item.status = 'completed';
                            getAppState().syncQueue = getAppState().syncQueue.filter(i => i.id !== item.id);
                            updateAppState({ syncQueue: getAppState().syncQueue });
                            continue;
                        }

                        // Check if another sync item for the same photo is already uploading
                        const otherUploadingItem = getAppState().syncQueue.find(s =>
                            s.photo.tempId === item.photo.tempId &&
                            s.id !== item.id &&
                            s.status === 'uploading'
                        );
                        if (otherUploadingItem) {
                            console.log(`[HighTechSync] ? Item skipped - same photo already uploading by ${otherUploadingItem.id}`);
                            item.status = 'pending';
                            updateAppState({ syncQueue: getAppState().syncQueue });
                            // Skip this iteration, try again after other completes
                            continue;
                        }
                    }

                    item.status = 'uploading';
                    updateAppState({ syncQueue: getAppState().syncQueue });
                    renderSyncStatus();

                    try {
                        const payloadSize = Math.round(item.photo.fileData.length / 1024);
                        console.group(`[Syncing Item] ${itemLabel} (${payloadSize} KB)`);
                        console.log(`Start Time: ${new Date(itemStartTime).toLocaleTimeString()}`);

                        const isWeed = item.type === 'weed_upload';

                        // 1. ATOMIC UPLOAD
                        if (!getEffectiveFolderId()) throw new Error("Folder ID missing.");

                        const uploadStart = Date.now();
                        console.log(`[Step 1/3] Uploading to Google Drive...`);

                        // Determine hierarchical folder path
                        let folderPath = null;
                        if (trial) {
                            const project = state.projects.find(p => p.ID === trial.ProjectID);
                            const projectName = project ? project.Name : 'Ungrouped Projects';
                            const dosageSuffix = trial.Dosage ? ` (${trial.Dosage})` : '';
                            const idSuffix = trial.ID ? ` - ${String(trial.ID).slice(-5)}` : '';
                            const trialNameWithDate = `${trial.FormulationName || 'Unknown Formulation'}${dosageSuffix} (${trial.Date ? new Date(trial.Date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]})${idSuffix}`.trim();
                            folderPath = [projectName, trialNameWithDate];
                        }

                        // ADD TIMEOUT SAFETY: Prevent hanging on Google Drive API (timeout after 45s)
                        let result = null;
                        try {
                            const uploadPromise = apiCall('uploadPhoto', {
                                trialId: item.trialId,
                                fileData: item.photo.fileData,
                                mimeType: item.photo.mimeType,
                                fileName: item.photo.fileName,
                                isWeed: isWeed,
                                label: item.photo.label,
                                date: item.photo.date,
                                folderPath: folderPath
                            }, false);

                            // Timeout after 45 seconds
                            result = await Promise.race([
                                uploadPromise,
                                new Promise((_, reject) =>
                                    setTimeout(() => reject(new Error('Upload timeout after 45s - connection too slow. Will retry.')), 45000)
                                )
                            ]);
                        } catch (timeoutErr) {
                            if (String(timeoutErr.message).includes('timeout')) {
                                console.error('[HighTechSync] [ERROR] Upload timeout detected:', timeoutErr.message);
                                item.status = 'pending';
                                item.attempts = (item.attempts || 0) + 1;
                                item.lastError = timeoutErr.message;
                                updateAppState({ syncQueue: getAppState().syncQueue });
                                continue;
                            }
                            throw timeoutErr;
                        }

                        if (item.cancelRequested) {
                            console.warn(`[HighTechSync] ? Upload finished but item was cancelled: ${itemLabel}`);
                            removeSyncPlaceholderFromTrial(item);
                            getAppState().syncQueue = getAppState().syncQueue.filter(i => i.id !== item.id);
                            updateAppState({ syncQueue: getAppState().syncQueue });
                            renderSyncStatus();
                            continue;
                        }

                        if (result && result._errType) throw new Error(`Server Error: ${result.message}`);
                        if (!result?.url && !result?.id) throw new Error('Empty response from script.');

                        const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(2);
                        console.log(`%c? Drive Upload Complete (${uploadTime}s)`, "color: #16a34a;");

                        const publicUrl = result.url || result.fileUrl;
                        console.log(`Cloud URL: ${publicUrl}`);

                        // 2. INTERNAL STATE & BACKGROUND AI
                        if (trial) {
                            let photos = isWeed ? safeJsonParse(trial.WeedPhotosJSON) : safeJsonParse(trial.PhotoURLs);
                            const idx = photos.findIndex(p => p.tempId === item.photo.tempId);

                            if (idx > -1) {
                                photos[idx].url = publicUrl;
                                if (!photos[idx].label || photos[idx].label === "Processing...") {
                                    photos[idx].label = item.photo.label || `Photo: ${item.photo.date || new Date().toLocaleDateString()}`;
                                }
                                delete photos[idx].fileData;
                            } else {
                                photos.push({ url: publicUrl, date: item.photo.date, label: item.photo.label || '', tempId: item.photo.tempId });
                            }

                            if (isWeed) trial.WeedPhotosJSON = JSON.stringify(photos); else trial.PhotoURLs = JSON.stringify(photos);
                            updateAppState({ trials: [...state.trials] });

                            // 3. PERSIST PHOTO LINK TO SHEET
                            const handshakeStart = Date.now();
                            console.log(`[Step 2/3] Updating Spreadsheet...`);

                            await apiCall('updateTrialRecord', {
                                ID: trial.ID,
                                [isWeed ? 'WeedPhotosJSON' : 'PhotoURLs']: trial[isWeed ? 'WeedPhotosJSON' : 'PhotoURLs']
                            }, false);

                            const handshakeTime = ((Date.now() - handshakeStart) / 1000).toFixed(2);
                            console.log(`%c? Spreadsheet Handshake Complete (${handshakeTime}s)`, "color: #16a34a;");

                            refreshRelevantUI(item.trialId, item.type);

                            // 4. FIRE-AND-FORGET AI
                            console.log(`[Step 3/3] Launching Background AI Analysis (Non-blocking)...`);
                            (async () => {
                                const aiStart = Date.now();
                                try {
                                    if (isWeed) {
                                        const ids = await identifyWeedsFromPhoto(item.photo.fileData, item.photo.mimeType);
                                        if (ids?.length > 0) {
                                            const t = state.trials.find(x => x.ID === item.trialId);
                                            let wPhotos = safeJsonParse(t.WeedPhotosJSON);
                                            const pIdx = wPhotos.findIndex(p => p.tempId === item.photo.tempId);
                                            if (pIdx > -1) {
                                                wPhotos[pIdx].identifications = ids;
                                                if (!wPhotos[pIdx].label || wPhotos[pIdx].label.includes('Synced')) wPhotos[pIdx].label = ids.map(i => i.name).join(', ');
                                                t.WeedPhotosJSON = JSON.stringify(wPhotos);
                                                await apiCall('updateTrialRecord', { ID: t.ID, WeedPhotosJSON: t.WeedPhotosJSON }, false);
                                                refreshRelevantUI(item.trialId, 'weed_upload');
                                                console.log(`[AI Background] Weed ID finished in ${((Date.now() - aiStart) / 1000).toFixed(2)}s`);
                                            }
                                        }
                                    } else {
                                        // 1. Proactive Weed ID (If missing species or first photo)
                                        const shouldRunFirstPhotoCheck = shouldAutoIdentifyGeneralPhotoWeeds(trial, {
                                            tempId: item.photo.tempId,
                                            url: publicUrl
                                        });

                                        if (shouldRunFirstPhotoCheck) {
                                            console.log('[AI Background] Triggering proactive Weed ID for general photo...');
                                            const ids = await analyzeGeneralPhotoWeeds(item.trialId, {
                                                tempId: item.photo.tempId,
                                                url: publicUrl
                                            }, {
                                                showToast: false,
                                                sourceFileData: item.photo.fileData,
                                                sourceMimeType: item.photo.mimeType
                                            });
                                            if (ids && ids.length > 0) {
                                                const common = ids.flatMap(i => i.commonNames || []).join(', ');
                                                if (common) showToast(`Identified potential weeds: ${common}`, 'info');
                                            }
                                        }

                                        // 2. Weed Cover Analysis (ALWAYS RUN & SAVE)
                                        console.log('%c[AI Background] [INFO] Running weed cover detection...', 'color: #10b981; font-weight: bold;');
                                        let coverResult = null;
                                        try {
                                            const greenOnly = true;
                                            coverResult = await analyzeWeedCover(item.photo.fileData, greenOnly);
                                            console.log(`%c[Weed Cover] [INFO] ${coverResult.cover}% coverage detected (${coverResult.mode})`,
                                                "color: #10b981; font-weight: bold; font-size: 1.2em;");
                                            console.log('[Weed Cover] Breakdown:', coverResult.breakdown);
                                            console.log('[Weed Cover] Details:', coverResult.details);

                                            // SAVE WEED COVER IMMEDIATELY (even if autoAnalyze is off)
                                            const trial = state.trials.find(x => x.ID === item.trialId);
                                            if (trial && coverResult.cover > 0) {
                                                let eData = safeJsonParse(trial.EfficacyDataJSON);
                                                const daa = window.calculateDAA(item.photo.date, trial.Date);
                                                const photoDateStr = window.toDateKey(item.photo.date);

                                                // Check if observation for this date already exists
                                                const existingIdx = eData.findIndex(obs => window.toDateKey(obs.date) === photoDateStr);
                                                if (existingIdx >= 0) {
                                                    // Update existing observation
                                                    eData[existingIdx].weedCover = coverResult.cover;
                                                    eData[existingIdx].vari = coverResult.vari;
                                                    eData[existingIdx].weedCoverMode = 'auto';
                                                    eData[existingIdx].photoUrl = publicUrl;
                                                    console.log(`[Weed Cover] Updated existing obs with ${coverResult.cover}%`);
                                                } else {
                                                    // Create new observation with weed cover
                                                    eData.push({
                                                        date: photoDateStr,
                                                        daa: daa,
                                                        notes: 'Weed cover detected from photo',
                                                        photoUrl: publicUrl,
                                                        weedCover: coverResult.cover,
                                                        weedCoverMode: 'auto',
                                                        weedDetails: []
                                                    });
                                                    console.log(`[Weed Cover] Created new obs with ${coverResult.cover}%`);
                                                }

                                                trial.EfficacyDataJSON = JSON.stringify(eData);
                                                await apiCall('updateTrialRecord', { ID: trial.ID, EfficacyDataJSON: trial.EfficacyDataJSON }, false);
                                                refreshRelevantUI(item.trialId, 'general_upload');
                                                console.log(`? WEED COVER SAVED: ${coverResult.cover}%`);
                                            }
                                        } catch (wcErr) {
                                            console.error('[Weed Cover] Analysis failed:', wcErr);
                                        }

                                        // 3. Full Efficacy Analysis (If enabled)
                                        console.log('[AI Background] autoAnalyzePhotos setting:', state.settings.autoAnalyzePhotos);
                                        if (state.settings.autoAnalyzePhotos) {
                                            console.log('[AI Background] Running full efficacy analysis...');
                                                const t = state.trials.find(x => x.ID === item.trialId);
                                            let eData = safeJsonParse(t.EfficacyDataJSON);
                                            const daa = window.calculateDAA(item.photo.date, t.Date);
                                                const workingTrial = {
                                                    ...t,
                                                    EfficacyDataJSON: JSON.stringify(eData || [])
                                                };
                                                const eff = await analyzePhotoForEfficacy(item.photo.fileData, item.photo.mimeType, { trial: workingTrial, daa: daa });
                                            if (eff) {

                                                // Include weed cover in saved data
                                                const photoDate = new Date(item.photo.date);
                                                const photoDateStr = window.toDateKey(item.photo.date);
                                                const newObs = {
                                                    date: photoDateStr,
                                                    daa: daa,
                                                    notes: `AI analysis from photo taken on ${photoDate.toLocaleDateString()}`,
                                                    photoUrl: publicUrl,
                                                    weedDetails: eff.weedDetails
                                                };

                                                // Calculate total weed cover from individual species
                                                if (eff.weedDetails && eff.weedDetails.length > 0) {
                                                    newObs.weedCover = window.computeObservationTotalCover({ weedDetails: eff.weedDetails }, t);
                                                    newObs.weedCoverMode = 'auto';
                                                    console.log(`[Weed Cover] Calculated total from species: ${newObs.weedCover}% from ${eff.weedDetails.length} species`);
                                                }

                                                // Add weed cover if available from AI estimate
                                                if (eff.weedCoverEstimate) {
                                                    newObs.weedCover = eff.weedCoverEstimate.cover;
                                                    newObs.weedCoverMode = eff.weedCoverEstimate.mode;
                                                    newObs.weedCoverConfidence = eff.weedCoverEstimate.confidence;
                                                    console.log(`[Weed Cover] Using AI estimate: ${newObs.weedCover}%`);
                                                }

                                                eData.push(newObs);
                                                t.EfficacyDataJSON = JSON.stringify(eData);
                                                t.AISummariesJSON = '{}';
                                                await apiCall('updateTrialRecord', { ID: t.ID, EfficacyDataJSON: t.EfficacyDataJSON, AISummariesJSON: '{}' }, false);
                                                refreshRelevantUI(item.trialId, 'general_upload');
                                                console.log(`[AI Background] Full efficacy analysis finished in ${((Date.now() - aiStart) / 1000).toFixed(2)}s`);

                                                // Auto-prompt for grid correction if weed cover detected
                                                if (newObs.weedCover && newObs.weedCover > 0 && publicUrl) {
                                                    setTimeout(() => {
                                                        if (confirm(`Weed cover detected: ${newObs.weedCover}%\n\nRefine with grid analysis? (Recommended for separating crop from weeds)`)) {
                                                            showGridWeedCoverModal(publicUrl, newObs.weedCover, (gridData) => {
                                                                updateObservationWeedCover(t.ID, eData.length - 1, gridData);
                                                            });
                                                        }
                                                    }, 1000);
                                                }
                                            }
                                        }
                                    }
                                } catch (aiErr) { console.warn(`[AI Background] Failed:`, aiErr.message); }
                            })();
                        }

                        item.status = 'completed';
                        getAppState().syncQueue = getAppState().syncQueue.filter(i => i.id !== item.id);

                        const totalItemTime = ((Date.now() - itemStartTime) / 1000).toFixed(2);
                        console.log(`%cTotal Item Process Time: ${totalItemTime}s`, "font-weight: bold; color: #0d9488;");
                        console.groupEnd();
                    } catch (error) {
                        const errMsg = String(error?.message || 'Unknown error');
                        console.error(`%c[Sync Error] ${itemLabel} Failed: ${errMsg}`, "color: #dc2626; font-weight: bold;");
                        item.attempts = (item.attempts || 0) + 1;
                        const drivePermDenied = isDrivePermissionError(errMsg);
                        item.noRetry = drivePermDenied;
                        item.status = errMsg.includes('Timeout') || errMsg.includes('fetch') ? 'pending' : 'failed';
                        item.lastError = errMsg;

                        if (drivePermDenied) {
                            const now = Date.now();
                            if (!window._drivePermissionToastAt || now - window._drivePermissionToastAt > 60000) {
                                showToast('Drive permission denied by server. In Apps Script deploy Web App as "Execute as: Me", run triggerDrivePermissions() once, then redeploy.', 'error');
                                window._drivePermissionToastAt = now;
                            }
                        }
                        console.groupEnd();
                    }
                    updateAppState({ syncQueue: getAppState().syncQueue });
                    renderSyncStatus();
                }

                _isSyncProcessing = false;
                const totalQueueTime = ((Date.now() - queueStartTime) / 1000).toFixed(2);
                console.log(`[HighTechSync] ? Queue Finished | Total Time: ${totalQueueTime}s | Pending: ${getAppState().syncQueue.filter(s => s.status === 'pending').length}`);

                // Feedback for user
                const successCount = itemsToProcess.filter(i => i.status === 'completed').length;
                const failedCount = itemsToProcess.filter(i => i.status === 'failed' && !i.noRetry).length;
                const blockedCount = getAppState().syncQueue.filter(i => i.status === 'failed' && i.noRetry).length;
                const pendingCount = getAppState().syncQueue.filter(i => i.status === 'pending' || (i.status === 'failed' && !i.noRetry)).length;

                if (successCount > 0) {
                    showToast(`? Sync complete! ${successCount} item(s) uploaded. ${pendingCount} pending.`, 'success');
                } else if (failedCount > 0) {
                    showToast(`Sync finished with ${failedCount} error(s). Retrying in 30s...`, 'warning');
                    // Auto-retry failed items after 30 seconds
                    setTimeout(() => {
                        if (navigator.onLine) processSyncQueue();
                    }, 30000);
                } else if (blockedCount > 0) {
                    showToast(`Sync paused: ${blockedCount} item(s) need Drive permission fix in Apps Script settings.`, 'warning');
                } else if (pendingCount > 0) {
                    console.log(`[HighTechSync] [INFO] ${pendingCount} items still pending. Setting up auto-retry...`);
                    setTimeout(() => {
                        if (navigator.onLine && !_isSyncProcessing) processSyncQueue();
                    }, 5000);
                }

                renderSyncStatus();
            }