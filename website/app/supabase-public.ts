// Public Supabase config for the website's email-auth pages (/reset).
//
// The anon key is public by design (Supabase's own docs: it's meant to ship
// in client code, RLS is what actually protects the data) — this is the
// exact same value already shipped inside the desktop app's own
// supabase-config.js, just copied here so the website's /reset page can call
// the Supabase REST API directly without pulling in the supabase-js SDK.
export const SUPABASE_URL = "https://asmymqutrpeejahlisgq.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzbXltcXV0cnBlZWphaGxpc2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNzYxMTIsImV4cCI6MjA5OTg1MjExMn0.GL3GGT2hds-Qo0UODdVD0G08yzc1pBO8Bmnn3m70cOU";
