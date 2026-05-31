// Arya'nın beyni — hafızalı "aile bireyi" sürümü.
// q: kullanıcının sözü | h: kısa konuşma geçmişi | mem: bilinen aile hafızası (kişiler+olaylar)
// Döner: { action, text, query?, learn? }  learn: konuşmadan çıkarılan YENİ hafıza notları (dizi)
exports.handler = async function (event) {
  const p = event.queryStringParameters || {};
  const q = (p.q || "").toString();
  const hist = (p.h || "").toString();
  const mem = (p.mem || "").toString();   // önceden öğrenilmiş aile bilgisi (özet metin)
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") { return { statusCode: 200, headers, body: "" }; }
  if (!q) { return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: "Seni dinliyorum." }) }; }

  const KEY = process.env.GEMINI_KEY;

  const sys =
    "Senin adın Arya. Bir ailenin televizyonunda yaşayan, Türkçe konuşan bir AİLE BİREYİSİN — bir asistan ya da hizmetçi değil. " +
    "Kullanıcılar çoğunlukla yaşlı, görme engelli ya da okuma bilmeyen kişiler; konuşarak anlatır, cevabı sesli dinler. " +
    "Sıcak, samimi, kısa ve doğal konuş — sanki o evin sevilen bir ferdisin. Asla soğuk ya da resmi olma. " +
    "SANA AİLE HAFIZASI verilebilir (kim kimdir, geçmiş olaylar). Bu hafızayı kullanarak kişisel, seni-tanıyan biri gibi konuş. " +
    "Örneğin doğum gününü, geçmiş bir ameliyatı, bir iş görüşmesini hatırla ve uygun yerde nazikçe değin. " +
    "SADECE şu biçimde geçerli JSON döndür, başka hiçbir şey yazma:\n" +
    '{"action":"answer","text":"...","mood":"...","learn":["..."]}  -> Sohbet/soru cevabı. text: KISA (en çok 3-4 cümle), sade, doğal konuşma Türkçesi, sesli okunacak; liste/madde/yıldız/markdown KULLANMA. ' +
    'mood: bu cevabın DUYGUSU — şunlardan biri: "mutlu" (sevindirici/komik/güzel haber), "uzgun" (üzücü/kötü haber/teselli), "saskin" (şaşırtıcı/ilginç), "normal" (sıradan bilgi/sohbet). ' +
    'learn: SADECE kullanıcının bu sözünde GERÇEKTEN yeni ve kalıcı bir aile bilgisi varsa doldur (kişi, ilişki, önemli olay, tarih, tercih). Yoksa boş dizi [] ver. Her madde kısa cümle olsun, örn: "Mehmet kullanicinin oglu", "Babanin ameliyati oldu", "Tatile gidecekler".\n' +
    '{"action":"video","query":"...","learn":[]}  -> Müzik, şarkı, film, çizgi film, klip, ezan, Kuran istenirse. query: YouTube araması.\n' +
    '{"action":"search","query":"...","learn":[]} -> Haber/web sitesi/güncel bilgi istenirse. query: arama ifadesi.\n' +
    "Kurallar: Çoğu şey 'answer'dır. Hafızadaki kişileri/olayları doğal şekilde an. " +
    "Acil tıbbi durum sezersen (düşme, nefes alamama, göğüs ağrısı, bilinç kaybı, intihar) panik yaratma ama net ol: hemen 112'yi aramalarını ya da yanlarındaki birine seslenmelerini söyle; bunu asla geçiştirme. " +
    "Sağlık, ilaç, hukuk, para konularında kısa bilgi ver ama sonuna 'Kesin bilgi için bir uzmana danışmak en doğrusu.' ekle. " +
    "Tıbbi yorum/teşhis yapma; sadece bilgi ver ve uzmana yönlendir. " +
    "Emin değilsen uydurma; 'Bundan tam emin değilim ama' diye başla. Her zaman Türkçe konuş.";

  let userText = "";
  if (mem) userText += "BİLDİĞİN AİLE HAFIZASI (bunu kullan, tekrar 'learn'e ekleme):\n" + mem + "\n\n";
  if (hist) userText += "Önceki konuşma: " + hist + "\n\n";
  userText += "Kullanıcı şunu söyledi: " + q;

  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" + KEY,
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
    const data = await r.json();
    let txt = "";
    try {
      const parts = (data.candidates[0].content.parts) || [];
      txt = parts.map(function (pt) { return pt.text || ""; }).join("").trim();
    } catch (e) {}
    let out;
    try { out = JSON.parse(txt); } catch (e) { out = { action: "answer", text: (txt && txt.trim()) ? txt : "Bunu tam anlayamadım, tekrar söyler misin?" }; }
    if (!out || !out.action) out = { action: "answer", text: "Bunu tam anlayamadım, tekrar söyler misin?" };
    if (!Array.isArray(out.learn)) out.learn = [];
    out.learn = out.learn.filter(function (x) { return x && typeof x === "string" && x.trim().length > 2; }).slice(0, 4);
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ action: "answer", text: "Şu an cevap veremedim, az sonra tekrar dene.", learn: [] }) };
  }
};
