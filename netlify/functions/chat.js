const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPA_URL = 'https://ciufbbdzekqlqdzodnrr.supabase.co';
const SUPA_KEY = 'sb_publishable_26hdkwY53clveH7bDPf21w_JGtrY1NP';
const ALLOWED_ORIGINS = ['https://uglyops.netlify.app', 'https://uglycrm.netlify.app', 'https://uglybot.netlify.app'];
function cors(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const allow = ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0];
  return { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
}
async function getCaller(event) {
  const h = event.headers || {};
  const token = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token === SUPA_KEY) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(event), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors(event), body: JSON.stringify({ error: 'Method Not Allowed' }) };

  // Require any authenticated user (blocks anonymous abuse of the AI proxy).
  const caller = await getCaller(event);
  if (!caller) return { statusCode: 401, headers: cors(event), body: JSON.stringify({ error: 'Authentication required' }) };

  try {
    const { messages, store, photoBase64, photoType } = JSON.parse(event.body);
    const userQuestion = messages[messages.length - 1]?.content || '';

    // Fetch relevant knowledge from UglyBot knowledge base
    let knowledgeContext = '';
    try {
      const searchRes = await fetch(
        `${SUPA_URL}/rest/v1/knowledge?select=question,answer,category&order=created_at.desc&limit=50`,
        { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
      );
      const knowledge = await searchRes.json();
      if (Array.isArray(knowledge) && knowledge.length > 0) {
        const q = userQuestion.toLowerCase();
        const relevant = knowledge.filter(k => {
          const combined = ((k.question || '') + ' ' + (k.answer || '')).toLowerCase();
          return q.split(' ').some(word => word.length > 3 && combined.includes(word));
        }).slice(0, 8);
        if (relevant.length > 0) {
          knowledgeContext = '\n\nRELEVANT KNOWLEDGE BASE:\n' +
            relevant.map(k => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n');
        }
      }
    } catch (e) { console.error('Knowledge fetch error:', e); }

    const systemPrompt = `You are UglyBot, the AI assistant for Ugly Donuts & Corn Dogs franchisees. You help with daily operations, recipes, quality standards, and procedures.

Key brand facts:
- Fried exclusively in avocado oil
- 98% made-to-order, food waste under 0.5%  
- 12 corn dog varieties, 15+ donuts, bubble tea (NYC), refreshers
- Toast POS system
- $22 average ticket, 41.3% repeat rate
- Premium positioning — only premium Korean corn dog brand in the US

${photoBase64 ? `When reviewing a photo: evaluate food quality, presentation, portion size, and adherence to brand standards. Be specific and constructive.` : ''}

You are helping: ${store || 'an Ugly Donuts & Corn Dogs location'}

If the knowledge base has a relevant answer, use it. If you don't know something specific, say "Please contact HQ for this one."${knowledgeContext}`;

    // Build the message content - add photo if provided
    const apiMessages = messages.slice(-20).map((m, i) => {
      // If this is the last user message and we have a photo
      if (i === messages.slice(-20).length - 1 && m.role === 'user' && photoBase64) {
        return {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: photoType || 'image/jpeg',
                data: photoBase64,
              }
            },
            { type: 'text', text: m.content || 'Please review this photo and give feedback on quality and presentation.' }
          ]
        };
      }
      return { role: m.role, content: m.content };
    });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: apiMessages,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 500, headers: cors(event), body: JSON.stringify({ error: data.error?.message || 'API error' }) };
    }

    return {
      statusCode: 200,
      headers: cors(event),
      body: JSON.stringify({ content: data.content?.[0]?.text || 'Sorry, I could not generate a response.' }),
    };
  } catch (err) {
    return { statusCode: 500, headers: cors(event), body: JSON.stringify({ error: err.message }) };
  }
};
