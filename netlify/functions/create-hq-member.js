// Creates an HQ team member using the Supabase Admin API (email_confirm:true),
// so the account can log in immediately without an email-confirmation step and
// without touching the built-in mailer's rate limit. Mirrors create-account.js.
const SUPA_URL = 'https://ciufbbdzekqlqdzodnrr.supabase.co';
const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ANON_KEY = 'sb_publishable_26hdkwY53clveH7bDPf21w_JGtrY1NP';
const ALLOWED_ORIGINS = ['https://uglyops.netlify.app', 'https://uglycrm.netlify.app'];
function cors(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const allow = ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0];
  return { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
}
async function getCaller(event) {
  const h = event.headers || {};
  const token = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token === ANON_KEY) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
async function isHQ(userId) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${userId}&select=role,is_active`, { headers: { apikey: SUPA_SERVICE_KEY, Authorization: `Bearer ${SUPA_SERVICE_KEY}` } });
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] && rows[0].role === 'hq' && rows[0].is_active !== false;
  } catch (e) { return false; }
}

exports.handler = async (event) => {
  const headers = cors(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const caller = await getCaller(event);
  if (!caller) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
  if (!(await isHQ(caller.id))) return { statusCode: 403, headers, body: JSON.stringify({ error: 'HQ access required' }) };

  if (!SUPA_SERVICE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY not set' }) };

  try {
    const { email, name, title } = JSON.parse(event.body || '{}');
    if (!email || !name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'email and name required' }) };

    const tempPass = Math.random().toString(36).slice(-8) + 'Aa1!';

    // Create the auth user, pre-confirmed so they can log in right away.
    const createRes = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_SERVICE_KEY, 'Authorization': `Bearer ${SUPA_SERVICE_KEY}` },
      body: JSON.stringify({ email, password: tempPass, email_confirm: true, user_metadata: { name } }),
    });
    const userData = await createRes.json();
    if (!createRes.ok) {
      const msg = userData.message || userData.msg || 'User creation failed';
      // Friendly message for the common "already registered" case.
      if (/already|registered|exists/i.test(msg)) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'An account with this email already exists. Use Reset PW to send them a new password instead.' }) };
      }
      return { statusCode: 400, headers, body: JSON.stringify({ error: msg }) };
    }
    const userId = userData.id;

    await fetch(`${SUPA_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_SERVICE_KEY, 'Authorization': `Bearer ${SUPA_SERVICE_KEY}`, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: userId, full_name: name, name, title: title || 'Team', role: 'hq', is_active: true }),
    });

    let emailSent = false, emailError = null;
    if (RESEND_API_KEY) {
      const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0E0E0E;color:#F0EDE8;padding:32px;border-radius:12px;"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#CC9C3A;margin-bottom:8px;">Ugly Donuts & Corn Dogs</div><h1 style="font-size:22px;margin:0 0 8px;">Welcome to the HQ team</h1><p style="color:#8A8480;font-size:14px;margin:0 0 24px;">An HQ account has been created for <strong style="color:#F0EDE8;">${name}</strong>${title ? ' (' + title + ')' : ''}.</p><div style="background:#1E1E1E;border:1px solid #2E2E2E;border-radius:10px;padding:20px;margin-bottom:20px;"><div style="margin-bottom:14px;"><div style="font-size:11px;color:#8A8480;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Login URL</div><div style="font-size:15px;font-weight:700;color:#F26419;">https://uglyops.netlify.app</div></div><div style="margin-bottom:14px;"><div style="font-size:11px;color:#8A8480;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Email</div><div style="font-size:15px;font-weight:700;">${email}</div></div><div><div style="font-size:11px;color:#8A8480;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Temporary Password</div><div style="font-size:22px;font-weight:700;font-family:monospace;letter-spacing:.1em;color:#CC9C3A;">${tempPass}</div></div></div><div style="background:rgba(204,156,58,.08);border:1px solid rgba(204,156,58,.3);border-radius:8px;padding:12px;margin-bottom:20px;"><p style="color:#CC9C3A;font-size:13px;margin:0;">⚠ Please change your password after first login in the Settings menu.</p></div><a href="https://uglyops.netlify.app" style="display:inline-block;background:#F26419;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Login to Franchise Ops →</a><p style="color:#5A5654;font-size:11px;margin-top:24px;">Ugly Donuts & Corn Dogs Franchising LLC · Belleville, NJ</p></div>`;
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Ugly Donuts & Corn Dogs HQ <do-not-reply@uglydonuts-franchiseportal.com>', to: [email], subject: 'Your Ugly Donuts Franchise Ops HQ Account', html }),
      });
      emailSent = emailRes.ok;
      if (!emailRes.ok) { try { emailError = (await emailRes.json()).message; } catch (e) { emailError = 'send failed'; } }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tempPass, emailSent, emailError }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
