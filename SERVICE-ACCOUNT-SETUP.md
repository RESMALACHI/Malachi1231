# חיבור כתיבה ליומנים דרך Service Account — מדריך קצר

במקום OAuth Playground: יוצרים **זהות אחת** לבוט ("משתמש שירות"), ומשתפים איתה
כל יומן — בדיוק כמו לשתף יומן עם עובד. יתרונות: גישה **רק** ליומנים ששיתפת,
ביטול בלחיצה, ואין טוקן שפג כל 7 ימים.

עושים את זה **פעם אחת**. ~5 דקות.

---

## שלב 0 (מומלץ) — גיבוי לפני הכול
בכל אחד משני היומנים: ⚙️ **Settings → Import & Export → Export** → יורד `.ics`
עם צילום מלא. רשת ביטחון, שמור אותו בצד.

## שלב 1 — יצירת ה-Service Account (פעם אחת)

1. היכנס ל-<https://console.cloud.google.com> ובחר למעלה את הפרויקט הקיים
   (זה שיצרת בהגדרת ה-OAuth, למשל `RES Calendar`).
2. ודא שה-API פעיל: ☰ → **APIs & Services → Library** → חפש **Google Calendar API** → אם כתוב **Enable**, לחץ; אם **Manage**, זה כבר פעיל.
3. ☰ → **IAM & Admin → Service Accounts** → **+ Create service account**.
4. שם: `res-calendar-bot` → **Create and continue** → את שלב ה-Roles דלג (**Continue**) → **Done**.
5. פתח את המשתמש שנוצר → לשונית **Keys** → **Add key → Create new key → JSON → Create**.
   יורד קובץ `.json` — **זה הסוד**, שמור אותו.
6. העתק את **כתובת המייל** של המשתמש (נראית כך:
   `res-calendar-bot@res-calendar.iam.gserviceaccount.com`).

## שלב 2 — לשתף איתו כל יומן (הדבר שנותן את הכתיבה)

עושים **פעמיים** — פעם לכל יומן (`pgishotzahar` ו-`pgishotramatgan`):

1. פתח **Google Calendar** של החשבון הרלוונטי.
2. בצד שמאל, רחף מעל שם היומן → **⋮ → Settings and sharing**.
3. **Share with specific people or groups → Add people and groups** →
   הדבק את מייל ה-Service Account משלב 1.6.
4. הרשאה: בחר **"Make changes to events"** (לא "See all event details") → **Send**.
5. באותו מסך, גלול ל-**Integrate calendar** → העתק את ה-**Calendar ID**
   (בדרך כלל זה מייל החשבון, למשל `pgishotzahar@gmail.com`).

חזור על שלב 2 עם היומן השני.

---

## מה לשלוח לי בסוף

1. **תוכן קובץ ה-JSON** (או רק שני השדות `client_email` ו-`private_key` מתוכו).
2. שני ה-**Calendar ID**:
   ```
   יומן צחר (צחר + זום):   ...   ← ה-Calendar ID של pgishotzahar
   יומן רמת גן:            ...   ← ה-Calendar ID של pgishotramatgan
   ```

**זה סוד** — אני אשמור את המפתח **רק** בטבלה הנעולה בשרת (`app_auth`),
לעולם לא בקוד ולא ב-git. לביטול בכל רגע: מוחקים את המייל מהשיתוף ביומן,
או מוחקים את המפתח ב-Console.

---

## מה יקרה אחרי שתשלח

1. אשמור את המפתח, ואריץ **בדיקת כתיבה** לכל יומן בנפרד — יוצר אירוע-בדיקה,
   קורא אותו, ומוחק אותו מיד (לא נשאר כלום). זה מוכיח שהכתיבה עובדת בלי לגעת בקיים.
2. אחווט את הניתוב: `סוג: זום` או `יומן: צחר` → יומן צחר; `יומן: רמת גן` → יומן רמת גן.
3. נריץ `.פגישה` אמיתית אחת, נוודא שהאירוע נכון, ונמחק.
4. רק אז מחליפים לקבוצת הווצאפ האמיתית.

**הערבות לא משתנה:** הקוד יוצר אירועים בלבד (`POST`), אף פעם לא עורך/מוחק קיימים.
