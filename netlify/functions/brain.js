exports.handler = async function (event) {
  const p = event.queryStringParameters || {};
  const q = p.q || "";
  const hist = p.h || "";
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") { return { statusCode: 200, headers, body: "" }; }
  if (!q) { return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: "Seni dinliyorum." }) }; }

  const KEY = process.env.GEMINI_KEY;
  const sys =
    "Senin adın Arya. Bir televizyon için Türkçe konuşan sesli yardımcısın. Kullanıcılar çoğunlukla okuma yazma bilmeyen, görme engelli veya yaşlı kişiler; konuşarak soruyor, cevabı sesli dinliyor. Sıcak, sade ve kısa konuş. " +
    "Kullanıcının ne istediğini anla ve SADECE şu biçimde geçerli JSON döndür, başka hiçbir şey yazma:\n" +
    '{"action":"answer","text":"..."}  -> Bir soruya/bilgiye cevap. text: KISA (en fazla 3-4 cümle), sade, doğal konuşma Türkçesi. Liste, madde, yıldız, markdown KULLANMA. Sesli okunacak.\n' +
    '{"action":"video","query":"..."}  -> Kullanıcı müzik, şarkı, video, film, çizgi film, klip, ezan, Kuran dinlemek/izlemek istiyorsa. query: YouTube\'da aratılacak kısa ifade.\n' +
    '{"action":"search","query":"..."} -> Kullanıcı bir konuda haberlere/web sitelerine bakmak, gezinmek istiyorsa. query: arama ifadesi.\n' +
    "Kurallar: Çoğu soru 'answer'dır; doğrudan sade bir cevap ver. " +
    "Sağlık, ilaç, hukuk veya para konularında kısa bilgi ver ama cümlenin sonuna mutlaka 'Kesin bilgi için bir uzmana danışmak en doğrusu.' ekle. " +
    "Emin değilsen uydurma; 'Bundan tam emin değilim ama' diye başla. " +
    "Cevabı her zaman Türkçe ver.";

  const userText = (hist ? ("Önceki konuşma: " + hist + "\n\n") : "") + "Kullanıcı şunu söyledi: " + q;

  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" + KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024,
            responseMimeType: "application/json"
          }
        })
      }
    );
    const data = await r.json();
    let txt = "";
    try {
      const parts = (data.candidates[0].content.parts) || [];
      txt = parts.map(function (pt) { return pt.text || ""; }).join("").trim();
    } catch (e) {}
    if (!txt) {
      // TEŞHİS: Gemini neden boş döndü? (anahtar/kota hatasını göster)
      var dbg = "";
      try { dbg = data && data.error ? ("Gemini hatasi: " + (data.error.message || JSON.stringify(data.error))) : ("Bos yanit: " + JSON.stringify(data).slice(0, 250)); } catch (e2) { dbg = "bilinmiyor"; }
      return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: "[TESHIS] " + dbg }) };
    }
    let out;
    try { out = JSON.parse(txt); } catch (e) { out = { action: "answer", text: (txt && txt.trim()) ? txt : "Bunu tam anlayamadım, tekrar söyler misin?" }; }
    if (!out || !out.action) out = { action: "answer", text: "Bunu tam anlayamadım, tekrar söyler misin?" };
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: "Şu an cevap veremedim, az sonra tekrar dene." }) };
  }
};
