import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { initFirebase } from "../services/firebase.js";
import { fbGetById, fbGetGlobalQRSettings } from "../services/firebaseDB.js";

// ── helpers ──────────────────────────────────────────────────────────────────
function safeJson(str, def = []) {
  try {
    const v = JSON.parse(str);
    return v ?? def;
  } catch {
    return def;
  }
}
function fmtDate(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return d || "—";
    return dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d || "—";
  }
}
function calcWce(baseline, cover) {
  if (!baseline || baseline <= 0) return null;
  return Math.max(0, Math.min(100, ((baseline - cover) / baseline) * 100));
}

const LEGACY_ONLINE_QR_DEFAULTS = {
  showFormulationName: true,
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
  showObservations: false,
  showAISummary: false,
  showReplication: false,
};

function mapOnlineFieldArrayToSettings(fields = []) {
  const mapped = { ...LEGACY_ONLINE_QR_DEFAULTS };
  mapped.showFormulationName = fields.includes("FormulationName");
  mapped.showInvestigator = fields.includes("InvestigatorName");
  mapped.showDate = fields.includes("Date");
  mapped.showDosage = fields.includes("Dosage");
  mapped.showLocation = fields.includes("Location");
  mapped.showWeedSpecies = fields.includes("WeedSpecies");
  mapped.showResult = fields.includes("Result");
  if (fields.includes("Weather")) mapped.showWeather = true;
  if (fields.includes("Conclusion")) mapped.showConclusion = true;
  if (fields.includes("Photos")) mapped.showPhotos = true;
  return mapped;
}

function readGlobalOnlineQrSettings() {
  try {
    const saved = localStorage.getItem("appSettings");
    if (!saved) return { ...LEGACY_ONLINE_QR_DEFAULTS };
    const parsed = JSON.parse(saved);
    const raw = parsed?.qrOnlineFields;
    if (Array.isArray(raw)) return mapOnlineFieldArrayToSettings(raw);
    if (raw && typeof raw === "object")
      return { ...LEGACY_ONLINE_QR_DEFAULTS, ...raw };
  } catch {
    // Ignore malformed local settings and use defaults.
  }
  return { ...LEGACY_ONLINE_QR_DEFAULTS };
}

function normalizeLiveQrSettings(rawSettings, globalSettings) {
  const raw = safeJson(rawSettings, {});
  const normalized = { ...globalSettings };

  Object.entries(raw || {}).forEach(([key, value]) => {
    normalized[key] = value;
  });

  if (Object.prototype.hasOwnProperty.call(raw, "showInvestigatorName"))
    normalized.showInvestigator = raw.showInvestigatorName;
  if (Object.prototype.hasOwnProperty.call(raw, "showFormulationName"))
    normalized.showFormulationName = raw.showFormulationName;
  if (Object.prototype.hasOwnProperty.call(raw, "showObservations"))
    normalized.showObservations = raw.showObservations;
  if (Object.prototype.hasOwnProperty.call(raw, "showAISummary"))
    normalized.showAISummary = raw.showAISummary;

  return normalized;
}

// ── Live Trial Page ───────────────────────────────────────────────────────────
export default function LiveTrialPage() {
  const { id } = useParams();
  const [trial, setTrial] = useState(null);
  const [formulation, setFormulation] = useState(null);
  const [globalQRSettings, setGlobalQRSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) {
      setError("No trial ID in URL.");
      setLoading(false);
      return;
    }

    // 1. Try Vite env vars baked in at build time (works for any visitor)
    let firebaseConfig = null;
    if (
      import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID
    ) {
      firebaseConfig = {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      };
    }

    // 2. Fall back to localStorage (works when opened on the same device as the app)
    if (!firebaseConfig) {
      try {
        const saved = localStorage.getItem("appSettings");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.firebaseConfig?.apiKey)
            firebaseConfig = parsed.firebaseConfig;
        }
      } catch {
        /* ignore */
      }
    }

    if (!firebaseConfig) {
      setError(
        "Firebase is not configured for public access. Ask the app administrator to set VITE_FIREBASE_* environment variables in Vercel.",
      );
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        initFirebase(firebaseConfig);

        // Fetch trial data + global QR visibility settings in parallel
        const [data, globalQR] = await Promise.all([
          fbGetById("trials", id),
          fbGetGlobalQRSettings(), // reads settings/globalQR from Firestore
        ]);

        if (!data) throw new Error("Trial not found in database.");
        setTrial(data);

        // Use Firestore global QR settings if available; localStorage is fallback
        if (globalQR?.qrOnlineFields) {
          setGlobalQRSettings(globalQR.qrOnlineFields);
        }

        if (data.FormulationID) {
          const formulationData = await fbGetById(
            "formulations",
            data.FormulationID,
          );
          setFormulation(formulationData);
        } else {
          setFormulation(null);
        }
      } catch (e) {
        console.error("LiveTrialPage loading error:", e);
        setError(e.message || "Failed to load trial.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-emerald-700 font-semibold">Loading trial data…</p>
        </div>
      </div>
    );

  // ── Error ────────────────────────────────────────────────────────────────
  if (error)
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">
            Could not load trial
          </h2>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );

  // ── Data ─────────────────────────────────────────────────────────────────
  const efficacy = safeJson(trial.EfficacyDataJSON, []).sort(
    (a, b) => (a.daa ?? 0) - (b.daa ?? 0),
  );
  const photos = safeJson(trial.PhotoURLs, []);
  const aiData = safeJson(trial.AISummariesJSON, {});
  const baseline = parseFloat(efficacy[0]?.weedCover ?? 0) || 0;
  const latest = efficacy.length ? efficacy[efficacy.length - 1] : null;
  const finalWce = latest
    ? calcWce(baseline, parseFloat(latest.weedCover ?? 0))
    : null;
  const isActive = String(trial.IsLive).toLowerCase() !== "false";

  // Per-trial field visibility.
  // Priority: Firestore globalQR (set in Settings) > localStorage fallback > hardcoded defaults.
  // This makes changes in the Settings page reflect immediately for any device scanning the QR.
  const globalShow = globalQRSettings
    ? { ...LEGACY_ONLINE_QR_DEFAULTS, ...globalQRSettings }
    : readGlobalOnlineQrSettings();
  const show = normalizeLiveQrSettings(trial.LiveQRSettings, globalShow);
  const ingredients = safeJson(formulation?.IngredientsJSON, []);

  const statusColor = isActive
    ? "bg-emerald-100 text-emerald-800"
    : "bg-slate-100 text-slate-700";

  if (!isActive)
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center border border-slate-200">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            Trial Concluded
          </h1>
          <p className="text-sm text-slate-500">
            This trial is no longer active.
          </p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 font-sans">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-6 text-white">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs bg-white/20 rounded-full px-3 py-0.5 font-semibold uppercase tracking-wide">
              Live Trial View
            </span>
            <span
              className={`text-xs rounded-full px-3 py-0.5 font-semibold ${isActive ? "bg-emerald-400/40" : "bg-white/20"}`}
            >
              {isActive ? "Active" : "Completed"}
            </span>
          </div>
          <h1 className="text-2xl font-bold leading-tight mt-1">
            {show.showFormulationName
              ? trial.FormulationName || "Unnamed Trial"
              : "Trial Report"}
          </h1>
          {(show.showDate || show.showLocation) && (
            <p className="text-emerald-100 text-sm mt-1">
              {show.showDate ? fmtDate(trial.Date) : ""}
              {show.showDate && show.showLocation && trial.Location
                ? " · "
                : ""}
              {show.showLocation ? trial.Location || "" : ""}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
        {/* Trial Details */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
            Trial Details
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ["Trial ID", trial.ID, true],
              [
                "Product",
                trial.FormulationName || "—",
                show.showFormulationName,
              ],
              [
                "Investigator",
                trial.InvestigatorName || "—",
                show.showInvestigator,
              ],
              ["Application Date", fmtDate(trial.Date), show.showDate],
              ["Dosage", trial.Dosage || "—", show.showDosage],
              ["Location", trial.Location || "—", show.showLocation],
              ["Target Weeds", trial.WeedSpecies || "—", show.showWeedSpecies],
              ["Replication", trial.Replication || "—", show.showReplication],
              ["Result", trial.Result || "—", show.showResult],
              ["Status", isActive ? "Active" : "Completed", true],
            ]
              .filter(([, , visible]) => visible)
              .map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-slate-400 font-semibold">
                    {label}
                  </p>
                  <p className="text-slate-700 font-medium break-words">
                    {value}
                  </p>
                </div>
              ))}
          </div>
        </div>

        {show.showWeather && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
              Weather
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                [
                  "Temperature",
                  trial.Temperature ? `${trial.Temperature} C` : "—",
                ],
                ["Humidity", trial.Humidity ? `${trial.Humidity}%` : "—"],
                ["Wind", trial.Windspeed ? `${trial.Windspeed} km/h` : "—"],
                ["Rain", trial.Rain ? `${trial.Rain} mm` : "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-slate-400 font-semibold">
                    {label}
                  </p>
                  <p className="text-slate-700 font-medium break-words">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {show.showIngredients && ingredients.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
              Formulation Ingredients
            </h2>
            <ul className="space-y-2 text-sm text-slate-700">
              {ingredients.map((ingredient, index) => (
                <li
                  key={`${ingredient.name || "ingredient"}-${index}`}
                  className="bg-slate-50 rounded-xl px-3 py-2"
                >
                  {ingredient.name || "Unnamed ingredient"}
                  {ingredient.quantity || ingredient.unit
                    ? ` (${ingredient.quantity || ""} ${ingredient.unit || ""})`.trim()
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Efficacy Summary */}
        {show.showObservations && efficacy.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
              Efficacy Summary
            </h2>
            <div className="flex gap-3 mb-4">
              <div className="flex-1 bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400 font-semibold">
                  Baseline Cover
                </p>
                <p className="text-2xl font-bold text-slate-800">{baseline}%</p>
              </div>
              <div className="flex-1 bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400 font-semibold">
                  Latest Cover
                </p>
                <p className="text-2xl font-bold text-slate-800">
                  {latest?.weedCover ?? "—"}%
                </p>
              </div>
              <div className="flex-1 bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400 font-semibold">WCE</p>
                <p className="text-2xl font-bold text-emerald-700">
                  {finalWce !== null ? `${finalWce.toFixed(1)}%` : "—"}
                </p>
              </div>
            </div>

            {/* Observation timeline */}
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">
              Observation Timeline
            </h3>
            <div className="space-y-2">
              {efficacy.map((obs, i) => {
                const cover = parseFloat(obs.weedCover ?? 0);
                const wce = i === 0 ? null : calcWce(baseline, cover);
                const species = (obs.weedDetails || [])
                  .map((w) => w.species)
                  .filter(Boolean)
                  .join(", ");
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 bg-slate-50 rounded-xl p-3"
                  >
                    <div className="shrink-0 bg-teal-100 text-teal-700 rounded-lg px-2 py-1 text-xs font-bold">
                      DAA {obs.daa ?? 0}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-700 text-sm">
                          {cover}% cover
                        </span>
                        {wce !== null && (
                          <span
                            className={`text-xs rounded-full px-2 py-0.5 font-semibold ${
                              wce >= 80
                                ? "bg-emerald-100 text-emerald-700"
                                : wce >= 50
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            WCE {wce.toFixed(1)}%
                          </span>
                        )}
                        {i === 0 && (
                          <span className="text-xs bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 font-semibold">
                            Baseline
                          </span>
                        )}
                      </div>
                      {species && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {species}
                        </p>
                      )}
                      {obs.notes && (
                        <p className="text-xs text-slate-400 mt-0.5 italic truncate">
                          {obs.notes}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Narrative */}
        {show.showAISummary && aiData.narrative && (
          <div className="bg-white rounded-2xl shadow-sm border border-violet-100 p-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>🤖</span> AI Trial Narrative
            </h2>
            <p className="text-xs text-slate-400 mb-2">
              Generated {fmtDate(aiData.narrativeGeneratedAt)} ·{" "}
              {aiData.narrativeObsCount} observations
            </p>
            <pre className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-sans">
              {aiData.narrative}
            </pre>
          </div>
        )}

        {show.showConclusion && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
              Conclusion and Notes
            </h2>
            <div className="space-y-3 text-sm text-slate-700">
              <div>
                <p className="text-xs text-slate-400 font-semibold mb-1">
                  Conclusion
                </p>
                <p>{trial.Conclusion || "No conclusion provided."}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold mb-1">
                  Notes
                </p>
                <p>{trial.Notes || "No notes provided."}</p>
              </div>
            </div>
          </div>
        )}

        {/* Photos */}
        {show.showPhotos && photos.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
              Field Photos
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {photos.map((p, i) => {
                const rawSrc = p.url || p.fileData;
                if (!rawSrc) return null;
                const driveMatch = typeof rawSrc === 'string' && rawSrc.includes('drive.google.com') && rawSrc.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
                const src = driveMatch
                  ? `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w600`
                  : rawSrc;
                return (
                  <div
                    key={i}
                    className="rounded-xl overflow-hidden border border-slate-100 aspect-square bg-slate-100"
                  >
                    <img
                      src={src}
                      alt={p.label || `Photo ${i + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {p.label && (
                      <p className="text-xs text-slate-500 text-center py-1 truncate px-1">
                        {p.label}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 py-4">
          <p>
            Powered by{" "}
            <span className="font-semibold text-teal-600">
              Miklens Herbicide Trial Platform
            </span>
          </p>
          <p className="mt-1">
            Trial ID: <span className="font-mono">{trial.ID}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
