// src/services/db.js

const OFFLINE_ACTIONS = [
    'addTrial', 'createTrialRecord', 'updateTrialRecord', 'updateTrialStatus',
    'addFormulation', 'addIngredient', 'finalizeTrial', 'addBatchTrials',
    'updateProject', 'addBlock'
];

export async function apiCall(action, payload = {}, showOverlay = true, getAppState) {
    const state = getAppState ? getAppState() : null;

    if (!state || !state.settings || !state.settings.scriptUrl) {
        console.warn('API call attempted without proper state/settings configured:', action);
        return { _errType: 'config', message: 'Application settings not configured.' };
    }

    const queueItem = (errType, msg) => {
        if (OFFLINE_ACTIONS.includes(action)) {
            const queuedAction = {
                id: Date.now().toString(),
                action: action,
                payload: payload,
                timestamp: new Date().toISOString(),
                status: 'pending',
                attempts: 0
            };
            return { success: true, offline: true, _queuedAction: queuedAction, ...payload };
        }
        return { _errType: errType, message: msg };
    };

    const isOnline = getAppState().isOnline !== false;
    if (!isOnline) {
        return queueItem('network', 'Offline');
    }

    const getEffectiveFolderId = () => {
        if (state.auth) {
            if (state.auth.user && state.auth.user.personalDriveFolderId) {
                return state.auth.user.personalDriveFolderId;
            }
            if (state.auth.personalDriveFolderId) {
                return state.auth.personalDriveFolderId;
            }
        }
        return state.settings.folderId;
    };

    const getAuthPayload = () => {
        if (!state.auth) return undefined;
        const authObject = state.auth.user ? { ...state.auth.user, token: state.auth.token } : { ...state.auth };
        if (authObject.token && authObject.Token === undefined) {
            authObject.Token = authObject.token;
        }
        if (authObject.Token && authObject.token === undefined) {
            authObject.token = authObject.Token;
        }
        if (state.auth.username) authObject.username = state.auth.username;
        if (state.auth.password) authObject.password = state.auth.password;
        return authObject;
    };

    const unwrapResponse = (payload) => {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return payload;
        if (payload.data !== undefined && payload.data !== payload) return unwrapResponse(payload.data);
        if (payload.response !== undefined && payload.response !== payload) return unwrapResponse(payload.response);
        if (payload.payload !== undefined && payload.payload !== payload) return unwrapResponse(payload.payload);
        return payload;
    };

    const buildQueueError = (errType, msg) => ({ _errType: errType, message: msg });

    const processRawResult = (rawResult) => {
        const errorMsg = rawResult?.message || (rawResult?.data && rawResult.data.message) || (rawResult?.response && rawResult.response.message);
        const isError = rawResult?.status === 'error'
            || (rawResult?.data && rawResult.data.status === 'error')
            || (rawResult?.response && rawResult.response.status === 'error')
            || rawResult?.success === false
            || (rawResult?.data && rawResult.data.success === false)
            || (rawResult?.response && rawResult.response.success === false);

        if (isError) return buildQueueError('server', errorMsg || 'Unknown server error');
        return unwrapResponse(rawResult);
    };

    if (window.google && window.google.script && typeof window.google.script.run === 'object') {
        return new Promise((resolve) => {
            if (showOverlay) if(getAppState().platformAdapter?.showLoading) getAppState().platformAdapter.showLoading(true);
            try {
                const fullPayload = {
                    ...payload,
                    spreadsheetId: state.settings.sheetId,
                    folderId: getEffectiveFolderId(),
                    auth: getAuthPayload()
                };
                window.google.script.run
                    .withSuccessHandler((response) => resolve(processRawResult(response)))
                    .withFailureHandler((error) => resolve(buildQueueError('server', error?.message || String(error))))
                    .handleRequest({ action, payload: fullPayload });
            } catch (err) {
                resolve(buildQueueError('client', err?.message || String(err)));
            } finally {
                if (showOverlay) if(getAppState().platformAdapter?.showLoading) getAppState().platformAdapter.showLoading(false);
            }
        });
    }

    if (showOverlay) if(getAppState().platformAdapter?.showLoading) getAppState().platformAdapter.showLoading(true);

    try {
        const fullPayload = {
            ...payload,
            spreadsheetId: state.settings.sheetId,
            folderId: getEffectiveFolderId(),
        };
        const res = await fetch(String(state.settings.scriptUrl).replace(/\s/g, ''), {
            method: 'POST',
            body: JSON.stringify({ action, payload: fullPayload, auth: getAuthPayload() }),
        });

        if (!res.ok) return buildQueueError('network', `HTTP ${res.status}: ${res.statusText}`);

        const text = await res.text();
        let rawResult;
        try { rawResult = JSON.parse(text); } catch (e) { return buildQueueError('parse', 'Invalid JSON from server'); }

        return processRawResult(rawResult);
    } catch (error) {
        return buildQueueError('fetch', error.message);
    } finally {
        if (showOverlay) if(getAppState().platformAdapter?.showLoading) getAppState().platformAdapter.showLoading(false);
    }
}

function findFirstArray(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return null;

    for (const nested of Object.values(value)) {
        const array = findFirstArray(nested);
        if (array) return array;
    }
    return null;
}

function findObjectValues(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const values = Object.values(value);
    if (!values.length) return null;
    const allObjects = values.every(v => v && typeof v === 'object' && !Array.isArray(v));
    if (allObjects) return values;
    const nested = values.map(findObjectValues).find(Boolean);
    return nested || null;
}

function normalizeArrayResponse(response, key) {
    if (Array.isArray(response)) return response;
    if (!response || typeof response !== 'object') return [];
    if (Array.isArray(response[key])) return response[key];
    if (Array.isArray(response.data)) return response.data;
    if (response.data && Array.isArray(response.data[key])) return response.data[key];
    if (response.data && response.data.response) {
        const nested = normalizeArrayResponse(response.data.response, key);
        if (Array.isArray(nested)) return nested;
    }
    if (response.data && response.data.payload) {
        const nested = normalizeArrayResponse(response.data.payload, key);
        if (Array.isArray(nested)) return nested;
    }
    if (Array.isArray(response.result)) return response.result;
    if (response.result && Array.isArray(response.result[key])) return response.result[key];
    if (response.result && response.result.response) {
        const nested = normalizeArrayResponse(response.result.response, key);
        if (Array.isArray(nested)) return nested;
    }
    if (response.result && response.result.payload) {
        const nested = normalizeArrayResponse(response.result.payload, key);
        if (Array.isArray(nested)) return nested;
    }
    if (response.payload && Array.isArray(response.payload)) return response.payload;
    if (response.payload && Array.isArray(response.payload[key])) return response.payload[key];
    if (response.payload && response.payload.response) {
        const nested = normalizeArrayResponse(response.payload.response, key);
        if (Array.isArray(nested)) return nested;
    }
    if (response.payload && response.payload.data) {
        const nested = normalizeArrayResponse(response.payload.data, key);
        if (Array.isArray(nested)) return nested;
    }
    if (response.response && Array.isArray(response.response[key])) return response.response[key];
    if (response.response) {
        const nested = normalizeArrayResponse(response.response, key);
        if (Array.isArray(nested)) return nested;
    }

    const keys = Object.keys(response);
    if (keys.length === 1 && Array.isArray(response[keys[0]])) return response[keys[0]];

    const foundArray = findFirstArray(response);
    if (Array.isArray(foundArray)) return foundArray;

    const foundObjectValues = findObjectValues(response[key]) || findObjectValues(response.data) || findObjectValues(response.result) || findObjectValues(response.payload) || findObjectValues(response);
    if (Array.isArray(foundObjectValues)) return foundObjectValues;

    if (response._errType || response.message || response.error) {
        console.warn('Received non-array API response for list fetch:', { key, response });
    } else {
        console.warn('Unable to normalize API response to array:', { key, response });
    }
    return [];
}

export const getAllData = (payload, getAppState) => apiCall('getAllData', payload, true, getAppState);
export const getTrials = (payload, getAppState) => apiCall('getTrials', payload, true, getAppState).then(res => normalizeArrayResponse(res, 'trials'));
export const addTrial = (payload, getAppState) => apiCall('addTrial', payload, true, getAppState);
export const updateTrial = (payload, getAppState) => apiCall('updateTrialRecord', payload, true, getAppState);
export const deleteTrial = (payload, getAppState) => apiCall('deleteTrialRecord', payload, true, getAppState);
export const getProjects = (payload, getAppState) => apiCall('getProjects', payload, true, getAppState).then(res => normalizeArrayResponse(res, 'projects'));
export const addProject = (payload, getAppState) => apiCall('addProject', payload, true, getAppState);
export const updateProject = (payload, getAppState) => apiCall('updateProject', payload, true, getAppState);
export const addBlock = (payload, getAppState) => apiCall('addBlock', payload, true, getAppState);
export const addFormulation = (payload, getAppState) => apiCall('addFormulation', payload, true, getAppState);
export const addIngredient = (payload, getAppState) => apiCall('addIngredient', payload, true, getAppState);
export const finalizeTrial = (payload, getAppState) => apiCall('finalizeTrial', payload, true, getAppState);
export const addBatchTrials = (payload, getAppState) => apiCall('addBatchTrials', payload, true, getAppState);
export const updateTrialStatus = (payload, getAppState) => apiCall('updateTrialStatus', payload, true, getAppState);
export const upsertEmbedding = (payload, getAppState) => apiCall('upsertEmbedding', payload, true, getAppState);
export const loadSmartIndex = (payload, getAppState) => apiCall('loadSmartIndex', payload, true, getAppState);
export const clearSmartEmbeddings = (payload, getAppState) => apiCall('clearSmartEmbeddings', payload, true, getAppState);

export const getFormulations = (payload, getAppState) => apiCall('getFormulations', payload, true, getAppState).then(res => normalizeArrayResponse(res, 'formulations'));
export const deleteFormulation = (payload, getAppState) => apiCall('deleteFormulation', payload, true, getAppState);
export const getIngredients = (payload, getAppState) => apiCall('getIngredients', payload, true, getAppState).then(res => normalizeArrayResponse(res, 'ingredients'));
export const deleteIngredient = (payload, getAppState) => apiCall('deleteIngredient', payload, true, getAppState);
export const getOrganisations = (payload, getAppState) => apiCall('getOrganisations', payload, true, getAppState).then(res => normalizeArrayResponse(res, 'organisations'));
export const addOrganisation = (payload, getAppState) => apiCall('addOrganisation', payload, true, getAppState);
export const deleteOrganisation = (payload, getAppState) => apiCall('deleteOrganisation', payload, true, getAppState);
export const deleteProject = (payload, getAppState) => apiCall('deleteProject', payload, true, getAppState);

export const loginUser = (payload, getAppState) => apiCall('login', payload, true, getAppState);
export const getUsers = (payload, getAppState) => apiCall('getUsersList', payload, true, getAppState);
export const updateUser = (payload, getAppState) => apiCall('adminUpdateUserConfig', payload, true, getAppState);
