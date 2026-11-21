// طبقتان بنفس الواجهة: Supabase (حقيقي) و Demo (محلي في الجهاز، بلا أي إعداد)

// ---------- Supabase ----------
export function createSupabaseBackend(sb) {
  async function call(body) {
    const { data, error } = await sb.functions.invoke("api", { body });
    if (error) {
      let m = "خطأ", code;
      try { const j = await error.context.json(); m = j.error || m; code = j.code; } catch {}
      throw Object.assign(new Error(m), { code });
    }
    return data;
  }
  return {
    demo: false,
    async init() { const { data } = await sb.auth.getSession(); return data.session?.user || null; },
    onAuthChange(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s?.user || null)); },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return {};
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      return data.session ? {} : { needsConfirm: true };
    },
    signOut() { return sb.auth.signOut(); },
    async agents() {
      const { data } = await sb.from("agents").select("id,name,icon,type,tier,free_daily,pro_daily,description").order("sort");
      return data || [];
    },
    async usage() { const { data } = await sb.rpc("my_usage"); return data || []; },
    async jobs() {
      const { data } = await sb.from("jobs").select("*").order("created_at", { ascending: false }).limit(100);
      return data || [];
    },
    async deleteJob(id) { await sb.from("jobs").delete().eq("id", id); },
    generate(agentId, prompt) { return call({ action: "generate", agentId, prompt }); },
    sync() { return call({ action: "sync" }); },
    async setResult() {},
  };
}

// ---------- Demo (محلي) ----------
const DEMO_AGENTS = [
  { id: "image", name: "صانع الصور", icon: "🖼️", type: "image", tier: "free", provider: "pollinations", free_daily: 10, pro_daily: 100, description: "يحوّل وصفك إلى صورة." },
  { id: "logo", name: "مصمم الشعارات", icon: "✨", type: "image", tier: "free", provider: "pollinations", free_daily: 5, pro_daily: 50, description: "شعارات بسيطة وأنيقة لمشروعك.", prefix: "minimal modern vector logo, flat design, white background, " },
  { id: "video_free", name: "فيديو أطفال 3D", icon: "🎬", type: "video", tier: "free", provider: "puter", free_daily: 2, pro_daily: 20, description: "فيديو قصير بستايل كرتون 3D (يُحسب من رصيدك المجاني في Puter).", prefix: "cute 3D animated children's video, Pixar style, soft lighting, vibrant colors, smooth motion, " },
  { id: "cartoon3d", name: "كرتون 3D", icon: "🧸", type: "image", tier: "free", provider: "pollinations", free_daily: 8, pro_daily: 80, description: "شخصيات كرتونية ثلاثية الأبعاد بستايل أفلام الأطفال.", prefix: "cute 3D animated movie character, Pixar style, soft lighting, big expressive eyes, vibrant colors, high detail render, " },
  { id: "anime", name: "أنمي", icon: "🎌", type: "image", tier: "free", provider: "pollinations", free_daily: 8, pro_daily: 80, description: "رسومات بستايل الأنمي الياباني.", prefix: "anime style illustration, detailed, vibrant colors, studio quality, " },
  { id: "photo", name: "صور واقعية", icon: "📷", type: "image", tier: "free", provider: "pollinations", free_daily: 8, pro_daily: 80, description: "صور تشبه التصوير الحقيقي.", prefix: "ultra realistic photograph, natural lighting, sharp focus, 50mm lens, high detail, " },
  { id: "wallpaper", name: "خلفيات هاتف", icon: "📱", type: "image", tier: "free", provider: "pollinations", free_daily: 8, pro_daily: 80, description: "خلفيات جميلة لشاشة هاتفك.", prefix: "beautiful phone wallpaper, aesthetic, high quality, clean composition, " },
  { id: "sticker", name: "ملصقات", icon: "🏷️", type: "image", tier: "free", provider: "pollinations", free_daily: 8, pro_daily: 80, description: "ستيكرات لطيفة جاهزة للمحادثات.", prefix: "die-cut sticker design, cute, thick white outline, flat colors, white background, " },
  { id: "appicon", name: "أيقونات تطبيقات", icon: "🎮", type: "image", tier: "free", provider: "pollinations", free_daily: 5, pro_daily: 50, description: "أيقونات لتطبيقاتك وألعابك.", prefix: "mobile app icon, rounded square, glossy, centered symbol, clean gradient background, " },
  { id: "coloring", name: "تلوين للأطفال", icon: "🖍️", type: "image", tier: "free", provider: "pollinations", free_daily: 5, pro_daily: 50, description: "صفحات تلوين بخطوط بسيطة.", prefix: "children's coloring book page, black and white line art, thick clean outlines, no shading, white background, " },
  { id: "art", name: "لوحات فنية", icon: "🎨", type: "image", tier: "free", provider: "pollinations", free_daily: 8, pro_daily: 80, description: "رسم زيتي ولوحات فنية.", prefix: "beautiful oil painting, artistic brush strokes, rich colors, gallery quality, " },
  { id: "product", name: "تصميم منتجات", icon: "📦", type: "image", tier: "free", provider: "pollinations", free_daily: 5, pro_daily: 50, description: "عرض منتج أو علبة بشكل احترافي.", prefix: "professional product photography, studio lighting, clean background, commercial advertising shot, " },
  { id: "cover", name: "أغلفة يوتيوب", icon: "📺", type: "image", tier: "free", provider: "pollinations", free_daily: 5, pro_daily: 50, description: "أغلفة جذابة لفيديوهاتك وصفحاتك.", prefix: "eye-catching social media thumbnail background, bold colors, dramatic lighting, high contrast, " },
  { id: "image_hd", name: "صور HD", icon: "🌟", type: "image", tier: "premium", free_daily: 0, pro_daily: 50, description: "جودة أعلى وسرعة أكبر." },
  { id: "video", name: "صانع الفيديو", icon: "🎬", type: "video", tier: "premium", free_daily: 0, pro_daily: 10, description: "فيديو قصير من وصف نصي." },
  { id: "model3d", name: "مجسمات 3D", icon: "🧊", type: "model3d", tier: "premium", free_daily: 0, pro_daily: 10, description: "مجسم ثلاثي الأبعاد تدوّره وتعاينه." },
  { id: "ads", name: "كاتب إعلانات", icon: "📣", type: "text", tier: "premium", free_daily: 0, pro_daily: 300, description: "نصوص إعلانية بالعربية جاهزة للنشر." },
  { id: "chat", name: "مساعد عام", icon: "💬", type: "text", tier: "premium", free_daily: 0, pro_daily: 300, description: "اسأل أي سؤال." },
];

const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function mockImage(prompt) {
  let h = 0;
  for (const ch of prompt) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,45%)"/><stop offset="1" stop-color="hsl(${(h + 70) % 360},70%,25%)"/></linearGradient></defs><rect width="768" height="768" fill="url(#g)"/><text x="384" y="360" font-size="34" fill="#fff" text-anchor="middle" font-family="sans-serif">وضع تجريبي</text><text x="384" y="410" font-size="22" fill="#ffffffcc" text-anchor="middle" font-family="sans-serif">${esc(prompt.slice(0, 40))}</text></svg>`;
  let bin = "";
  for (const b of new TextEncoder().encode(svg)) bin += String.fromCharCode(b);
  return "data:image/svg+xml;base64," + btoa(bin);
}

export function createDemoBackend(store = globalThis.localStorage, now = () => Date.now()) {
  const KEY = "demo_state_v1";
  const load = () => { try { return JSON.parse(store.getItem(KEY)) || {}; } catch { return {}; } };
  const state = Object.assign({ user: null, pro: false, jobs: [] }, load());
  const save = () => { try { store.setItem(KEY, JSON.stringify(state)); } catch {} };
  let listener = () => {};
  const dayStart = () => { const d = new Date(now()); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
  const usedToday = id => state.jobs.filter(j => j.agent_id === id && j.status !== "failed" && j.created_ts >= dayStart()).length;
  const fail = (msg, code) => { throw Object.assign(new Error(msg), { code }); };

  return {
    demo: true,
    async init() { return state.user; },
    onAuthChange(cb) { listener = cb; },
    async signIn(email, password) {
      if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) throw new Error("بريد غير صالح أو كلمة سر أقل من 6 أحرف");
      state.user = { id: "demo", email }; save(); listener(state.user); return {};
    },
    async signUp(email, password) { return this.signIn(email, password); },
    async signOut() { state.user = null; save(); listener(null); },
    async agents() { return DEMO_AGENTS.map(({ prefix, provider, ...a }) => a); },
    async usage() {
      return DEMO_AGENTS.map(a => ({
        agent_id: a.id, used: usedToday(a.id), daily_limit: state.pro ? a.pro_daily : a.free_daily,
        premium: a.tier === "premium", is_pro: state.pro,
      }));
    },
    async jobs() { return [...state.jobs].sort((a, b) => b.created_ts - a.created_ts).slice(0, 100); },
    async deleteJob(id) { state.jobs = state.jobs.filter(j => j.id !== id); save(); },
    async generate(agentId, prompt) {
      prompt = String(prompt || "").trim().slice(0, 1500);
      const a = DEMO_AGENTS.find(x => x.id === agentId);
      if (!a || !prompt) fail("اختر وكيلاً واكتب وصفاً");
      if (a.tier === "premium" && !state.pro) fail("هذا الوكيل للمشتركين فقط", "premium");
      if (usedToday(a.id) >= (state.pro ? a.pro_daily : a.free_daily)) fail("وصلت حدك اليومي لهذا الوكيل", "quota");
      let result;
      if (a.provider === "puter") {
        result = { kind: a.type, puter: true, prompt: (a.prefix || "") + prompt.slice(0, 450) };
      } else if (a.provider === "pollinations") {
        const full = (a.prefix || "") + prompt.slice(0, 450); // روابط الصور لها حد طول
        result = { kind: "image", puter: true, prompt: full };
      } else if (a.type === "image") result = { kind: "image", url: mockImage(prompt), mock: true };
      else if (a.type === "text") result = { kind: "text", text: "وضع تجريبي: هنا يظهر رد الذكاء الاصطناعي الحقيقي بعد ربط Supabase وإضافة المفاتيح.\n\nطلبك: " + prompt, mock: true };
      else result = { kind: "text", text: "وضع تجريبي: التوليد الحقيقي لهذا الوكيل يتفعّل بعد ربط Supabase وإضافة المفتاح.", mock: true };
      const t = now();
      state.jobs.push({ id: String(t) + Math.random().toString(36).slice(2, 6), agent_id: a.id, agent_name: a.name, type: a.type, prompt,
        status: "done", result, created_ts: t, created_at: new Date(t).toISOString() });
      save();
      return {};
    },
    async sync() {},
    async setResult(id, result) { const j = state.jobs.find(x => x.id === id); if (j) { j.result = result; save(); } },
    setPro(v) { state.pro = !!v; save(); },
  };
}
