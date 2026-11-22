-- الصق هذا الملف كاملاً في Supabase → SQL Editor ثم Run
-- النموذج: حصة يومية مجانية لكل وكيل، وكلاء "بريميوم" (مثل 3D) للمشتركين فقط. بلا كريديت.

-- ============ الجداول ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free','pro')),
  plan_until timestamptz,            -- null = بلا انتهاء
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  id text primary key,
  name text not null,
  icon text not null default '🤖',
  type text not null check (type in ('image','video','model3d','text')),
  tier text not null default 'free' check (tier in ('free','premium')),
  free_daily integer not null default 5,   -- الحصة اليومية للمجاني
  pro_daily integer not null default 50,   -- الحصة اليومية للمشترك
  provider text not null default 'auto' check (provider in ('auto','pollinations','puter')),  -- pollinations = مجاني، يُحمَّل من متصفح المستخدم
  description text,
  sort integer not null default 0,
  active boolean not null default true
);
alter table public.agents add column if not exists provider text not null default 'auto';
alter table public.agents drop constraint if exists agents_provider_check;
alter table public.agents add constraint agents_provider_check check (provider in ('auto','pollinations','puter'));

-- تعليمات الوكيل سرّية: لا يقرأها إلا الـ Edge Function
create table if not exists public.agent_private (
  agent_id text primary key references public.agents(id) on delete cascade,
  system text,
  prefix text
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id text not null references public.agents(id),
  agent_name text,
  type text,
  prompt text not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  result jsonb,
  error text,
  provider jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists jobs_user_idx on public.jobs(user_id, created_at desc);

-- ============ الحماية (RLS) ============
alter table public.profiles enable row level security;
alter table public.agents enable row level security;
alter table public.agent_private enable row level security;  -- بلا policies = مغلق ما عدا service_role
alter table public.jobs enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);

drop policy if exists "agents public" on public.agents;
create policy "agents public" on public.agents for select using (active);

drop policy if exists "own jobs read" on public.jobs;
create policy "own jobs read" on public.jobs for select using (auth.uid() = user_id);

drop policy if exists "own jobs delete" on public.jobs;
create policy "own jobs delete" on public.jobs for delete using (auth.uid() = user_id);
-- لا يوجد insert/update للمستخدم: الخطة والنتائج يكتبها السيرفر فقط

-- ============ حساب جديد (أول حساب = مدير) ============
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, not exists (select 1 from public.profiles));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ إنشاء طلب مع فحص الخطة والحصة (ذرّي) ============
create or replace function public.create_job(p_user uuid, p_agent text, p_prompt text)
returns public.jobs
language plpgsql security definer set search_path = public as $$
declare
  a public.agents%rowtype;
  pr public.profiles%rowtype;
  is_pro boolean;
  lim integer;
  used integer;
  j public.jobs;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));  -- يمنع تجاوز الحصة بطلبات متزامنة

  select * into a from public.agents where id = p_agent and active;
  if not found then raise exception 'no_agent'; end if;
  select * into pr from public.profiles where id = p_user;
  if not found then raise exception 'no_profile'; end if;

  is_pro := pr.plan = 'pro' and (pr.plan_until is null or pr.plan_until > now());
  if a.tier = 'premium' and not is_pro then raise exception 'premium_required'; end if;

  lim := case when is_pro then a.pro_daily else a.free_daily end;
  select count(*) into used from public.jobs
   where user_id = p_user and agent_id = a.id and status <> 'failed'
     and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if used >= lim then raise exception 'quota_exceeded'; end if;

  insert into public.jobs (user_id, agent_id, agent_name, type, prompt, status)
  values (p_user, a.id, a.name, a.type, p_prompt, 'running') returning * into j;
  return j;
end $$;

-- الطلب الفاشل لا يُحسب من الحصة اليومية
create or replace function public.fail_job(p_job uuid, p_error text) returns void
language sql security definer set search_path = public as $$
  update public.jobs set status = 'failed', error = left(p_error, 300), finished_at = now()
   where id = p_job and status in ('queued','running');
$$;

-- استهلاك اليوم لكل وكيل (للواجهة)
create or replace function public.my_usage()
returns table (agent_id text, used integer, daily_limit integer, premium boolean, is_pro boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select (plan = 'pro' and (plan_until is null or plan_until > now())) as pro
      from public.profiles where id = auth.uid()
  )
  select a.id,
         (select count(*)::int from public.jobs j
           where j.user_id = auth.uid() and j.agent_id = a.id and j.status <> 'failed'
             and j.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')),
         case when coalesce((select pro from me), false) then a.pro_daily else a.free_daily end,
         a.tier = 'premium',
         coalesce((select pro from me), false)
    from public.agents a where a.active order by a.sort;
$$;

revoke execute on function public.create_job(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.fail_job(uuid, text) from public, anon, authenticated;
grant execute on function public.create_job(uuid, text, text) to service_role;
grant execute on function public.fail_job(uuid, text) to service_role;
revoke execute on function public.my_usage() from public, anon;
grant execute on function public.my_usage() to authenticated;

-- ============ مكان تخزين النتائج ============
insert into storage.buckets (id, name, public) values ('results', 'results', true)
on conflict (id) do nothing;

-- ============ الوكلاء الأوائل ============
-- المجاني = صور عبر Pollinations (بلا تكلفة عليك). كل ما يكلّف مالاً (فيديو، 3D، HD، نصوص) = بريميوم.
-- ملاحظة: إعادة تشغيل هذا الملف تعيد ضبط الوكلاء الأوائل إلى هذه القيم.
insert into public.agents (id, name, icon, type, tier, provider, free_daily, pro_daily, description, sort) values
  ('image',    'صانع الصور',      '🖼️', 'image',   'free',    'pollinations', 10, 100, 'يحوّل وصفك إلى صورة.', 1),
  ('logo',     'مصمم الشعارات',   '✨', 'image',   'free',    'pollinations', 5,  50,  'شعارات بسيطة وأنيقة لمشروعك.', 2),
  ('story_video', 'فيديو قصة 3D', '📖', 'video', 'free', 'puter', 20, 20, 'قصة مصوّرة متحركة بستايل أفلام الأطفال 3D مع كلمات عربية وموسيقى.', 0),
  ('story_anime', 'فيديو أنمي', '🎌', 'video', 'free', 'puter', 20, 20, 'قصة بستايل الأنمي الياباني، حركة كاميرا وموسيقى.', 1),
  ('story_cartoon', 'فيديو كرتون 2D', '🎨', 'video', 'free', 'puter', 20, 20, 'كرتون ملوّن بخطوط واضحة للأطفال.', 2),
  ('story_fairy', 'حكايات خيالية', '🧚', 'video', 'free', 'puter', 20, 20, 'حكايات سحرية بألوان مائية دافئة.', 3),
  ('story_animals', 'عالم الحيوانات', '🦁', 'video', 'free', 'puter', 20, 20, 'مغامرات حيوانات لطيفة بستايل 3D.', 4),
  ('story_moral', 'قصص وعِبَر للأطفال', '🌟', 'video', 'free', 'puter', 20, 20, 'قصص تربوية قصيرة تعلّم قيمة جميلة.', 5),
  ('story_edu', 'فيديو تعليمي للأطفال', '🔤', 'video', 'free', 'puter', 20, 20, 'حروف وأرقام وألوان بشكل ممتع.', 6),
  ('story_space', 'فضاء وخيال علمي', '🚀', 'video', 'free', 'puter', 20, 20, 'رحلات فضائية وكواكب بستايل سينمائي.', 7),
  ('story_cinema', 'فيديو سينمائي', '🎥', 'video', 'free', 'puter', 20, 20, 'مشاهد واقعية بإضاءة سينمائية.', 8),
  ('story_ad', 'فيديو إعلان منتج', '📣', 'video', 'free', 'puter', 20, 20, 'فيديو إعلاني لمنتجك بلقطات احترافية.', 9),
  ('video_free', 'فيديو أطفال 3D', '🎬', 'video', 'free', 'puter', 10, 10, 'فيديو قصير بستايل كرتون 3D (يُحسب من رصيدك المجاني في Puter).', 3),
  ('cartoon3d', 'كرتون 3D', '🧸', 'image', 'free', 'pollinations', 8, 80, 'شخصيات كرتونية ثلاثية الأبعاد بستايل أفلام الأطفال.', 4),
  ('anime', 'أنمي', '🎌', 'image', 'free', 'pollinations', 8, 80, 'رسومات بستايل الأنمي الياباني.', 5),
  ('photo', 'صور واقعية', '📷', 'image', 'free', 'pollinations', 8, 80, 'صور تشبه التصوير الحقيقي.', 6),
  ('wallpaper', 'خلفيات هاتف', '📱', 'image', 'free', 'pollinations', 8, 80, 'خلفيات جميلة لشاشة هاتفك.', 7),
  ('sticker', 'ملصقات', '🏷️', 'image', 'free', 'pollinations', 8, 80, 'ستيكرات لطيفة جاهزة للمحادثات.', 8),
  ('appicon', 'أيقونات تطبيقات', '🎮', 'image', 'free', 'pollinations', 5, 50, 'أيقونات لتطبيقاتك وألعابك.', 9),
  ('coloring', 'تلوين للأطفال', '🖍️', 'image', 'free', 'pollinations', 5, 50, 'صفحات تلوين بخطوط بسيطة.', 10),
  ('art', 'لوحات فنية', '🎨', 'image', 'free', 'pollinations', 8, 80, 'رسم زيتي ولوحات فنية.', 11),
  ('product', 'تصميم منتجات', '📦', 'image', 'free', 'pollinations', 5, 50, 'عرض منتج أو علبة بشكل احترافي.', 12),
  ('cover', 'أغلفة يوتيوب', '📺', 'image', 'free', 'pollinations', 5, 50, 'أغلفة جذابة لفيديوهاتك وصفحاتك.', 13),
  ('image_hd', 'صور HD', '🌟', 'image', 'free', 'puter', 50, 50, 'جودة أعلى وسرعة أكبر.', 14),
  ('ads', 'كاتب إعلانات', '📣', 'text', 'free', 'puter', 50, 50, 'نصوص إعلانية بالعربية جاهزة للنشر.', 17),
  ('chat', 'مساعد عام', '💬', 'text', 'free', 'puter', 50, 50, 'اسأل أي سؤال.', 18)
on conflict (id) do update set name=excluded.name, icon=excluded.icon, type=excluded.type, tier=excluded.tier,
  provider=excluded.provider, free_daily=excluded.free_daily, pro_daily=excluded.pro_daily,
  description=excluded.description, sort=excluded.sort;

-- الوكلاء القدامى التي تحتاج تكلفة حقيقية: نعطّلها (كل شيء مجاني الآن)
update public.agents set active = false where id in ('video','model3d');

insert into public.agent_private (agent_id, system, prefix) values
  ('image', null, ''),
  ('logo', null, 'minimal modern vector logo, flat design, white background, '),
  ('image_hd', null, ''),
  ('video', null, ''),
  ('model3d', null, ''),
  ('ads', 'أنت كاتب إعلانات محترف. اكتب بالعربية الفصحى المبسطة. أعط 3 صيغ قصيرة ومقنعة مع عنوان لكل واحدة. بدون مقدمات.', ''),
  ('chat', 'أنت مساعد مفيد. أجب بإيجاز وبنفس لغة المستخدم.', ''),
  ('video_free', null, 'cute 3D animated children''s video, Pixar style, soft lighting, vibrant colors, smooth motion, '),
  ('cartoon3d', null, 'cute 3D animated movie character, Pixar style, soft lighting, big expressive eyes, vibrant colors, high detail render, '),
  ('anime', null, 'anime style illustration, detailed, vibrant colors, studio quality, '),
  ('photo', null, 'ultra realistic photograph, natural lighting, sharp focus, 50mm lens, high detail, '),
  ('wallpaper', null, 'beautiful phone wallpaper, aesthetic, high quality, clean composition, '),
  ('sticker', null, 'die-cut sticker design, cute, thick white outline, flat colors, white background, '),
  ('appicon', null, 'mobile app icon, rounded square, glossy, centered symbol, clean gradient background, '),
  ('coloring', null, 'children''s coloring book page, black and white line art, thick clean outlines, no shading, white background, '),
  ('art', null, 'beautiful oil painting, artistic brush strokes, rich colors, gallery quality, '),
  ('product', null, 'professional product photography, studio lighting, clean background, commercial advertising shot, '),
  ('cover', null, 'eye-catching social media thumbnail background, bold colors, dramatic lighting, high contrast, ')
on conflict (agent_id) do nothing;
