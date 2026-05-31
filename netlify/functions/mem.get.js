// Aile hafızası GETİR — Arya açılınca ve her konuşmada bunu okur.
// ?code=AILEKODU  -> o ailenin bildiği her şeyi tek metin olarak döndürür.
exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    const q = event.queryStringParameters || {};
    const code = (q.code || '').toString().trim().toUpperCase();
    if (!code) return { statusCode: 200, headers: cors, body: JSON.stringify({ facts: [], text: "" }) };
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!base || !key) return { statusCode: 200, headers: cors, body: JSON.stringify({ facts: [], text: "" }) };

    const url = base.replace(/\/$/, '') +
      '/rest/v1/memories?code=eq.' + encodeURIComponent(code) +
      '&order=id.desc&select=fact&limit=80';
    const r = await fetch(url, { headers: { 'apikey': key, 'Authorization': 'Bearer ' + key } });
    if (!r.ok) return { statusCode: 200, headers: cors, body: JSON.stringify({ facts: [], text: "" }) };
    let data = await r.json();
    if (!Array.isArray(data)) data = [];
    // tekrarları ele
    const seen = {}; const facts = [];
    for (const row of data) {
      const f = (row && row.fact ? row.fact : '').trim();
      const kkey = f.toLocaleLowerCase('tr');
      if (f && !seen[kkey]) { seen[kkey] = 1; facts.push(f); }
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ facts: facts, text: facts.join("\n") }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ facts: [], text: "" }) };
  }
};
