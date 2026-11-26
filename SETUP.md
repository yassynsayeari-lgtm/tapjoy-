# إعداد YASJOY (Cloudflare + Firebase)

1. ارفع `admin.html` و `index.html` ومجلد `functions/` إلى جذر المستودع (functions بجانب index.html) ثم أعد النشر على Cloudflare Pages.
2. Cloudflare Pages > Settings > Variables and Secrets: أضف `FIREBASE_SERVICE_ACCOUNT` = ملف JSON لحساب الخدمة (Firebase Console > Project settings > Service accounts > Generate new private key). اختياري: `ADMIN_UID`.
3. قواعد Firestore: اسمح للمستخدم بتحديث حقوله (balance عبر عملية السحب فقط، وip, previousIp, ipAt, countryCode, country, countryAt, lastCountryCode, lastCountry, previousCountryCode, banned, banReason, bannedBy, bannedAt, wallEntries). اسمح للمسؤول بالقراءة على transactions و postbackLogs وبالحذف على users/withdrawals/transactions.
4. جدار العروض: من لوحة المسؤول > جدران العروض أضف الجدار + المفتاح السري، احفظ، انسخ رابط Postback وضعه في لوحة المزوّد (بدّل المتغيرات حسب مزوّدك).

## تحديث v20 — الحماية التلقائية من الخادم + تطبيق المميز بـ PIN
- الحماية التلقائية تعمل الآن من الخادم (`/api/guard/scan` + بعد كل مكافأة جدار) حتى لو تطبيق المسؤول مغلق. فعّلها من «الخطر» ← التحكم الكامل.
- القواعد (الدرجات والأعداد) تُحفظ في `adminSettings/fraud.rules` ويعدلها المسؤول فقط؛ المصدر المشترك: `guard-core.js`.
- تطبيق المميز: الدخول بـ Google فقط؛ التسجيل = رقم الحساب + الاسم + الفئة (+ID) ثم PIN من 6 أرقام يصدره المسؤول مع الرقم.
- احذف من المستودع إن وُجدت: `functions/api/acct/forgot.js` و `functions/api/acct/recover.js`.

## تحديث v21
- «الخطر» صار فيه: 🛰️ غرفة المراقبة · 🎛️ غرفة التحكم · ⚙️ إعدادات التطبيق (إحصائيات، حالة، مساعدو المسؤول، إعادة الضبط).
- قائمة «💎 النقاط»: من أنجز عروضًا، دولته، جدرانه وعروضه. تفاصيل العرض (الاسم/الصورة/المتبقي) تظهر إذا أرسلها الجدار في الـPostback بالأسماء: `offer_name` `offer_id` `image` (https) `offer_total`.
- مساعد المسؤول: يُنشأ من إعدادات التطبيق (يتطلب كلمة مرورك). انشر `firestore.rules` من جديد، وملف `functions/api/admin/assistant-delete.js` يحذف حساب المساعد نهائيًا.

## VIP registration (automatic)
The Account ID is generated automatically when a VIP signs in with Google and creates the account; the VIP only chooses a 6-digit PIN. The admin "المميزون" list shows name, category, category ID, Account ID and PIN in one card (copy buttons + copy all). Redeploy Cloudflare Pages after pushing.
