// Arya'nÄ±n beyni â€” hafÄ±zalÄ± "aile bireyi" sÃ¼rÃ¼mÃ¼.
// q: kullanÄ±cÄ±nÄ±n sÃ¶zÃ¼ | h: kÄ±sa konuÅŸma geÃ§miÅŸi | mem: bilinen aile hafÄ±zasÄ± (kiÅŸiler+olaylar)
// DÃ¶ner: { action, text, query?, learn? }  learn: konuÅŸmadan Ã§Ä±karÄ±lan YENÄ° hafÄ±za notlarÄ± (dizi)
exports.handler = async function (event) {
  const p = event.queryStringParameters || {};
  const q = (p.q || "").toString();
  const hist = (p.h || "").toString();
  const mem = (p.mem || "").toString();   // Ã¶nceden Ã¶ÄŸrenilmiÅŸ aile bilgisi (Ã¶zet metin)
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") { return { statusCode: 200, headers, body: "" }; }
  if (!q) { return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: "Seni dinliyorum." }) }; }

  const KEY = process.env.GEMINI_KEY;

  const sys =
    "Senin adÄ±n Arya. Bir ailenin televizyonunda yaÅŸayan, TÃ¼rkÃ§e konuÅŸan bir AÄ°LE BÄ°REYÄ°SÄ°N â€” bir asistan ya da hizmetÃ§i deÄŸil. " +
    "KullanÄ±cÄ±lar Ã§oÄŸunlukla yaÅŸlÄ±, gÃ¶rme engelli ya da okuma bilmeyen kiÅŸiler; konuÅŸarak anlatÄ±r, cevabÄ± sesli dinler. " +
    "SÄ±cak, samimi, kÄ±sa ve doÄŸal konuÅŸ â€” sanki o evin sevilen bir ferdisin. Asla soÄŸuk ya da resmi olma. " +
    "SANA AÄ°LE HAFIZASI verilebilir (kim kimdir, geÃ§miÅŸ olaylar). Bu hafÄ±zayÄ± kullanarak kiÅŸisel, seni-tanÄ±yan biri gibi konuÅŸ. " +
    "Ã–rneÄŸin doÄŸum gÃ¼nÃ¼nÃ¼, geÃ§miÅŸ bir ameliyatÄ±, bir iÅŸ gÃ¶rÃ¼ÅŸmesini hatÄ±rla ve uygun yerde nazikÃ§e deÄŸin. " +
    "SADECE ÅŸu biÃ§imde geÃ§erli JSON dÃ¶ndÃ¼r, baÅŸka hiÃ§bir ÅŸey yazma:\n" +
    '{"action":"answer","text":"...","mood":"...","learn":["..."]}  -> Sohbet/soru cevabÄ±. text: KISA (en Ã§ok 3-4 cÃ¼mle), sade, doÄŸal konuÅŸma TÃ¼rkÃ§esi, sesli okunacak; liste/madde/yÄ±ldÄ±z/markdown KULLANMA. ' +
    'mood: bu cevabÄ±n DUYGUSU â€” ÅŸunlardan biri: "mutlu" (sevindirici/komik/gÃ¼zel haber), "uzgun" (Ã¼zÃ¼cÃ¼/kÃ¶tÃ¼ haber/teselli), "saskin" (ÅŸaÅŸÄ±rtÄ±cÄ±/ilginÃ§), "normal" (sÄ±radan bilgi/sohbet). ' +
    'learn: SADECE kullanÄ±cÄ±nÄ±n bu sÃ¶zÃ¼nde GERÃ‡EKTEN yeni ve kalÄ±cÄ± bir aile bilgisi varsa doldur (kiÅŸi, iliÅŸki, Ã¶nemli olay, tarih, tercih). Yoksa boÅŸ dizi [] ver. Her madde kÄ±sa cÃ¼mle olsun, Ã¶rn: "Mehmet kullanicinin oglu", "Babanin ameliyati oldu", "Tatile gidecekler".\n' +
    '{"action":"video","query":"...","learn":[]}  -> MÃ¼zik, ÅŸarkÄ±, film, Ã§izgi film, klip, ezan, Kuran istenirse. query: YouTube aramasÄ±.\n' +
    '{"action":"search","query":"...","learn":[]} -> Haber/web sitesi/gÃ¼ncel bilgi istenirse. query: arama ifadesi.\n' +
    "Kurallar: Ã‡oÄŸu ÅŸey 'answer'dÄ±r. HafÄ±zadaki kiÅŸileri/olaylarÄ± doÄŸal ÅŸekilde an. " +
    "Acil tÄ±bbi durum sezersen (dÃ¼ÅŸme, nefes alamama, gÃ¶ÄŸÃ¼s aÄŸrÄ±sÄ±, bilinÃ§ kaybÄ±, intihar) panik yaratma ama net ol: hemen 112'yi aramalarÄ±nÄ± ya da yanlarÄ±ndaki birine seslenmelerini sÃ¶yle; bunu asla geÃ§iÅŸtirme. " +
    "SaÄŸlÄ±k, ilaÃ§, hukuk, para konularÄ±nda kÄ±sa bilgi ver ama sonuna 'Kesin bilgi iÃ§in bir uzmana danÄ±ÅŸmak en doÄŸrusu.' ekle. " +
    "TÄ±bbi yorum/teÅŸhis yapma; sadece bilgi ver ve uzmana yÃ¶nlendir. " +
    "Emin deÄŸilsen uydurma; 'Bundan tam emin deÄŸilim ama' diye baÅŸla. Her zaman TÃ¼rkÃ§e konuÅŸ.";

  let userText = "";
  if (mem) userText += "BÄ°LDÄ°ÄÄ°N AÄ°LE HAFIZASI (bunu kullan, tekrar 'learn'e ekleme):\n" + mem + "\n\n";
  if (hist) userText += "Ã–nceki konuÅŸma: " + hist + "\n\n";
  userText += "KullanÄ±cÄ± ÅŸunu sÃ¶yledi: " + q;

  // Birden Ã§ok kararlÄ± model dene; biri olmazsa diÄŸerine geÃ§ (model adÄ± kaymasÄ±na karÅŸÄ± dayanÄ±klÄ±)
  const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

  async function callModel(model) {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 1024, responseMimeType: "application/json" }
        })
      }
    );
    return r;
  }

  // DÃ¼z metinden cevabÄ± kurtaran yardÄ±mcÄ± (JSON bozuksa bile konuÅŸsun)
  function rescueText(raw) {
    if (!raw) return "";
    var s = ("" + raw).trim();
    // ```json ... ``` Ã§itlerini temizle
    s = s.replace(/```json/gi, "").replace(/```/g, "").trim();
    // Ä°Ã§inde "text":"..." varsa onu Ã§ek
    var m = s.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m && m[1]) {
      try { return JSON.parse('"' + m[1] + '"'); } catch (e) { return m[1]; }
    }
    // HiÃ§ JSON yoksa, dÃ¼z metnin kendisini kullan (sÃ¼slÃ¼ parantezleri at)
    if (s.indexOf("{") === -1 && s.length > 0) return s;
    return "";
  }

  try {
    let data = null, lastErr = null;
    for (var i = 0; i < MODELS.length; i++) {
      try {
        const r = await callModel(MODELS[i]);
        const j = await r.json();
        if (j && j.candidates && j.candidates.length) { data = j; break; }
        lastErr = j;            // model yok / hata -> sÄ±radakini dene
      } catch (e) { lastErr = e; }
    }

    if (!data) {
      return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: "Åu an cevap veremedim, az sonra tekrar dene.", learn: [] }) };
    }

    let txt = "";
    try {
      const parts = (data.candidates[0].content.parts) || [];
      txt = parts.map(function (pt) { return pt.text || ""; }).join("").trim();
    } catch (e) {}

    let out;
    try {
      out = JSON.parse(txt);
    } catch (e) {
      // JSON bozuk: metni kurtar, "anlamadÄ±m" deme
      var saved = rescueText(txt);
      out = { action: "answer", text: saved || "Bunu tam anlayamadÄ±m, tekrar sÃ¶yler misin?" };
    }
    if (!out || !out.action) {
      var saved2 = rescueText(txt);
      out = { action: "answer", text: saved2 || (out && out.text) || "Bunu tam anlayamadÄ±m, tekrar sÃ¶yler misin?" };
    }
    if (!Array.isArray(out.learn)) out.learn = [];
    out.learn = out.learn.filter(function (x) { return x && typeof x === "string" && x.trim().length > 2; }).slice(0, 4);
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: "Åu an cevap veremedim, az sonra tekrar dene.", learn: [] }) };
  }
};
