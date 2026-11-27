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
  'סירופ': 'soft-drinks',
  'שוופס': 'soft-drinks',
  'מים': 'water',
  'מי': [[/פה/, 'dental'], [/ורדים|זהר/, 'baking'], [/פנים|מיסלר|מיסלאר/, 'skincare-cosmetics'], 'water'],
  'תה': 'coffee-tea',
  'חליטת': 'coffee-tea',
  'קפה': 'coffee-tea',
  'קפסולות': [[/קפה|אספרסו|קופאין|נספרסו/, 'coffee-tea'], [/כביסה/, 'laundry'], [/כלים/, 'dishwashing'], 'coffee-tea'],
  'אבקת': [
    [/כביסה/, 'laundry'],
    [/מדיח|כלים/, 'dishwashing'],
    [/אפייה|סוכר|קקאו|פודינג|ג.לי/, 'baking'],
    [/חלב|תמ"?ל/, 'baby-food'],
    [/מרק/, 'sauces'],
    [/חלבון|פרוטאין/, 'other'],
    'soft-drinks',
  ],

  // Produce
  'תפוח': [[/אדמה/, 'vegetables'], [/חטיף|צ.?יפס|קלוי/, 'salty-snacks'], 'fruit'],
  'פלפל': [
    [/שחור|לבן|לימון|גרוס|טחון|מטחנה|אנגלי|ורוד|קאיין|גרגרים|גרגירים|מתוק\s*(גרוס|טחון)|\d+\s*ג/, 'spices'],
    [/ממולא|קלוי|כבוש|בחומץ|חריף.*(סרה|צנצנת|\d+\s*גר)|צומה|שאטה|חריף.*ביטון/, 'canned'],
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
  'שמן': [[/זית|קנולה|חמניות|ענבים|סויה|תירס|קוקוס|שומשום|אגוז|אבוקדו|מזוכך/, 'oils-vinegar'], [/גוף|שיער|עיסוי|תינוק/, 'body-soap'], 'oils-vinegar'],
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
  'רצועות': [[/שעווה/, 'skincare-cosmetics'], 'other'],

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

// ---------------------------------------------------------------------------

/** The aisle of each frozen kind of food. */
function frozenAisle(aisle) {
  if (['butcher', 'fish-counter', 'packaged-cold-cuts', 'meat-counter'].includes(aisle)) return 'frozen-meat-fish';
  if (['vegetables', 'fruit', 'herbs-mushrooms'].includes(aisle)) return 'frozen-veg-fruit';
  if (aisle === 'ice-cream') return aisle;
  return 'frozen-meals';
}
// Food aisles (a frozen one of these is in the freezer); non-food stays put.
const FoodTabs = new Set(['produce', 'bakery', 'meat-fish', 'deli', 'dairy', 'chilled', 'pantry', 'frozen']);

const Marks = /['’׳"״`]/g;

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
  const words = wordsOf(rawName);
  if (words.length === 0) return undefined;
  if (NotProducts.has(words[0])) return null;
  let aisle;
  for (let i = 0; i < Math.min(words.length, 3) && aisle === undefined; i++) {
    aisle = byWord(words[i], name);
    if (aisle === undefined && !Skip.has(words[i])) break;
  }
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
