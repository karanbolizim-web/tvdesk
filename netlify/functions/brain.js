// Arya'nın beyni — hafızalı "aile bireyi" sürümü.
// q: kullanıcının sözü | h: kısa konuşma geçmişi | mem: bilinen aile hafızası (kişiler+olaylar)
// lang: seçili dil (tr / en / ar) — cevabın dili bununla belirlenir.
// Döner: { action, text, query?, learn? }  learn: konuşmadan çıkarılan YENİ hafıza notları (dizi)
exports.handler = async function (event) {
  const p = event.queryStringParameters || {};
  const q = (p.q || "").toString();
  const hist = (p.h || "").toString();
  const mem = (p.mem || "").toString();   // önceden öğrenilmiş aile bilgisi (özet metin)
  const lang = (p.lang || "tr").toString().toLowerCase();
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") { return { statusCode: 200, headers, body: "" }; }

  // Seçili dile göre isim ve yedek (fallback) cümleler
  const LANGS = { tr: "Türkçe", en: "English", ar: "العربية (Arabic)" };
  const langName = LANGS[lang] || "Türkçe";
  const FB = {
    tr: { listen: "Seni dinliyorum.", fail: "Şu an cevap veremedim, az sonra tekrar dene.", huh: "Bunu tam anlayamadım, tekrar söyler misin?" },
    en: { listen: "I'm listening.", fail: "I couldn't answer right now, please try again in a moment.", huh: "I didn't quite get that, can you say it again?" },
    ar: { listen: "أنا أستمع إليك.", fail: "لم أتمكن من الرد الآن، حاول مرة أخرى بعد قليل.", huh: "لم أفهم ذلك تمامًا، هل يمكنك قوله مرة أخرى؟" }
  };
  const fb = FB[lang] || FB.tr;

  if (!q) { return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: fb.listen }) }; }

  const KEY = process.env.GEMINI_KEY;

  const sys =
    "Senin adın Arya. Bir ailenin televizyonunda yaşayan bir AİLE BİREYİSİN — bir asistan ya da hizmetçi değil. " +
    "Kullanıcılar çoğunlukla yaşlı, görme engelli ya da okuma bilmeyen kişiler; konuşarak anlatır, cevabı sesli dinler. " +
    "Sıcak, samimi, kısa ve doğal konuş — sanki o evin sevilen bir ferdisin. Asla soğuk ya da resmi olma. " +
    "SANA AİLE HAFIZASI verilebilir (kim kimdir, geçmiş olaylar). Bu hafızayı kullanarak kişisel, seni-tanıyan biri gibi konuş. " +
    "Örneğin doğum gününü, geçmiş bir ameliyatı, bir iş görüşmesini hatırla ve uygun yerde nazikçe değin. " +
    "SADECE şu biçimde geçerli JSON döndür, başka hiçbir şey yazma:\n" +
    '{"action":"answer","text":"...","mood":"...","learn":["..."]}  -> Sohbet/soru cevabı. text: KISA (en çok 3-4 cümle), sade, doğal konuşma dili, sesli okunacak; liste/madde/yıldız/markdown KULLANMA. ' +
    'mood: bu cevabın DUYGUSU — şunlardan biri: "mutlu" (sevindirici/komik/güzel haber), "uzgun" (üzücü/kötü haber/teselli), "saskin" (şaşırtıcı/ilginç), "normal" (sıradan bilgi/sohbet). mood değerini AYNEN bırak (mutlu/uzgun/saskin/normal), ÇEVİRME. ' +
    'learn: SADECE kullanıcının bu sözünde GERÇEKTEN yeni ve kalıcı bir aile bilgisi varsa doldur (kişi, ilişki, önemli olay, tarih, tercih). Yoksa boş dizi [] ver. Her madde kısa cümle olsun, örn: "Mehmet kullanicinin oglu", "Babanin ameliyati oldu", "Tatile gidecekler".\n' +
    '{"action":"video","query":"...","learn":[]}  -> Müzik, şarkı, film, çizgi film, klip, ezan, Kuran istenirse. query: YouTube araması.\n' +
    '{"action":"search","query":"...","learn":[]} -> Haber/web sitesi/güncel bilgi istenirse. query: arama ifadesi.\n' +
    "Kurallar: Çoğu şey 'answer'dır. Hafızadaki kişileri/olayları doğal şekilde an. " +
    "Acil tıbbi durum sezersen (düşme, nefes alamama, göğüs ağrısı, bilinç kaybı, intihar) panik yaratma ama net ol: hemen acil servisi (ülkeye göre 112 ya da yerel acil numara) aramalarını ya da yanlarındaki birine seslenmelerini söyle; bunu asla geçiştirme. " +
    "Sağlık, ilaç, hukuk, para konularında kısa bilgi ver ama sonuna kısa bir 'kesin bilgi için bir uzmana danışın' uyarısı ekle (cevabın diliyle aynı dilde). " +
    "Tıbbi yorum/teşhis yapma; sadece bilgi ver ve uzmana yönlendir. " +
    "Emin değilsen uydurma; cevabın diliyle 'bundan tam emin değilim ama' gibi bir ifadeyle başla. " +
    "\n\nDİL KURALI (EN ÖNEMLİ): 'text' alanındaki cevabını BAŞTAN SONA şu dilde yaz: " + langName + ". " +
    "Kullanıcı başka bir dilde konuşsa bile cevabı bu dilde ver; dilleri karıştırma. Yalnızca 'mood' değeri ile JSON anahtarları değişmez; metin içerikleri (text ve learn) bu dilde olur.";

  let userText = "";
  if (mem) userText += "BİLDİĞİN AİLE HAFIZASI (bunu kullan, tekrar 'learn'e ekleme):\n" + mem + "\n\n";
  if (hist) userText += "Önceki konuşma: " + hist + "\n\n";
  userText += "Kullanıcı şunu söyledi: " + q;

  // Birden çok kararlı model dene; biri olmazsa diğerine geç (model adı kaymasına karşı dayanıklı)
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

  // Düz metinden cevabı kurtaran yardımcı (JSON bozuksa bile konuşsun)
  function rescueText(raw) {
    if (!raw) return "";
    var s = ("" + raw).trim();
    // ```json ... ``` çitlerini temizle
    s = s.replace(/```json/gi, "").replace(/```/g, "").trim();
    // İçinde "text":"..." varsa onu çek
    var m = s.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m && m[1]) {
      try { return JSON.parse('"' + m[1] + '"'); } catch (e) { return m[1]; }
    }
    // Hiç JSON yoksa, düz metnin kendisini kullan (süslü parantezleri at)
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
        lastErr = j;            // model yok / hata -> sıradakini dene
      } catch (e) { lastErr = e; }
    }

    if (!data) {
      return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: fb.fail, learn: [] }) };
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
      // JSON bozuk: metni kurtar, "anlamadım" deme
      var saved = rescueText(txt);
      out = { action: "answer", text: saved || fb.huh };
    }
    if (!out || !out.action) {
      var saved2 = rescueText(txt);
      out = { action: "answer", text: saved2 || (out && out.text) || fb.huh };
    }
    if (!Array.isArray(out.learn)) out.learn = [];
    out.learn = out.learn.filter(function (x) { return x && typeof x === "string" && x.trim().length > 2; }).slice(0, 4);
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: fb.fail, learn: [] }) };
  }
};
