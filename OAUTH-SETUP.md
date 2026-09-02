# חיבור כתיבה ליומני גוגל — מדריך צעד-אחר-צעד

כדי שההודעה `.פגישה` תיצור אירוע ביומן, צריך **הרשאת כתיבה** לשני חשבונות
היומן. הקישורים הסודיים (iCal) הקיימים הם לקריאה בלבד — לכן זה נדרש.

עושים את זה **פעם אחת**. ~15 דקות. צריך גישה לשני החשבונות:
- `pgishotzahar@gmail.com` (צחר + זום)
- `pgishotramatgan@gmail.com` (רמת גן)

---

## שלב 1 — פרויקט ב-Google Cloud (פעם אחת)

1. היכנס ל-<https://console.cloud.google.com> עם **חשבון אחד** מהשניים.
2. למעלה: **Select a project → New Project**. שם: `RES Calendar`. → **Create**.
3. בתפריט (☰) → **APIs & Services → Library**.
4. חפש **Google Calendar API** → **Enable**.

## שלב 2 — מסך ההסכמה (OAuth consent)

1. **APIs & Services → OAuth consent screen**.
2. User Type: **External** → **Create**.
3. מלא: App name `RES Calendar`, User support email — המייל שלך, Developer email — המייל שלך. → **Save and Continue**.
4. **Scopes** → **Add or Remove Scopes** → הדבק:
   ```
   https://www.googleapis.com/auth/calendar.events
   ```
   → **Update** → **Save and Continue**.
5. **Test users** → **Add Users** → הוסף את **שני** המיילים:
   `pgishotzahar@gmail.com` ו-`pgishotramatgan@gmail.com` → **Save**.

## שלב 3 — Client ID + Secret

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**. שם: `RES Calendar Web`.
3. תחת **Authorized redirect URIs → Add URI** הדבק בדיוק:
   ```
   https://developers.google.com/oauthplayground
   ```
   → **Create**.
4. ייפתח חלון עם **Client ID** ו-**Client secret**. **שמור את שניהם** — תשלח לי אותם.

## שלב 4 — Refresh token לכל חשבון (החלק שנותן את הכתיבה)

עושים את שלב 4 **פעמיים** — פעם לכל חשבון יומן.

1. פתח <https://developers.google.com/oauthplayground>.
2. בפינה למעלה מימין — גלגל השיניים ⚙️ → סמן **Use your own OAuth credentials**,
   והדבק את ה-**Client ID** וה-**Client secret** משלב 3.
3. בצד שמאל, בשדה **"Input your own scopes"** הדבק:
   ```
   https://www.googleapis.com/auth/calendar.events
   ```
   → **Authorize APIs**.
4. **התחבר עם החשבון הרלוונטי** (בפעם הראשונה — `pgishotzahar`, בשנייה — `pgishotramatgan`).
   אם מופיע "Google hasn't verified this app" → **Advanced → Go to RES Calendar (unsafe)** → **Continue**. (זה בסדר — זו האפליקציה שלך.)
5. אשר את ההרשאה. חוזרים ל-Playground → לחץ **Exchange authorization code for tokens**.
6. יופיע **Refresh token** (מתחיל ב-`1//`). **העתק ושמור** — סמן איזה חשבון זה.

חזור על שלב 4 עם החשבון השני.

---

## מה לשלוח לי בסוף

```
Client ID:                 ...
Client secret:             ...
Refresh token (צחר):        1//...   ← מהחשבון pgishotzahar
Refresh token (רמת גן):     1//...   ← מהחשבון pgishotramatgan
```

**זה סוד** — אני אגדיר את זה כ-Supabase secrets (בדיוק כמו שאר המפתחות),
לעולם לא בקוד ולא ב-git. עם אלה, הבוט יוכל ליצור אירועים ביומן הנכון.

---

## מה כבר מוכן מצדי (ואיפה עצרנו)

- ✅ **הפרסר** — קורא את הודעת `.פגישה`, מזהה סוג/שם/טלפון/תאריך/שעה/מתאם/מבצע/הערות,
  ובונה אירוע יומן בפורמט הקיים (`פגישת זום - <שם> - <מתאם>`). נבדק על ההודעות האמיתיות של נטלי ורות. ✅
- ✅ **ולידציה** — חסר תאריך/שעה/מתאם → נדחה עם הודעה; יום-בשבוע שלא תואם לתאריך → נדחה.
- ⏳ **נשאר אחרי שתשלח את הטוקנים:** חיבור Webhook של Green API (הבוט שומע את הקבוצה)
  + פונקציית הכתיבה ליומן. ואז — **קודם קבוצת בדיקה**, ורק כשמדויק — הקבוצה האמיתית.
