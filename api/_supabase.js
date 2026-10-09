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

// Puts a failure on the admin's Issues screen. Repeats of the same `kind`
// fold into one issue with a count, so pass a stable kind and put ids in
// `detail`. Never throws and never blocks the caller: reporting a failure
// must not become a second one.
async function reportIssue(kind, severity, title, detail) {
  try {
    const admin = supabaseAdmin();
    if (!admin) return;
    const { error } = await admin.rpc('report_system_issue', {
      p_source: 'website',
      p_kind: kind,
      p_severity: severity,
      p_title: title,
      p_detail: detail || {},
    });
    if (error) console.error(`reportIssue(${kind}) failed: ${error.message}`);
  } catch (err) {
    console.error(`reportIssue(${kind}) failed: ${err?.message || err}`);
  }
}

module.exports = { supabaseAdmin, reportIssue };
