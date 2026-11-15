# وكلاء الذكاء — Supabase فقط

واجهة ثابتة (HTML/JS) + Supabase (حسابات، قاعدة بيانات، تخزين، تشغيل) — بلا سيرفر خاص.

## تجربة فورية (بلا أي إعداد)
ارفع الملفات إلى GitHub وفعّل Pages، افتح الرابط: يخدم **وضع تجريبي** محلي (الصور المجانية حقيقية، والباقي وهمي، وزر "جرّب PRO"). كل شيء محفوظ في جهازك.
على أندرويد: افتح الرابط في Chrome ← ⋮ ← "إضافة إلى الشاشة الرئيسية" فيتثبت كتطبيق (PWA).

## الإعداد الحقيقي (مرة واحدة)
1. supabase.com ← New project (مجاني).
2. **SQL Editor** ← الصق `supabase/schema.sql` ← Run.
3. **Authentication → Providers → Email** ← عطّل "Confirm email".
4. **Edge Functions → Deploy a new function** ← الاسم: `api` ← الصق `supabase/functions/api/index.ts` ← Deploy.
5. **Edge Functions → Secrets** ← للوكلاء البريميوم فقط (اختياري؛ بدونها تعمل في وضع تجريبي وبلا أي تكلفة عليك):
   `FAL_KEY` (صور + فيديو) · `MESHY_KEY` (3D) · `ANTHROPIC_API_KEY` (نصوص)
6. **Project Settings → API** ← انسخ Project URL و anon key إلى `config.js`.
7. ارفع المجلد إلى GitHub ← Settings → Pages ← Deploy from branch (main / root).

## النموذج: مجاني + بريميوم
- المجاني = صور عبر Pollinations (تُحمَّل من متصفح المستخدم، بلا تكلفة عليك). كل ما يكلّف مالاً (فيديو، 3D، HD، نصوص) = بريميوم.
- كل وكيل له حصة يومية: `free_daily` للمجاني و`pro_daily` للمشترك (جدول `agents`). يتجدد منتصف الليل UTC.
- `tier = 'premium'` (مثل 3D) = للمشتركين فقط. الطلب الفاشل لا يُحسب من الحصة.
- ترقية مستخدم يدوياً (حتى يُضاف الدفع): Table Editor ← profiles ← `plan = pro` (و`plan_until` اختياري).
- لما تضيف الدفع: ضع رابط الـ checkout في `UPGRADE_URL` داخل `config.js`.
- أول حساب تسجله = مدير. لإضافة وكيل نصي: صف في `agents` وصف في `agent_private` (التعليمات `system`).

## Google Play
التطبيق PWA جاهز (manifest + service worker + أيقونات). لتغليفه كحزمة أندرويد من رابط الموقع المنشور: pwabuilder.com ← أدخل الرابط ← Android.
