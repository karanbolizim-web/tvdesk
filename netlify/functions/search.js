exports.handler = async function (event) {
  const q = (event.queryStringParameters && event.queryStringParameters.q) || "";
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (!q) {
    return { statusCode: 200, headers, body: JSON.stringify({ web: { results: [] } }) };
  }
  const KEY = process.env.BRAVE_KEY;
  try {
    const r = await fetch(
      "https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(q),
      { headers: { Accept: "application/json", "X-Subscription-Token": KEY } }
    );
    const data = await r.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: { detail: String(e) } }) };
  }
};
