// Uzaktan not ALMA — Iğdır'daki TV bunu her ~20 saniyede çağırır.
// ?code=AILEKODU&since=SONGORULENID  -> o koddan, since'den yeni notları döndürür.
exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  try {
    const q = event.queryStringParameters || {};
    const code = (q.code || '').toString().trim().toUpperCase();
    const since = parseInt(q.since || '0', 10) || 0;
    if (!code) return { statusCode: 200, headers: cors, body: '[]' };

    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!base || !key) return { statusCode: 200, headers: cors, body: '[]' };

    const url = base.replace(/\/$/, '') +
      '/rest/v1/notes?code=eq.' + encodeURIComponent(code) +
      '&id=gt.' + since +
      '&order=id.asc&select=id,text,sender,created_at';

    const r = await fetch(url, {
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    });
    if (!r.ok) return { statusCode: 200, headers: cors, body: '[]' };
    const data = await r.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify(Array.isArray(data) ? data : []) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: '[]' };
  }
};

