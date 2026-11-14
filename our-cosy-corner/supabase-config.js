// ┌────────────────────────────────────────────────────────────────────────┐
// │  Our Cosy Corner — Supabase configuration                               │
// │                                                                        │
// │  Leave this file exactly as-is to run in LOCAL MODE (everything is     │
// │  saved on this computer only — no account, no internet needed).        │
// │                                                                        │
// │  To sync with your partner across two Macs, follow SETUP.md and paste  │
// │  your own Supabase project values below, replacing every PASTE_...     │
// │  placeholder. As soon as `url`/`anonKey` are filled in, the app        │
// │  switches to cloud mode automatically.                                 │
// └────────────────────────────────────────────────────────────────────────┘

window.SUPABASE_CONFIG = {
  url: "PASTE_YOUR_SUPABASE_URL",
  anonKey: "PASTE_YOUR_SUPABASE_ANON_KEY"
};

// Helper the app uses to decide local vs cloud. (Do not edit.)
window.hasSupabaseConfig = function () {
  var c = window.SUPABASE_CONFIG || {};
  return !!(c.url && c.url.indexOf("PASTE_") !== 0 && c.anonKey && c.anonKey.indexOf("PASTE_") !== 0);
};
