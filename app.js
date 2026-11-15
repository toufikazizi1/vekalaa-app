import { SUPABASE_URL, SUPABASE_ANON_KEY, UPGRADE_URL } from "./config.js";
import { createSupabaseBackend, createDemoBackend } from "./backend.js";

const $ = id => document.getElementById(id);
const st = { user: null, isPro: false, agents: [], usage: {}, jobs: [], sel: null, cat: "all", timer: null };
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
    b.append(el("span", { className: "muted", textContent: st.user.email }),
      el("span", { className: "plan " + (st.isPro ? "pro" : "free"), textContent: st.isPro ? "PRO 👑" : "مجاني" }));
    if (!st.isPro) b.append(el("button", { textContent: "ترقية", onclick: () => showUpgrade("اشترك للوصول إلى الوكلاء المميزة وحصص أكبر.") }));
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
      st.sel = a.id; $("sel").textContent = `الوكيل: ${a.icon} ${a.name}`; renderAgents();
    };
    g.append(c);
  }
}

function renderJob(j) {
  const card = el("div", { className: "job", id: "job-" + j.id });
  const badge = { queued: "في الانتظار", running: "جارٍ التوليد…", done: "تم", failed: "فشل" }[j.status];
  card.append(el("div", { className: "meta" }, el("span", { textContent: j.agent_name }), el("span", { className: "badge b-" + j.status, textContent: badge })));
  card.append(el("p", { className: "p", textContent: j.prompt }));
  const r = j.result;
  if (j.status === "failed") card.append(el("div", { className: "err", textContent: (j.error || "") + " — لم تُحسب من حصتك اليومية" }));
  if (r) {
    const u = safeUrl(r.url);
    if (r.kind === "image" && u) card.append(el("img", { src: u, alt: j.prompt, onerror: ev => ev.target.replaceWith(el("div", { className: "err", textContent: "تعذر تحميل الصورة (الخدمة المجانية قد تكون مشغولة). أعد المحاولة بعد قليل." })) }), el("a", { href: u, target: "_blank", rel: "noopener", textContent: "فتح / تحميل" }));
    else if (r.kind === "video" && u) card.append(el("video", { src: u, controls: true, loop: true }), el("a", { href: u, target: "_blank", rel: "noopener", textContent: "تحميل" }));
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
  const [u, j] = await Promise.all([be.usage(), be.jobs()]);
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
  try { await be.generate(st.sel, prompt); $("prompt").value = ""; await load(); }
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
if (first) { st.sel = first.id; $("sel").textContent = `الوكيل: ${first.icon} ${first.name}`; }
renderAgents();
st.user = await be.init(); load();
