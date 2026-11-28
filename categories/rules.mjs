/**
 * The app's own sorting of products into aisles (see framework.json), from the
 * product's name in the government price files and its "sold by weight" mark.
 *
 * How a name is sorted:
 * 1. Apostrophes and quote marks are dropped (צ'יפס = ציפס).
 * 2. Its first word is looked up in `Words`. Hebrew names start with what the
 *    product is ("גבינת שמנת…", "שמפו…"). A word may need the rest of the name to
 *    decide: then it has a list of [pattern, aisle] tried in order, the last entry
 *    being the aisle when none fits.
 * 3. A word that says nothing about the product (a pack: "מארז", "זוג"; a brand:
 *    "אסם") is in `Skip`: the next word is looked up instead.
 * 4. Frozen ("קפוא" anywhere) moves food to its frozen aisle; sold by weight moves
 *    cheese, cold cuts and olives to the deli counter.
 *
 * Sorted by Claude (in Claude Code) with the app's owner, from the most common
 * words; add a word when a product is sorted wrong or not at all.
 */

/** Words that don't say what the product is: the next word decides. */
export const Skip = new Set([
  'מארז', 'זוג', 'שלישיית', 'שלישית', 'רביעיית', 'רביעית', 'שישיית', 'שישית', 'מאגדת',
  'מיני', 'מיקס', 'ערכת', 'אסם', 'לה', 'אל', 'A&D', 'קופסת', 'צנצנת', 'שקית',
]);

/** Not products (coupons, deposits): left unsorted. */
export const NotProducts = new Set(['קופון']);

// Shorthands for the rules below.
const cheeseByKind = [
  [/מותכת|משולשי/, 'yellow-cheese'],
  [/שמנת|לבנה|קוטג|צפתית|בולגרית|פטה|ריקוטה|מסקרפונה|עזים רכה|שמנת|5%|9%|3%/, 'soft-cheese'],
  [/מוצרלה|צהובה|עמק|גאודה|צדר|אמנטל|פרמזן|גרנה|גויה|מנצגו|ברי|קממבר|רוקפור|גורגונזולה|חלומי|קשקבל|פרובולונה|אדם|מסדם|טל העמק/, 'yellow-cheese'],
  'yellow-cheese',
];

/** First word → aisle, or [pattern, aisle]… with a default last. */
export const Words = {
  // Drinks & alcohol
  'יין': 'wine',
  'בירה': 'beer-spirits',
  'ליקר': 'beer-spirits',
  'וודקה': 'beer-spirits',
  'ויסקי': 'beer-spirits',
  'וויסקי': 'beer-spirits',
  'ברנדי': 'beer-spirits',
  'משקה': [
    [/חלב|שוקו|יוגורט|לבן/, 'milk-cream'],
    [/שקדים|סויה|שיבולת|אורז|קוקוס|אגוזי|צמחי/, 'plant-milks'],
    [/אלכוהול|וודקה|קוקטייל/, 'beer-spirits'],
    'soft-drinks',
  ],
  'מיץ': [[/לימון.*(משומר|טבעי|100)/, 'sauces'], 'soft-drinks'],
  'נקטר': 'soft-drinks',
  'סירופ': [[/מייפל|תמרים|אגבה/, 'spreads'], 'soft-drinks'],
  'שוופס': 'soft-drinks',
  'מים': 'water',
  'מי': [[/פה/, 'dental'], [/ורדים|זהר/, 'baking'], [/פנים|מיסלר|מיסלאר/, 'skincare-cosmetics'], 'water'],
  'תה': 'coffee-tea',
  'חליטת': 'coffee-tea',
  'קפה': 'coffee-tea',
  'קפסולות': [[/קפה|אספרסו|קופאין|נספרסו/, 'coffee-tea'], [/כביסה/, 'laundry'], [/כלים/, 'dishwashing'], 'coffee-tea'],
  'אבקת': [
    [/כביסה|אריאל|מקסימה|וניש|הלבנה|להסרת|סנו|פלא/, 'laundry'],
    [/מדיח|כלים/, 'dishwashing'],
    [/ניקוי/, 'home-cleaners'],
    [/אפי?יה|סוכר|קקאו|פודינג|ג.לי|גלטין|סודה|חרובים|וניל/, 'baking'],
    [/חלבון|פרוטאין|גיינר|ספירולינה|מאקה|פסיליום|קולגן/, 'other'],
    [/חלב|תמ"?ל/, 'baby-food'],
    [/מרק|פלאפל/, 'sauces'],
    [/בצל|שום|חרדל|וואסבי|ווסאבי|פפריקה|כורכום|ג.ינג.ר|קארי|ציר/, 'spices'],
    'soft-drinks',
  ],

  // Produce
  'תפוח': [[/אדמה/, 'vegetables'], [/חטיף|צ.?יפס|קלוי/, 'salty-snacks'], 'fruit'],
  'פלפל': [
    [/שחור|לבן|לימון|גרוס|טחון|מטחנה|אנגלי|ורוד|קאיין|גרגרים|גרגירים|מתוק\s*(גרוס|טחון)|\d+\s*ג/, 'spices'],
    [/ממולא|קלוי|כבוש|בחומץ|חלפוניו|חלאפניו|חתוך ב|חריף.*(סרה|צנצנת|\d+\s*גר)|צומה|שאטה|חריף.*ביטון/, 'canned'],
    'vegetables',
  ],
  'כרוב': [[/כבוש|חמוץ|כרובית כבוש|סלט/, 'hummus-salads'], 'vegetables'],
  'חסה': 'vegetables',
  'מלפפון': [[/מלח|חומץ|כבוש|חמוץ/, 'canned'], 'vegetables'],
  'מלפפונים': [[/מלח|חומץ|כבוש|חמוץ/, 'canned'], 'vegetables'],
  'עגבניות': [[/מרוסקות|קוביות|לקוביות|רסק|משומרות|קלופות|מיובשות|יכין|שימורי/, 'canned'], 'vegetables'],
  'פטריות': [[/שימורי|משומרות|חתוכות.*(יכין|ויליפוד)|בקופסא/, 'canned'], 'herbs-mushrooms'],
  'שום': [[/כבוש|קלוי|כתוש|גרוס|אבקת|מיובש/, 'spices'], 'vegetables'],
  'בצל': [[/מטוגן|מיובש|אבקת|גרוס/, 'spices'], [/כבוש|פנינה/, 'canned'], 'vegetables'],
  'כוסברה': 'herbs-mushrooms',
  'סלרי': 'vegetables',
  'חציל': [[/קלוי|במיונז|בטעם|סלט|בטחינה|פיקנטי/, 'hummus-salads'], 'vegetables'],
  'תירס': [[/קפוא/, 'frozen-veg-fruit'], [/מהשדה|גרעינים|שימורי|גמדי|קופסא|יכין|ויליפוד/, 'canned'], [/חטיף|פריכיות/, 'salty-snacks'], 'vegetables'],
  'אננס': [[/קופסא|שימורי|בסירופ|משומר/, 'canned'], [/מסוכר|מיובש|טבעות/, 'nuts-dried-fruit'], 'fruit'],
  'שזיף': [[/מיובש|ללא גלעין/, 'nuts-dried-fruit'], 'fruit'],
  'ענבים': [[/שוקולד/, 'chocolate-candy'], 'fruit'],
  'תמר': [[/כבוש|מגהול|מג.הול|דקלה|מיובש|ללא חרצן|\d+\s*גר/, 'nuts-dried-fruit'], 'fruit'],
  'אוכמניות': [[/שוקו/, 'chocolate-candy'], [/מיובש|חמוציות|\d+\s*גר/, 'nuts-dried-fruit'], 'fruit'],
  'עלי': [[/גפן/, 'canned'], [/בייבי|חסה|תרד|רוקט|שטופים/, 'vegetables'], 'herbs-mushrooms'],
  'לבבות': [[/דקל|ארטישוק/, 'canned'], 'vegetables'],
  'אפונה': [[/יבשה|מיה|גרוסה/, 'legumes'], [/קפוא/, 'frozen-veg-fruit'], 'canned'],
  'קוביות': [[/בטטה|דלעת|ירקות|סלק/, 'vegetables'], [/עגבניות/, 'canned'], [/מרק|ציר/, 'sauces'], [/קרח/, 'frozen-veg-fruit'], 'other'],

  // Bakery
  'לחם': 'bread',
  'חלה': 'bread',
  'לחמניות': 'rolls',
  'עוגת': 'cakes-pastries',
  'מאפה': 'cakes-pastries',
  'וופל': [[/בלגי|חם/, 'cakes-pastries'], 'cookies'],
  'בורקס': 'frozen-meals',
  'פרוסות': [[/טוסט|לחם/, 'bread'], [/גבינ/, 'yellow-cheese'], [/נקניק|פסטרמה|הודו/, 'packaged-cold-cuts'], 'other'],

  // Meat, poultry, fish
  'בשר': 'butcher',
  'חזה': [[/הודו.*(ברביקיו|מעושן|צלוי|פרוס|%)|מעושן|פרוס/, 'packaged-cold-cuts'], 'butcher'],
  'עוף': [[/שניצל|קציצות|נאגטס|טוב/, 'frozen-meat-fish'], 'butcher'],
  'סטייק': [[/דג|טונה|סלמון/, 'fish-counter'], 'butcher'],
  'שניצל': [[/תירס|צמחוני|טבעול|סויה/, 'frozen-meals'], [/טרי/, 'butcher'], 'frozen-meat-fish'],
  'צלי': 'butcher',
  'כתף': [[/מעושן|דק|פרוס/, 'packaged-cold-cuts'], 'butcher'],
  'שריר': 'butcher',
  'צלעות': 'butcher',
  'כבד': [[/קצוץ|ממרח|סלט/, 'hummus-salads'], 'butcher'],
  'כנפיים': 'butcher',
  'אסאדו': 'butcher',
  'שוקיים': 'butcher',
  'כרעיים': 'butcher',
  'ירכיים': 'butcher',
  'לשון': [[/פרוס|מעושן|דק/, 'packaged-cold-cuts'], 'butcher'],
  'עצמות': 'butcher',
  'צוואר': 'butcher',
  'אנטריקוט': [[/בורגר|המבורגר/, 'frozen-meat-fish'], 'butcher'],
  'סינטה': 'butcher',
  'טחון': 'butcher',
  'קבב': [[/קפוא/, 'frozen-meat-fish'], 'butcher'],
  'המבורגר': [[/טבעול|צמחוני|טבעוני|סויה/, 'frozen-meals'], 'frozen-meat-fish'],
  'שווארמה': 'butcher',
  'כדורי': [[/בשר/, 'frozen-meat-fish'], [/פלאפל/, 'frozen-meals'], [/גבינ|מוצרלה/, 'soft-cheese'], [/שוקולד|קוקוס|תמרים/, 'chocolate-candy'], 'other'],
  'פילה': [
    [/אנשובי|מטיאס|הרינג|מלוח/, 'canned'],
    [/מעושן/, 'meat-counter'],
    [/עוף|הודו/, 'butcher'],
    [/בקר|עגל|ריבוע/, 'butcher'],
    'fish-counter',
  ],
  'דג': [[/חטיף|אפוי.*מלוח/, 'salty-snacks'], [/טונה.*(שמן|מים|בהירה|קופס)/, 'canned'], [/מעושן/, 'meat-counter'], 'fish-counter'],
  'סלמון': [[/מעושן/, 'meat-counter'], 'fish-counter'],
  'ראש': [[/מקלחת/, 'other'], [/דג/, 'fish-counter'], 'butcher'],

  // Deli & cold cuts
  'פסטרמה': 'packaged-cold-cuts',
  'נקניק': 'packaged-cold-cuts',
  'נקניקיות': 'packaged-cold-cuts',
  'סלמי': 'packaged-cold-cuts',
  'זיתים': 'canned',
  'זית': 'canned',

  // Dairy & eggs
  'גבינת': cheeseByKind,
  'גבינה': cheeseByKind,
  'גאודה': 'yellow-cheese',
  'יוגורט': 'yogurts-desserts',
  'מעדן': [[/סויה/, 'tofu-vegan'], 'yogurts-desserts'],
  'חלב': [[/קוקוס.*(שימורי|פחית|330|400)/, 'canned'], [/שקדים|סויה|שיבולת|אורז/, 'plant-milks'], 'milk-cream'],
  'ביצים': 'eggs',
  'אצבעות': [[/גבינ/, 'yellow-cheese'], [/שוקולד/, 'chocolate-candy'], [/שומשום|מלוח/, 'salty-snacks'], [/דג/, 'frozen-meat-fish'], 'other'],
  'כדור': [[/מוצרלה/, 'soft-cheese'], [/רחצה/, 'body-soap'], [/כביסה/, 'laundry'], 'toys-stationery'],

  // Chilled
  'סלט': [[/טונה.*(ויליגר|שליש|קופס)|ויליפוד/, 'canned'], 'hummus-salads'],
  'חומוס': [[/שלם|יבש|גרגירי|מיה|\d+\s*ק"?ג/, 'legumes'], [/שימורי|יכין/, 'canned'], 'hummus-salads'],
  'טחינה': [[/גולמית|מלא|500|שומשום/, 'spreads'], 'hummus-salads'],

  // Pantry
  'רוטב': 'sauces',
  'שמן': [[/שפתיים|שפתון/, 'skincare-cosmetics'], [/זית|קנולה|חמניות|ענבים|סויה|תירס|קוקוס|שומשום|אגוז|אבוקדו|מזוכך/, 'oils-vinegar'], [/גוף|שיער|עיסוי|תינוק/, 'body-soap'], 'oils-vinegar'],
  'תרסיס': [[/שמן/, 'oils-vinegar'], [/שיער/, 'hair'], 'home-cleaners'],
  'חומץ': 'oils-vinegar',
  'פסטה': [[/ברוטב|מוכנה/, 'fresh-pasta-meals'], 'rice-pasta-grains'],
  'אטריות': 'rice-pasta-grains',
  'אורז': [[/פריכיות|פצפוצי/, 'salty-snacks'], 'rice-pasta-grains'],
  'קמח': 'flour-sugar',
  'שעועית': [[/לבנה.*(מושרית|ברוטב|יכין)|ברוטב|שימורי|צילי|ירוקה.*(קפוא|חתוכה)/, 'canned'], [/ירוקה|צהובה/, 'vegetables'], 'legumes'],
  'עדשים': 'legumes',
  'עדשות': [[/LIGHT|מגע|\d\.\d\d/, 'other'], 'legumes'],
  'שימורי': 'canned',
  'גרעיני': [[/תירס/, 'canned'], [/חמניות|דלעת|אבטיח/, 'nuts-dried-fruit'], 'nuts-dried-fruit'],
  'טונה': 'canned',
  'נתחי': [[/טונה|סלמון|סרדינים/, 'canned'], [/עוף|הודו|בקר/, 'butcher'], 'canned'],
  'מחית': [[/תינוק|לתינוק/, 'baby-food'], 'canned'],
  'מרק': [[/אמיתי|טרי|קפוא/, 'fresh-pasta-meals'], 'sauces'],
  'נוטלה': [[/ביסקוויט|בי רדי|B-READY/i, 'cookies'], [/גלידה/, 'ice-cream'], 'spreads'],
  'ממרח': [[/עמבה|חרדל|חריף|שום/, 'sauces'], [/חומוס|חציל|פלפלים/, 'hummus-salads'], 'spreads'],
  'ריבת': 'spreads',
  'דבש': 'spreads',
  'חמאת': [[/בוטנים|שקדים|אגוזים|קשיו/, 'spreads'], 'butter'],
  'מיונז': 'sauces',
  'דגני': 'cereals',
  'גרנולה': 'cereals',
  'פירורי': 'baking',
  'תערובת': [
    [/תבלינ|פלפלים|לתבשיל|לעוף|לבשר|לדגים|בהרט|חוואיג|זעתר/, 'spices'],
    [/עוגה|לעוגת|עוגיות|מאפינס|פנקייק|בראוניז|לאפייה/, 'baking'],
    [/אגוזים|פיצוחים|פירות יבשים|סטודנט/, 'nuts-dried-fruit'],
    [/ירקות.*(קפוא|מוקפא)/, 'frozen-veg-fruit'],
    'spices',
  ],
  'תבלין': 'spices',
  'מלח': [[/לימון/, 'baking'], [/אמבט|רחצה|ים המלח.*גוף/, 'body-soap'], 'spices'],
  'פפריקה': 'spices',
  'צבע': [[/מאכל/, 'baking'], [/שיער/, 'hair'], 'other'],
  'זרעי': [[/פשתן|צ.?יה|שומשום|קינואה/, 'legumes'], 'nuts-dried-fruit'],

  // Snacks & sweets
  'עוגיות': 'cookies',
  'קרקר': 'salty-snacks',
  'פריכיות': 'salty-snacks',
  'בייגלה': 'salty-snacks',
  'מקלות': [[/גריסיני|מלוחים|בייגלה/, 'salty-snacks'], [/אוזניים/, 'hygiene'], [/קינמון/, 'spices'], 'salty-snacks'],
  'ציפס': [[/קפוא/, 'frozen-veg-fruit'], 'salty-snacks'],
  'חטיף': [[/שוקולד|קיט|טוויקס|סניקרס|במבה נוגט/, 'chocolate-candy'], [/פרוטאין|דגנים|גרנולה|אנרגיה/, 'cereals'], [/לכלב|לחתול/, 'pet-food'], 'salty-snacks'],
  'חטיפי': [[/שוקולד/, 'chocolate-candy'], [/דגנים|גרנולה|פרוטאין/, 'cereals'], 'salty-snacks'],
  'סוכריות': 'chocolate-candy',
  'ממתק': 'chocolate-candy',
  'לקקן': 'chocolate-candy',
  'גומי': [[/לעיסה|מנטוס|פיצה|גרם|סוכר/, 'chocolate-candy'], 'other'],
  'מייק': 'chocolate-candy',
  'שוקולד': [[/ציפס|לבישול|לאפייה|מריר.*(70|80|לבישול)/, 'baking'], 'chocolate-candy'],
  'שקד': [[/ממרח|חמאת/, 'spreads'], 'nuts-dried-fruit'],
  'אגוז': [[/מוסקט/, 'spices'], 'nuts-dried-fruit'],
  'פקאן': 'nuts-dried-fruit',
  'בוטנים': 'nuts-dried-fruit',

  // Frozen
  'גלידת': 'ice-cream',
  'גלידה': 'ice-cream',

  // Cleaning
  'נוזל': [[/כלים|מדיח/, 'dishwashing'], [/כביסה/, 'laundry'], [/רצפה|ניקוי|לניקוי|אסלה|חלונות/, 'home-cleaners'], [/רחצה|גוף/, 'body-soap'], 'home-cleaners'],
  'מרכך': [[/שיער|לשיער/, 'hair'], 'laundry'],
  'סבון': [[/כלים/, 'dishwashing'], [/כביסה/, 'laundry'], 'body-soap'],
  'ספריי': [[/גוף|דאודורנט|אקס|לשיער|שיער/, 'deodorant'], 'home-cleaners'],
  'מבשם': 'home-cleaners',
  'מגב': 'cleaning-tools',
  'מטאטא': 'cleaning-tools',
  'ספוג': [[/רחצה|גוף|מקלחת/, 'body-soap'], 'cleaning-tools'],
  'דלי': [[/פופקורן/, 'tableware-cookware'], 'cleaning-tools'],
  'מטליות': [[/לחות.*(תינוק|לתינוק)/, 'diapers-wipes'], 'cleaning-tools'],
  'מגבונים': [[/תינוק|לתינוק|בייבי|האגיס|טיטולים/, 'diapers-wipes'], [/ניקוי|חיטוי|משקפי/, 'home-cleaners'], 'diapers-wipes'],
  'כפפות': 'cleaning-tools',
  'סנו': [[/נייר|אפייה|ניילון|שקיות/, 'foil-wrap'], [/דוחה/, 'other'], 'home-cleaners'],
  'מתקן': [[/כביסה/, 'laundry'], 'tableware-cookware'],
  'סל': [[/כביסה/, 'laundry'], 'other'],

  // Paper & disposables
  'נייר': [[/טואלט/, 'toilet-paper'], [/אפייה|כסף|אלומיניום/, 'foil-wrap'], [/מגבת|סופג/, 'paper-towels'], [/שיער|שעווה/, 'skincare-cosmetics'], [/מדפסת|A4|צילום/, 'toys-stationery'], 'paper-towels'],
  'מגבת': [[/נייר|גלילים/, 'paper-towels'], 'home-textiles'],
  'מפיות': 'disposable-tableware',
  'צלחות': [[/פלסטיק|קרטון|נייר|מתכלות|חד|\d+\s*יח/, 'disposable-tableware'], 'tableware-cookware'],
  'כוסות': [[/פלסטיק|קרטון|נייר|חד|\d+\s*יח/, 'disposable-tableware'], 'tableware-cookware'],
  'כפיות': [[/\d+\s*יח|פלסטיק|חד/, 'disposable-tableware'], 'tableware-cookware'],
  'שקיות': [[/אשפה|לפחים|זבל/, 'garbage-bags'], [/צליה|אפייה|הקפאה|סנדוויץ|כריכים|ואקום|אחסון/, 'foil-wrap'], 'garbage-bags'],
  'תבנית': [[/אלומיניום|חד/, 'foil-wrap'], 'tableware-cookware'],
  'תבניות': [[/אלומיניום|ארוזות|מאפינס|חד|נייר/, 'foil-wrap'], 'tableware-cookware'],
  'ר.שמאי': 'disposable-tableware',

  // Personal care
  'שמפו': [[/כלב|חתול/, 'pet-care'], [/תינוק|בייבי/, 'baby-care'], 'hair'],
  'מברשת': [[/שיני/, 'dental'], [/שיער/, 'hair'], [/בקבוקים|ניקוי|אסלה|כלים/, 'cleaning-tools'], 'other'],
  'משחת': [[/שיני/, 'dental'], [/נעליים/, 'home-cleaners'], 'skincare-cosmetics'],
  'קולגייט': 'dental',
  'שפתון': 'skincare-cosmetics',
  'לק': 'skincare-cosmetics',
  'סומק': [[/צנצנת|\d+\s*גר|ק /, 'spices'], 'skincare-cosmetics'],
  'קונסילר': 'skincare-cosmetics',
  'מייקאפ': 'skincare-cosmetics',
  'מסקרה': 'skincare-cosmetics',
  'סרום': [[/שיער/, 'hair'], 'skincare-cosmetics'],
  'קרם': [
    [/קוקוס|בישול|פטיסייר|ברולה|קרמל|שוקולד|וניל/, 'baking'],
    [/רחצה|גוף|ידיים|רגליים/, 'body-soap'],
    [/גילוח/, 'body-soap'],
    [/שיער/, 'hair'],
    [/החתלה|תינוק|בייבי/, 'baby-care'],
    'skincare-cosmetics',
  ],
  'תחליב': [[/תינוק|בייבי/, 'baby-care'], 'body-soap'],
  'גל': [[/גילוח|רחצה|גוף|מקלחת/, 'body-soap'], [/שיער|עיצוב/, 'hair'], [/כביסה/, 'laundry'], [/כלים|מדיח/, 'dishwashing'], [/ניקוי|אסלה/, 'home-cleaners'], 'body-soap'],
  'דאודורנט': 'deodorant',
  'דאו': 'deodorant',
  'ניוואה': [[/דאו/, 'deodorant'], [/בייבי/, 'baby-care'], [/שפתון|פנים/, 'skincare-cosmetics'], 'body-soap'],
  'רצועות': [[/שעווה/, 'skincare-cosmetics'], [/להקפצה|עוף|בקר|טרי/, 'butcher'], 'other'],

  // Baby
  // (diapers, formula: see later words)

  // Pets
  'פרמיו': 'pet-food',

  // Home & kitchen
  'סט': [
    [/מברשות שיני/, 'dental'],
    [/איפור|מניקור|טיפוח|מתנה.*(בושם|קרם)/, 'skincare-cosmetics'],
    [/מגבות|מצעים|מפות/, 'home-textiles'],
    [/צעצוע|משחק|צביעה|יצירה|ציור|עפרונות|טושים/, 'toys-stationery'],
    [/כלי עבודה|מברגים|ביטים/, 'batteries-bulbs'],
    'tableware-cookware',
  ],
  'צלחת': 'tableware-cookware',
  'כוס': [[/אימון|תינוק/, 'baby-care'], 'tableware-cookware'],
  'בקבוק': [[/מים חמים/, 'home-textiles'], [/תינוק|האכלה|פטמה/, 'baby-care'], 'tableware-cookware'],
  'מגש': [[/\d+\s*יח|שקוף|חד|אלומיניום|קרטון/, 'disposable-tableware'], 'tableware-cookware'],
  'כף': 'tableware-cookware',
  'סכין': [[/שקוף|\d+\s*יח|חד/, 'disposable-tableware'], 'tableware-cookware'],
  'סיר': 'tableware-cookware',
  'קערה': 'tableware-cookware',
  'קערת': 'tableware-cookware',
  'מחבת': 'tableware-cookware',
  'מסננת': 'tableware-cookware',
  'קרש': 'tableware-cookware',
  'מאג': 'tableware-cookware',
  'ספל': 'tableware-cookware',
  'סולתם': 'tableware-cookware',
  'לקיטשן': 'tableware-cookware',
  'קופסאת': 'tableware-cookware',
  'קופסא': 'tableware-cookware',
  'מיכל': 'tableware-cookware',
  'גביע': [[/מעדן|סויה|יוגורט/, 'yogurts-desserts'], [/מארז|\d+\s*יח|אחסון/, 'disposable-tableware'], 'tableware-cookware'],
  'שיפודי': 'foil-wrap',
  'מפת': 'home-textiles',
  'שטיח': 'home-textiles',
  'פח': 'cleaning-tools',
  'נר': 'candles',
  'נרות': 'candles',
  'כבל': 'batteries-bulbs',

  // Other
  'תיק': 'other',
  'פיגמה': 'clothing',
  'פיגמת': 'clothing',
  'חולצת': 'clothing',
  'חולצה': 'clothing',
  'נעלי': 'clothing',
  'חליפת': 'clothing',
  'עפרון': 'toys-stationery',
  'בובת': 'toys-stationery',
  'בלון': 'party-seasonal',
  'קישוט': 'party-seasonal',
  'עץ': [[/ריח/, 'home-cleaners'], 'flowers-plants'],
  'זר': 'flowers-plants',
  'סנטה': [[/גונץ|מתובל|\d+\s*גר/, 'packaged-cold-cuts'], 'party-seasonal'],
};

// Packs and brands whose next word says what the product is.
for (const word of ['חמישיית', 'צמד', 'אריזת', 'מאסטר', 'שף', 'האופה', 'קרפור', 'תמי', 'סופר', 'פרו', 'מימון', 'בית', 'השיטה', 'חצי', 'פס', 'מבצע', '*מבצע*', 'קיט', 'גלגל', 'פלטת', 'לקט']) Skip.add(word);

// The next most common words (batch 2).
Object.assign(Words, {
  // Produce
  'סלק': [[/רצועות|מבושל|ואקום|סלט/, 'vegetables'], 'vegetables'],
  'תות': [[/שוקולד/, 'chocolate-candy'], 'fruit'],
  'מנגו': [[/מיובש/, 'nuts-dried-fruit'], 'fruit'],
  'דלעת': 'vegetables',
  'תפוא': 'vegetables',
  'גזר': [[/ברוטב|מרוקאי|סלט/, 'hummus-salads'], 'vegetables'],
  'כרובית': 'vegetables',
  'אגס': 'fruit',
  'בזיליקום': [[/טחון|מיובש|\d+\s*גר/, 'spices'], 'herbs-mushrooms'],
  'ברוקולי': 'vegetables',
  'לימון': [[/כבוש|משומר/, 'canned'], 'fruit'],
  'שרי': [[/תמר|אשכולות/, 'vegetables'], 'fruit'],
  'פטרוזיליה': 'herbs-mushrooms',
  'נענע': [[/מיובש|\d+\s*גר/, 'spices'], 'herbs-mushrooms'],
  'שורש': 'vegetables',
  'נבטי': 'vegetables',
  'עגבניה': 'vegetables',
  'בננה': [[/ציפס|מיובש/, 'nuts-dried-fruit'], 'fruit'],
  'קיווי': [[/נעליים/, 'home-cleaners'], 'fruit'],
  'תפוז': 'fruit',
  'אבוקדו': 'fruit',
  'קישוא': [[/בטעם|סלט/, 'hummus-salads'], 'vegetables'],
  'ענב': 'fruit',
  'צמחים': 'flowers-plants',
  'עציץ': 'flowers-plants',

  // Bakery
  'לחמניה': 'rolls',
  'לחמניית': 'rolls',
  'עוגה': 'cakes-pastries',
  'פיתות': 'bread',
  'פיתה': 'bread',
  'בגט': 'bread',
  'בייגל': 'bread',
  'בונזור': 'bread',
  'טורטיה': 'bread',
  'צנימים': 'cookies',
  'קרואסון': 'cakes-pastries',
  'סופגניה': 'cakes-pastries',
  'דובשניות': 'cookies',
  'בצק': [[/עלים|פילו|קדאיף|פיצה|שמרים|קפוא/, 'frozen-meals'], [/עוגיות|לעוגת|פריך/, 'frozen-meals'], 'frozen-meals'],

  // Meat & fish
  'גרון': 'butcher',
  'שוק': [[/שוקו|חלב/, 'milk-cream'], 'butcher'],
  'קציצות': [[/דג|אמנון/, 'frozen-meat-fish'], 'frozen-meat-fish'],
  'פרגיות': 'butcher',
  'פרגית': [[/ממולאת/, 'fresh-pasta-meals'], 'butcher'],
  'לב': 'butcher',
  'מקרל': [[/מעושן/, 'meat-counter'], 'canned'],
  'אוסובוקו': 'butcher',
  'נתח': [[/טבעול|צמחוני/, 'frozen-meals'], [/סלמון|דג/, 'frozen-meat-fish'], 'butcher'],
  'קובה': 'frozen-meals',
  'רולדה': [[/גפילטע/, 'frozen-meat-fish'], 'butcher'],
  'קורקבן': 'butcher',
  'שרימפס': 'frozen-meat-fish',
  'שייטל': 'butcher',
  'גולש': 'butcher',
  'הודו': 'butcher',
  'כיסונים': 'frozen-meals',
  'סרדינים': 'canned',

  // Dairy & chilled
  'בולגרית': 'soft-cheese',
  'שמנת': [[/לבישול|מתוקה|להקצפה|חמוצה|של פעם|%/, 'milk-cream'], 'milk-cream'],
  'ביצי': [[/שוקולד|קינדר/, 'chocolate-candy'], 'eggs'],
  'מוצרלה': 'soft-cheese',
  'פתיתי': [[/גבינ|מוצרלה/, 'yellow-cheese'], [/שוקולד/, 'baking'], [/שיבולת|תירס|דגנים/, 'cereals'], 'other'],
  'פטה': 'soft-cheese',
  'חמאה': 'butter',
  'דנונה': 'yogurts-desserts',
  'מולר': 'yogurts-desserts',
  'גד': [[/מלבי|מעדן|יוגורט/, 'yogurts-desserts'], 'soft-cheese'],
  'גלי': [[/תנובה|שמחות|מנה/, 'yogurts-desserts'], 'baking'],
  'קינוח': [[/שוקולד|גיאנדוחה|DUBAI/, 'chocolate-candy'], 'yogurts-desserts'],
  'שוקו': [[/בונבון|ממרח/, 'chocolate-candy'], 'milk-cream'],
  'רביולי': 'fresh-pasta-meals',
  'ניוקי': 'fresh-pasta-meals',
  'מנה': 'fresh-pasta-meals',
  'תבשיל': [[/שימורי|יכין|קופסא/, 'canned'], 'fresh-pasta-meals'],
  'אחלה': 'hummus-salads',
  'שמיר': 'hummus-salads',
  'סחוג': 'hummus-salads',
  'חזרת': 'hummus-salads',
  'טבעות': [[/זית/, 'canned'], [/בצל|קלמרי/, 'frozen-meals'], 'other'],
  'פיצה': 'frozen-meals',
  'שלגון': 'ice-cream',

  // Pantry
  'נודלס': 'rice-pasta-grains',
  'ספגטי': 'rice-pasta-grains',
  'קוסקוס': 'rice-pasta-grains',
  'כוסמת': 'rice-pasta-grains',
  'קינואה': 'rice-pasta-grains',
  'בורגול': 'rice-pasta-grains',
  'גריסי': 'rice-pasta-grains',
  'פתיתים': 'rice-pasta-grains',
  'מקלוני': 'rice-pasta-grains',
  'דפי': [[/לזניה|אורז/, 'rice-pasta-grains'], 'other'],
  'שיבולת': 'cereals',
  'פיטנס': 'cereals',
  'פול': [[/ירוק|סנפרוסט/, 'frozen-veg-fruit'], 'canned'],
  'סוכר': 'flour-sugar',
  'תחליף': [[/סוכר/, 'flour-sugar'], 'other'],
  'תמצית': 'baking',
  'רסק': [[/עגבניות/, 'canned'], 'canned'],
  'חרדל': 'sauces',
  'קונפיטורה': 'spreads',
  'קונפיטורת': 'spreads',
  'סילאן': 'spreads',
  'חלבה': 'spreads',
  'חלווה': 'spreads',
  'קוקוס': [[/טחון|קלוי|שבבי/, 'baking'], [/חלב|קרם|400/, 'canned'], 'nuts-dried-fruit'],
  'קוקטייל': [[/פירות/, 'canned'], [/זיתים/, 'canned'], 'beer-spirits'],
  'כורכום': 'spices',
  'קינמון': 'spices',
  'כמון': 'spices',
  'אורגנו': 'spices',
  'טוסקנה': 'spices',
  'שומשום': 'legumes',

  // Snacks & sweets
  'בונ': 'chocolate-candy',
  'בונבוניירה': 'chocolate-candy',
  'מרשמלו': 'chocolate-candy',
  'קשיו': 'nuts-dried-fruit',
  'חמוציות': 'nuts-dried-fruit',
  'ביסקוויט': 'cookies',
  'בוטן': 'nuts-dried-fruit',
  'פיסטוק': 'nuts-dried-fruit',
  'פופקורן': 'salty-snacks',
  'אגוזי': 'nuts-dried-fruit',
  'שקדים': [[/טחונים|מולבנים|פרוסים|קצוצים/, 'baking'], 'nuts-dried-fruit'],
  'צימוק': 'nuts-dried-fruit',
  'משמש': 'nuts-dried-fruit',
  'גרעין': 'nuts-dried-fruit',
  'פטל': [[/שוקולד/, 'chocolate-candy'], 'soft-drinks'],
  'קראנץ': 'chocolate-candy',
  'רבע': 'chocolate-candy',
  'צוקטה': [[/ממרח/, 'spreads'], 'chocolate-candy'],
  'סוכ': 'chocolate-candy',
  'טופי': 'chocolate-candy',
  'מסטיק': 'chocolate-candy',
  'הריבו': 'chocolate-candy',
  'קינדר': 'chocolate-candy',
  'מעיין': 'chocolate-candy',
  'יוגטה': 'chocolate-candy',
  'זפיר': 'chocolate-candy',
  'מטבעות': 'chocolate-candy',
  'כריות': [[/קרצוף|ניקוי/, 'cleaning-tools'], 'cereals'],
  'מקל': [[/סניקרס|שוקולד/, 'chocolate-candy'], 'other'],

  // Drinks & alcohol
  'פחית': 'soft-drinks',
  'סודה': 'water',
  'קוקה': 'soft-drinks',
  'ספרינג': 'soft-drinks',
  'פריגת': 'soft-drinks',
  'פולי': [[/קפה|אספרסו/, 'coffee-tea'], 'legumes'],
  'קוניאק': 'beer-spirits',
  'גין': 'beer-spirits',

  // Cleaning, paper & disposables
  'בושם': [[/כביסה/, 'laundry'], 'skincare-cosmetics'],
  'מגבוני': [[/טישו/, 'toilet-paper'], 'diapers-wipes'],
  'מסיר': [[/כתמים|כביסה/, 'laundry'], [/איפור|לק/, 'skincare-cosmetics'], 'home-cleaners'],
  'מרסס': 'home-cleaners',
  'מטהר': 'home-cleaners',
  'מפיץ': 'home-cleaners',
  'מטלית': 'cleaning-tools',
  'שואב': 'batteries-bulbs',
  'סלסלה': [[/אטבי|כביסה/, 'laundry'], 'home-textiles'],
  'אטבי': 'laundry',
  'מתלה': [[/כביסה/, 'laundry'], 'tableware-cookware'],
  'אריאל': 'laundry',
  'קמיל': 'laundry',
  'אבקה': [[/כביסה|כתמים/, 'laundry'], 'soft-drinks'],
  'הום': 'garbage-bags',
  'אשפתון': 'garbage-bags',
  'ממחטות': 'toilet-paper',
  'מגבות': [[/נייר|מטבח|גלילים/, 'paper-towels'], 'home-textiles'],
  'כפות': [[/שקוף|\d+\s*יח|חד/, 'disposable-tableware'], 'tableware-cookware'],
  'מזלגות': [[/\d+\s*יח|חד|לבן/, 'disposable-tableware'], 'tableware-cookware'],
  'מזלג': [[/שקוף|\d+\s*יח|חד/, 'disposable-tableware'], 'tableware-cookware'],
  'סכינים': [[/\d+\s*יח|חד/, 'disposable-tableware'], 'tableware-cookware'],
  'מרקיה': 'disposable-tableware',
  'מרקיות': 'disposable-tableware',
  'קסרול': 'disposable-tableware',
  'רדיד': 'foil-wrap',
  'ניילון': 'foil-wrap',
  'ניקול': 'foil-wrap',
  'קיסמי': [[/שיניים/, 'dental'], 'foil-wrap'],

  // Personal care
  'מסכה': [[/שיער/, 'hair'], 'skincare-cosmetics'],
  'מסכת': [[/שיער|ליס|עיצוב/, 'hair'], 'skincare-cosmetics'],
  'תחבושות': 'hygiene',
  'מגן': [[/תחתון/, 'hygiene'], 'other'],
  'אולוויז': 'hygiene',
  'תחתון': [[/סופג/, 'hygiene'], 'clothing'],
  'מכשיר': [[/גילוח/, 'body-soap'], 'batteries-bulbs'],
  'סכיני': [[/גילוח/, 'body-soap'], 'tableware-cookware'],
  'פלמוליב': [[/כלים/, 'dishwashing'], 'body-soap'],
  'דאב': [[/דאו/, 'deodorant'], 'body-soap'],
  'אסותא': 'body-soap',
  'אדידס': 'deodorant',
  'גילט': [[/דאו/, 'deodorant'], 'body-soap'],
  'גרנייה': [[/דאו/, 'deodorant'], 'hair'],
  'פנטן': 'hair',
  'פינוק': 'hair',
  'קליפס': [[/מוצץ/, 'baby-care'], 'hair'],
  'אולטרסול': 'skincare-cosmetics',
  'עיפרון': [[/גבות|עיניים|שפתיים/, 'skincare-cosmetics'], 'toys-stationery'],
  'פודרה': 'skincare-cosmetics',
  'תוחם': 'skincare-cosmetics',
  'מייק-אפ': 'skincare-cosmetics',
  'טיינט': 'skincare-cosmetics',
  'גלוס': 'skincare-cosmetics',
  'ליפסטיק': 'skincare-cosmetics',
  'צללית': 'skincare-cosmetics',
  'פלסטר': 'hygiene',
  'פלסטרים': 'hygiene',
  'ויטמין': 'hygiene',

  // Baby
  'מוצץ': 'baby-care',
  'מוצצים': 'baby-care',
  'בייבי': [[/ביס|דייסה|מחית/, 'baby-food'], 'baby-care'],

  // Pets
  'פריסקיז': 'pet-food',

  // Home & kitchen
  'קערית': 'tableware-cookware',
  'קומקום': 'batteries-bulbs',
  'רשת': 'tableware-cookware',
  'מכונת': 'batteries-bulbs',
  'כלי': 'tableware-cookware',
  'מכסה': 'tableware-cookware',
  'גליל': [[/יין|מרלו|קברנה/, 'wine'], 'foil-wrap'],
  'קולפן': 'tableware-cookware',
  'מספריים': 'tableware-cookware',
  'מלקחיים': 'tableware-cookware',
  'קוצץ': 'tableware-cookware',
  'מגרדת': 'tableware-cookware',
  'קנקן': 'tableware-cookware',
  'פותחן': 'tableware-cookware',
  'מצקת': 'tableware-cookware',
  'תרווד': 'tableware-cookware',
  'גביעי': 'tableware-cookware',
  'סכום': [[/\d+\s*יח|חד/, 'disposable-tableware'], 'tableware-cookware'],
  'כפית': 'tableware-cookware',
  'סוטז': 'tableware-cookware',
  'קופסה': 'tableware-cookware',
  'צידנית': 'tableware-cookware',
  'מנגל': 'tableware-cookware',
  'משטח': [[/תינוק/, 'baby-care'], [/חד/, 'disposable-tableware'], 'tableware-cookware'],
  'מפה': 'home-textiles',
  'כרית': [[/ניקוי|קרצוף/, 'cleaning-tools'], 'home-textiles'],
  'כובע': [[/רחצה|מגבת/, 'home-textiles'], 'clothing'],
  'שמיכת': 'home-textiles',
  'כיסוי': 'home-textiles',
  'סלסלת': 'home-textiles',
  'מחזיק': 'tableware-cookware',
  'מטען': 'batteries-bulbs',
  'סוללות': 'batteries-bulbs',
  'שרשרת': [[/תאורה|LED/, 'batteries-bulbs'], 'other'],
  'טוסטר': 'batteries-bulbs',
  'מאוורר': 'batteries-bulbs',
  'בוס': 'batteries-bulbs',
  'דבק': 'toys-stationery',
  'מעמד': [[/נרות/, 'candles'], 'tableware-cookware'],
  'חנוכיה': 'candles',
  'פריזר': 'spices',
  'דבאח': [[/קפה/, 'coffee-tea'], 'spices'],

  // Other
  'צעצוע': 'toys-stationery',
  'סביבון': 'toys-stationery',
  'מדבקות': 'toys-stationery',
  'בובה': 'toys-stationery',
  'משחק': 'toys-stationery',
  'קשת': 'party-seasonal',
  'פסלון': 'party-seasonal',
  'גרבי': 'clothing',
  'גרביי': 'clothing',
  'כפכף': 'clothing',
  'קפוצון': 'clothing',
  'מטריה': 'other',
  'שולחן': 'other',
  'כיסא': 'other',
  'סיגריות': 'other',
});

for (const word of ['רביעייה', 'רבעיית', 'טירת', 'צבי', 'דה', 'ניו', 'סוד', 'אובלי', 'טאצ', 'מבחר', 'קליק', 'פיור', 'יטבתה', 'טרו', 'עלמה', 'סלפי', 'HY-GLAM', 'א.ש.', 'WIZ', 'המיניונים', 'LOVLIS', 'דר', 'פישר', 'מגיק', 'קרטון', 'ארוחת', 'מנות', 'חתיכות', 'כיף', 'אקסלנס', 'פרוט', 'קריסטל', 'בלו', 'פרי', 'ניב', 'רב']) Skip.add(word);

// Batch 3.
Object.assign(Words, {
  // Produce
  'גינגר': 'vegetables',
  'ארטישוק': 'vegetables',
  'מלון': [[/משקה/, 'soft-drinks'], 'fruit'],
  'תרד': 'vegetables',
  'שיני': [[/שום/, 'vegetables'], 'other'],
  'ענף': 'flowers-plants',
  'אבטיח': [[/קרחונים|מגש/, 'tableware-cookware'], 'fruit'],
  'תפוע': 'fruit',
  'תאנים': [[/מיובש/, 'nuts-dried-fruit'], 'fruit'],
  'ערמונים': [[/קלוי|ואקום|\d+\s*גר/, 'nuts-dried-fruit'], 'vegetables'],
  'רוזמרין': [[/\d+\s*גר/, 'spices'], 'herbs-mushrooms'],
  'תמרים': 'nuts-dried-fruit',
  'דובדבן': 'fruit',
  'בטטה': 'vegetables',
  'במיה': 'vegetables',
  'רימון': [[/קרמיקה|זכוכית/, 'party-seasonal'], 'fruit'],
  'פומלה': 'fruit',
  'שומר': 'vegetables',
  'קלמנטינה': 'fruit',
  'אפרסמון': 'fruit',
  'פרחי': [[/ברוקולי|כרובית/, 'vegetables'], 'flowers-plants'],
  'זרעים': [[/קישוא|פטרוזיליה|עגבני|לשתילה/, 'flowers-plants'], 'nuts-dried-fruit'],
  'פסים': 'chocolate-candy',

  // Bakery
  'כריך': 'bread',
  'אוזני': 'cakes-pastries',
  'מאפינס': 'cakes-pastries',
  'רוגלך': 'cakes-pastries',
  'חלת': 'bread',
  'עוגות': 'cakes-pastries',
  'דונאטס': 'cakes-pastries',
  'באגט': 'bread',
  'שטרודל': 'cakes-pastries',
  'גולון': 'cookies',
  'גחנון': 'frozen-meals',
  'בלינצס': 'frozen-meals',
  'קרפלך': 'frozen-meals',
  'בסיס': [[/פיצה/, 'frozen-meals'], [/מרק/, 'sauces'], 'skincare-cosmetics'],

  // Meat & fish
  'שומן': 'butcher',
  'כנף': 'butcher',
  'טחול': 'butcher',
  'זנב': 'butcher',
  'פיקניה': 'butcher',
  'גידים': 'butcher',
  'רגל': 'butcher',
  'מוח': 'butcher',
  'בריסקט': 'butcher',
  'גרונות': 'butcher',
  'קרפיון': 'fish-counter',
  'אמנון': 'fish-counter',
  'פורל': [[/מעושן/, 'meat-counter'], 'fish-counter'],
  'הרינג': 'canned',
  'סרדין': 'canned',
  'שפרוטים': 'canned',
  'נקנקיות': 'packaged-cold-cuts',
  'קבנוס': 'packaged-cold-cuts',
  'רוסטביף': 'packaged-cold-cuts',

  // Dairy & chilled
  'מילקי': 'yogurts-desserts',
  'טבורוג': 'soft-cheese',
  'לאבנה': 'soft-cheese',
  'צפתית': 'soft-cheese',
  'עמק': 'yellow-cheese',
  'צדר': 'yellow-cheese',
  'פרמזן': [[/קרקר|חטיף|ביסקוויט/, 'salty-snacks'], 'yellow-cheese'],
  'חלומי': 'yellow-cheese',
  'יופלה': 'yogurts-desserts',
  'אלפרו': 'plant-milks',
  'טופו': 'tofu-vegan',
  'פירה': 'fresh-pasta-meals',
  'אריסה': 'sauces',
  'פרוזן': 'ice-cream',
  'קרחון': 'ice-cream',
  'מגנום': 'ice-cream',
  'פיינט': 'ice-cream',

  // Pantry
  'דייסת': [[/תינוק|B&D|מטרנה|לגיל/, 'baby-food'], 'cereals'],
  'קטשופ': 'sauces',
  'לפתן': 'canned',
  'תיבול': 'spices',
  'זעתר': 'spices',
  'חיטה': [[/תפוחה/, 'cereals'], 'rice-pasta-grains'],
  'איטריות': 'rice-pasta-grains',
  'קוואקר': 'cereals',
  'קורנפלקס': 'cereals',
  'תרכיז': [[/עגבניות/, 'canned'], 'soft-drinks'],
  'שבבי': [[/בצל/, 'spices'], [/שוקולד|קוקוס/, 'baking'], 'other'],
  'קרוטונים': 'sauces',
  'גרגירי': 'legumes',
  'גרעינים': 'nuts-dried-fruit',
  'טימין': 'spices',
  'נפטון': 'spices',
  'צנובר': 'nuts-dried-fruit',
  'צילי': 'spices',
  'שקדי': [[/מרק/, 'sauces'], 'nuts-dried-fruit'],
  'דגש': 'cereals',
  'מגנזיום': 'hygiene',

  // Snacks & sweets
  'מילקה': 'chocolate-candy',
  'פרינגלס': 'salty-snacks',
  'גליליות': 'cookies',
  'תפוציפס': 'salty-snacks',
  'ממתקי': 'chocolate-candy',
  'ביסלי': 'salty-snacks',
  'קרקרים': 'salty-snacks',
  'פרוטאין': 'cereals',
  'ליקריץ': 'chocolate-candy',
  'לקריץ': 'chocolate-candy',
  'במבה': 'salty-snacks',
  'לוקיטוס': 'chocolate-candy',
  'טילון': 'ice-cream',
  'גונץ': 'chocolate-candy',
  'וופלים': 'cookies',
  'דוריטוס': 'salty-snacks',
  'לינדט': 'chocolate-candy',
  'טבלת': 'chocolate-candy',
  'סוכריה': 'chocolate-candy',
  'מנטוס': 'chocolate-candy',
  'נאצוס': 'salty-snacks',
  'פת': 'salty-snacks',

  // Drinks & alcohol
  'טקילה': 'beer-spirits',
  'סיידר': 'beer-spirits',
  'ערק': 'beer-spirits',
  'אקווה': 'water',
  'אקס': 'soft-drinks',
  'פיין': 'beer-spirits',
  'ספרייט': 'soft-drinks',
  'סאן': 'water',
  'פפסי': 'soft-drinks',
  'באנץ': 'coffee-tea',

  // Cleaning, paper & disposables
  'מייבש': 'tableware-cookware',
  'פיירי': 'dishwashing',
  'פיניש': 'dishwashing',
  'לנור': 'laundry',
  'כדוריות': 'laundry',
  'כביסכל': 'laundry',
  'בדין': 'laundry',
  'מנקה': 'home-cleaners',
  'קצף': [[/גילוח/, 'body-soap'], [/שיער/, 'hair'], 'home-cleaners'],
  'איירוויק': 'home-cleaners',
  'ריצפז': 'home-cleaners',
  'יעה': 'cleaning-tools',
  'צמר': [[/פלדה/, 'cleaning-tools'], [/גפן/, 'hygiene'], 'other'],
  'טישו': 'toilet-paper',
  'קערות': [[/\d+\s*יח/, 'disposable-tableware'], 'tableware-cookware'],
  'קעריות': [[/\d+\s*יח|קלאסיק/, 'disposable-tableware'], 'tableware-cookware'],
  'לפתניה': [[/שקוף|\d+\s*יח/, 'disposable-tableware'], 'tableware-cookware'],
  'לפתניות': 'disposable-tableware',
  'צמרוני': 'foil-wrap',
  'פחם': 'foil-wrap',
  'פתיל': 'candles',
  'מצית': 'candles',

  // Personal care
  'גומיות': 'hair',
  'באלם': 'skincare-cosmetics',
  'חוט': [[/דנטלי/, 'dental'], 'other'],
  'קרמה': 'body-soap',
  'מוס': [[/גילוח/, 'body-soap'], [/שיער/, 'hair'], 'yogurts-desserts'],
  'מיי': 'dental',
  'אייליינר': 'skincare-cosmetics',
  'ליפגלוס': 'skincare-cosmetics',
  'מסיכה': 'hair',
  'מסיכת': 'hair',
  'סרקל': 'hair',
  'קרליין': 'hair',
  'אלביב': 'hair',
  'פרוהייר': 'hair',
  'קולסטון': 'hair',
  'פדים': 'skincare-cosmetics',
  'קליניק': 'skincare-cosmetics',
  'אורל': 'dental',
  'פריימר': 'skincare-cosmetics',
  'רול': [[/און/, 'deodorant'], 'other'],
  'פינצטה': 'skincare-cosmetics',
  'תחתוני': [[/דיסקריט|סופג/, 'hygiene'], 'clothing'],
  'ארגונית': 'hygiene',

  // Baby
  'מטרנה': 'baby-food',
  'חיתולי': 'diapers-wipes',
  'האגיס': 'diapers-wipes',
  'מאמ': 'baby-care',
  'מוצצי': 'baby-care',

  // Pets
  'מזון': [[/כלב|חתול|ציפור|דגי נוי/, 'pet-food'], [/תינוק/, 'baby-food'], 'pet-food'],
  'חול': [[/חתול/, 'pet-care'], 'other'],
  'בובו': 'pet-care',

  // Home & kitchen
  'מפות': 'home-textiles',
  'גריל': 'tableware-cookware',
  'מערכת': 'tableware-cookware',
  'מועך': 'tableware-cookware',
  'לוק&לוק': 'tableware-cookware',
  'תחתית': 'tableware-cookware',
  'בלנדר': 'batteries-bulbs',
  'כד': 'tableware-cookware',
  'פינגאן': 'tableware-cookware',
  'משקל': 'batteries-bulbs',
  'קופסאות': 'tableware-cookware',
  'מסחטת': 'tableware-cookware',
  'מיקסר': 'batteries-bulbs',
  'סכומון': 'tableware-cookware',
  'תרמוס': 'tableware-cookware',
  'כותש': 'tableware-cookware',
  'פורס': 'tableware-cookware',
  'מערוך': 'tableware-cookware',
  'מיקרוגל': 'batteries-bulbs',
  'מלחיה': 'tableware-cookware',
  'פטיש': 'tableware-cookware',
  'מגהץ': 'batteries-bulbs',
  'פומפיה': 'tableware-cookware',
  'שעון': 'batteries-bulbs',
  'פנס': 'batteries-bulbs',
  'נורת': 'batteries-bulbs',
  'סדין': 'home-textiles',
  'ארגז': 'other',
  'אגרטל': 'flowers-plants',
  'חנוכייה': 'candles',

  // Other
  'קלמר': 'toys-stationery',
  'אוזניות': 'batteries-bulbs',
  'רובה': 'toys-stationery',
  'מכונית': 'toys-stationery',
  'חוברת': 'toys-stationery',
  'ספר': 'toys-stationery',
  'עט': 'toys-stationery',
  'אקדח': 'toys-stationery',
  'סרט': [[/מדידה|הדבקה|דביק/, 'batteries-bulbs'], 'party-seasonal'],
  'גירלנדה': 'party-seasonal',
  'מטרייה': 'other',
  'מכנסיים': 'clothing',
  'מכנסי': 'clothing',
  'גופייה': 'clothing',
  'בוקסר': 'clothing',
  'מעיל': 'clothing',
  'אוברול': 'clothing',
  'כסא': 'other',
  'עגלת': 'other',
  'משקפי': 'other',
  'טבק': 'other',
  'וינסטון': 'other',
  'סיג.טסלה': 'other',
  'חבל': [[/כביסה/, 'laundry'], 'other'],
  'פיקדון': 'other',
});

for (const word of ['שלישייה', 'אריזה', 'גב.', 'אייס', 'הפי', 'מעורב', 'בסגנון', 'מולטי', 'מאמא', 'אלהילאל', 'גולדן', 'פרימור', 'נקה', 'מקס', 'דאבל', 'בי', 'סרי', 'בלו', 'תומר', 'וילדה', 'ר.', 'סן', 'WIN', 'ניו', 'הר', 'פרה', 'יחיעם', 'גרנד', 'שמש', 'ביטון', 'אקסטרה', 'טיים', 'קלאסיק', 'פרימיום', 'הכל', 'סופרים', 'נויה', 'טרה', 'כי', 'טוב', 'ביו', 'נעם', 'אורבן', 'בסט', 'סטיץ', 'מיה', 'עלית', 'מרבה', 'ווק', 'פריט', 'דליים', 'גורמה', 'פנסי', 'מילוי']) Skip.add(word);

// Batch 4.
Object.assign(Words, {
  'מקרונים': 'cookies', 'קאפרי': 'canned', 'ציפורן': 'spices', 'פלפלים': [[/ממולאים|קלויים|כבושים|צנצנת/, 'canned'], 'vegetables'],
  'אסטוניש': 'home-cleaners', 'אקונומיקה': 'home-cleaners', 'מצת': 'candles', 'אפרסק': [[/חצאי|בסירופ/, 'canned'], 'fruit'],
  'קבוקים': 'salty-snacks', 'קש': 'disposable-tableware', 'פמפרס': 'diapers-wipes', 'תבלינים': 'spices', 'דניס': 'fish-counter',
  'מצות': 'bread', 'שק': 'home-textiles', 'רולר': 'cleaning-tools', 'נעליים': 'clothing', 'אפונת': 'frozen-veg-fruit',
  'מסנן': 'tableware-cookware', 'דאק': 'home-cleaners', 'רקסונה': 'deodorant', 'נביעות': 'water', 'פירות': [[/יער.*קפוא|קפוא/, 'frozen-veg-fruit'], [/יבשים|מיובשים/, 'nuts-dried-fruit'], 'frozen-veg-fruit'],
  'לוף': 'packaged-cold-cuts', 'תפוזינה': 'soft-drinks', 'ברי': 'yellow-cheese', 'טרמוס': 'nuts-dried-fruit', 'משולש': 'yellow-cheese',
  'פחמים': 'foil-wrap', 'מיחם': 'batteries-bulbs', 'חנוכיית': 'candles', 'לוח': [[/חיתוך/, 'tableware-cookware'], 'toys-stationery'],
  'איש': 'party-seasonal', 'סיגQWEET': 'other', 'ברבי': 'toys-stationery', 'אגקס': 'home-cleaners', 'פאנטה': 'soft-drinks',
  'מימונס': 'soft-drinks', 'חמוצים': 'canned', 'אביזרי': [[/שיער/, 'hair'], 'other'], 'שאטו': 'wine', 'סוטאז': 'tableware-cookware',
  'מטחנת': 'spices', 'בונדוק': 'nuts-dried-fruit', 'לברק': 'fish-counter', 'נסיכת': 'fish-counter', 'מאפים': 'cakes-pastries',
  'רוסטיק': 'bread', 'ספרי': [[/שיער/, 'hair'], 'deodorant'], 'קוואס': 'soft-drinks', 'ספורה': 'skincare-cosmetics', 'ציטוס': 'salty-snacks',
  'תירוש': 'soft-drinks', 'חצילים': 'hummus-salads', 'קקאו': 'baking', 'ברילה': [[/רוטב/, 'sauces'], 'rice-pasta-grains'],
  'נורדיק': 'water', 'פסטו': 'sauces', 'צנונית': 'vegetables', 'מטרפה': 'tableware-cookware', 'בוצר': 'tableware-cookware',
  'אפקטיב': 'laundry', 'גבטה': 'bread', 'ליידי': 'deodorant', 'גיוזה': 'frozen-meals', 'מזגן': 'batteries-bulbs', 'פרג': 'baking',
  'סטיק': [[/הגנה|פנים/, 'skincare-cosmetics'], 'deodorant'], 'באנר': 'party-seasonal', 'שפיץ': 'butcher', 'פלטה': 'tableware-cookware',
  'דולצה': 'cookies', 'קינוחית': 'disposable-tableware', 'בלונים': 'party-seasonal', 'פרח': 'flowers-plants', 'פמוט': 'candles',
  'קישואים': 'vegetables', 'קולב': 'home-textiles', 'חילבה': 'spices', 'סרוולט': 'packaged-cold-cuts', 'אייפון': 'batteries-bulbs',
  'פרוש': 'home-cleaners', 'מוסקו': 'home-cleaners', 'כוסיות': 'disposable-tableware', 'טבעול': 'frozen-meals', 'לואקר': 'cookies',
  'תרחיץ': 'skincare-cosmetics', 'תחבושת': 'hygiene', 'ליצי': 'soft-drinks', 'סנובון': 'home-cleaners', 'אשכולית': 'fruit',
  'מרית': 'tableware-cookware', 'טבליות': [[/מדיח|כלים/, 'dishwashing'], [/כביסה/, 'laundry'], 'other'], 'פניני': 'laundry',
  'בלדי': 'frozen-meat-fish', 'נבטים': 'vegetables', 'תנור': 'batteries-bulbs', 'גרב': 'clothing', 'בובות': 'toys-stationery',
  'מפזר': 'tableware-cookware', 'ארטיק': 'ice-cream', 'פרנה': 'bread', 'נחלה': 'coffee-tea', 'קיש': 'frozen-meals',
  'דקורציה': 'party-seasonal', 'ויליג': 'candles', 'פומפדור': 'coffee-tea', 'איקרה': 'hummus-salads', 'חליטה': 'coffee-tea',
  'נשכן': 'baby-care', 'קארי': [[/מוקפא|קודי/, 'frozen-meat-fish'], 'spices'], 'שיפודים': 'foil-wrap', 'אונטריב': 'butcher',
  'נטלה': 'tableware-cookware', 'מפית': 'disposable-tableware', 'קשתית': 'butcher', 'בקר': 'butcher', 'טופר': 'party-seasonal',
  'כדורים': 'toys-stationery', 'קנקון': 'frozen-meat-fish', 'אססי': 'skincare-cosmetics', 'אייקון': 'body-soap',
  'ציפוי': 'baking', 'פאוץ': 'baby-food', 'סולת': 'flour-sugar', 'דיאודורנט': 'deodorant', 'ופל': 'cookies', 'סברס': 'fruit',
  'תחתונים': [[/סופגים/, 'hygiene'], 'clothing'], 'גלילי': 'cookies', 'אספרגוס': 'vegetables', 'גלייד': 'home-cleaners',
  'עמבה': 'sauces', 'אורביטול': 'dental', 'כעכים': 'cookies', 'מסרק': 'hair', 'פרלינים': 'chocolate-candy', 'פסיפלורה': 'fruit',
  'גופיות': 'clothing', 'דיספנסר': 'body-soap', 'קילקה': 'canned', 'ממתיק': 'flour-sugar', 'רמקול': 'batteries-bulbs',
  'נובו': 'body-soap', 'קינוחיות': 'disposable-tableware', 'ברונזר': 'skincare-cosmetics', 'איולי': 'sauces',
  'נמס': 'coffee-tea', 'פרורי': 'baking', 'פודינג': 'baking', 'צבר': 'hummus-salads', 'ביצת': 'chocolate-candy',
  'גרין': 'body-soap', 'אצות': 'canned', 'צימוקים': 'nuts-dried-fruit', 'ירקות': [[/חמוצים|כבושים/, 'canned'], [/קפוא|מוקפא/, 'frozen-veg-fruit'], 'vegetables'],
  'פילטר': 'other', 'וילון': 'home-textiles', 'פלייסמנט': 'home-textiles', 'קימל': 'spices', 'נורות': 'batteries-bulbs',
  'קוברה': [[/גיהוץ/, 'home-textiles'], 'other'], 'מראה': 'other', 'קברנה': 'wine', 'סיף': 'cleaning-tools', 'הוט': 'salty-snacks',
  'טמפונים': 'hygiene', 'פתי': 'cookies', 'פפאיה': 'fruit', 'חותך': 'tableware-cookware', 'נשנושי': 'packaged-cold-cuts',
  'סקין': 'skincare-cosmetics', 'אוראו': 'cookies', 'מחבט': 'tableware-cookware', 'כאמל': 'other', 'סוללת': 'batteries-bulbs',
  'שטיחון': 'home-textiles', 'מזרק': 'home-cleaners', 'חצאי': 'canned', 'פד': 'body-soap', 'עיתון': 'toys-stationery',
  'טוש': 'toys-stationery', 'גרביון': 'clothing', 'קמפטאון': 'other', 'פרפקט': 'home-cleaners', 'היילייטר': 'skincare-cosmetics',
  'ברברי': 'skincare-cosmetics', 'טרולי': 'other', 'שערות': 'frozen-meals', 'סוגת': 'rice-pasta-grains', 'סוללה': 'batteries-bulbs',
  'סיגרים': 'frozen-meals', 'מוט': 'batteries-bulbs', 'גונסונס': 'baby-care', 'נקטרינה': 'fruit', 'קישקע': 'frozen-meals',
  'רצועת': 'chocolate-candy', 'צינור': 'other', 'שוארמה': 'butcher', 'פחזניות': 'cakes-pastries', 'מעדני': 'packaged-cold-cuts',
  'רום': 'beer-spirits', 'תותח': 'party-seasonal', 'תרבד': 'tableware-cookware', 'סאוור': 'chocolate-candy', 'קשים': 'disposable-tableware',
  'אירגונית': 'tableware-cookware', 'פפיון': 'party-seasonal', 'TITANIA': 'skincare-cosmetics', 'Explicitשפתון': 'skincare-cosmetics',
  'נסטי': 'body-soap', 'ויברטור': 'other', 'מדליק': 'foil-wrap', 'קוויק': 'cleaning-tools', 'מנצגו': 'yellow-cheese',
  'מש.שיניים': 'dental', 'פנה': 'rice-pasta-grains', 'משלוח': 'other', 'קורנפלור': 'baking', 'פיראוס': 'soft-cheese',
  'סימילאק': 'baby-food', 'נובי': 'baby-care', 'דלורית': 'vegetables', 'פומלית': 'fruit', 'טורטיות': 'bread',
  'גפרורים': 'candles', 'מעבד': 'batteries-bulbs', 'זנגביל': [[/\d+\s*גר/, 'spices'], 'vegetables'], 'סיכות': 'toys-stationery',
  'כיפה': 'other', 'לזניה': 'rice-pasta-grains', 'גלגלת': 'tableware-cookware', 'חטיפים': 'salty-snacks', 'מקציף': 'batteries-bulbs',
  'מאפרה': 'other', 'דנבר': 'butcher', 'בונזו': 'pet-food', 'לוביה': 'vegetables', 'מכסים': 'foil-wrap', 'סובין': 'flour-sugar',
  'מקרר': 'batteries-bulbs', 'ארוכה': 'clothing', 'סווטשירט': 'clothing', 'בוזנינה': 'butcher', 'ב.מיילר18': 'party-seasonal',
  'ONE': 'batteries-bulbs', 'מקלח': 'other', 'קולגן': 'hygiene', 'חמצוצים': 'chocolate-candy', 'סטייל': 'hair', 'מוזלי': 'cereals',
  'מרלבורו': 'other', 'גריסים': 'rice-pasta-grains', 'בארכה': 'spreads', 'נפוליאון': 'cakes-pastries', 'גונסון': 'baby-care',
  'שיק': 'body-soap', 'עירית': 'herbs-mushrooms', 'ליפטון': 'coffee-tea', 'ניקוי': 'dishwashing', 'קשיות': 'disposable-tableware',
  'הרבל': 'hair', 'שייק': 'soft-drinks', 'פרסיל': 'laundry', 'צוריסוס': 'packaged-cold-cuts', 'כיסוני': 'frozen-meals',
  'אוזו': 'beer-spirits', 'ערכה': 'toys-stationery', 'ראנר': 'home-textiles', 'נפנף': 'foil-wrap', 'פלפלונים': 'canned',
  'פוקצה': 'bread', 'קטלן': 'home-cleaners', 'פרחים': 'flowers-plants', 'וזלין': 'skincare-cosmetics', 'גליס': 'hair',
  'משאית': 'toys-stationery', 'לוריאל': [[/שיער|שמפו|צבע/, 'hair'], 'skincare-cosmetics'], 'סוויט': 'flour-sugar', 'פסטילה': 'nuts-dried-fruit',
  'מחברת': 'toys-stationery', 'גרינז': 'frozen-veg-fruit', 'וונדר': 'skincare-cosmetics', 'מויסט': 'other', 'סטארבקס': 'coffee-tea',
  'צימרוני': 'hygiene', 'משחה': 'hygiene', 'קולה': 'soft-drinks', 'גולדסטאר': 'beer-spirits', 'טבסקו': 'sauces',
  'זוגלובק': 'packaged-cold-cuts', 'פיוז': 'soft-drinks', 'גאמפ': 'soft-drinks', 'קממבר': 'yellow-cheese', 'פאלטה': 'hair',
  'לרסן': 'canned', 'יקב': 'wine', 'כפפת': 'body-soap', 'ויט': 'skincare-cosmetics', 'לבלו': 'skincare-cosmetics', 'גופיה': 'clothing',
  'בלוק': [[/ניקוי|שירותים|אסלה/, 'home-cleaners'], 'toys-stationery'], 'רפידות': 'baby-care', 'ראמן': 'rice-pasta-grains', 'כדורגל': 'toys-stationery', 'מד': 'batteries-bulbs',
  'ארקוסטיל': 'tableware-cookware', 'מיטה': 'other', 'עקביות': 'clothing', 'קוקיס': 'cookies', 'לבנה': 'soft-cheese', 'ואזה': 'flowers-plants',
  'סוזוקי': 'batteries-bulbs',
});

// ---------------------------------------------------------------------------

/** The aisle of each frozen kind of food. */
function frozenAisle(aisle) {
  if (['butcher', 'fish-counter', 'packaged-cold-cuts', 'meat-counter'].includes(aisle)) return 'frozen-meat-fish';
  if (['vegetables', 'fruit', 'herbs-mushrooms'].includes(aisle)) return 'frozen-veg-fruit';
  if (aisle.startsWith('frozen-') || aisle === 'ice-cream') return aisle;
  return 'frozen-meals';
}
// Food aisles (a frozen one of these is in the freezer); non-food stays put.
const FoodTabs = new Set(['produce', 'bakery', 'meat-fish', 'deli', 'dairy', 'chilled', 'pantry', 'frozen']);

const Marks = /['’׳"״`]/g;
// Words after which a name tells the flavor or coating, not the product.
const FlavorWords = /^(בטעם|בטעמי|טעם|טעמי|ציפוי|בציפוי|מצופה|מצופים|במילוי|מילוי|ברוטב|בניחוח|ניחוח)$/;

/** The words of a name, without marks. */
export function wordsOf(name) {
  return name.replace(Marks, '').trim().split(/\s+/).filter(Boolean);
}

/** The aisle a word's rule gives for a whole name (undefined: the word isn't known). */
function byWord(word, name) {
  const rule = Words[word];
  if (rule === undefined) return undefined;
  if (typeof rule === 'string') return rule;
  for (const entry of rule) {
    if (typeof entry === 'string') return entry;
    if (entry[0].test(name)) return entry[1];
  }
  return undefined;
}

/**
 * A product's aisle: from its name and whether it's sold by weight. `tabOf`
 * gives an aisle's tab (from framework.json). Null: not a product; undefined:
 * no rule knows it yet.
 */
export function aisleOf(rawName, weighted, tabOf) {
  const name = rawName.replace(Marks, '');
  const found = productWord(rawName, tabOf);
  if (found === null) return null;
  let aisle = found?.aisle;
  if (aisle === undefined) return undefined;

  // Frozen food: its frozen aisle.
  if (/קפוא|קפואה|קפואים|קפואות|מוקפא/.test(name) && FoodTabs.has(tabOf(aisle))) {
    return frozenAisle(aisle);
  }
  // Sold by weight: cheese, cold cuts and olives are cut or weighed at the deli counter.
  if (weighted) {
    if (aisle === 'yellow-cheese' || aisle === 'soft-cheese') return 'cheese-counter';
    if (aisle === 'packaged-cold-cuts') return 'meat-counter';
    if (aisle === 'canned' && /זית|זיתים|מלפפון|כבוש|חמוצים/.test(name)) return 'olives-salads';
    if (aisle === 'hummus-salads') return 'olives-salads';
  }
  return aisle;
}

/**
 * The word of a name that says what the product is: { at: its place in
 * wordsOf(name), aisle: what its rule gives }. Undefined: no rule knows the name;
 * null: not a product.
 */
export function productWord(rawName, tabOf) {
  const name = rawName.replace(Marks, '');
  const words = wordsOf(rawName);
  if (words.length === 0) return undefined;
  if (NotProducts.has(words[0])) return null;
  // The first known word; after a pack, brand or number ("מארז", "אסם", "12"),
  // a few words further (its next words may be a brand or a flavor).
  // A first word no rule knows is taken as a brand too ("פילדלפיה גבינת שמנת"), but
  // after one, what follows a flavor word is the flavor ("פאוורייד בטעם פירות"), and
  // fruit or vegetables are nearly always a flavor ("לימונדת מנגו"), so not taken.
  let aisle;
  let afterSkip = false;
  let afterBrand = false;
  for (let i = 0; i < Math.min(words.length, 4); i++) {
    if (afterBrand && FlavorWords.test(words[i])) return undefined;
    aisle = byWord(words[i], name);
    if (aisle !== undefined) {
      if (afterBrand && (tabOf(aisle) === 'produce' || aisle === 'frozen-veg-fruit')) return undefined;
      return { at: i, aisle };
    }
    if (Skip.has(words[i]) || /^\d/.test(words[i])) afterSkip = true;
    else if (!afterSkip) afterBrand = true;
  }
  return undefined;
}
