exports.handler = async function (event) {
  const u = (event.queryStringParameters && event.queryStringParameters.u) || "";
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") { return { statusCode: 200, headers, body: "" }; }
  if (!u) { return { statusCode: 200, headers, body: JSON.stringify({ text: "" }) }; }
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (TVDesk reader)" } });
    let html = await r.text();
    // scriptleri, stilleri, gizli kısımları at
    html = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
               .replace(/<style[\s\S]*?<\/style>/gi, " ")
               .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
    // paragrafları topla
    const paras = [];
    const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      let t = m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&[a-z0-9#]+;/gi, " ")
        .replace(/\[[0-9]+\]/g, " ")   // [1] gibi kaynak numaralarını at
        .replace(/\s+/g, " ")
        .trim();
      if (t.length > 40) paras.push(t);
      if (paras.join(" ").length > 4000) break;
    }
    let text = paras.join(" ").slice(0, 3500);
    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ text: "", error: String(e) }) };
  }
};

