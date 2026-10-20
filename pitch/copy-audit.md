# zap UP: copy audit against One Tone (internal register)

Source of truth: the `zap-one-tone` skill plus `references/internal.md`. The internal register talks like a colleague: warm, with clarity before playfulness. The main point comes first, and the text is in plural or gender-neutral form. No slashes (`/ת`, `/ה`), lowercase `zap`, no `...`, and at most one `!`.

Line numbers refer to the files as of this audit. If a line has moved, search for the "current text" instead. Onboarding.tsx is excluded because it's being rewritten.

## Glossary: one form per concept

| Concept | Use | Don't use |
|---|---|---|
| The product | **zap UP** | zap KNOW (only as a descriptor: "zap KNOW · מרכז הלמידה והידע של zap"), ZAP, Zap |
| The company inside a Hebrew sentence | ב-zap, של zap, ל-zap | בזאפ, קבוצת זאפ |
| The verb or playful use | זאפ (at most once per text: "זאפ קטן וסיימנו") | |
| A course or update when the type is known | **קורס** / **עדכון** | פריט (on user-facing screens) |
| A course or update, generically | **תוכן** (for the collective) / **קורס או עדכון** (for a single item) | פריט |
| An internal project | **פרויקט** (the section is "קורה ב-zap", always in quotes inside a sentence) | פוסט (except in the points rules, where "פוסט" is OK) |
| Comment | **תגובה** | |
| Like or dislike | **לייק / דיסלייק** (together: "לייק או דיסלייק") | תגובה לפריט, תגובה (in the sense of a reaction) |
| Points | **נקודות** (in tables: נק') | |
| Level | **רמה** (zapper מתחיל … zapper על) | דרגה |
| Badge | **תג** | |
| The board | **הטבלה** (people / teams, החודש / כל הזמנים) | לוח מובילים, לידרבורד |
| The personal area | **האזור שלי** | |
| Preferences | **ההעדפות שלי** | הגדרות |
| The library/search page | **חיפוש** (in navigation); page headline as it is now | מאגר / המאגר |
| Team profiles | **הצוותים** (navigation); page headline "ככה עובדים פה" | איך עובדים פה (as a nav label) |
| Admin screen | **ניהול** | אישורים (the screen has more than approvals) |
| Home | **הבית** | הבית שלי |
| The manager | **מי שמנהל אתכם** / **המנהלים** (plural, neutral) | מנהל/ת, המנהל/ת הישיר/ה |
| An employee | **עובדים** (plural) / restructure the sentence | עובד/ת |
| "Shared with you" | **שיתפו איתכם** / **המלצה מ-{שם}** | שיתף/ה איתך, שיתפו איתך |
| AI summary | **ה-AI סיכם** (active voice) / the badge "סוכם ב-AI" may stay | התקצירים נכתבים |
| Buttons (CTAs) | **Infinitive verb:** לשמור, לשלוח, לשאול, לפתוח, לבטל, לסגור, למחוק, לדווח, להיכנס, לצאת, לאשר, לדחות, לתקן | Nouns (שליחה, מחיקה, ביטול, סגירה, כניסה, יציאה, דיווח) or command forms (שאלו, שלחו לי) |
| Section links | Destination name plus an arrow: "לטבלה ←", "לכל הפרויקטים ←" | |
| "Everything" | **הכול** | הכל |
| "Trends" | **טרנדים** (the user's term; kept on purpose) | |

## Gender rule (affects many lines)
Every slash form has to be rewritten. Below is a fix for each occurrence, so the next agent can grep for `/ת`, `/ה`, `/תקבל` and the like and replace each one with the text in the tables.

---

## src/App.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 71 | הבית שלי | Doesn't match the bottom bar ("הבית") | הבית |
| 74 | מאגר | Unclear; the page is search | חיפוש |
| 76 | איך עובדים פה | Long nav label, inconsistent with "צוותים" elsewhere | הצוותים |
| 78 + 83–85 | האזור שלי (in the nav **and** next to the avatar) | Duplicated in the same top bar | Keep only the avatar link (aria-label "האזור שלי") and remove the nav item |
| 80 | אישורים | The screen holds approvals, sources, budget and the run log | ניהול |
| 107 | התקצירים נכתבים ב-AI מתוך מידע פומבי על כל קורס ועדכון, וכל פריט מוביל למקור המקורי. | Passive, "פריט", "למקור המקורי" is redundant | ה-AI מסכם מידע פומבי על כל קורס ועדכון, וכל אחד מהם מוביל למקור. |
| 108 | מצאתם טעות? יש כפתור "דווח על טעות" בכל פריט. | The button name is a masculine-singular command; "פריט" | מצאתם טעות? בכל קורס ועדכון יש כפתור "לדווח על טעות". |
| 110 | יציאה | Button as a noun | לצאת |
| 116 | שאלו | Bottom bar: fine as a short label; keep for consistency with the nav | (no change) |

## src/lib.ts
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 109 | מחכה למנהל/ת | Slash | מחכה לאישור |
| 112 | נקנה | Fine, but "קניתם" matches the history screen | נקנה (no change) |
| 129 | ROLES | Being replaced by the onboarding agent | (no change) |

## src/components/ui.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 40 | סוכם ב-AI | OK as a badge (the design agent is shrinking it) | (no change) |
| 44 | נתוני דמו | OK | (no change) |

## src/components/social.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 96 | שיתוף{n} | Reads as "שיתוף 1"; unclear | Share icon + number (design); aria-label: "לשתף" |
| 142 | נשלח לערוץ קורה ב-zap ב-Teams. | The section name has no quotes | נשלח לערוץ "קורה ב-zap" ב-Teams. |
| 144 | נשלח ל${name}. זה יופיע אצלם בבית, וגם ב-Teams ובמייל. | "אצלם" mixes forms (plural for one person); delivery promise is also inaccurate (Teams personal isn't connected) | שלחנו ל${name}. זה יחכה בבית שלהם ב-zap UP, וגם במייל. |
| 154/156 | שיתוף (dialog title) | Fine as a title | (no change) |
| 157/165 | סגירה | Button as a noun | לסגור |
| 169 | לעמית או עמיתה | OK | (no change) |
| 170 | לערוץ קורה ב-zap ב-Teams | Missing quotes | לערוץ "קורה ב-zap" ב-Teams |
| 171 | להעתיק קישור | OK | (no change) |
| 192 | לא מצאנו. אולי הם עוד לא נכנסו ל-zap UP. | Fine; "הם" is clumsy for one person | לא מצאנו. אולי עוד לא נכנסו ל-zap UP. |
| 201 | לשלוח | OK | (no change) |
| 202 | חזרה | Noun | לחזור |
| 253 | מה חושבים עליו פה | Unclear "עליו" | מה אומרים פה |
| 254 | עוד אין תגובות. מי פותח? | OK, light humor | (no change) |
| 263 | מחיקה | Noun | למחוק |
| 265 | דווח, תודה | Passive and abrupt | קיבלנו, תודה |
| 267 | דיווח | Noun | לדווח |
| 277 | לפרסם תגובה | OK | (no change) |
| 294 | ${shared_by} שיתף/ה איתך | Slash, singular | המלצה מ-${shared_by} |

## src/components/points.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 14, 50 | פרסום בקורה ב-zap | Missing quotes; reads as "בקורה" | פרסום ב"קורה ב-zap" |
| 15 | פתיחה | Unclear | פתיחת קורס או עדכון |
| 17, 51 (react) | תגובה לפריט / לייק או דיסלייק | **Clashes with "תגובה" (comment)** | לייק או דיסלייק (in both places) |
| 27 | פתיחת פריט | "פריט" | פתיחת קורס או עדכון |
| 41–46 | Emoji icons (🎓🏅💬⚡) | The design agent is replacing them with SVG | (design) |
| 43 | 5 שיתופים עם עמיתים | Fine; not parallel with the others (verb) | משתפים 5 פעמים |
| 44 | 10 תגובות | Not parallel | כותבים 10 תגובות |
| 46 | מגיבים ראשונים על 3 פריטים | "פריטים" | מגיבים ראשונים על 3 קורסים או עדכונים |
| 169 | דיסלייק אף פעם לא מוריד נקודות למישהו. הכי הרבה נקודות מקבלים על למידה ועל שיתוף ידע. | Order: the main point should come first | הכי הרבה נקודות מקבלים על למידה ועל שיתוף ידע. דיסלייק אף פעם לא מוריד נקודות לאף אחד. |
| 172 | **מה זה נותן:** רמות ותגים, שלושת המובילים של החודש מקבלים תוספת לתקציב הלמידה, והמובילים מקבלים קרדיט בפרק השבועי. | Long list sentence, "המובילים" repeated | **מה זה נותן:** רמות ותגים. שלושת המובילים של החודש מקבלים תוספת לתקציב הלמידה, וגם פרגון בפרק השבועי. |
| 191 | מאז ומעולם | Elevated phrase | מאז שהתחלתם |
| 194 | עוד לא בטבלה | OK | (no change) |
| 206/203 | הרווחתם | OK | (no change) |
| 253 | אתם במקום N עם M נקודות. לטבלה המלאה ← | OK | (no change) |

## src/components/budget.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 39 | 🏆 כולל X בונוס, כי סיימתם את החודש שעבר בין המובילים בטבלה. | Emoji (design) | כולל X בונוס, כי סיימתם את החודש שעבר בין המובילים בטבלה. |
| 43 | סכום לדוגמה. את הסכום האמיתי קובעים ב-L&D. | OK | (no change) |
| 71 | זה מעל התקציב החודשי, אז צריך אישור מהמנהל/ת הישיר/ה. מה המייל שלהם? | Slash | זה מעל התקציב החודשי, אז צריך אישור ממי שמנהל אתכם. מה כתובת המייל? |
| 76 | לשמור ולשלוח בקשה | OK | (no change) |
| 85 | מעל התקציב, שלחנו בקשה למנהל/ת. נעדכן כשתגיע תשובה. | Slash | זה מעל התקציב, אז שלחנו בקשת אישור. נעדכן ברגע שתגיע תשובה. |
| 89 | אושר אוטומטית. קונים עכשיו באתר עם הכרטיס הווירטואלי של zap UP. | OK ("אושר" without an actor is acceptable) | (no change) |

## src/components/prefs.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 81 | שומרים / לשמור | OK | (no change) |
| 83 | נשמר. הפיד מתעדכן. | OK | (no change) |
| 84 | משהו נתקע בשמירה. נסו שוב. | OK | (no change) |

## src/pages/Home.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 124 | 'עמית/ה' (fallback) | Slash | 'מישהו מהצוות' |
| 148 | Headline light: `היי ${firstName}, זה השבוע שלכם` / black: "מה חדש בתחום" | "בתחום" is vague; singular name plus plural "שלכם" | light: `היי ${firstName},` / black: "מה חדש השבוע" |
| 150 | האזור שלי וההעדפות ← | OK (consider removing; it's in the top bar) | (no change) |
| 156 | ככה תופיעו בטבלה, בתגובות ובשיתופים. רגע אחד וסיימנו. | OK | (no change) |
| 166–167 | Hand: "הפרק השבועי שלכם" + "3 דברים ששווה להכיר השבוע" | **The number is wrong when fewer than 3 items show** (the screen showed 2) | Hand: "הפרק השבועי שלכם" + "מה שווה להכיר השבוע" |
| 168 | אוספים בשבילכם | OK | (no change) |
| 169 | עוד אין תוכן מאושר בנושאים שבחרתם. הוא מגיע עם האיסוף הבא. | OK | (no change) |
| 181 | כל שבוע מגיע פרק חדש ב-Teams ובמייל, לפי הנושאים שבחרתם. | Teams personal messages aren't connected; promises something that won't happen | כל יום ראשון מגיע פרק חדש במייל, לפי הנושאים שבחרתם. |
| 181 (episode) | הפרק הזה נשלח גם ב-Teams ובמייל. | Same | הפרק הזה נשלח גם במייל. |
| 189 | שיתפו איתך | Singular | שיתפו איתכם |
| 197 | לפתוח | OK | (no change) |
| 206 | מה מעניין אותי `<small>`הנושאים והצרכים שבחרתם, לפי מה שעובד אצל הצוות`</small>` | "מה שעובד אצל הצוות" is unclear | מה מעניין אותי `<small>`לפי מה שבחרתם ומה שאהבו אצל הצוות`</small>` |
| 223 | מה יכול לעניין אותך | Singular; the user's wording, but the rule is plural (the user's wording appears on the slide; keep the decision consistent) | מה יכול לעניין אתכם |
| 232 | טרנדים `<small>`הכי נצפה השבוע`</small>` | OK | (no change) |
| 241 | ממשיכים מאיפה שעצרתם | OK | (no change) |
| 254 | עוד אין פרויקטים. יש לכם משהו להראות? ספרו לנו | OK | (no change) |
| 257 | שאלו את zap UP | OK as a title | (no change) |
| 261 | שאלו (button) | Button: infinitive | לשאול |
| 268–269 | תקציב הלמידה שלכם החודש / לתקציב ← | OK | (no change) |

## src/pages/Item.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 104 | הפריט הזה כבר לא זמין. אולי הקישור שלו נשבר, או שהוא בבדיקה. | "פריט" | התוכן הזה כבר לא זמין. אולי הקישור שלו נשבר, או שהוא אצלנו בבדיקה. |
| 135 | שמור אצלכם ✓ / שמירה לאחר כך | Not consistent with the CTAs | נשמר ✓ / לשמור לאחר כך |
| 143 | לקנות מהתקציב | OK | (no change) |
| 153 | ביטול | Noun | לבטל |
| 158 | משהו נתקע בדרך. נסו שוב עוד רגע. | OK | (no change) |
| 161 | עד גובה התקציב החודשי זה מאושר מיד. מעל זה, הבקשה הולכת ישר למנהל/ת. | Slash | עד גובה התקציב החודשי זה מאושר מיד. מעל זה, הבקשה הולכת ישר למי שמנהל אתכם. |
| 169 | מסמנים כל שיעור שסיימתם, וככה zap UP זוכר איפה עצרתם. | OK | (no change) |
| 191 | תודה. העברנו את הפריט לבדיקה, והוא יחזור אחרי שנתקן. | **Inaccurate after patch-007:** the content is hidden only after 2 reports | תודה. הדיווח הגיע לצוות L&D, והם יבדקו את זה. |
| 199 | שליחה | Noun | לשלוח |
| 200 | ביטול | Noun | לבטל |
| 204 | ⚑ דווח על טעות | Masculine-singular command | לדווח על טעות (icon from design) |

## src/pages/Topic.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 27 | הנושא הזה לא קיים. | Dry | לא מצאנו את הנושא הזה. |
| 35 | אנחנו כבר בוחרים מקורות לנושא הזה. ברגע שהם מאושרים, התוכן מגיע לכאן לבד. | Passive | אנחנו כבר בוחרים מקורות לנושא הזה. ברגע שנאשר אותם, התוכן יגיע לכאן לבד. |
| 53 | הכול / קורסים / עדכונים | OK | (no change) |
| 65 | רלוונטי ל: | Colon after a prefix | רלוונטי ל- |
| 73 | אין כאן עדיין תוכן שמתאים לסינון. | OK; add the next step | אין כאן עדיין תוכן שמתאים לסינון. אפשר לנסות סינון אחר. |

## src/pages/Library.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 47 | {n} תוצאות | "1 תוצאות" | n===1 ? "תוצאה אחת" : `${n} תוצאות` |
| 50 | לא מצאנו. אפשר לנסות מילה אחרת, או לשאול את zap UP. | OK | (no change) |

## src/pages/Login.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 16 | zap UP פתוח לעובדי zap. נכנסים עם כתובת המייל של העבודה (…). | OK | (no change) |
| 36 | הקוד לא עבד. בדקו שהעתקתם את כולו, או בקשו קוד חדש. | Slightly blames the user; the common cause is an older code | הקוד לא עבד. אולי הוא כבר לא בתוקף, או שנשלח אחריו קוד חדש. אפשר לבקש קוד חדש. |
| 60 | שלחו לי קוד | Command form (as an option it's OK); consistency | לשלוח לי קוד |
| 69 | כניסה | Noun | להיכנס |
| 71 | החלפת מייל | Noun | להחליף מייל |

## src/pages/Me.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 30 | הכל | Spelling | הכול |
| 31–38 (filters) | נפתח, נשמר, לייק, תגובות, שיתפו איתי, שיתפתי, התקדמות, קניות | Mixes singular/plural/nouns/first person | פתחתם, שמרתם, אהבתם, הגבתם, שיתפו איתכם, שיתפתם, התקדמות, קניות |
| 42–48 (tiles) | נפתחו, נשמרו, לייקים, תגובות, שיתופים, בתהליך, הושלמו | Not parallel | פתחתם, שמרתם, אהבתם, הגבתם, שיתפתם, בתהליך, סיימתם |
| 115 | hand: "הכל נשמר" | Spelling | הכול נשמר |
| 121 | המאגר | Glossary | חיפוש |
| 120 | איך עובדים פה | Glossary | הצוותים |
| 123 | אישורים | Glossary | ניהול |
| 168 | תשאלו את zap UP, למשל: … | "תשאלו" is a casual future form | שאלו את zap UP, למשל: … |
| 174 | לא מצאנו משהו כזה בהיסטוריה שלכם. אולי במילה אחרת? | OK | (no change) |

## src/pages/Leaderboard.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 23 | נק' לחבר/ה | Slash | נק' בממוצע |
| 45 | צוותים מדורגים לפי ממוצע לחבר/ה פעיל/ה, כדי שגם צוות קטן יכול לנצח. | Slash; grammar ("שגם … יכול") | את הצוותים מדרגים לפי ממוצע הנקודות של מי שפעיל בהם, כדי שגם צוות קטן יוכל לנצח. |
| 49 | הטבלה לא נטענה כרגע. נסו לרענן בעוד רגע. | OK | (no change) |
| 85 | יש לכם N נקודות החודש. עוד קצת וזה בטבלה. | **Contradiction:** anyone with points is already on the board | יש לכם N נקודות החודש. עוד קצת ואתם עולים בטבלה. |
| 73 | (אתם) | OK | (no change) |

## src/pages/Ask.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 34 | לא הצלחתי לענות כרגע. נסו שוב בעוד רגע. | First-person singular, inconsistent with "אנחנו" elsewhere | לא הצלחנו לענות כרגע. נסו שוב בעוד רגע. |
| 53 | התשובות מגיעות רק מהתוכן שב-zap UP: … | Long; OK | התשובות מגיעות רק מהתוכן שב-zap UP: מהצוותים (ידע פנימי) ומהקורסים והעדכונים (ידע חיצוני). ליד כל תשובה מופיעים המקורות. |
| 83 | שליחה | Noun | לשאול |

## src/pages/Budget.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 80 | … מעל התקציב, הבקשה הולכת ישר למנהל/ת, לאישור בקליק אחד. | Slash | … מעל התקציב, הבקשה הולכת ישר למי שמנהל אתכם, לאישור בקליק אחד. |
| 127 | אצל {email} | OK | (no change) |
| 138 | ההעדפות שלי עברו לאזור שלי | Awkward ("שלי … שלי") | ההעדפות נמצאות עכשיו באזור שלי |

## src/pages/Internal.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 35 | hand: "מי עושה זאפ על זה?" | Fingerprint, once only; OK | (no change) |
| 58 | שליחה | Noun | לשלוח |
| 59 | קיבלנו. ה-AI מסכם, צוות L&D מאשר, והפרויקט עולה לכאן. | **Inaccurate:** publishing is automatic (INTERNAL_AUTO_APPROVE) | קיבלנו. ה-AI מסכם, והפרויקט עולה לכאן תוך דקה. |
| 60 | … או פרסמו בערוץ ה-Teams של קורה ב-zap. | Quotes | … או פרסמו בערוץ "קורה ב-zap" ב-Teams. |

## src/pages/Teams.tsx / TeamDetail.tsx
| File:line | Current text | Problem | Replacement |
|---|---|---|---|
| Teams 25 | הפרופילים כאן הם נתוני דמו להאקתון. בגרסה המלאה הם נבנים משיחה חודשית קצרה… | Passive | הפרופילים כאן הם נתוני דמו להאקתון. בגרסה המלאה סוכן AI בונה אותם משיחה חודשית קצרה עם כל צוות, ומהמקומות שכל צוות בחר לשתף. |
| TeamDetail 27 | הפרופיל הזה נוצר כנתוני דמו. הוא עוד לא אושר מול הצוות האמיתי. | Passive | זה פרופיל דמו. הצוות האמיתי עוד לא אישר אותו. |
| TeamDetail 44 | שם וקישור בלבד. המערכת עצמה בודקת אם יש לכם הרשאה | OK; tidy up | רק שם וקישור. המערכת המקורית בודקת את ההרשאות |

## src/pages/Admin.tsx
| Line | Current text | Problem | Replacement |
|---|---|---|---|
| 110 | אין מה לאשר. כל הכבוד, סיימתם להשבוע. | "להשבוע" | אין מה לאשר. כל הכבוד, סיימתם לשבוע הזה. |
| 160 | לשמור ולאשר | OK | (no change) |
| 200 | סכום חודשי לכל עובד/ת (₪) | Slash | סכום חודשי לכל אחד ואחת (₪) |
| 232 | מנהל/ת (table header) | Slash | מאשרים |
| 210 | נשמר. העובדים רואים את הסכום החדש. | OK | (no change) |

## supabase/functions (emails and Teams)
| File:line | Current text | Problem | Replacement |
|---|---|---|---|
| _shared/core.ts 137 | את/ה כותב/ת בשם zap UP… (system prompt) | Not user-facing, but it shows the model the forbidden slash form | כותבים בשם zap UP (zap KNOW), מרכז הלמידה והידע של עובדי zap, בעברית זאפית… |
| purchase 49 | המנהל/ת אישר/ה את "${title}". אפשר לקנות עכשיו עם הכרטיס של zap UP. | Slash | הבקשה ל"${title}" אושרה. אפשר לקנות עכשיו עם הכרטיס של zap UP. |
| purchase 50 | … שווה לדבר עם המנהל/ת, או לחפש חלופה ב-zap UP. | Slash | "${title}" לא אושר הפעם. שווה לדבר על זה עם מי שמנהל אתכם, או לחפש חלופה ב-zap UP. |
| purchase 59 | אישרתם, תודה / "${title}" אושר. העובד/ת מקבל/ת הודעה ויכול/ה לקנות עכשיו. | Slash | אישרתם, תודה / "${title}" אושר. שלחנו עדכון, ואפשר כבר לקנות. |
| purchase 60 | סירבתם, תודה / העובד/ת יקבל/תקבל הודעה ש"${title}" לא אושר הפעם. | Slash, "סירבתם" is harsh | קיבלנו, תודה / שלחנו עדכון ש"${title}" לא אושר הפעם. |
| purchase 91 | … אז צריך את האישור שלך על ההפרש. | Singular | … אז צריך אישור על ההפרש. |
| purchase 96 | ${who} מבקש/ת אישור ללמידה: ${title} | Slash | בקשת אישור ללמידה מ-${who}: ${title} |
| share 31 | ${from} חושב/ת שזה שווה לך: "${title}" | Slash | המלצה מ-${from}: "${title}" |
| share 31 | במילים שלו/ה: ${note} | Slash | בהערה: ${note} |
| share 36 | ${from} שיתף/ה איתך מ-zap UP: ${title} | Slash, singular | המלצה מ-${from} ב-zap UP: ${title} |
| share 37 | שיתפו איתך משהו | Singular | שיתפו איתכם משהו |
| send-email 27–29 | מעתיקים את הקוד… וזהו, אתם בפנים. / הקוד תקף לשעה… | OK | (no change) |
| core 128–130 | משהו נתקע ב-${job} … | OK (internal) | (no change) |
| weekly 171–174 | הפרק השבועי שלכם ב-zap UP / להאזנה (2 דקות) / לפתוח את zap UP | OK | (no change) |

## Information-architecture issues the copy exposes
1. **The top bar has 10 items**, and "האזור שלי" appears twice. Suggestion: הבית · נושאים · חיפוש · קורה ב-zap · הצוותים · שאלו את zap UP · הטבלה, plus an avatar (האזור שלי, התקציב, ניהול, לצאת).
2. **"תגובה" means two things** (comment, and like/dislike in the points rules). Fixed in the glossary.
3. **Delivery promises that don't happen today:** "ב-Teams ובמייל" on Home and in shares, while personal Teams messages aren't connected. Change to "במייל" until there's a Workflow.
4. **Inaccurate messages after changes:** the report message (content goes away for checking) and the "קורה ב-zap" message (L&D approves). Both were fixed above.
5. **A fixed number in the episode headline** ("3 דברים") versus actual content of 1–2 items.
6. **"מה יכול לעניין אותך"**: the user's wording versus the plural rule. I recommend "אתכם", and the same change on the presentation slide for consistency.
7. **Button language mixes nouns and verbs:** standardize on infinitives (see the glossary).
8. **Empty states:** most of them already give a next step. Topic.tsx:73 and TeamDetail have none; added.
9. **The footer explains the AI and reporting:** it repeats the "סוכם ב-AI" badge on every card. With a smaller badge, keep it once in the footer and once on the item page.
10. **"1 תוצאות"** in the library, and **pluralization** in general (`פעילים`, `שיעורים`): needs a helper for singular and plural.
