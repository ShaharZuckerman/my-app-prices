/**
 * The word table (words.json): which aisle a word in an item's name points to,
 * learned each night from every chain's product names sorted by rules.mjs. The
 * app uses it for what's typed or said ("פרמזן" → the cheese aisle), and it grows
 * with the products, without a new version of the app.
 *
 * words.json:
 *   aisles  every aisle id (framework.json's order); the tables give a place in it.
 *   tabs    each aisle's tab id, in the same order.
 *   first   what a name starts with (its first one or two words, after a pack,
 *           brand or number) → aisle: "גבינת" → yellow cheese, "גבינת שמנת" → soft
 *           cheese. Hebrew names start with what the product is, so this comes first.
 *   any     a word anywhere in a name → aisle, when most names with it are in one
 *           aisle ("פרמזן" in "גבינת פרמזן"): for what `first` doesn't know.
 * A word is kept only if enough products have it and most of them are in one aisle.
 *
 * Run on its own (after a build, or with last night's files in ./previous):
 *   node categories/word-table.mjs   → out/words.json, and how much it knows.
 */
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { aisleOf, productWord, wordsOf } from './rules.mjs';

// How sure a word must be: at least this many products, this share in one aisle.
const FirstMin = 3;
const FirstShare = 0.6;
const AnyMin = 10;
const AnyShare = 0.6;

// Sizes and units ("100 גרם"): they say nothing about the product.
const Units = new Set([
  'גרם', 'גר', 'גרמים', 'קג', 'קילו', 'ליטר', 'ליטרים', 'מל', 'יח', 'יחידות', 'יחי', 'מ',
  'g', 'gr', 'kg', 'ml', 'l', 'ליט', 'במשקל', 'משקל',
]);

/** A word worth keeping: has two letters or more, and isn't a number or a size. */
const isWord = (word) => /\p{L}.*\p{L}/u.test(word) && !/\d/.test(word) && !Units.has(word);

/** Counts per aisle for a key: Map(key → Map(aisle → count)). */
function count(table, key, aisle) {
  let counts = table.get(key);
  if (!counts) table.set(key, (counts = new Map()));
  counts.set(aisle, (counts.get(aisle) ?? 0) + 1);
}

/**
 * The keys whose products are mostly in one aisle: { key: aisle place }. If no
 * aisle has enough but one tab does ("שניצל": frozen chicken and frozen meals),
 * that tab's biggest aisle.
 */
function decided(table, min, share, place, tabOf) {
  const out = {};
  for (const [key, counts] of [...table].sort(([a], [b]) => (a < b ? -1 : 1))) {
    let total = 0;
    const byTab = new Map();
    for (const [aisle, n] of counts) {
      total += n;
      byTab.set(tabOf(aisle), (byTab.get(tabOf(aisle)) ?? 0) + n);
    }
    if (total < min) continue;
    const [tab, inTab] = [...byTab].sort((a, b) => b[1] - a[1])[0];
    if (inTab / total < share) continue;
    const best = [...counts].filter(([aisle]) => tabOf(aisle) === tab).sort((a, b) => b[1] - a[1])[0];
    out[key] = place.get(best[0]);
  }
  return out;
}

/**
 * The word table from product names. `names`: every product name (each once);
 * `framework`: framework.json. Also returns how many names were sorted.
 */
export function buildWordTable(names, framework) {
  const aisles = framework.tabs.flatMap((tab) => tab.aisles.map((aisle) => [aisle.id, tab.id]));
  const tabOfAisle = new Map(aisles);
  const place = new Map(aisles.map(([id], i) => [id, i]));
  const tabOf = (aisle) => tabOfAisle.get(aisle);

  const first = new Map();
  const any = new Map();
  let sorted = 0;
  for (const [name] of names) {
    // What the product is, not how it's sold: cheese is the cheese aisle whether it's
    // packed or weighed at the counter (the app sees the counter from "200 גרם", "פרוס").
    const aisle = aisleOf(name, false, tabOf);
    if (!aisle) continue;
    sorted++;
    const words = wordsOf(name).map((word) => word.toLowerCase());
    // Its start: the word that says what it is, after packs, brands and numbers
    // ("מארז 4 יוגורט…", "פילדלפיה גבינת שמנת"). Brands go only in `any`.
    const { at } = productWord(name, tabOf);
    if (isWord(words[at])) {
      count(first, words[at], aisle);
      if (isWord(words[at + 1] ?? '')) count(first, `${words[at]} ${words[at + 1]}`, aisle);
    }
    for (const word of new Set(words.filter(isWord))) count(any, word, aisle);
  }

  const firstTable = decided(first, FirstMin, FirstShare, place, tabOf);
  // Two words only where they say more than the first alone ("גבינת שמנת", not "חלב תנובה").
  for (const key of Object.keys(firstTable)) {
    const [one, two] = key.split(' ');
    if (two && firstTable[one] === firstTable[key]) delete firstTable[key];
  }
  const anyTable = decided(any, AnyMin, AnyShare, place, tabOf);
  // A word `first` already decides the same way isn't needed twice.
  for (const key of Object.keys(anyTable)) {
    if (firstTable[key] === anyTable[key]) delete anyTable[key];
  }

  return {
    table: {
      aisles: aisles.map(([id]) => id),
      tabs: aisles.map(([, tab]) => tab),
      first: firstTable,
      any: anyTable,
    },
    sorted,
  };
}

/** Every product name in chains/*.json under `dir`, each once: [name, by weight]. */
export async function productNames(dir) {
  const seen = new Map();
  for (const file of await fs.readdir(dir)) {
    if (!file.endsWith('.json')) continue;
    const { products } = JSON.parse(await fs.readFile(new URL(file, dir), 'utf8'));
    for (const [, name, weighted] of products) {
      const key = name?.trim();
      if (key && !seen.has(key)) seen.set(key, weighted);
    }
  }
  return [...seen];
}

/** Builds words.json in `outDir` from its chains/ folder; returns a line for the log. */
export async function writeWordTable(outDir, builtAt) {
  const framework = JSON.parse(
    await fs.readFile(new URL('./framework.json', import.meta.url), 'utf8')
  );
  const names = await productNames(new URL('./chains/', outDir));
  const { table, sorted } = buildWordTable(names, framework);
  const text = JSON.stringify({ builtAt, ...table });
  await fs.writeFile(new URL('./words.json', outDir), text);
  return {
    names: names.length,
    sorted,
    first: Object.keys(table.first).length,
    any: Object.keys(table.any).length,
    kb: Math.round(Buffer.byteLength(text) / 1024),
  };
}

// Run on its own: from ./out (or ./previous if there's no build here).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('../', import.meta.url);
  let dir = new URL('./out/', root);
  try {
    await fs.access(new URL('./chains/', dir));
  } catch {
    dir = new URL('./previous/', root);
  }
  const stats = await writeWordTable(dir, new Date().toISOString());
  console.log(`words.json in ${dir.pathname}:`, stats);
}
