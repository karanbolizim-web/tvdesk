// Uzaktan not GÖNDERME — Dubai'deki kişi yollar, Supabase'e kaydedilir.
// Iğdır'daki TV bunu note-get ile alıp sesli okur.
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
    const text = (body.text || '').toString().trim().slice(0, 500);
    const from = (body.from || '').toString().trim().slice(0, 60);
    if (!code || !text) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'kod ve not gerekli' }) };
    }

    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!base || !key) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'sunucu ayari eksik' }) };
    }

    const r = await fetch(base.replace(/\/$/, '') + '/rest/v1/notes', {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ code: code, text: text, sender: from })
    });

    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'kayit basarisiz', detail: detail }) };
    }
    const data = await r.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, note: (data && data[0]) || null }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: String(e) }) };
  }
};
