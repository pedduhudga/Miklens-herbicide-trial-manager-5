import React, { useState, useRef } from "react";
import TopBar from "../components/TopBar.jsx";
import { useAppState } from "../hooks/useAppState.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { initFirebase, isFirebaseReady } from "../services/firebase.js";
import { fbSaveUserSettings } from "../services/firebaseDB.js";
import { apiCall } from "../services/dataLayer.js";
import {
  Link,
  Key,
  CloudLightning,
  Trash2,
  CheckCircle,
  Plus,
  LogOut,
  Cpu,
  Info,
  Image,
  QrCode,
  Wrench,
  Save,
  LayoutGrid,
  Search,
  Flame,
  Database,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
} from "lucide-react";

const QR_FIELDS = [
  "FormulationName",
  "Dosage",
  "WeedSpecies",
  "Location",
  "Date",
  "Result",
  "InvestigatorName",
  "Replication",
  "Notes",
  "Temperature",
  "Humidity",
];
const ONLINE_QR_FIELDS = [
  { key: "showInvestigator", label: "Investigator" },
  { key: "showDate", label: "Date" },
  { key: "showLocation", label: "Location" },
  { key: "showDosage", label: "Dosage" },
  { key: "showWeedSpecies", label: "Weed Species" },
  { key: "showResult", label: "Result" },
  { key: "showWeather", label: "Weather" },
  { key: "showIngredients", label: "Ingredients" },
  { key: "showConclusion", label: "Conclusion & Notes" },
  { key: "showPhotos", label: "Photos" },
];
const DEFAULT_ONLINE_QR_SETTINGS = {
  showInvestigator: true,
  showDate: true,
  showLocation: true,
  showDosage: true,
  showWeedSpecies: true,
  showResult: true,
  showWeather: true,
  showIngredients: false,
  showConclusion: true,
  showPhotos: true,
};

export default function Settings({ onMenuClick }) {
  const { state, updateSettings, updateState } = useAppState();
  const { logout, user } = useAuth();
  const [newKey, setNewKey] = useState("");
  const [testingKey, setTestingKey] = useState(null);
  const [keyTestResult, setKeyTestResult] = useState({});
  const logoInputRef = useRef(null);

  // Multi-provider AI keys from localStorage
  const [aiKeys, setAiKeys] = useState({
    gemini: localStorage.getItem("AI_KEY_GEMINI") || "",
    groq: localStorage.getItem("AI_KEY_GROQ") || "",
    pixtral: localStorage.getItem("AI_KEY_PIXTRAL") || "",
  });

  const saveAiKey = (provider, key) => {
    const newKeys = { ...aiKeys, [provider]: key };
    setAiKeys(newKeys);
    localStorage.setItem(`AI_KEY_${provider.toUpperCase()}`, key);
    toast(
      `${provider.charAt(0).toUpperCase() + provider.slice(1)} API key saved`,
    );
  };

  const toast = (msg, type = "success") =>
    window.dispatchEvent(
      new CustomEvent("app:toast", { detail: { msg, type } }),
    );

  const s = state.settings || {};
  const isAdminUser =
    String(user?.Role || user?.role || "").toLowerCase() === "admin";

  // ── API Keys ──────────────────────────────────────────────────────────────
  const handleAddKey = () => {
    if (!newKey.trim()) return;
    updateSettings({ apiKeys: [...(s.apiKeys || []), newKey.trim()] });
    setNewKey("");
    toast("API Key Added");
  };

  const handleRemoveKey = (index) => {
    const updatedKeys = [...(s.apiKeys || [])];
    updatedKeys.splice(index, 1);
    let newIndex = s.currentApiKeyIndex || 0;
    if (newIndex >= updatedKeys.length)
      newIndex = Math.max(0, updatedKeys.length - 1);
    updateSettings({ apiKeys: updatedKeys, currentApiKeyIndex: newIndex });
    setKeyTestResult((prev) => {
      const n = { ...prev };
      delete n[index];
      return n;
    });
    toast("API Key Removed");
  };

  const handleTestKey = async (key, index) => {
    const rawKey = typeof key === "object" ? key.key : key;
    setTestingKey(index);
    setKeyTestResult((prev) => ({ ...prev, [index]: null }));
    try {
      const model = s.selectedModel || "gemini-2.5-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${rawKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "OK" in one word.' }] }],
          }),
        },
      );
      if (res.ok) {
        setKeyTestResult((prev) => ({ ...prev, [index]: "ok" }));
        toast("API Key is valid ✓");
      } else {
        const err = await res.json().catch(() => ({}));
        setKeyTestResult((prev) => ({ ...prev, [index]: "fail" }));
        toast(err?.error?.message || "Key invalid or quota exceeded", "error");
      }
    } catch {
      setKeyTestResult((prev) => ({ ...prev, [index]: "fail" }));
      toast("Network error testing key", "error");
    } finally {
      setTestingKey(null);
    }
  };

  const handleTestAllKeys = async () => {
    const keys = s.apiKeys || [];
    if (!keys.length) {
      toast("No keys to test", "info");
      return;
    }
    for (let i = 0; i < keys.length; i++) await handleTestKey(keys[i], i);
  };

  // ── Logo ──────────────────────────────────────────────────────────────────
  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => updateSettings({ logoBase64: ev.target.result });
    reader.readAsDataURL(file);
  };

  // ── Weather provider conditional ─────────────────────────────────────────
  const weatherProvider = s.weatherProvider || "open-meteo";

  // ── QR field toggles ─────────────────────────────────────────────────────
  const parseArr = (val, def) =>
    Array.isArray(val)
      ? val
      : typeof val === "string"
        ? (() => {
            try {
              const p = JSON.parse(val);
              return Array.isArray(p) ? p : def;
            } catch {
              return def;
            }
          })()
        : def;
  const parseOnlineQrSettings = (val) => {
    if (Array.isArray(val)) {
      return {
        ...DEFAULT_ONLINE_QR_SETTINGS,
        showInvestigator: val.includes("InvestigatorName"),
        showDate: val.includes("Date"),
        showLocation: val.includes("Location"),
        showDosage: val.includes("Dosage"),
        showWeedSpecies: val.includes("WeedSpecies"),
        showResult: val.includes("Result"),
        showWeather:
          val.includes("Temperature") ||
          val.includes("Humidity") ||
          val.includes("Weather"),
        showConclusion: val.includes("Notes") || val.includes("Conclusion"),
        showPhotos: val.includes("Photos"),
      };
    }
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parseOnlineQrSettings(parsed);
        if (parsed && typeof parsed === "object")
          return { ...DEFAULT_ONLINE_QR_SETTINGS, ...parsed };
      } catch {
        return { ...DEFAULT_ONLINE_QR_SETTINGS };
      }
    }
    if (val && typeof val === "object")
      return { ...DEFAULT_ONLINE_QR_SETTINGS, ...val };
    return { ...DEFAULT_ONLINE_QR_SETTINGS };
  };
  const qrOfflineFields = parseArr(s.qrOfflineFields, [
    "FormulationName",
    "Dosage",
    "WeedSpecies",
    "Date",
  ]);
  const qrOnlineFields = parseOnlineQrSettings(s.qrOnlineFields);

  const toggleQrField = (mode, field) => {
    if (mode === "offline") {
      const updated = qrOfflineFields.includes(field)
        ? qrOfflineFields.filter((f) => f !== field)
        : [...qrOfflineFields, field];
      updateSettings({ qrOfflineFields: updated });
      return;
    }
    updateSettings({
      qrOnlineFields: { ...qrOnlineFields, [field]: !qrOnlineFields[field] },
    });
  };

  // ── Save / Logout ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    const settingsToPersist = {
      ...s,
      qrOnlineFields,
    };

    try {
      // Firebase mode should never call the legacy Apps Script settings endpoint.
      // That endpoint expects a Google Sheets session user (auth.ID) and will reject
      // Firebase-only users with "Invalid session user".
      if (s.firebaseEnabled) {
        try {
          if (
            !isFirebaseReady() &&
            s.firebaseConfig?.apiKey &&
            s.firebaseConfig?.projectId
          ) {
            initFirebase(s.firebaseConfig);
          }

          const uid = state.auth?.uid || user?.uid;
          if (uid && isFirebaseReady()) {
            await fbSaveUserSettings(uid, settingsToPersist);
          }
        } catch (firebaseErr) {
          console.warn("Firebase settings sync failed:", firebaseErr);
        }

        toast("Settings saved");
        return;
      }

      // Legacy Google Sheets mode: mirror the old HTML app behavior.
      // - Admins can save all global settings.
      // - Non-admin users only sync their personal config.
      if (isAdminUser) {
        const result = await apiCall(
          "saveAllSettings",
          { settings: settingsToPersist },
          false,
          () => state,
        );
        if (result?._errType) {
          toast(
            `Local settings saved, but script sync failed: ${result.message}`,
            "warning",
          );
        } else {
          toast("Settings saved");
        }
        return;
      }

      const apiKeys = Array.isArray(s.apiKeys)
        ? s.apiKeys
            .map((key) => (typeof key === "object" ? key.key : key))
            .filter(Boolean)
        : [];

      const userConfig = await apiCall(
        "updateMyUserConfig",
        {
          DriveFolderId: s.folderId || "",
          ApiKeysJSON: JSON.stringify(apiKeys),
        },
        false,
        () => state,
      );

      if (userConfig?._errType) {
        toast(
          `Local settings saved, but user sync failed: ${userConfig.message}`,
          "warning",
        );
        return;
      }

      if (userConfig && state.auth) {
        updateState({
          auth: {
            ...state.auth,
            user: {
              ...state.auth.user,
              ...userConfig,
            },
          },
        });
      }

      toast("Settings saved");
    } catch (err) {
      toast(`Local settings saved, but sync failed: ${err.message}`, "warning");
    }
  };
  const handleLogout = () => {
    if (window.confirm("Log out of this account?")) logout();
  };
  const handleClearCacheReload = () => {
    if (!window.confirm("Clear all cached data and reload the app?")) return;
    if ("caches" in window)
      caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
    window.location.reload(true);
  };

  // ── Firebase ────────────────────────────────────────────────────────────────
  const [fbTestResult, setFbTestResult] = useState(null);
  const [fbTesting, setFbTesting] = useState(false);

  const fbCfg = s.firebaseConfig || {};
  const updateFbConfig = (key, val) => {
    updateSettings({ firebaseConfig: { ...fbCfg, [key]: val } });
  };

  const handleTestFirebase = async () => {
    setFbTesting(true);
    setFbTestResult(null);
    try {
      initFirebase(s.firebaseConfig || {});
      // Simple connectivity check: try to access Firestore
      const { getFirebaseDB } = await import("../services/firebase.js");
      getFirebaseDB();
      setFbTestResult({ ok: true, msg: "Firebase connected successfully!" });
      toast("Firebase connected ✓");
    } catch (err) {
      setFbTestResult({ ok: false, msg: err.message });
      toast("Firebase connection failed: " + err.message, "error");
    } finally {
      setFbTesting(false);
    }
  };

  const handleEnableFirebase = (enabled) => {
    updateSettings({ firebaseEnabled: enabled });
    if (enabled && s.firebaseConfig?.apiKey && s.firebaseConfig?.projectId) {
      try {
        initFirebase(s.firebaseConfig);
        toast("Firebase activated");
      } catch (err) {
        toast("Firebase init error: " + err.message, "error");
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Settings" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full space-y-6">
        {/* ── AI Integration ── */}
        <div className="bg-white p-6 rounded-lg shadow space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-700 mb-1">
              AI Integration (Gemini)
            </h2>
            <p className="text-sm text-gray-600">
              Add one or more Google Gemini API keys. The app will automatically
              rotate to the next key if one exceeds its free quota.
            </p>
          </div>

          {/* Model + Weather Provider */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2 flex items-center gap-1">
                <Cpu className="w-4 h-4 text-indigo-500" /> Gemini API Model
              </label>
              <select
                value={s.selectedModel || "gemini-3.5-flash"}
                onChange={(e) =>
                  updateSettings({ selectedModel: e.target.value })
                }
                className="w-full border rounded-md shadow-sm p-2 bg-white text-sm"
              >
                <optgroup label="Gemini 3.x — Newest (Recommended)">
                  <option value="gemini-3.1-flash-lite">
                    Gemini 3.1 Flash-Lite ⚡ Fastest, 1500 RPD
                  </option>
                  <option value="gemini-3.5-flash">
                    Gemini 3.5 Flash 🌟 Best overall, ~500 RPD
                  </option>
                  <option value="gemini-3-flash-preview">
                    Gemini 3 Flash Preview 🔵 ~100 RPD
                  </option>
                  <option value="gemini-3.1-pro-preview">
                    Gemini 3.1 Pro Preview 🧠 Deepest reasoning, 25 RPD
                  </option>
                </optgroup>
                <optgroup label="Gemini 2.5 — Stable Fallback">
                  <option value="gemini-2.5-flash-lite">
                    Gemini 2.5 Flash-Lite ⚡ 1500 RPD
                  </option>
                  <option value="gemini-2.5-flash">
                    Gemini 2.5 Flash ✅ 250 RPD
                  </option>
                  <option value="gemini-2.5-pro">
                    Gemini 2.5 Pro 🔬 25 RPD
                  </option>
                </optgroup>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Recommended: <b>Gemini 3.5 Flash</b> (best) or{" "}
                <b>3.1 Flash-Lite</b> (fastest/most quota).
              </p>
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2 flex items-center gap-1">
                <CloudLightning className="w-4 h-4 text-blue-500" /> Weather
                &amp; Soil Provider
              </label>
              <select
                value={weatherProvider}
                onChange={(e) =>
                  updateSettings({ weatherProvider: e.target.value })
                }
                className="w-full border rounded-md shadow-sm p-2 bg-white text-sm"
              >
                <option value="open-meteo">Open-Meteo (Default, No Key)</option>
                <option value="tomorrow-io">
                  Tomorrow.io (Reliable, Key Required)
                </option>
                <option value="visual-crossing">
                  Visual Crossing (Fallback, Key Required)
                </option>
              </select>
            </div>
          </div>

          {/* Tomorrow.io key */}
          {weatherProvider === "tomorrow-io" && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <label className="block text-blue-800 text-sm font-bold mb-2">
                Tomorrow.io API Key
              </label>
              <input
                type="password"
                value={s.tomorrowIoKey || ""}
                onChange={(e) =>
                  updateSettings({ tomorrowIoKey: e.target.value })
                }
                placeholder="Enter Tomorrow.io key"
                className="w-full border border-blue-300 rounded-md shadow-sm p-2 bg-white text-sm"
              />
              <p className="text-xs text-blue-600 mt-1">
                Required for higher accuracy weather &amp; soil moisture.
              </p>
            </div>
          )}

          {/* Visual Crossing key */}
          {weatherProvider === "visual-crossing" && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <label className="block text-slate-800 text-sm font-bold mb-2">
                Visual Crossing API Key
              </label>
              <input
                type="password"
                value={s.openWeatherMapKey || ""}
                onChange={(e) =>
                  updateSettings({ openWeatherMapKey: e.target.value })
                }
                placeholder="Enter Visual Crossing key"
                className="w-full border border-slate-300 rounded-md shadow-sm p-2 bg-white text-sm"
              />
            </div>
          )}

          {/* API Keys list */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-gray-700 text-sm font-bold flex items-center gap-1">
                <Key className="w-4 h-4 text-purple-500" /> API Keys
              </label>
              <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                Active: #{s.currentApiKeyIndex || 0}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Multiple keys rotate automatically on quota limits.
            </p>
            <div className="space-y-2 mb-3">
              {(s.apiKeys || []).length === 0 && (
                <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                  No API keys configured. AI features will be disabled.
                </p>
              )}
              {(s.apiKeys || []).map((key, index) => {
                const rawKey = typeof key === "object" ? key.key : key;
                const result = keyTestResult[index];
                return (
                  <div key={index} className="flex gap-2 items-center">
                    <div className="flex-1 relative">
                      <input
                        type="password"
                        value={rawKey}
                        readOnly
                        className="w-full px-3 py-2 text-sm border bg-slate-50 text-slate-500 rounded-lg outline-none pr-8"
                      />
                      {result === "ok" && (
                        <CheckCircle className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                      )}
                      {result === "fail" && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500 text-xs font-bold">
                          ✗
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleTestKey(key, index)}
                      disabled={testingKey === index}
                      className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition disabled:opacity-50 whitespace-nowrap"
                    >
                      {testingKey === index ? "…" : "Test"}
                    </button>
                    <button
                      onClick={() => handleRemoveKey(index)}
                      className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddKey()}
                placeholder="Paste new Gemini API key…"
                className="flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-purple-400"
              />
              <button
                onClick={handleAddKey}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleTestAllKeys}
                className="text-sm bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-md hover:bg-indigo-200 font-semibold"
              >
                Test All Keys
              </button>
            </div>
          </div>

          {/* API Quota Saver */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="text-sm font-semibold text-amber-800 mb-2">
              API Quota Saver
            </h4>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!s.autoAnalyzePhotos}
                onChange={(e) =>
                  updateSettings({ autoAnalyzePhotos: e.target.checked })
                }
                className="h-5 w-5 rounded border-gray-300 text-emerald-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-800">
                  Auto-Analyze Photos for Efficacy
                </span>
                <p className="text-xs text-gray-500">
                  When enabled, each photo upload uses 1 API call. Disable to
                  save quota.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* ── Multi-Provider AI Keys ── */}
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-700 mb-1">
              AI Photo Analysis Keys
            </h2>
            <p className="text-sm text-gray-600">
              Add API keys for multi-provider AI weed analysis. The app
              auto-rotates providers if one fails.
            </p>
          </div>

          {/* Groq API Key */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              Groq API Key (Llama 3.2 Vision)
              <span className="text-xs text-gray-500">
                · 1000 calls/day free
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={aiKeys.groq}
                onChange={(e) => saveAiKey("groq", e.target.value)}
                placeholder="gsk_..."
                className="flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Get free key at{" "}
              <a
                href="https://console.groq.com"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                console.groq.com
              </a>
            </p>
          </div>

          {/* Gemini API Key */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Gemini API Key (Flash/Pro)
              <span className="text-xs text-gray-500">
                · 1000 calls/day free
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={aiKeys.gemini}
                onChange={(e) => saveAiKey("gemini", e.target.value)}
                placeholder="AIza..."
                className="flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Get free key at{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                aistudio.google.com
              </a>
            </p>
          </div>

          {/* Pixtral API Key */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              Pixtral/Mistral API Key
              <span className="text-xs text-gray-500">
                · 10000 calls/day free tier
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={aiKeys.pixtral}
                onChange={(e) => saveAiKey("pixtral", e.target.value)}
                placeholder="..."
                className="flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Get key at{" "}
              <a
                href="https://console.mistral.ai"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                console.mistral.ai
              </a>
            </p>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Priority Order:</strong> Groq → Gemini Flash → Gemini Pro
              → Pixtral. The app automatically rotates to the next provider if
              one fails or hits quota.
            </p>
          </div>
        </div>

        {/* ── Precision Agriculture ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-1">
            Precision Agriculture
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Enhanced features for climate auditing and spatial mapping.
          </p>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            OpenWeather API Key
          </label>
          <input
            type="password"
            value={s.openWeatherApiKey || ""}
            onChange={(e) =>
              updateSettings({ openWeatherApiKey: e.target.value })
            }
            placeholder="Enter your OpenWeather API Key"
            className="w-full border rounded-md shadow-sm p-2 text-sm form-input"
          />
          <p className="text-xs text-gray-500 mt-1">
            Required for <b>Autonomous Weather Audit</b>. Get a free key at{" "}
            <a
              href="https://openweathermap.org/api"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              openweathermap.org
            </a>
          </p>
        </div>

        {/* ── Report Customization ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-1 flex items-center gap-2">
            <Image className="w-5 h-5 text-gray-500" /> Report Customization
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Configure how your trial cards and reports look.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo
              </label>
              <div className="flex items-center gap-4">
                {s.logoBase64 && (
                  <img
                    src={s.logoBase64}
                    alt="Logo"
                    className="h-12 w-auto object-contain border p-1 rounded"
                  />
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="text-sm px-3 py-1.5 bg-slate-100 border rounded-lg hover:bg-slate-200 font-medium"
                >
                  Choose Logo
                </button>
                {s.logoBase64 && (
                  <button
                    onClick={() => updateSettings({ logoBase64: "" })}
                    className="text-red-500 text-sm font-medium hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Card Print Size
              </label>
              <select
                value={s.cardSize || "A6"}
                onChange={(e) => updateSettings({ cardSize: e.target.value })}
                className="w-full border rounded-md shadow-sm p-2 bg-white text-sm"
              >
                <option value="ID">ID Card (Compact)</option>
                <option value="A6">A6 (4 per page)</option>
                <option value="A4">A4 (2 per page)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Firebase Configuration ── */}
        <div className="bg-white p-6 rounded-lg shadow space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" /> Firebase (Primary
                Database)
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Use Firestore as the main database. Google Sheets becomes a
                backup mirror.
              </p>
            </div>
            <button
              onClick={() => handleEnableFirebase(!s.firebaseEnabled)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition ${
                s.firebaseEnabled
                  ? "bg-orange-100 text-orange-700 border border-orange-200"
                  : "bg-gray-100 text-gray-600 border border-gray-200"
              }`}
            >
              {s.firebaseEnabled ? (
                <ToggleRight className="w-5 h-5" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
              {s.firebaseEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          {s.firebaseEnabled && (
            <div
              className="p-3 rounded-lg flex items-center gap-2 text-sm font-medium "
              style={{
                background: isFirebaseReady() ? "#f0fdf4" : "#fef9c3",
                border: isFirebaseReady()
                  ? "1px solid #86efac"
                  : "1px solid #fde047",
              }}
            >
              {isFirebaseReady() ? (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-700">
                    Firebase is initialized and ready.
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  <span className="text-yellow-700">
                    Firebase not yet initialized — save config and reload.
                  </span>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { label: "API Key", key: "apiKey", placeholder: "AIza..." },
              {
                label: "Auth Domain",
                key: "authDomain",
                placeholder: "your-app.firebaseapp.com",
              },
              {
                label: "Project ID",
                key: "projectId",
                placeholder: "your-firebase-project-id",
              },
              {
                label: "Storage Bucket",
                key: "storageBucket",
                placeholder: "your-app.appspot.com",
              },
              {
                label: "Messaging Sender ID",
                key: "messagingSenderId",
                placeholder: "1234567890",
              },
              {
                label: "App ID",
                key: "appId",
                placeholder: "1:123:web:abc...",
              },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  {label}
                </label>
                <input
                  type={key === "apiKey" ? "password" : "text"}
                  value={fbCfg[key] || ""}
                  onChange={(e) => updateFbConfig(key, e.target.value)}
                  placeholder={placeholder}
                  className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-orange-300"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleTestFirebase}
              disabled={fbTesting || !fbCfg.apiKey}
              className="px-4 py-2 bg-orange-600 text-white text-sm font-bold rounded-lg hover:bg-orange-700 disabled:opacity-40 transition flex items-center gap-2"
            >
              {fbTesting ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
              ) : (
                <Database className="w-4 h-4" />
              )}
              {fbTesting ? "Testing…" : "Test Firebase Connection"}
            </button>
            {fbTestResult && (
              <span
                className={`text-sm font-medium ${fbTestResult.ok ? "text-emerald-600" : "text-red-600"}`}
              >
                {fbTestResult.ok ? "✓" : "✗"} {fbTestResult.msg}
              </span>
            )}
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-700">
              How to get your Firebase config:
            </p>
            <p>
              1. Go to <strong>console.firebase.google.com</strong> → Your
              project → Project settings
            </p>
            <p>2. Under "Your apps" click "Web app" (or add one)</p>
            <p>
              3. Copy the <code>firebaseConfig</code> object values into the
              fields above
            </p>
            <p>
              4. In Firebase Console: enable <strong>Firestore Database</strong>{" "}
              and <strong>Authentication → Email/Password</strong>
            </p>
          </div>
        </div>

        {/* ── Sheet Mirror (Plan B) ── */}
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-2">
            <Database className="w-5 h-5 text-slate-500" /> Google Sheet Mirror
            (Plan B)
          </h2>
          <p className="text-sm text-gray-600">
            When enabled, every write to Firebase is <em>also</em> silently
            queued and sent to Google Sheets in the background. Reads{" "}
            <strong>never</strong> come from Sheets (Admin-only migration tool
            excepted).
          </p>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button
              onClick={() =>
                updateSettings({ sheetMirrorEnabled: !s.sheetMirrorEnabled })
              }
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition ${
                s.sheetMirrorEnabled
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  : "bg-gray-100 text-gray-600 border border-gray-200"
              }`}
            >
              {s.sheetMirrorEnabled ? (
                <ToggleRight className="w-5 h-5" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
              {s.sheetMirrorEnabled ? "Sheet Mirror ON" : "Sheet Mirror OFF"}
            </button>
            <span className="text-sm text-gray-600">
              {s.sheetMirrorEnabled
                ? "All writes are being mirrored to Google Sheets."
                : "Writes go to Firebase only."}
            </span>
          </label>
        </div>

        {/* ── Data Source Settings ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-1 flex items-center gap-2">
            <Link className="w-5 h-5 text-gray-500" /> Data Source Settings
            (Google Sheets)
          </h2>
          <p className="text-sm text-gray-600 mb-2">
            The Apps Script URL is{" "}
            <strong>required for photo uploads to Google Drive</strong> — this
            applies in both Firebase and Sheet modes. The Sheet ID is only
            needed when using Sheet mirror/backup.
          </p>
          {!s.scriptUrl && (
            <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Script URL missing</strong> — photos cannot be uploaded
                to Google Drive until this is set.
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                label: "Script URL",
                key: "scriptUrl",
                placeholder: "https://script.google.com/macros/s/...",
              },
              {
                label: "Google Sheet URL",
                key: "sheetId",
                placeholder: "https://docs.google.com/spreadsheets/d/...",
              },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {label}
                </label>
                <input
                  type="text"
                  value={s[key] || ""}
                  onChange={(e) => updateSettings({ [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full border rounded-md shadow-sm p-2 text-sm"
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Drive Photo Folder URL
              </label>
              <input
                type="text"
                value={s.folderId || ""}
                onChange={(e) => updateSettings({ folderId: e.target.value })}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full border rounded-md shadow-sm p-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-emerald-800">
                  Drive Cleanup Utility
                </h4>
                <p className="text-xs text-emerald-700 mt-1">
                  Automatically organize all existing trial photos into "Project
                  &gt; Trial" subfolders.
                </p>
              </div>
              <button
                onClick={() =>
                  toast("Requires Google Apps Script environment", "info")
                }
                className="whitespace-nowrap bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium text-sm flex items-center gap-2"
              >
                <LayoutGrid className="w-4 h-4" /> Organize Drive Photos
              </button>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-800">
                  Photo Consistency Check
                </h4>
                <p className="text-xs text-slate-700 mt-1">
                  Scan Drive and trials to find photos not linked to any Trial
                  record.
                </p>
              </div>
              <button
                onClick={() =>
                  toast("Requires Google Apps Script environment", "info")
                }
                className="whitespace-nowrap bg-slate-700 text-white px-4 py-2 rounded-lg hover:bg-slate-800 font-medium text-sm flex items-center gap-2"
              >
                <Search className="w-4 h-4" /> Scan Photos
              </button>
            </div>
          </div>
        </div>

        {/* ── QR Code Content — Offline ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-1 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-gray-500" /> QR Code Content
            (Offline Mode)
          </h2>
          <p className="text-sm text-amber-700 bg-amber-50 p-2 rounded-md mb-4">
            <strong>Warning:</strong> For stability, please select only
            essential fields (4–5) for offline QR codes.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {QR_FIELDS.map((f) => (
              <label key={f} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={qrOfflineFields.includes(f)}
                  onChange={() => toggleQrField("offline", f)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                />
                {f}
              </label>
            ))}
          </div>
        </div>

        {/* ── QR Code Content — Online ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-1 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-gray-500" /> Global QR Content
            (Online Mode)
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Default settings for what shows up when a QR code is scanned in
            online mode through the Google Apps Script web app.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {ONLINE_QR_FIELDS.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!qrOnlineFields[key]}
                  onChange={() => toggleQrField("online", key)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* ── Save + Reset ── */}
        <div className="bg-white p-6 rounded-lg shadow flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              onClick={handleSave}
              className="btn-primary text-white px-6 py-2 rounded-lg font-bold shadow-md flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Save All Settings
            </button>
            <button
              onClick={handleLogout}
              className="text-sm font-bold text-red-600 hover:underline flex items-center gap-1"
            >
              <LogOut className="w-4 h-4" /> Reset Connection &amp; Logout
            </button>
          </div>
        </div>

        {/* ── Account ── */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-500" /> Account
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {user?.Name ||
                  user?.Username ||
                  user?.username ||
                  "Unknown User"}
              </p>
              <p className="text-xs text-slate-400">
                {user?.Role || user?.role || "Researcher"} ·{" "}
                {state.auth?.username || ""}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-semibold hover:bg-red-100 transition"
            >
              <LogOut className="w-4 h-4" /> Log Out
            </button>
          </div>
        </div>

        {/* ── Troubleshooting ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-1 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-gray-500" /> Troubleshooting
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            If you are experiencing issues, clear the application cache and
            perform a hard reload.
          </p>
          <button
            onClick={handleClearCacheReload}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition"
          >
            Clear Cache &amp; Reload App
          </button>
        </div>

        <div className="text-center py-2 text-xs text-slate-300">
          Herbicide Trial Manager · React v{React.version} · Build{" "}
          {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
