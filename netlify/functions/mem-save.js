// Aile hafızası KAYDET — Arya konuşmadan yeni bilgi çıkarınca buraya yazar.
// POST { code, items: ["Mehmet oglu", ...] }
exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'POST kullan' };
  try {
    const body = JSON.parse(event.body || '{}');
    const code = (body.code || '').toString().trim().toUpperCase();
    let items = body.items;
    if (!Array.isArray(items)) items = [];
    items = items.map(function (s) { return (s || '').toString().trim().slice(0, 200); }).filter(function (s) { return s.length > 2; }).slice(0, 6);
    if (!code || !items.length) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, saved: 0 }) };

    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!base || !key) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false }) };

    const rows = items.map(function (t) { return { code: code, fact: t }; });
    const r = await fetch(base.replace(/\/$/, '') + '/rest/v1/memories', {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(rows)
    });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: r.ok, saved: r.ok ? items.length : 0 }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
