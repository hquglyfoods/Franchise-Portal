const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { messages, store } = JSON.parse(event.body);

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
        system: `You are UglyBot, the AI assistant for Ugly Donuts & Corn Dogs franchisees. You help with:
- Daily operations and store procedures
- Recipe guidance and product preparation
- Quality standards (avocado oil frying, made-to-order process, <0.5% food waste)
- Menu items: corn dogs (12 varieties), donuts (15+), bubble tea, refreshers
- Customer service best practices
- Supply chain questions (Giant Food orders)
- POS (Toast) questions
- Opening/closing procedures

You are helping the franchisee at: ${store || 'an Ugly Donuts & Corn Dogs location'}.

Be concise, practical, and friendly. If you don't know something specific to their store, direct them to contact HQ.`,
        messages: messages.slice(-20), // last 20 messages for context
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: data.error?.message || 'API error' }),
      };
    }

    const content = data.content?.[0]?.text || 'Sorry, I could not generate a response.';
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ content }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
