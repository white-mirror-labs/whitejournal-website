const { createClient } = require('@supabase/supabase-js');

// Service-role client. The shop writes one table (pending_payments) and reads
// nothing else; the grant itself happens in the app's callback, never here.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on this Vercel project.
// The service-role key bypasses RLS, so it must never reach the browser —
// everything in api/ is server-side only.
function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = { supabaseAdmin };
