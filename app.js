import { SUPABASE_URL, SUPABASE_ANON_KEY, UPGRADE_URL } from "./config.js";
import { createSupabaseBackend, createDemoBackend } from "./backend.js";

const $ = id => document.getElementById(id);
const st = { points: null, user: null, isPro: false, agents: [], usage: {}, jobs: [], sel: null, cat: "all", timer: null };
const CATS = [["all", "الكل"], ["image", "صور"], ["video", "فيديو"], ["model3d", "3D"], ["text", "نصوص"]];

// بلا إعداد = وضع تجريبي محلي (يخدم فوراً). بعد وضع مفاتيح Supabase في config.js = النسخة الحقيقية.
let be;
if (SUPABASE_URL.startsWith("PASTE")) be = createDemoBackend();
else {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  be = createSupabaseBackend(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
}
if (be.demo) $("demo").hidden = false;

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };
const safeUrl = u => /^(https:\/\/|data:image\/)/.test(u || "") ? u : "";

function showUpgrade(msg) {
  const box = $("upactions"); box.replaceChildren();
  $("upmsg").textContent = msg;
  if (UPGRADE_URL) box.append(el("a", { className: "btn primary", href: UPGRADE_URL, target: "_blank", rel: "noopener", textContent: "اشترك الآن" }));
  else if (be.demo) {
    $("upmsg").textContent = msg + " — في الوضع التجريبي تقدر تجرّب بريميوم مجاناً.";
    box.append(el("button", { className: "primary", textContent: "جرّب PRO (تجريبي)", onclick: () => { be.setPro(true); $("upgrade").close(); load(); } }));
  } else $("upmsg").textContent = msg + " — الاشتراك سيُفتح قريباً.";
  box.append(el("button", { textContent: "إغلاق", onclick: () => $("upgrade").close() }));
  $("upgrade").showModal();
}

function renderUser() {
  const b = $("userbox"); b.replaceChildren();
  if (st.user) {
    if (st.points != null) b.append(el("span", { className: "plan pro", textContent: "💎 " + st.points.toLocaleString("en-US") }));
    b.append(el("span", { className: "muted", textContent: st.user.email }));
    b.append(el("button", { textContent: "خروج", onclick: () => be.signOut() }));
  } else b.append(el("button", { className: "primary", textContent: "دخول / تسجيل", onclick: () => $("auth").showModal() }));
}

function renderChips() {
  const c = $("chips"); c.replaceChildren();
  for (const [k, label] of CATS) c.append(el("button", { className: "chip" + (st.cat === k ? " on" : ""), textContent: label, onclick: () => { st.cat = k; renderChips(); renderAgents(); } }));
}

function agentState(a) {
  const u = st.usage[a.id];
  const premium = a.tier === "premium";
  const locked = premium && !st.isPro;
  const limit = u ? u.daily_limit : (st.isPro ? a.pro_daily : a.free_daily);
  const used = u ? u.used : 0;
  return { premium, locked, limit, used, left: Math.max(0, limit - used) };
}

function renderAgents() {
  const g = $("agents"); g.replaceChildren();
  for (const a of st.agents.filter(x => st.cat === "all" || x.type === st.cat)) {
    const s = agentState(a);
    const info = s.locked ? "للمشتركين فقط" : st.user ? `متبقي اليوم: ${s.left} / ${s.limit}` : `${s.limit} يومياً مجاناً`;
    const c = el("div", { className: "agent" + (st.sel === a.id ? " on" : "") + (s.locked ? " locked" : "") },
      el("div", { className: "ic", textContent: a.icon }),
      el("b", { textContent: a.name }), el("small", { textContent: a.description || "" }),
      el("div", {}, el("span", { className: "tag " + (s.premium ? "tag-pro" : "tag-free"), textContent: s.premium ? "👑 بريميوم" : "مجاني" })),
      el("span", { className: "left", textContent: info }));
    c.onclick = () => {
      if (s.locked) return showUpgrade(`«${a.name}» متاح للمشتركين فقط.`);
      st.sel = a.id; $("vopts").hidden = a.type !== "video"; $("sel").textContent = `الوكيل: ${a.icon} ${a.name}`; renderAgents();
    };
    g.append(c);
  }
}


// دمج المقاطع في فيديو واحد داخل المتصفح (ffmpeg.wasm). قد يفشل إن منع المتصفح تحميل المقاطع (CORS).
// ===== فيديو قصة مصوّرة: صور 3D مجانية + حركة كاميرا + كلمات عربية، تُركَّب في فيديو واحد داخل المتصفح =====
const STORY_STYLES = {
  story_video:   { art: "cute 3D animated children's movie style, Pixar style, adorable characters with big expressive eyes, vibrant colors, soft cinematic lighting, highly detailed, ", plan: "a cute kids' adventure story" },
  story_anime:   { art: "anime style illustration, studio quality, vibrant colors, detailed background, cinematic composition, ", plan: "an emotional anime adventure story" },
  story_cartoon: { art: "classic 2D cartoon style for kids, bold clean outlines, flat bright colors, cheerful, ", plan: "a funny cartoon story for kids" },
  story_fairy:   { art: "magical fairy tale storybook illustration, soft watercolor, warm glowing light, whimsical, ", plan: "a magical fairy tale" },
  story_animals: { art: "cute 3D animated animals, Pixar style, fluffy fur, expressive faces, lush nature, vibrant colors, ", plan: "an adventure of friendly animals" },
  story_moral:   { art: "warm children's picture book illustration, gentle colors, friendly characters, ", plan: "a short story that teaches a good value such as honesty, sharing or kindness, ending with the lesson" },
  story_edu:     { art: "colorful educational illustration for kids, simple big shapes, bright clean background, cheerful, ", plan: "a fun lesson that teaches children one simple concept (letters, numbers, colors or shapes) step by step" },
  story_space:   { art: "cinematic sci-fi space scene, glowing planets and stars, dramatic lighting, highly detailed, ", plan: "an exciting space journey" },
  story_cinema:  { art: "cinematic photorealistic film still, dramatic lighting, shallow depth of field, 35mm, highly detailed, ", plan: "a short cinematic story" },
  story_ad:      { art: "professional commercial product photography, studio lighting, clean elegant background, premium advertising shot, ", plan: "a short product commercial: each scene shows a different benefit or angle of the product" },
};
const untainted = d => { try { const c = document.createElement("canvas"); c.width = c.height = 2; const x = c.getContext("2d"); x.drawImage(d, 0, 0, 2, 2); x.getImageData(0, 0, 1, 1); return true; } catch { return false; } };
async function toDrawable(img) {
  try { await img.decode?.(); } catch {}
  const s = img.src || "";
  if ((s.startsWith("data:") || s.startsWith("blob:")) && untainted(img)) return img;
  const tries = [
    async () => (await fetch(s)).blob(),                                   // مباشرة إن سمح الخادم (CORS)
    async () => (await window.puter.net.fetch(s)).blob(),                   // عبر Puter (يتجاوز CORS)
  ];
  for (const t of tries) {
    try { const bm = await createImageBitmap(await t()); if (untainted(bm)) return bm; } catch {}
  }
  const im = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = s; }).catch(() => null);
  if (im && untainted(im)) return im;
  throw new Error("cors");
}
function wrapText(ctx, text, maxW) {
  const words = text.split(/\s+/), lines = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
async function renderStory(imgs, caps, W, H, per, onProgress) {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const mime = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("المتصفح لا يدعم تسجيل الفيديو");
  const stream = cv.captureStream(30);
  let actx = null;
  try {   // موسيقى هادئة مولَّدة برمجياً (بلا حقوق) وتُسجَّل داخل الفيديو
    actx = new (window.AudioContext || window.webkitAudioContext)(); await actx.resume();
    const dest = actx.createMediaStreamDestination(); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const notes = [261.63, 293.66, 329.63, 392, 440, 523.25, 392, 329.63], t0a = actx.currentTime + 0.1, secs = per * imgs.length;
    for (let i = 0, tt = 0; tt < secs; i++, tt += 0.5) {
      const o = actx.createOscillator(), g = actx.createGain(), f = notes[(i * 3 + (i >> 2)) % notes.length] * (i % 8 === 7 ? 2 : 1);
      o.type = "triangle"; o.frequency.value = f; o.connect(g); g.connect(dest);
      const t = t0a + tt; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.start(t); o.stop(t + 1);
      if (i % 4 === 0) { const b = actx.createOscillator(), bg = actx.createGain(); b.type = "sine"; b.frequency.value = notes[(i >> 2) % 3] / 2; b.connect(bg); bg.connect(dest); bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.06, t + 0.08); bg.gain.exponentialRampToValueAtTime(0.0001, t + 2); b.start(t); b.stop(t + 2.1); }
    }
  } catch { actx = null; }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => (rec.onstop = r));
  const dur = per * 1000, fade = 700, total = dur * imgs.length;
  const drawImg = (img, k, p, alpha) => {
    const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
    const sc = Math.max(W / iw, H / ih) * (1.04 + 0.14 * (k % 2 ? 1 - p : p));
    const dx = (k % 3 - 1) * 26 * (p - 0.5), dy = (k % 2 ? -1 : 1) * 20 * (p - 0.5);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (W - iw * sc) / 2 + dx, (H - ih * sc) / 2 + dy, iw * sc, ih * sc);
    ctx.globalAlpha = 1;
  };
  const caption = txt => {
    if (!txt) return;
    const fs = Math.round(W * 0.058); ctx.font = `bold ${fs}px sans-serif`; ctx.direction = "rtl"; ctx.textAlign = "center";
    const lines = wrapText(ctx, txt, W * 0.84), lh = fs * 1.35, bh = lines.length * lh + fs, y0 = H - bh - H * 0.06;
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(W * 0.05, y0, W * 0.9, bh);
    ctx.fillStyle = "#fff"; lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + fs * 0.95 + i * lh));
  };
  let lock = null; try { lock = await navigator.wakeLock?.request("screen"); } catch {}
  rec.start();
  let t = 0, last = performance.now();
  await new Promise(done => {
    const frame = () => {
      const now = performance.now(); t += Math.min(now - last, 100); last = now;   // لا نحسب وقت غياب الصفحة عن الشاشة
      if (t >= total) return done();
      const i = Math.min(imgs.length - 1, Math.floor(t / dur)), local = t - i * dur;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      drawImg(imgs[i], i, local / dur, 1);
      if (local > dur - fade && imgs[i + 1]) drawImg(imgs[i + 1], i + 1, 0, (local - (dur - fade)) / fade);
      caption(caps[i]);
      onProgress?.(Math.round((t / total) * 100));
      requestAnimationFrame(frame);
    };
    frame();
  });
  rec.stop(); await stopped; try { lock?.release(); } catch {} try { actx?.close(); } catch {}
  const type = mime.split(";")[0];
  const blob = new Blob(chunks, { type });
  if (blob.size < 60000) throw new Error("الفيديو الناتج فارغ");
  return { url: URL.createObjectURL(blob), ext: type === "video/mp4" ? "mp4" : "webm" };
}
async function storyVideo(j, r, w, P, textOf, toEnglish, fail) {
  const n = Math.max(3, Math.min(25, Math.round((r.total || 30) / 6))), per = Math.round((r.total || 30) / n);
  const show = m => { w.className = "muted"; w.textContent = m; };
  const vertical = r.size !== "1280x720", W = vertical ? 720 : 1280, H = vertical ? 1280 : 720;
  try {
    show(`أكتب القصة (${n} مشاهد)…`);
    let scenes = [];
    try {
      const raw = textOf(await P.chat([{ role: "system", content: `You write storyboards for short videos. The video is ${(STORY_STYLES[r.style] || STORY_STYLES.story_video).plan}. Return ONLY a JSON array of exactly ${n} objects {"en":"one-sentence English image prompt for the scene; describe the main character or product identically in every scene","ar":"one short Arabic narration sentence for this scene"}. It has a beginning, a middle and a good ending.` }, { role: "user", content: r.prompt }]));
      scenes = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
    } catch {}
    if (!Array.isArray(scenes) || scenes.length < 2) { const idea = await toEnglish(r.prompt); scenes = Array.from({ length: n }, (_, k) => ({ en: `${idea}, scene ${k + 1}`, ar: "" })); }
    scenes = scenes.slice(0, n);
    const imgs = [], caps = [], raws = []; let corsFail = false, usePoll = false;
    const STYLE_ART = (STORY_STYLES[r.style] || STORY_STYLES.story_video).art;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const getImg = async prompt => {
      if (!usePoll) {
        try { return await P.txt2img(prompt, { model: "black-forest-labs/flux-schnell" }); }
        catch (e) {
          const m = e?.error?.message || e?.message || e?.code || "";
          if (!/credit|fund|balance|insufficient|billing/i.test(String(m))) throw e;
          usePoll = true; show("رصيد Puter خلص، أستعمل الخدمة البديلة (أبطأ: صورة كل 45 ثانية). لا تغلق الصفحة.");
        }
      }
      await sleep(window.__POLL_PAUSE ?? 46000);
      return await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("الخدمة البديلة مشغولة")); i.src = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${vertical ? 576 : 1024}&height=${vertical ? 1024 : 576}&seed=${Math.floor(Math.random() * 1e9)}&nologo=true`; });
    };
    for (let k = 0; k < scenes.length; k++) {
      show(`أرسم المشهد ${k + 1} / ${scenes.length}… لا تغلق الصفحة ولا تطفئ الشاشة.`);
      try {
        const img = await getImg(STYLE_ART + String(scenes[k].en || scenes[k]));
        raws.push(img);
        try { imgs.push(await toDrawable(img)); caps.push(String(scenes[k].ar || "")); } catch { corsFail = true; }
      } catch (e) {
        if (imgs.length < 2) return fail("فشل رسم المشاهد: " + (e?.error?.message || e?.message || e?.code || "خطأ") + ".");
        break;
      }
    }
    if (imgs.length < 2) {
      w.className = "";
      w.replaceChildren(el("div", { className: "err", textContent: "تعذّر تركيب الفيديو تلقائياً: المتصفح يمنع قراءة الصور المولّدة. الصور جاهزة للتحميل أدناه." }),
        ...raws.map((im, k) => el("div", {}, Object.assign(im, { style: "max-width:100%;border-radius:10px" }), el("a", { href: im.src, target: "_blank", rel: "noopener", download: `scene_${k + 1}.png`, textContent: ` تحميل المشهد ${k + 1}` }))));
      return;
    }
    show(`جارٍ تركيب الفيديو (${imgs.length * per} ثانية)… 0%. لا تغلق الصفحة ولا تطفئ الشاشة.`);
    const out = await renderStory(imgs, caps, W, H, per, p => (w.textContent = `جارٍ تركيب الفيديو… ${p}%. لا تغلق الصفحة ولا تطفئ الشاشة.`));
    const vid = el("video", { src: out.url, controls: true, loop: true, playsInline: true, style: "max-width:100%;border-radius:10px;display:block" });
    w.className = ""; w.replaceChildren(vid, el("a", { href: out.url, download: `story_video.${out.ext}`, className: "btn primary", textContent: "⬇️ تحميل الفيديو الكامل" }),
      el("div", { className: "muted", textContent: "الفيديو مؤقت في المتصفح: حمّله الآن." }));
    be.setResult?.(j.id, { kind: "text", text: "✔ تم تركيب الفيديو. الفيديو لا يُحفظ بعد إغلاق الصفحة، لذلك حمّله فور الانتهاء." });
  } catch (e) { fail("فشل التوليد: " + (e?.message || e) + "."); }
}

let _ff;
async function loadFFmpeg(status) {
  if (_ff) return _ff;
  const load = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.append(s); });
  status("تحميل أداة الدمج (مرة واحدة، حوالي 30MB)…");
  await load("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js");
  await load("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js");
  const { FFmpeg } = window.FFmpegWASM, { toBlobURL } = window.FFmpegUtil;
  const ff = new FFmpeg();
  const core = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";
  await ff.load({
    classWorkerURL: await toBlobURL("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js", "text/javascript"),
    coreURL: await toBlobURL(`${core}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${core}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return (_ff = ff);
}
async function mergeClips(urls, status) {
  const ff = await loadFFmpeg(status), { fetchFile } = window.FFmpegUtil;
  let list = "";
  for (let i = 0; i < urls.length; i++) {
    status(`تنزيل المقطع ${i + 1} / ${urls.length} للدمج…`);
    await ff.writeFile(`c${i}.mp4`, await fetchFile(urls[i]));
    list += `file 'c${i}.mp4'\n`;
  }
  await ff.writeFile("list.txt", list);
  status("جارٍ دمج المقاطع في فيديو واحد…");
  let code = await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "out.mp4"]);
  if (code !== 0) { status("إعادة الترميز (أبطأ)…"); code = await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "out.mp4"]); }
  if (code !== 0) throw new Error("ffmpeg " + code);
  const data = await ff.readFile("out.mp4");
  return URL.createObjectURL(new Blob([data.buffer], { type: "video/mp4" }));
}

function playlist(urls, auto = false) {
  const box = el("div", {});
  const v = el("video", { src: urls[0], controls: true, playsInline: true, style: "max-width:100%;border-radius:10px" });
  let i = 0;
  const label = el("div", { className: "muted", textContent: `المقطع 1 / ${urls.length}` });
  v.onended = () => { if (i + 1 < urls.length) { i++; v.src = urls[i]; label.textContent = `المقطع ${i + 1} / ${urls.length}`; v.play().catch(() => {}); } };
  v.onerror = () => { label.className = "err"; label.textContent = "انتهت صلاحية روابط الفيديو. حمّل المقاطع فور ما تنتهي."; };
  const mergeBox = el("div", { className: "muted" });
  const doMerge = async () => {
    mergeBtn.disabled = true;
    try {
      const out = await mergeClips(urls, t => (mergeBox.textContent = t));
      mergeBox.replaceChildren(el("b", { textContent: "الفيديو الكامل جاهز:" }), el("video", { src: out, controls: true, playsInline: true, style: "max-width:100%;border-radius:10px;display:block;margin:6px 0" }),
        el("a", { href: out, download: "full_video.mp4", className: "btn primary", textContent: "تحميل الفيديو الكامل" }));
    } catch (e) { mergeBox.className = "err"; mergeBox.textContent = "تعذّر الدمج التلقائي (قيود المتصفح على روابط المقاطع). حمّل المقاطع منفصلة من الأسفل. (" + (e?.message || e) + ")"; mergeBtn.disabled = false; }
  };
  const mergeBtn = el("button", { className: "primary", textContent: "🔗 دمج المقاطع في فيديو واحد", onclick: doMerge });
  box.append(v, label, mergeBtn, mergeBox, el("div", { className: "row" }, ...urls.map((u, k) => el("a", { href: u, target: "_blank", rel: "noopener", download: `clip_${k + 1}.mp4`, textContent: `تحميل ${k + 1}` }))));
  if (auto) setTimeout(doMerge, 0);
  return box;
}

const imgCache = {};
// الصور المجانية عبر Puter.js: تُولَّد في متصفح المستخدم وتُحسب على حسابه المجاني عندهم (لا تكلفة عليك)
function puterMedia(j, r, force = false) {
  if (!force && imgCache[j.id]) return imgCache[j.id];
  // لا نولّد تلقائياً عند تحديث الصفحة أو لمهام قديمة (كان يستهلك الرصيد ويُظهر نافذة Puter كل مرة)
  let started = []; try { started = JSON.parse(localStorage.getItem("puter_started") || "[]"); } catch {}
  const age = Date.now() - (j.created_ts || Date.parse(j.created_at) || 0);
  if (!force && (started.includes(j.id) || age > 180000)) {
    const box = imgCache[j.id] = el("div", { className: "muted" }, "لم يُحفظ ناتج هذه المهمة. ",
      el("button", { textContent: "▶ إعادة التوليد (يستهلك رصيد Puter)", onclick: () => { const nw = puterMedia(j, r, true); box.replaceWith(nw); } }));
    return box;
  }
  if (!started.includes(j.id)) { started.push(j.id); try { localStorage.setItem("puter_started", JSON.stringify(started.slice(-300))); } catch {} }
  const w = imgCache[j.id] = el("div", { className: "muted", textContent: "جارٍ التوليد… (أول مرة قد تظهر نافذة لإنشاء حساب Puter مجاني، وافق عليها)" });
  const fail = msg => {
    const low = /credit|fund|balance|insufficient|billing/i.test(msg);
    w.className = "err";
    const kids = [low ? "رصيد Puter المجاني لحسابك خلص (حدّ من Puter وليس من التطبيق). " : msg + " ",
      el("button", { textContent: "إعادة المحاولة", onclick: () => { delete imgCache[j.id]; load(); } })];
    if (r.kind === "image") kids.push(el("button", { textContent: "🔁 خدمة بديلة مجانية (أبطأ وفيها علامة مائية)", onclick: () => {
      delete imgCache[j.id];
      be.setResult?.(j.id, { kind: "image", url: `https://image.pollinations.ai/prompt/${encodeURIComponent(r.prompt)}?width=768&height=768&seed=${Math.floor(Math.random() * 1e9)}&nologo=true` });
      load();
    } }));
    w.replaceChildren(...kids);
  };
  if (!window.puter) { fail("تعذر تحميل خدمة الصور."); return w; }
  const isVideo = r.kind === "video", isText = r.kind === "text";
  const P = window.puter.ai;
  const textOf = m => { const c = m?.message?.content ?? m?.text ?? m; return typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x.text || "").join("") : String(c); };
  // الوصف بالعربية: نترجمه للإنجليزية أولاً لأن نماذج الصور والفيديو تفهم الإنجليزية أحسن
  const toEnglish = async p => {
    if (!/[\u0600-\u06FF]/.test(p)) return p;
    try { return textOf(await P.chat([{ role: "system", content: "Translate the user's text to English. Output only the translation, nothing else." }, { role: "user", content: p }])).trim() || p; }
    catch { return p; }
  };
  if (r.story) { storyVideo(j, r, w, P, textOf, toEnglish, fail); return w; }
  if (isVideo && r.clips > 1) { longVideo(j, r, w, P, textOf, toEnglish, fail); return w; }
  const run = isText ? P.chat(r.system ? [{ role: "system", content: r.system }, { role: "user", content: r.prompt }] : r.prompt)
    : (async () => { const en = await toEnglish(r.prompt); return isVideo ? P.txt2vid(en, { model: "togetherai:wan-ai/wan2.7-t2v", ...(r.seconds ? { seconds: r.seconds } : {}), ...(r.size ? { size: r.size } : {}) }) : P.txt2img(en, { model: r.model || "black-forest-labs/flux-schnell" }); })();
  if (isVideo) w.textContent = "جارٍ توليد الفيديو… قد ياخذ من نصف دقيقة إلى بضع دقائق. ما تغلقش الصفحة.";
  run.then(m => {
    if (isText) {
      const text = textOf(m);
      w.className = ""; w.replaceChildren(el("pre", { textContent: text }));
      be.setResult?.(j.id, { kind: "text", text });
      return;
    }
    m.alt = j.prompt; m.style.maxWidth = "100%"; m.style.borderRadius = "10px";
    if (isVideo) { m.controls = true; m.loop = true; }
    const src = String(m.src || m);
    w.className = ""; w.replaceChildren(m, el("a", { href: src, target: "_blank", rel: "noopener", textContent: " فتح / تحميل" }));
    if (src.startsWith("https://") || (src.startsWith("data:image/") && src.length < 700000)) be.setResult?.(j.id, { kind: r.kind, url: src });
  }).catch(e => fail("فشل التوليد: " + (e?.error?.message || e?.message || e?.code || "سجّل الدخول في Puter وتأكد من رصيدك") + "."));
  return w;
}

// فيديو طويل: نقسّم القصة إلى مشاهد، نولّد مقطعاً لكل مشهد بالتتابع، ونعرضها كقائمة تشغيل متصلة
async function longVideo(j, r, w, P, textOf, toEnglish, fail) {
  const n = r.clips, urls = [];
  const show = msg => { w.className = "muted"; w.textContent = msg; };
  try {
    show(`أكتب سيناريو من ${n} مشاهد…`);
    let scenes = [];
    try {
      const idea = await toEnglish(r.prompt);
      const raw = textOf(await P.chat([{ role: "system", content: `You write storyboards for kids' 3D animated videos. Return ONLY a JSON array of exactly ${n} short English scene descriptions (one sentence each) that continue one story in order. Describe the main character identically in every scene (same age, hair, outfit, colors) for visual consistency.` }, { role: "user", content: idea }]));
      scenes = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
    } catch {}
    if (!Array.isArray(scenes) || !scenes.length) { const idea = await toEnglish(r.prompt); scenes = Array.from({ length: n }, (_, k) => `${idea} (scene ${k + 1} of ${n})`); }
    scenes = scenes.slice(0, n);
    for (let k = 0; k < scenes.length; k++) {
      show(`جارٍ توليد المقطع ${k + 1} / ${scenes.length}… (${urls.length} جاهز). لا تغلق الصفحة.`);
      try {
        const v = await P.txt2vid(String(scenes[k]), { model: "togetherai:wan-ai/wan2.7-t2v", seconds: r.seconds, size: r.size });
        urls.push(String(v.src || v));
        w.className = ""; w.replaceChildren(playlist(urls.slice()), el("div", { className: "muted", textContent: `جارٍ توليد المقطع ${k + 2} / ${scenes.length}…` }));
      } catch (e) {
        const msg = e?.error?.message || e?.message || e?.code || "خطأ";
        if (!urls.length) return fail("فشل التوليد: " + msg + ".");
        w.className = ""; w.replaceChildren(playlist(urls, true), el("div", { className: "err", textContent: `توقف عند المقطع ${k + 1}: ${msg} (رصيد Puter المجاني على الأغلب). المقاطع السابقة جاهزة.` }));
        be.setResult?.(j.id, { kind: "video", urls }); return;
      }
    }
    w.className = ""; w.replaceChildren(playlist(urls, true));
    be.setResult?.(j.id, { kind: "video", urls });
  } catch (e) { fail("فشل التوليد: " + (e?.message || e) + "."); }
}

function renderJob(j) {
  const card = el("div", { className: "job", id: "job-" + j.id });
  const badge = { queued: "في الانتظار", running: "جارٍ التوليد…", done: "تم", failed: "فشل" }[j.status];
  card.append(el("div", { className: "meta" }, el("span", { textContent: j.agent_name }), el("span", { className: "badge b-" + j.status, textContent: badge })));
  card.append(el("p", { className: "p", textContent: j.prompt }));
  const r = j.result;
  if (j.status === "failed") card.append(el("div", { className: "err", textContent: (j.error || "") + " — لم تُحسب من حصتك اليومية" }));
  if (r && imgCache[j.id]) card.append(imgCache[j.id]);   // أثناء الجلسة نُبقي العنصر المولَّد كما هو
  else if (r) {
    const u = safeUrl(r.url);
    if (r.puter) card.append(puterMedia(j, r));
    else if (r.kind === "image" && u) {
      // الخدمة المجانية (Pollinations) تسمح بصورة كل ~45 ثانية: نعيد المحاولة تلقائياً بدل إظهار خطأ
      const img = el("img", { alt: j.prompt });
      const note = el("div", { className: "muted" });
      let tries = 0;
      const attempt = () => { note.textContent = tries ? `الخدمة المجانية مشغولة (صورة كل 45 ثانية). إعادة المحاولة تلقائياً… (${tries}/6)` : "جارٍ التوليد…"; img.src = tries ? u + (u.includes("?") ? "&" : "?") + "r=" + tries : u; };
      img.onload = () => note.remove();
      img.onerror = () => {
        if (u.startsWith("data:") || ++tries > 6) { note.className = "err"; note.textContent = "تعذر تحميل الصورة. أعد المحاولة لاحقاً."; img.remove(); return; }
        note.textContent = `الخدمة المجانية مشغولة (صورة كل 45 ثانية). إعادة المحاولة بعد قليل… (${tries}/6)`;
        setTimeout(attempt, 46000);
      };
      attempt();
      card.append(note, img, el("a", { href: u, target: "_blank", rel: "noopener", textContent: "فتح / تحميل" }));
    }
    else if (r.kind === "video" && r.urls) card.append(playlist(r.urls));
    else if (r.kind === "video" && u) card.append(el("video", { src: u, controls: true, loop: true, onerror: ev => ev.target.replaceWith(el("div", { className: "err", textContent: "انتهت صلاحية رابط الفيديو. حمّل الفيديو فور ما يخلص التوليد." })) }), el("a", { href: u, target: "_blank", rel: "noopener", textContent: "تحميل" }));
    else if (r.kind === "model3d" && u) {
      const mv = document.createElement("model-viewer");
      mv.setAttribute("src", u); mv.setAttribute("camera-controls", ""); mv.setAttribute("auto-rotate", ""); mv.setAttribute("shadow-intensity", "1");
      card.append(mv, el("a", { href: u, target: "_blank", rel: "noopener", textContent: "تحميل GLB" }));
    } else if (r.text) card.append(el("pre", { textContent: r.text }));
  }
  return card;
}

function renderJobs() {
  const box = $("results"), h = $("history");
  box.replaceChildren(); h.replaceChildren();
  if (!st.user) { box.append(el("p", { className: "muted", textContent: "سجّل الدخول لتبدأ." })); return; }
  if (!st.jobs.length) box.append(el("p", { className: "muted", textContent: "لا نتائج بعد." }));
  for (const j of st.jobs) {
    box.append(renderJob(j));
    h.append(el("div", { className: "hi" },
      el("span", { textContent: j.prompt, onclick: () => $("job-" + j.id)?.scrollIntoView({ behavior: "smooth" }) }),
      el("span", { textContent: "✕", title: "حذف", onclick: async () => { await be.deleteJob(j.id); load(); } })));
  }
}

async function load() {
  clearTimeout(st.timer);
  if (!st.user) { st.jobs = []; st.usage = {}; st.isPro = false; renderUser(); renderAgents(); return renderJobs(); }
  const [u, j, pts] = await Promise.all([be.usage(), be.jobs(), be.balance()]);
  st.points = pts;
  st.usage = {}; st.isPro = false;
  for (const r of u) { st.usage[r.agent_id] = r; st.isPro = r.is_pro; }
  st.jobs = j;
  renderUser(); renderAgents(); renderJobs();
  if (st.jobs.some(x => x.status === "queued" || x.status === "running")) {
    st.timer = setTimeout(async () => { try { await be.sync(); } catch {} load(); }, 4000);
  }
}

async function auth(kind) {
  $("autherr").textContent = "";
  const email = $("email").value.trim(), pw = $("pw").value;
  try {
    const r = kind === "register" ? await be.signUp(email, pw) : await be.signIn(email, pw);
    if (r.needsConfirm) return ($("autherr").textContent = "تحقق من بريدك لتفعيل الحساب ثم سجّل الدخول.");
    $("auth").close();
  } catch (e) { $("autherr").textContent = e.message; }
}
$("login").onclick = () => auth("login");
$("register").onclick = () => auth("register");
$("close").onclick = () => $("auth").close();

$("go").onclick = async () => {
  $("msg").textContent = "";
  if (!st.user) return $("auth").showModal();
  if (!st.sel) { $("agents").scrollIntoView({ behavior: "smooth" }); return ($("msg").textContent = "اضغط على وكيل من الأعلى أولاً"); }
  const prompt = $("prompt").value.trim();
  if (!prompt) return ($("msg").textContent = "اكتب وصفاً");
  $("go").disabled = true;
  try { await be.generate(st.sel, prompt, { seconds: $("vsec").value, size: $("vori").value }); $("prompt").value = ""; await load(); }
  catch (e) {
    if (e.code === "premium") showUpgrade(e.message);
    else if (e.code === "quota") { $("msg").textContent = e.message + " — يتجدد غداً."; if (!st.isPro) showUpgrade(e.message + ". اشترك لحصص أكبر."); }
    else $("msg").textContent = e.message;
  }
  $("go").disabled = false;
};

be.onAuthChange(user => { st.user = user; load(); });

renderChips();
st.agents = await be.agents();
const first = st.agents.find(a => a.tier !== "premium") || st.agents[0];
if (first) { st.sel = first.id; $("vopts").hidden = first.type !== "video"; $("sel").textContent = `الوكيل: ${first.icon} ${first.name}`; }
renderAgents();
st.user = await be.init(); load();
