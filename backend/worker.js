// KH Law Firm — WhatsApp client-update notifier
// Runs on Cloudflare Workers (free tier). Called by dashboard.html after a
// confirmed client edit; sends the approved WhatsApp template message from
// the firm's own number via the Meta WhatsApp Cloud API.
//
// Required secrets (set with `npx wrangler secret put <NAME>`, never in code):
//   META_TOKEN       - permanent access token from the Meta app (System User)
//   PHONE_NUMBER_ID  - the WhatsApp phone number ID from the Meta app
//   SHARED_SECRET    - any long random string; the dashboard must send the same one
// Optional vars:
//   TEMPLATE_NAME    - approved template name (default: client_case_update)
//   GRAPH_VERSION    - Meta Graph API version (default: v23.0)

const ALLOWED_ORIGINS = [
  'https://ahmadsabahi.github.io',
  'http://127.0.0.1:8000',
  'http://localhost:8000'
];

function corsHeaders(origin) {
  const o = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

// "٩٩١٢٣٤٥٦" / "+968 9945-8712" / "99123456" -> "96899123456" (E.164 without +)
export function normalizePhone(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)); // Arabic-Indic digits -> Latin
  s = s.replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  if (/^\d{8}$/.test(s)) s = '968' + s; // bare 8-digit Omani number
  return /^\d{10,15}$/.test(s) ? s : null;
}

function json(status, obj, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

export default {
  async fetch(request, env) {
    const h = corsHeaders(request.headers.get('Origin') || '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (request.method !== 'POST') return json(405, { ok: false, error: 'method not allowed' }, h);

    let body;
    try { body = await request.json(); }
    catch (e) { return json(400, { ok: false, error: 'invalid json' }, h); }

    if (!env.SHARED_SECRET || body.secret !== env.SHARED_SECRET) {
      return json(401, { ok: false, error: 'unauthorized' }, h);
    }

    const to = normalizePhone(body.phone);
    if (!to) return json(400, { ok: false, error: 'invalid phone number' }, h);

    // template params must not be empty
    const nz = t => { t = String(t == null ? '' : t).trim(); return t && t !== 'None' ? t : 'لا يوجد'; };

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: env.TEMPLATE_NAME || 'client_case_update',
        language: { code: 'ar' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: nz(body.client) },        // {{1}} client name
            { type: 'text', text: nz(body.caseNo) },        // {{2}} case number
            { type: 'text', text: nz(body.nextHearing) },   // {{3}} next hearing
            { type: 'text', text: nz(body.finalDecision) }  // {{4}} final decision
          ]
        }]
      }
    };

    const ver = env.GRAPH_VERSION || 'v23.0';
    const res = await fetch(`https://graph.facebook.com/${ver}/${env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      return json(200, { ok: true, id: data.messages && data.messages[0] && data.messages[0].id }, h);
    }
    return json(502, { ok: false, error: (data.error && data.error.message) || ('meta error ' + res.status) }, h);
  }
};
