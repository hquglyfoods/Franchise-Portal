const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'do-not-reply@uglydonuts-franchiseportal.com';
const FROM_NAME = 'Ugly Donuts & Corn Dogs HQ';
const SUPA_URL = 'https://ciufbbdzekqlqdzodnrr.supabase.co';
const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Any authenticated user may send (blocks anonymous internet abuse / open relay).
  // Note: kept at "authenticated" rather than HQ-only because franchisees also
  // trigger notification emails (e.g. messaging HQ from the portal).
  const caller = await getCaller(event);
  if (!caller) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };

  try {
    const { to, subject, html, type } = JSON.parse(event.body);

    // to can be a single email string or array of {email, name}
    const recipients = Array.isArray(to) ? to : [{ email: to }];

    // Send to each recipient
    const results = await Promise.all(recipients.map(async (recipient) => {
      const emailAddr = typeof recipient === 'string' ? recipient : recipient.email;
      const name = typeof recipient === 'object' ? recipient.name : '';

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [emailAddr],
          subject,
          html,
        }),
      });
      const data = await res.json();
      return { email: emailAddr, ok: res.ok, data };
    }));

    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
      console.error('Some emails failed:', failed);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, results }),
    };
  } catch (err) {
    console.error('send-email error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
