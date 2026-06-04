export const AVAILABLE_GEMINI_MODELS = [
  // ── Gemini 3.x ────────────────────────────────────────────────────────────
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash-Lite",
    description: "Stable. Ultra-fast, highest free quota (1500 RPD). Best for high-volume weed analysis.",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    description: "Stable. Most intelligent Gemini 3, frontier-class performance (~500 RPD free).",
    tier: "free_accessible"
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    description: "Preview. Stepping stone to 3.5 Flash, deeper reasoning (~100 RPD free).",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    description: "Preview. Most advanced reasoning for complex trial reports (~25 RPD free).",
    tier: "free_accessible"
  },
  // ── Gemini 2.5 (stable fallback) ──────────────────────────────────────────
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    description: "Stable. Fastest 2.5 model, high free quota (1500 RPD). Reliable fallback.",
    tier: "free_accessible"
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Stable. Reliable all-rounder with vision + thinking (250 RPD free).",
    tier: "free_accessible"
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Stable. Deep reasoning fallback, most capable 2.5 model (25 RPD free).",
    tier: "free_accessible"
  }
];
