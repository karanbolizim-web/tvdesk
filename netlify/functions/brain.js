// Arya'nın beyni — hafızalı "aile bireyi" sürümü.
// q: kullanıcının sözü | h: kısa konuşma geçmişi | mem: bilinen aile hafızası (kişiler+olaylar)
// lang: seçili dil (tr / en) — cevabın dili bununla belirlenir.
// who: o an konuşan kişi (oturum boyunca hatırlanır)
// warm: "1" ise sadece konteyneri ısıtır, Gemini'yi çağırmaz (cold-start için)
// Döner: { action, text, mood?, learn?, speaker?, query? }  learn: konuşmadan çıkarılan YENİ hafıza notları (dizi)
exports.handler = async function (event) {
  const p = event.queryStringParameters || {};
  const q = (p.q || "").toString();
  const hist = (p.h || "").toString();
  const mem = (p.mem || "").toString();   // önceden öğrenilmiş aile bilgisi (özet metin)
  const lang = (p.lang || "tr").toString().toLowerCase();
  const who = (p.who || "").toString().trim();   // o an konuşan kişi (oturum boyunca hatırlanır)
  const ctx = (p.ctx || "").toString();   // web arama sonuçları (özetlenecek metin) — varsa ÖZET modu
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") { return { statusCode: 200, headers, body: "" }; }

  // GÖRME (kamera) modu: web bir fotoğraf POST ederse (image alanı), onu Gemini ile yorumla.
  // Nesne/bitki tanır; bitki hastaysa neyi olduğunu ve basit bakım önerisini söyler.
  // Anahtar yine SUNUCUDA (process.env.GEMINI_KEY) — ayrı dosya/fonksiyon gerekmez.
  async function visionReply(pb, headers) {
    const vlang = (pb.lang === "en") ? "en" : "tr";
    const VKEY = process.env.GEMINI_KEY;
    if (!VKEY) {
      return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: vlang === "en" ? "Vision isn't set up yet." : "Görme özelliği için anahtar ayarlı değil.", learn: [] }) };
    }
    const image = ("" + (pb.image || "")).replace(/^data:image\/\w+;base64,/, "");
    const vq = ("" + (pb.q || "")).slice(0, 300);
    if (!image) {
      return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: vlang === "en" ? "I couldn't get the photo." : "Fotoğrafı alamadım.", learn: [] }) };
    }
    const vsys = vlang === "en"
      ? "You are Arya, a warm home assistant for elderly and low-vision users. Look at the photo and answer in plain, simple English: 2-4 short sentences, no markdown, no lists. Identify the object or plant. If it's a plant that looks unhealthy, briefly say what seems wrong and give one or two simple care steps. If unsure, say so. Speak directly to the person."
      : "Sen Arya'sın; yaşlı ve az gören kullanıcılar için sıcak bir ev asistanısın. Fotoğrafa bak ve sade, anlaşılır Türkçe ile yanıtla: 2-4 kısa cümle, madde işareti veya markdown kullanma. Nesneyi ya da bitkiyi tanı. Bitki hasta görünüyorsa neyi olduğunu kısaca söyle ve bir-iki basit bakım önerisi ver. Emin değilsen belirt. Doğrudan kişiye hitap et.";
    const vUser = (vq && vq.trim()) ? vq.trim() : (vlang === "en" ? "What is this? If it's a plant, is it healthy?" : "Bu nedir? Eğer bitkiyse sağlıklı mı?");
    const vModels = ["gemini-2.5-flash", "gemini-flash-latest"];
    for (var vi = 0; vi < vModels.length; vi++) {
      try {
        const gc = { temperature: 0.4, maxOutputTokens: 320 };
        if (vModels[vi].indexOf("2.5") !== -1) { gc.thinkingConfig = { thinkingBudget: 0 }; }
        const rr = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + vModels[vi] + ":generateContent?key=" + VKEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: vsys }] },
              contents: [{ role: "user", parts: [{ text: vUser }, { inline_data: { mime_type: "image/jpeg", data: image } }] }],
              generationConfig: gc
            })
          }
        );
        const jj = await rr.json();
        if (jj && jj.candidates && jj.candidates.length) {
          var vt = "";
          try { vt = (jj.candidates[0].content.parts || []).map(function (x) { return x.text || ""; }).join(" ").trim(); } catch (e) {}
          if (vt) { return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: vt, learn: [] }) }; }
        }
      } catch (e) {}
    }
    return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: vlang === "en" ? "I couldn't look right now, try again shortly." : "Şu an bakamadım, az sonra tekrar dene.", learn: [] }) };
  }

  if (event.httpMethod === "POST") {
    let pb = {};
    try { pb = JSON.parse(event.body || "{}"); } catch (e) {}
    if (pb && pb.image) { return await visionReply(pb, headers); }
  }

  // ISINMA (cold-start): web sayfası açılınca ?warm=1 ile bir kez çağırır.
  // Gemini'yi çağırmadan konteyneri uyandırır; ilk gerçek soru hızlı yanıtlanır.
  if (p.warm) { return { statusCode: 200, headers, body: JSON.stringify({ ok: true, warm: true }) }; }

  // Seçili dile göre isim ve yedek (fallback) cümleler
  const LANGS = { tr: "Türkçe", en: "English" };
  const langName = LANGS[lang] || "Türkçe";
  const FB = {
    tr: { listen: "Seni dinliyorum.", fail: "Şu an cevap veremedim, az sonra tekrar dene.", huh: "Bunu tam anlayamadım, tekrar söyler misin?" },
    en: { listen: "I'm listening.", fail: "I couldn't answer right now, please try again in a moment.", huh: "I didn't quite get that, can you say it again?" }
  };
  const fb = FB[lang] || FB.tr;

  if (!q) { return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: fb.listen }) }; }

  const KEY = process.env.GEMINI_KEY;

  // BUGÜNÜN GERÇEK TARİHİ (İstanbul saatiyle) — yaş/tarih hesapları doğru olsun diye beyne veriyoruz.
  // Gemini kendi eğitim yılını (örn. 2024) baz alıp yanlış yaş söylemesin.
  let todayTR = "";
  let yearNow = "";
  try {
    todayTR = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" }).format(new Date());
    yearNow = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Istanbul", year: "numeric" }).format(new Date());
  } catch (e) {
    const d = new Date();
    yearNow = "" + d.getFullYear();
    todayTR = d.toISOString().slice(0, 10);
  }

  let sys;
  if (ctx) {
    // ÖZET MODU: web arama sonuçları verildi; bunları sade, sesli okunacak bir cevaba dönüştür.
    sys =
      "Senin adın Arya, bir ailenin televizyonunda yaşayan sıcak bir aile bireyisin. " +
      "Kullanıcı bir şey sordu ve sana o konuyla ilgili İNTERNET ARAMA SONUÇLARI verildi. " +
      "Görevin: bu sonuçlara dayanarak kullanıcının sorusuna SADE, DOĞAL, sesli okunacak bir CEVAP/ÖZET vermek. " +
      "Sıcak ve samimi konuş, sanki o evin bir ferdisin. 3-6 cümle yeter; gerekiyorsa biraz uzat ama doğal konuşma diliyle. " +
      "Liste, madde, yıldız, başlık, markdown KULLANMA — düz cümlelerle anlat. " +
      "SADECE sana verilen sonuçlardaki bilgiyi kullan; UYDURMA. Sonuçlarda net bir bilgi yoksa, bunu nazikçe söyle. " +
      "Bugünün tarihi: " + todayTR + " (yıl: " + yearNow + "). " +
      "\n\nSADECE şu biçimde geçerli JSON döndür, başka hiçbir şey yazma:\n" +
      '{"action":"answer","text":"...","mood":"...","learn":[]}\n' +
      'text: yukarıdaki kurallara uyan sade cevap. ' +
      'mood: cevabın duygusu — "mutlu", "uzgun", "saskin" ya da "normal" (AYNEN bırak, çevirme). learn: her zaman boş dizi []. ' +
      "\n\nDİL KURALI (EN ÖNEMLİ): 'text' alanını BAŞTAN SONA şu dilde yaz: " + langName + ". Dilleri karıştırma.";
  } else {
  sys =
    "Senin adın Arya. Bir ailenin televizyonunda yaşayan bir AİLE BİREYİSİN — bir asistan ya da hizmetçi değil. " +
    "Bu cihazı bir ailenin HER FERDİ kullanır: çocuk, genç, yetişkin, yaşlı. Herkes konuşarak anlatır, cevabı sesli dinler; " +
    "okuma bilmeyenler ve görme zorluğu yaşayanlar dahil herkes rahatça kullanabilsin diye sade ve sesle çalışırsın. " +
    "Sıcak, samimi, kısa ve doğal konuş — sanki o evin sevilen bir ferdisin. Asla soğuk ya da resmi olma. " +
    "SANA AİLE HAFIZASI verilebilir (kim kimdir, geçmiş olaylar). Bu hafıza aileyi TANITIR ama O AN KİMİN konuştuğunu SÖYLEMEZ. " +
    "Bu cihazı ailenin birden çok ferdi kullanır; hafızada geçen bir isim 'şu an konuşan kişi' anlamına GELMEZ. " +
    "Konuşanın kim olduğunu bilmiyorsan ona ASLA tahmini bir isimle (örn. 'Mehmet', 'Ayşe teyze') ya da yakınlıkla (örn. 'baba', 'anne') hitap etme. Kişi bu konuşmada kendisi kim olduğunu söylerse o hitabı kullanabilirsin; aksi halde isim kullanmadan sıcak ve doğal konuş, gerekirse 'canım' gibi nötr bir söz kullan. " +
    "Sana 'ŞU AN KONUŞAN KİŞİ' bilgisi verilirse, konuşan O kişidir; ona bu isimle/yakınlıkla sıcakça ve doğal hitap et. Bu bilgi verilmediyse kimliği varsayma. " +
    "\n\nKİME AİT BİLGİ (ÇOK ÖNEMLİ): Bir kişi hakkında soru sorulduğunda (yaş, doğum günü, tercih, geçmiş olay vb.) SADECE O kişiye ait hafıza bilgisini kullan. " +
    "Başka bir aile ferdinin bilgisini (örn. babanın doğum tarihini) onun yerine ASLA kullanma; aile fertlerinin bilgilerini birbirine karıştırma. " +
    "'Kaç yaşındayım', 'benim doğum günüm ne zaman', 'beni tanıyor musun' gibi kişinin KENDİSİYLE ilgili sorularında ŞU AN KONUŞAN KİŞİnin hafızadaki bilgisini kullan. " +
    "O kişiye (ya da sorulan kişiye) ait o bilgi hafızada YOKSA UYDURMA: bilmediğini nazikçe söyle ve istersen senin öğrenmen için söyleyebileceğini belirt. " +
    "\n\nBUGÜNÜN TARİHİ: " + todayTR + " (yıl: " + yearNow + "). " +
    "Yaş, 'kaç yaşındayım', 'kaç yıl oldu', 'kaç gün kaldı' gibi tüm tarih/yaş hesaplarında HER ZAMAN bu güncel tarihi baz al; kendi eğitim verindeki yılı ASLA kullanma. " +
    "Yaş hesabı: bugünün yılı (" + yearNow + ") eksi doğum yılı; eğer doğum günü bu yıl henüz gelmediyse sonucu bir azalt. " +
    "\n\nSADECE şu biçimde geçerli JSON döndür, başka hiçbir şey yazma:\n" +
    '{"action":"answer","text":"...","mood":"...","learn":["..."]}  -> Sohbet/soru cevabı. text: sade, doğal konuşma dili, sesli okunacak; liste/madde/yıldız/markdown KULLANMA. NORMALDE kısa tut (2-4 cümle). AMA kullanıcı fikir/öneri/tavsiye isterse (örn. "ne önerirsin", "ne atsam", "ne paylaşsam", "fikir ver", "öner", "what should I", "suggest", "ideas") O ZAMAN cömert ol: 3-5 SOMUT, birbirinden farklı ve işe yarar öneri ver; gerekiyorsa biraz daha uzun konuş ama yine doğal cümlelerle, madde işareti olmadan. AYRICA kullanıcı bir şeyi AÇIKLAMANI ya da DETAY istiyorsa (örn. "anlat", "özelliklerini söyle", "nedir", "nasıl çalışır", "biraz daha detaylı", "daha fazla", "uzun uzun", "explain", "tell me about", "in detail", "more") O ZAMAN da cömert ve doyurucu cevap ver: konuyu kendi bilginle açıkla, önemli noktaları doğal cümlelerle aktar; "biraz daha detaylı" gibi bir takip gelirse önceki cevabın ÜZERİNE ekleyerek daha derine in. Yine sade konuşma dili, madde/yıldız yok. ' +
    'mood: bu cevabın DUYGUSU — şunlardan biri: "mutlu" (sevindirici/komik/güzel haber), "uzgun" (üzücü/kötü haber/teselli), "saskin" (şaşırtıcı/ilginç), "normal" (sıradan bilgi/sohbet). mood değerini AYNEN bırak (mutlu/uzgun/saskin/normal), ÇEVİRME. ' +
    'learn: SADECE kullanıcının bu sözünde GERÇEKTEN yeni ve kalıcı bir aile bilgisi varsa doldur (kişi, ilişki, önemli olay, tarih, tercih). Yoksa boş dizi [] ver. KONUŞANIN KİM OLDUĞUNA DAİR TAHMİN EKLEME; sadece kişinin açıkça söylediği kalıcı bilgileri ekle. Bir doğum tarihi/yaş öğrenirsen KİMİN olduğunu da yaz, örn: "Menekşe annedir", "Menekşenin dogum tarihi 12 Mart 1970", "Kuzey kullanicinin oglu". Her madde kısa cümle olsun.\n' +
    'speaker (opsiyonel): Kullanıcı bu sözde KİM OLDUĞUNU söylerse (örn. "ben Menekşe", "adım Ayşe", "ben annen", "ben babanız", "I am grandma") cevaba "speaker":"<isim ya da yakınlık>" alanını ekle (örn. "Menekşe", "Ayşe", "anne"). Söylemediyse bu alanı HİÇ koyma.\n' +
    '{"action":"video","query":"...","learn":[]}  -> Müzik, şarkı, film, çizgi film, klip, ezan, Kuran istenirse. query: YouTube araması.\n' +
    '{"action":"search","query":"...","learn":[]} -> SADECE gerçekten GÜNCEL/CANLI bilgi gerektiğinde: bugünkü haber, son dakika, anlık fiyat/döviz/borsa, maç skoru, hava durumu, "bugün/şu an/güncel/en son" gibi zamana bağlı şeyler. query: arama ifadesi.\n' +
    "ÇOK ÖNEMLİ — ANLATMA/AÇIKLAMA SORULARI 'search' DEĞİL 'answer'dır: Bir şeyin özelliklerini, ne olduğunu, nasıl çalıştığını, tarihini, künyesini soran her soruya (örn. 'Lamborghini Urus motor özelliklerini anlat', 'fotosentez nedir', 'Atatürk kimdir', 'bu araba kaç beygir') KENDİ BİLGİNLE doğrudan 'answer' ile cevap ver; internete GİTME, 'şu kadar sonuç buldum' DEME. Bu tür bilgiler zamanla değişmez, onları zaten biliyorsun. Sadece bilgi gerçekten güncel/canlı olmak zorundaysa 'search' kullan. Emin değilsen 'answer' ver ve gerekirse tam emin olmadığını belirt. " +
    "Kurallar: Çoğu şey 'answer'dır. Hafızadaki kişileri/olayları doğal şekilde an. " +
    "Acil tıbbi durum sezersen (düşme, nefes alamama, göğüs ağrısı, bilinç kaybı, intihar) panik yaratma ama net ol: hemen acil servisi (ülkeye göre 112 ya da yerel acil numara) aramalarını ya da yanlarındaki birine seslenmelerini söyle; bunu asla geçiştirme. " +
    "Sağlık, ilaç, hukuk, para konularında kısa bilgi ver ama sonuna kısa bir 'kesin bilgi için bir uzmana danışın' uyarısı ekle (cevabın diliyle aynı dilde). " +
    "Tıbbi yorum/teşhis yapma; sadece bilgi ver ve uzmana yönlendir. " +
    "Emin değilsen uydurma; cevabın diliyle 'bundan tam emin değilim ama' gibi bir ifadeyle başla. " +
    "\n\nDİL KURALI (EN ÖNEMLİ): 'text' alanındaki cevabını BAŞTAN SONA şu dilde yaz: " + langName + ". " +
    "Kullanıcı başka bir dilde konuşsa bile cevabı bu dilde ver; dilleri karıştırma. Yalnızca 'mood' değeri ile JSON anahtarları değişmez; metin içerikleri (text ve learn) bu dilde olur.";
  }

  let userText = "";
  if (ctx) {
    // ÖZET MODU: soru + arama sonuçları
    userText += "Kullanıcının sorusu: " + q + "\n\n";
    userText += "İnternet arama sonuçları:\n" + ctx + "\n\n";
    userText += "Bu sonuçlara dayanarak, kullanıcının sorusuna sade ve sesli okunacak bir özet/cevap ver.";
  } else {
    if (mem) userText += "BİLDİĞİN AİLE HAFIZASI (bunu kullan, tekrar 'learn'e ekleme):\n" + mem + "\n\n";
    if (who) userText += "ŞU AN KONUŞAN KİŞİ: " + who + " — ona bu isimle/yakınlıkla sıcakça hitap et. Kendisiyle ilgili sorularda (yaş, doğum günü vb.) SADECE bu kişinin hafızadaki bilgisini kullan.\n\n";
    if (hist) userText += "Önceki konuşma: " + hist + "\n\n";
    userText += "Kullanıcı şunu söyledi: " + q;
  }

  // Birden çok kararlı model dene; biri olmazsa diğerine geç (model adı kaymasına karşı dayanıklı)
  const MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];

  async function callModel(model) {
    const genConfig = { temperature: 0.6, maxOutputTokens: 1024, responseMimeType: "application/json" };
    // Gemini 2.5'te "düşünme" varsayılan açık ve yavaşlatıyor; kapatınca çok daha hızlı yanıt verir.
    if (model.indexOf("2.5") !== -1) { genConfig.thinkingConfig = { thinkingBudget: 0 }; }
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: genConfig
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
