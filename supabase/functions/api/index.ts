// deno-lint-ignore-file no-explicit-any
// Edge Function واحدة اسمها: api   (actions: generate | sync)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (k: string, d = "") => Deno.env.get(k) || d;

const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

async function hj(url: string, init: RequestInit = {}) {
  const r = await fetch(url, init);
  const t = await r.text();
  let j: any;
  try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return j;
}

const falH = () => ({ Authorization: `Key ${env("FAL_KEY")}`, "Content-Type": "application/json" });
const meshyH = () => ({ Authorization: `Bearer ${env("MESHY_KEY")}`, "Content-Type": "application/json" });

// ---------- وضع تجريبي ----------
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
function mockImage(prompt: string) {
  let h = 0;
  for (const ch of prompt) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,45%)"/><stop offset="1" stop-color="hsl(${(h + 70) % 360},70%,25%)"/></linearGradient></defs><rect width="768" height="768" fill="url(#g)"/><text x="384" y="360" font-size="34" fill="#fff" text-anchor="middle" font-family="sans-serif">وضع تجريبي</text><text x="384" y="410" font-size="22" fill="#ffffffcc" text-anchor="middle" font-family="sans-serif">${esc(prompt.slice(0, 40))}</text></svg>`;
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return "data:image/svg+xml;base64," + btoa(bin);
}

// ---------- نسخ النتيجة إلى Supabase Storage ----------
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "model/gltf-binary": "glb", "application/octet-stream": "glb",
};
async function store(url: string, userId: string, fallbackExt: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("fetch");
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > 45e6) throw new Error("big");
    const ct = (r.headers.get("content-type") || "").split(";")[0].trim();
    const ext = EXT[ct] || fallbackExt;
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("results").upload(path, buf, { contentType: ct || undefined });
    if (error) throw error;
    return sb.storage.from("results").getPublicUrl(path).data.publicUrl;
  } catch {
    return url; // إن فشل النسخ نبقي رابط المزود
  }
}

// ---------- بدء التوليد ----------
async function start(agent: any, priv: any, prompt: string): Promise<{ result?: any; provider?: any }> {
  const full = (priv?.prefix || "") + prompt;

  // مجاني: الصورة تُحمَّل من متصفح المستخدم نفسه (لا يمر عبر السيرفر ولا تكلفة عليك)
  if (agent.provider === "pollinations") {
    return { result: { kind: "image", puter: true, prompt: (priv?.prefix || "") + prompt.slice(0, 450) } };
  }

  if (agent.type === "image" || agent.type === "video") {
    if (!env("FAL_KEY")) {
      return {
        result: agent.type === "image"
          ? { kind: "image", url: mockImage(prompt), mock: true }
          : { kind: "text", text: "وضع تجريبي: أضف FAL_KEY في Secrets لتوليد فيديو حقيقي.", mock: true },
      };
    }
    const model = agent.type === "image"
      ? env("FAL_IMAGE_MODEL", "fal-ai/flux/schnell")
      : env("FAL_VIDEO_MODEL", "fal-ai/kling-video/v2.1/master/text-to-video");
    const q = await hj(`https://queue.fal.run/${model}`, {
      method: "POST", headers: falH(), body: JSON.stringify({ prompt: full }),
    });
    return { provider: { name: "fal", kind: agent.type, status_url: q.status_url, response_url: q.response_url } };
  }

  if (agent.type === "model3d") {
    if (!env("MESHY_KEY")) {
      return { result: { kind: "text", text: "وضع تجريبي: أضف MESHY_KEY في Secrets لتوليد مجسم 3D حقيقي.", mock: true } };
    }
    const c = await hj("https://api.meshy.ai/openapi/v2/text-to-3d", {
      method: "POST", headers: meshyH(), body: JSON.stringify({ mode: "preview", prompt: full }),
    });
    return { provider: { name: "meshy", id: c.result } };
  }

  // نص
  if (!env("ANTHROPIC_API_KEY")) {
    return { result: { kind: "text", text: "وضع تجريبي: أضف ANTHROPIC_API_KEY في Secrets.\n\nطلبك: " + prompt, mock: true } };
  }
  const j = await hj("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env("CLAUDE_MODEL", "claude-sonnet-5-5"),
      max_tokens: 1500,
      system: priv?.system || "",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  return { result: { kind: "text", text: (j.content || []).map((b: any) => b.text || "").join("") } };
}

// ---------- متابعة الطلبات الجارية ----------
const finish = (id: string, result: any) =>
  sb.from("jobs").update({ status: "done", result, finished_at: new Date().toISOString() })
    .eq("id", id).in("status", ["queued", "running"]);
const fail = (id: string, msg: string) => sb.rpc("fail_job", { p_job: id, p_error: msg });

async function advance(j: any) {
  if (Date.now() - new Date(j.created_at).getTime() > 15 * 60e3) return fail(j.id, "انتهت المهلة");
  const p = j.provider;
  if (!p) return;

  let s: any;
  try {
    s = p.name === "fal" ? await hj(p.status_url, { headers: falH() })
      : await hj(`https://api.meshy.ai/openapi/v2/text-to-3d/${p.id}`, { headers: meshyH() });
  } catch { return; } // خطأ شبكة عابر: نعيد المحاولة في الدورة القادمة

  try {
    if (p.name === "fal") {
      if (s.status !== "COMPLETED") return;
      const r = await hj(p.response_url, { headers: falH() });
      const u = p.kind === "image" ? r.images?.[0]?.url : r.video?.url;
      if (!u) throw new Error("لا توجد نتيجة");
      const url = await store(u, j.user_id, p.kind === "image" ? "jpg" : "mp4");
      return finish(j.id, { kind: p.kind, url });
    }
    if (s.status === "SUCCEEDED") {
      const g = s.model_urls?.glb;
      if (!g) throw new Error("لا توجد نتيجة");
      const url = await store(g, j.user_id, "glb");
      return finish(j.id, { kind: "model3d", url, thumb: s.thumbnail_url });
    }
    if (s.status === "FAILED" || s.status === "CANCELED") throw new Error("فشل التوليد");
  } catch (e) {
    return fail(j.id, String((e as Error).message || e));
  }
}

// ---------- Actions ----------
async function generate(user: any, body: any) {
  const prompt = String(body.prompt || "").trim().slice(0, 1500);
  const agentId = String(body.agentId || "");
  if (!agentId || !prompt) return json({ error: "اختر وكيلاً واكتب وصفاً" }, 400);

  const since = new Date(Date.now() - 60e3).toISOString();
  const { count } = await sb.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count || 0) >= 8) return json({ error: "طلبات كثيرة، انتظر دقيقة" }, 429);

  // يفحص الخطة والحصة اليومية ويُنشئ الطلب داخل قاعدة البيانات (ذرّي)
  const { data: job, error } = await sb.rpc("create_job", { p_user: user.id, p_agent: agentId, p_prompt: prompt });
  if (error) {
    const m = error.message || "";
    if (m.includes("premium_required")) return json({ error: "هذا الوكيل للمشتركين فقط", code: "premium" }, 402);
    if (m.includes("quota_exceeded")) return json({ error: "وصلت حدك اليومي لهذا الوكيل", code: "quota" }, 429);
    if (m.includes("no_agent")) return json({ error: "وكيل غير موجود" }, 400);
    return json({ error: "تعذر إنشاء الطلب" }, 500);
  }

  try {
    const { data: agent } = await sb.from("agents").select("*").eq("id", agentId).single();
    const { data: priv } = await sb.from("agent_private").select("*").eq("agent_id", agentId).maybeSingle();
    const out = await start(agent, priv, prompt);
    if (out.result) await finish(job.id, out.result);
    else await sb.from("jobs").update({ provider: out.provider }).eq("id", job.id);
  } catch (e) {
    await fail(job.id, String((e as Error).message || e));
  }
  return json({ jobId: job.id });
}

async function sync(user: any) {
  const { data: jobs } = await sb.from("jobs").select("*").eq("user_id", user.id)
    .in("status", ["queued", "running"]).limit(10);
  await Promise.all((jobs || []).map((j) => advance(j).catch(() => {})));
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data } = await sb.auth.getUser(jwt);
    const user = data?.user;
    if (!user) return json({ error: "سجّل الدخول أولاً" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.action === "generate") return await generate(user, body);
    if (body.action === "sync") return await sync(user);
    return json({ error: "action غير معروف" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "خطأ في السيرفر" }, 500);
  }
});
