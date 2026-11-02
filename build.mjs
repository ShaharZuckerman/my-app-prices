// Builds the price files for the Grocery List app, from the price files the
// chains publish by law (Israel's price transparency law).
//
// For each chain in config.json: read its list of branches (all of Israel), find
// where each one is, and turn its full price file into a small JSON file. The app
// downloads only the branches near the phone. Everything goes into ./out:
//   out/branches.json        every branch: chain, name, city, address, place on the map
//   out/chains/<key>.json    a chain's products: [barcode, name, by weight]
//   out/branches/<id>.json   a branch's prices, in its chain's product order (0: not sold)
//   out/groceries.json       every grocery on OpenStreetMap, for the app's map
//   out/places.json          the cities' centers found so far
//   out/report.json          what was found (every city seen, errors), to tune config.json
//   out/stores.json, out/catalog.json   the Haifa area only, for the app's older versions
//
// Run with: node build.mjs   (GitHub runs it every night, see .github/workflows)
import { Client } from 'basic-ftp';
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { gunzipSync, inflateRawSync } from 'node:zlib';

const config = JSON.parse(await fs.readFile(new URL('./config.json', import.meta.url), 'utf8'));
const OUT = new URL('./out/', import.meta.url);
const ShufersalSite = 'https://prices.shufersal.co.il/';

// ---- Reading the files ----------------------------------------------------

// Tag names differ in case between chains (StoreId, STOREID, StoreID): all lowercase here.
const xml = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  transformTagName: (name) => name.toLowerCase().replace(/^.*:/, ''),
});

/** A downloaded file as text: unzipped if needed (gzip, or zip like K.T.'s), UTF-8 or UTF-16. */
function toText(buffer) {
  let data = buffer;
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) data = gunzipSync(buffer);
  // A zip's first file: it starts after its 30-byte header, name and extra field.
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    data = inflateRawSync(buffer.subarray(30 + buffer.readUInt16LE(26) + buffer.readUInt16LE(28)));
  }
  if (data[0] === 0xff && data[1] === 0xfe) return data.subarray(2).toString('utf16le');
  return data.toString('utf8').replace(/^﻿/, '');
}

/** Every node called `key`, anywhere in the parsed file. */
function findAll(node, key, found = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, key, found));
  } else if (node && typeof node === 'object') {
    for (const [name, value] of Object.entries(node)) {
      if (name === key) found.push(...(Array.isArray(value) ? value : [value]));
      else findAll(value, key, found);
    }
  }
  return found;
}

const text = (value) => (value === undefined || value === null ? '' : String(value).trim());
const number = (value) => {
  const parsed = Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : null;
};

// ---- Cities ---------------------------------------------------------------

/** "קריית  אתא" → "קרית אתא", so spelling differences still match. */
function normalizeCity(name) {
  return text(name)
    .replace(/["'״׳-]/g, ' ')
    .replace(/קריית/g, 'קרית')
    .replace(/\s+/g, ' ')
    .trim();
}

// Every town's official code and name (city-codes.json, from data.gov.il): many chains
// give a branch's city as its code ("4000" is Haifa).
const cityCodes = JSON.parse(
  await fs.readFile(new URL('./city-codes.json', import.meta.url), 'utf8')
).codes;
// Longest first, so "קרית אתא" is found before "אתא" would be.
const cityNames = [...new Set(Object.values(cityCodes))]
  .map((name) => ({ name, normalized: normalizeCity(name) }))
  .filter(({ normalized }) => normalized.length >= 3)
  .sort((a, b) => b.normalized.length - a.normalized.length);

/**
 * The city a branch is in, anywhere in Israel: by its code, its name as written,
 * or a town's name in the branch's name or address. Empty if none is found.
 */
function cityName(store) {
  const code = text(store.city);
  if (/^\d+$/.test(code) && +code > 0) return cityCodes[+code] ?? '';
  if (code && !/^0+$/.test(code)) return code;
  const words = ` ${normalizeCity(`${store.name} ${store.address}`)} `;
  return cityNames.find(({ normalized }) => words.includes(` ${normalized} `))?.name ?? '';
}

/** The chosen city a branch is in (the Haifa area, for the app's older versions), or null. */
function cityOf(store) {
  const city = normalizeCity(store.city);
  for (const chosen of config.cities) {
    const name = normalizeCity(chosen.name);
    if (city === name || chosen.codes.includes(text(store.city))) return chosen.name;
  }
  // No city at all (empty, or code 0): look in the name and address.
  if (city && !/^0+$/.test(city)) return null;
  const words = normalizeCity(`${store.name} ${store.address}`);
  return config.cities.find((chosen) => words.includes(normalizeCity(chosen.name)))?.name ?? null;
}

function readStores(fileText) {
  return findAll(xml.parse(fileText), 'store').map((store) => ({
    storeId: text(store.storeid).replace(/^0+(?=\d)/, ''),
    name: text(store.storename),
    address: text(store.address),
    city: text(store.city),
    subChain: text(store.subchainname),
  }));
}

/** A branch's products, compact: [barcode, name, maker, price, amount, unit, price per unit, by weight]. */
function readPrices(fileText) {
  const parsed = xml.parse(fileText);
  const items = findAll(parsed, 'item');
  return (items.length > 0 ? items : findAll(parsed, 'product'))
    .map((item) => [
      text(item.itemcode),
      text(item.itemname),
      text(item.manufacturername),
      number(item.itemprice),
      number(item.quantity),
      text(item.unitofmeasure) || text(item.unitqty),
      number(item.unitofmeasureprice),
      text(item.bisweighted) === '1' ? 1 : 0,
    ])
    .filter(([code, name, , price]) => code && name && price !== null);
}

// ---- Shufersal: its own website --------------------------------------------

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** The download links on a Shufersal listing page (category 5 = branches, 2 = full prices). */
async function shufersalLinks(category, page = 1, storeId = '') {
  const query = new URLSearchParams({ catID: String(category), page: String(page) });
  if (storeId) query.set('storeId', storeId);
  const html = (await download(`${ShufersalSite}FileObject/UpdateCategory?${query}`)).toString();
  return [...html.matchAll(/href="(https:\/\/[^"]+\.blob\.core\.windows\.net[^"]+)"/g)].map(
    (match) => match[1].replace(/&amp;/g, '&')
  );
}

function shufersal(chain) {
  // The full price files: listed 20 a page (about 22 pages), read once. The list
  // misses some branches (others have several files a day): their own page then.
  let fullPrices = null;
  async function listFullPrices() {
    const links = new Map();
    for (let page = 1; page <= MaxPages; page++) {
      const before = links.size;
      for (const link of await shufersalLinks(2, page)) {
        links.set(link.split('?')[0].split('/').pop(), link);
      }
      if (links.size === before) break;
    }
    return links;
  }
  return {
    async stores() {
      const [link] = (await shufersalLinks(5)).filter((url) => /Stores/i.test(url));
      if (!link) throw new Error('no branches file on the Shufersal site');
      return readStores(toText(await download(link)));
    },
    async prices(store) {
      fullPrices ??= listFullPrices();
      const links = await fullPrices;
      const ownPage = async () => {
        for (const link of await shufersalLinks(2, 1, store.storeId)) {
          links.set(link.split('?')[0].split('/').pop(), link);
        }
      };
      if (!newestPriceFull([...links.keys()], chain, store)) await ownPage();
      const name = newestPriceFull([...links.keys()], chain, store);
      if (!name) throw new Error(`no full price file for branch ${store.storeId}`);
      // The links stop working about half an hour after they're listed: a fresh one then.
      const file = await download(links.get(name)).catch(async () => {
        await ownPage();
        return download(links.get(name));
      });
      return { items: readPrices(toText(file)), file: name };
    },
    close() {},
  };
}

/**
 * The newest full price file of a branch, from a list of file names, e.g.
 * PriceFull7290058140886-001-015-20261028-060951.gz: chain, sub-chain (001),
 * branch (zeros in front), date. Some chains leave out the sub-chain.
 */
function newestPriceFull(names, chain, store) {
  const pattern = new RegExp(`^PriceFull${chain.chainId}(?:-\\d+)?-0*${store.storeId}-\\d{8}`);
  return names.filter((each) => pattern.test(each)).sort().at(-1);
}

// ---- Carrefour: its own website (a page of files per day) ---------------------

const CarrefourSite = 'https://prices.carrefour.co.il/';

/** "20261031" for today, and for the days before. */
function dayCode(daysAgo) {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
}

async function carrefour(chain) {
  // Its full price files come out at about 05:10, after this runs: yesterday's too.
  const links = new Map();
  for (const day of [dayCode(1), dayCode(0)]) {
    const page = (await download(`${CarrefourSite}?date=${day}`)).toString();
    const path = page.match(/const path = '(\d+)'/)?.[1];
    const files = JSON.parse(page.match(/const files = (\[.*?\]);/)?.[1] ?? '[]');
    for (const { name } of files) links.set(name, `${CarrefourSite}${path}/${name}`);
  }
  const names = [...links.keys()];
  console.log(`${chain.key}: ${names.length} files on the site`);
  return {
    async stores() {
      const name = names.filter((each) => each.startsWith(`Stores${chain.chainId}`)).sort().at(-1);
      if (!name) throw new Error('no branches file on the Carrefour site');
      return readStores(toText(await download(links.get(name))));
    },
    async prices(store) {
      const name = newestPriceFull(names, chain, store);
      if (!name) throw new Error(`no full price file for branch ${store.storeId}`);
      return { items: readPrices(toText(await download(links.get(name)))), file: name };
    },
    close() {},
  };
}

// ---- laibcatalog: a shared site with a file list (Victory, H. Cohen, Mahsanei HaShuk) --

const LaibCatalog = 'https://laibcatalog.co.il/webapi/';

async function laibcatalog(chain) {
  const files = JSON.parse(
    (await download(`${LaibCatalog}api/getfiles?edi=${chain.chainId}`)).toString()
  );
  const names = files.map((file) => file.fileName);
  console.log(`${chain.key}: ${names.length} files on the site`);
  const link = (name) => `${LaibCatalog}${chain.chainId}/${encodeURIComponent(name)}`;
  return {
    async stores() {
      const name = names.filter((each) => each.startsWith(`Stores${chain.chainId}`)).sort().at(-1);
      if (!name) throw new Error('no branches file on the site');
      return readStores(toText(await download(link(name))));
    },
    async prices(store) {
      const name = newestPriceFull(names, chain, store);
      if (!name) throw new Error(`no full price file for branch ${store.storeId}`);
      return { items: readPrices(toText(await download(link(name)))), file: name };
    },
    close() {},
  };
}

// ---- Pages of download links (Hazi Hinam, Super-Pharm, Wolt, K.T.) ------------
// config.json's "pages": the pages that list the branches file and the full price
// files. In them {iso} is a date (2026-10-31) and {dmy} too (31/10/2026), for today
// and yesterday; {page} is 1, 2, 3… until a page has no new files.

const MaxPages = 80;

/** The files linked on a page (or listed in JSON as "url"): file name → full link. */
async function linksOn(url) {
  const page = (await download(url)).toString();
  const links = new Map();
  for (const [, href] of page.matchAll(/(?:href="|"url":")([^"]*(?:PriceFull|Stores)[^"]*)"/g)) {
    const full = new URL(href.replace(/&amp;/g, '&'), url).href;
    links.set(full.split('?')[0].split('/').pop(), full);
  }
  return links;
}

async function linkPages(chain) {
  const links = new Map();
  for (const template of chain.pages) {
    const days = /\{(iso|dmy)\}/.test(template) ? [1, 0] : [0];
    for (const daysAgo of days) {
      const iso = dayCode(daysAgo).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3');
      const dated = template
        .replace('{iso}', iso)
        .replace('{dmy}', encodeURIComponent(iso.split('-').reverse().join('/')));
      for (let page = 1; page <= (dated.includes('{page}') ? MaxPages : 1); page++) {
        const found = await linksOn(dated.replace('{page}', String(page)));
        const before = links.size;
        for (const [name, link] of found) links.set(name, link);
        if (links.size === before) break;
      }
    }
  }
  const names = [...links.keys()];
  console.log(`${chain.key}: ${names.length} files on the site`);
  return {
    async stores() {
      const pattern = new RegExp(`^Stores(Full)?${chain.chainId}`);
      const name = names.filter((each) => pattern.test(each)).sort().at(-1);
      if (!name) throw new Error('no branches file on the site');
      return readStores(toText(await download(links.get(name))));
    },
    async prices(store) {
      const name = newestPriceFull(names, chain, store);
      if (!name) throw new Error(`no full price file for branch ${store.storeId}`);
      return { items: readPrices(toText(await download(links.get(name)))), file: name };
    },
    close() {},
  };
}

// ---- Cerberus: the shared server most chains use -------------------------------
// Each chain logs in with the user name and password gov.il lists for it. A few
// keep their files in a folder ("folder" in config.json).

async function cerberus(chain) {
  const client = new Client(60_000);
  await client.access({
    host: 'url.retail.publishedprices.co.il',
    user: chain.username,
    password: chain.password,
    secure: false,
  });
  const folder = chain.folder ? `/${chain.folder}/` : '/';
  const names = (await client.list(folder)).map((file) => file.name);
  console.log(`${chain.key}: ${names.length} files on the server`);
  // For report.json: what the files are called (to see why a branch's file isn't found).
  chain.fileSample = {
    total: names.length,
    priceFull: names.filter((name) => /^PriceFull/i.test(name)).length,
    examples: [...names].sort().filter((_, index, all) => index % Math.ceil(all.length / 25) === 0),
  };

  // File names end with the time they were made, so the last one (sorted) is the newest.
  const newest = (prefix) => names.filter((name) => name.startsWith(prefix)).sort().at(-1);
  async function fetchFile(name) {
    const chunks = [];
    const sink = new PassThrough();
    sink.on('data', (chunk) => chunks.push(chunk));
    await client.downloadTo(sink, `${folder}${name}`);
    return Buffer.concat(chunks);
  }

  return {
    async stores() {
      const name = newest(`Stores${chain.chainId}`) ?? newest('Stores');
      if (!name) throw new Error('no branches file on the server');
      return readStores(toText(await fetchFile(name)));
    },
    async prices(store) {
      const name = newestPriceFull(names, chain, store);
      if (!name) throw new Error(`no full price file for branch ${store.storeId}`);
      return { items: readPrices(toText(await fetchFile(name))), file: name };
    },
    close() {
      client.close();
    },
  };
}

// Each chain's "source" in config.json: how its files are read.
const Sources = {
  shufersal,
  carrefour,
  laibcatalog,
  pages: linkPages,
  cerberus,
};

// ---- Where each branch is (for "stores near me" in the app) -------------------

// OpenStreetMap's free address search: at most one question a second, and a
// name for who's asking (their rules).
const MapSearch = 'https://nominatim.openstreetmap.org/search';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// How far from its city's center a branch may be. The map search reads "חיפה" as the
// Haifa district too, and found "חנה סנש 20, חיפה" in Hadera.
const CityKm = 10;
// Each city's center, kept from run to run (places.json).
const cityCenters = new Map();

// One search a second, and about 1,900 branches in Israel: each run searches for at
// most this long (minutes), and the branches not reached are searched for next time.
const SearchForMs = Number(process.env.SEARCH_MINUTES ?? 25) * 60_000;
let searchedMs = 0;

/**
 * A place's coordinates from OpenStreetMap, or null if it isn't found (or this
 * run's searching time is used up). With a city, only a place within CityKm of
 * its center.
 */
async function findOnMap(query, city) {
  const center = city ? await cityCenter(city) : null;
  return inTurn(async () => {
    if (searchedMs > SearchForMs) return null;
    const started = Date.now();
    try {
      await pause(1100);
      const url = `${MapSearch}?format=json&limit=5&countrycodes=il&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'my-app-prices (github.com/ShaharZuckerman/my-app-prices)' },
      });
      if (!response.ok) return null;
      const places = (await response.json()).map((place) => ({
        lat: +(+place.lat).toFixed(5),
        lng: +(+place.lon).toFixed(5),
      }));
      return places.find((place) => !center || kmBetween(center, place) <= CityKm) ?? null;
    } finally {
      searchedMs += Date.now() - started;
    }
  });
}

// Several chains are read at once, but the searches wait for each other (one a second).
let searchTurn = Promise.resolve();
function inTurn(work) {
  const turn = searchTurn.then(work);
  searchTurn = turn.catch(() => {});
  return turn;
}

/** A city's center (searched for once, then kept; null if the map doesn't know it). */
async function cityCenter(city) {
  if (!cityCenters.has(city)) cityCenters.set(city, await findOnMap(city));
  return cityCenters.get(city);
}

/**
 * An address the way the map understands it: "רח' גוט לוין 48" → "גוט לוין 48",
 * "שד.אח"י אילת 20" → "שדרות אח"י אילת 20".
 */
function cleanAddress(address) {
  return address
    .replace(/^\s*(רח['׳.]?|רחוב)\s*/, '')
    .replace(/^\s*(שד['׳.]|שדרות)\s*/, 'שדרות ')
    .replace(/^\s*ד\.\s*/, 'דרך ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ways to write a chain's address that the map search may understand, best
 * first, each with its city: "ורדיה10" → "ורדיה 10", "שד' הנשיא 124 מר" →
 * "שדרות הנשיא 124", "כצנלסון/מנדל 67" → each street, "ד.ויצמן 1" → "דרך
 * ויצמן 1" or "שדרות ויצמן 1", "נשר המרגנית 1" → "המרגנית 1" in Nesher.
 */
function addressVariants(address, city) {
  let base = address
    .replace(/&#x?[0-9a-f]+;/gi, ' ') // leftover codes like &#x0D;
    .replace(/[(,].*$/, '') // "עין דור 16 (רחוב הבנקים)", "אליהו חכים 1,כרמל צרפתי"
    .replace(/([א-ת])(\d)/g, '$1 $2') // "ורדיה10"
    .replace(/^(\d+)\s+(.+)$/, '$2 $1') // "196 דרך יפו"
    .replace(/\s+/g, ' ')
    .trim();
  // The city inside the address ("נשר המרגנית 1", "הלחי 8 טירת הכרמל"): searched in that city.
  let where = city;
  for (const { name } of config.cities) {
    // "טירת כרמל" is also written "טירת הכרמל", "קרית" also "קריית".
    const spellings = name
      .split(' ')
      .map((word, index) => (index ? `ה?${word}` : word.replace('קרית', 'קרי?ית')))
      .join(' ');
    const inside = base.match(new RegExp(`^(${spellings})\\s|\\s(${spellings})$`));
    if (inside) {
      where = name;
      base = base.replace(inside[0], ' ').trim();
    }
  }
  base = base.replace(/(\d+)\s+[א-ת]{1,3}\.?\s*$/, '$1'); // "124 מר" (מרכז)
  // A city the map counts as part of another ("קרית חיים" is in Haifa): both are tried.
  const alsoIn = config.cities.find((each) => each.name === where)?.partOf;
  const number = base.match(/\d+\s*$/)?.[0] ?? '';
  const streets = [];
  for (const part of base.split('/')) {
    const withNumber = (/\d/.test(part) ? part : `${part} ${number}`).trim();
    // "ד." is "דרך" or "שדרות": both are tried.
    const short = withNumber.match(/^ד\.\s*(.*)$/);
    const names = short
      ? [`דרך ${cleanAddress(short[1])}`, `שדרות ${cleanAddress(short[1])}`]
      : [cleanAddress(withNumber)];
    for (const name of names) {
      const bare = name.replace(/^(דרך|שדרות)\s+/, '');
      // The map's spelling may differ: "וולנברג" / "ולנברג", "הדולפין" / "דולפין".
      streets.push(name, bare, bare.replace(/וו/g, 'ו'), bare.replace(/^ה/, ''));
    }
  }
  return [...new Set(streets.map((street) => street.trim()))]
    .filter((street) => /[א-ת]{2}/.test(street))
    .flatMap((street) => [`${street}, ${where}`, ...(alsoIn ? [`${street}, ${alsoIn}`] : [])]);
}

/** The distance between two places, in km (as the crow flies). */
function kmBetween(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// How far from a branch's address, or from the neighborhood or street in its name,
// its chain's store on the map may be (to put the branch exactly on it).
const SnapKm = { address: 0.3, area: 1.5 };

/** The chain's store on the map (groceries.json) nearest to a place, if one is within maxKm. */
function nearestChainStore(chain, place, maxKm) {
  const names = (chain.mapNames ?? [chain.name]).map((name) => name.toLowerCase());
  let best = null;
  for (const shop of osmShops) {
    if (!names.some((name) => shop.names.includes(name))) continue;
    const km = kmBetween(place, shop);
    if (km <= maxKm && (!best || km < best.km)) best = { lat: shop.lat, lng: shop.lng, km };
  }
  return best && { lat: best.lat, lng: best.lng };
}

// Words in branch names that aren't a place: the chains' brands and kinds of store.
// Whole words only ("יש" goes, "ישראל" stays).
const NotAPlace = new RegExp(
  `(^|[\\s-])(${[
    ...config.chains.flatMap((chain) => [chain.name, ...(chain.mapNames ?? [])]),
    ...['שלי', 'דיל', 'אקספרס', 'אקסטרה', 'יש', 'online', 'אונליין', 'סופר', 'מרקט'],
  ]
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // "ח. כהן": a dot, not any letter
    .join('|')})(?=[\\s-]|$)`,
  'gi'
);

/**
 * The place in a branch's name, "שופרסל שלי חיפה- ורדיה" → "ורדיה",
 * "שופרסל דיל קרית מוצקין-שד ויצמן" → "שדרות ויצמן" (without the chain, the kind
 * of store and the city).
 */
function placeInName(entry) {
  let words = entry.name.replace(NotAPlace, '$1 ');
  for (const city of [entry.city, ...config.cities.map((each) => each.name)]) {
    words = words.replaceAll(city, ' ');
  }
  return cleanAddress(words.replace(/\(.*?\)/g, ' ').replace(/[-–,]/g, ' '));
}

/**
 * A branch's coordinates (located: how they were found), trying in order:
 *   'manual'   set by hand in config.json ("locations": { "<branch id>": [lat, lng] });
 *   'address'  its address (as written, then the ways addressVariants writes it),
 *              kept from last night once found;
 *   'store'    its street without the house number, or the place in its name (a
 *              neighborhood or street), then the chain's store on the map nearest
 *              to it (also kept from last night);
 *   'area'     just that street or place (tried again next night);
 *   'unknown'  not found: no coordinates (tried again next night).
 * An address found is also snapped to the chain's store on the map, when one is close.
 */
async function locate(entry, chain) {
  const manual = config.locations?.[entry.id];
  if (manual) return { lat: manual[0], lng: manual[1], located: 'manual' };
  const last = lastTime.get(entry.id);
  // Kept from last night, unless it's out of its city (found before CityKm was checked).
  if (last?.located === 'address' || last?.located === 'store') {
    const center = await cityCenter(entry.city);
    if (!center || kmBetween(center, last) <= CityKm) {
      return { lat: last.lat, lng: last.lng, located: last.located };
    }
  }
  // Without its city, a search could find the same street anywhere in Israel.
  if (!entry.city) return { located: 'unknown' };
  const address = entry.address && !/unknown/i.test(entry.address) ? entry.address : '';
  const tries = address ? [`${address}, ${entry.city}`, ...addressVariants(address, entry.city)] : [];
  for (const each of new Set(tries)) {
    const exact = await findOnMap(each, entry.city);
    if (exact) {
      const store = nearestChainStore(chain, exact, SnapKm.address);
      return { ...(store ?? exact), located: 'address' };
    }
  }
  const place = placeInName(entry);
  // The map may know the street but not the house number: the street alone, else the place in the name.
  const streets = tries.map((each) => each.replace(/\s+\d+[א-ת]?(?=,)/, '')).filter((each) => !tries.includes(each));
  let area = null;
  for (const each of new Set([...streets, ...(place ? [`${place}, ${entry.city}`] : [])])) {
    area = await findOnMap(each, entry.city);
    if (area) break;
  }
  if (area) {
    const store = nearestChainStore(chain, area, SnapKm.area);
    return store ? { ...store, located: 'store' } : { ...area, located: 'area' };
  }
  // Not found (e.g. "כביש חיפה - תל אביב ביציאה מחיפה"): no place rather than the city
  // center, which would put a wrong pin on the map. Can be added in "locations".
  return { located: 'unknown' };
}

// ---- Every grocery on the map (for "Groceries near me" in the app) -----------

// OpenStreetMap's shop search (Overpass). The main server first, then a mirror.
const ShopSearch = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const ShopKinds = ['supermarket', 'convenience', 'greengrocer', 'butcher', 'deli'];

/**
 * Every grocery in Israel that OpenStreetMap knows of: supermarkets,
 * minimarkets, greengrocers, butchers and delis. Asked once a night, so the
 * app doesn't wait for the (often busy) server. Null if no server answered.
 */
async function findShops() {
  const query =
    '[out:json][timeout:180];area["ISO3166-1"="IL"][admin_level=2]->.il;' +
    `nwr["shop"~"^(${ShopKinds.join('|')})$"](area.il);out center tags;`;
  for (const server of ShopSearch) {
    try {
      const response = await fetch(server, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        headers: { 'User-Agent': 'my-app-prices (github.com/ShaharZuckerman/my-app-prices)' },
        signal: AbortSignal.timeout(200_000),
      });
      if (!response.ok) throw new Error(`${response.status}`);
      const result = await response.json();
      if (result.remark) throw new Error(result.remark);
      return result.elements.flatMap((element) => {
        const lat = element.lat ?? element.center?.lat;
        const lng = element.lon ?? element.center?.lon;
        if (lat === undefined || lng === undefined) return [];
        const tags = element.tags ?? {};
        const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
        return [{
          lat: +lat.toFixed(5),
          lng: +lng.toFixed(5),
          kind: tags.shop,
          name: tags['name:he'] || tags.name || '',
          address: [street, tags['addr:city']].filter(Boolean).join(', '),
          // Every name and brand it has, to recognize the chains' stores.
          names: ['name', 'name:he', 'name:en', 'brand', 'brand:he', 'brand:en']
            .map((key) => tags[key] ?? '')
            .join(' | ')
            .toLowerCase(),
        }];
      });
    } catch (error) {
      console.log(`  ✗ ${server}: ${error.message}`);
    }
  }
  return null;
}

// ---- Putting it together --------------------------------------------------

// Which chains this run reads. The sites that block computers outside Israel
// ("israel": true in config.json) are read at home (RUN_AT=home, run-at-home.cmd)
// and kept from there on GitHub (RUN_AT=github); at home the other chains are kept
// from GitHub's run. Without RUN_AT, every chain is read.
const RunAt = process.env.RUN_AT ?? 'all';
const readsChain = (chain) =>
  RunAt === 'github' ? !chain.israel : RunAt === 'home' ? Boolean(chain.israel) : true;
// After this long (minutes), the branches not read yet keep last time's prices, so
// the files are always published (GitHub stops a run after 2 hours).
const ReadUntil = Date.now() + Number(process.env.READ_MINUTES ?? 75) * 60_000;

// Last time's files (the data branch, put in ./previous by the workflow and by
// run-at-home.cmd): places already found, and prices for branches not read this time.
const PREVIOUS = new URL('./previous/', import.meta.url);
const readPrevious = (file) =>
  fs.readFile(new URL(file, PREVIOUS), 'utf8').then(JSON.parse).catch(() => null);
// branches.json; before it existed, stores.json (the Haifa area only).
const previousBranches =
  (await readPrevious('branches.json'))?.branches ??
  (await readPrevious('stores.json'))?.stores ??
  [];
const lastTime = new Map(previousBranches.map((branch) => [branch.id, branch]));
const previousPlaces = (await readPrevious('places.json'))?.cityCenters ?? {};
for (const [city, [lat, lng]] of Object.entries(previousPlaces)) {
  cityCenters.set(city, { lat, lng });
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(new URL('./branches/', OUT), { recursive: true });
await fs.mkdir(new URL('./chains/', OUT), { recursive: true });

// The groceries on the map first (they help place the branches). If no server
// answers tonight, last night's list is used.
console.log('Groceries on the map (OpenStreetMap)');
const previousShops = (await readPrevious('groceries.json')) ?? { shops: [] };
const foundShops = await findShops();
const osmShops =
  foundShops ??
  previousShops.shops.map(([lat, lng, kind, name, address, names]) => ({
    lat, lng, kind, name, address, names,
  }));
console.log(`  ${osmShops.length} groceries${foundShops ? '' : ' (from last night)'}`);

const report = { builtAt: new Date().toISOString(), runAt: RunAt, chains: {} };
// Every branch in Israel with prices: branches.json.
const branches = [];

// A chain's products, as they're added: barcode → its place in chains/<key>.json, and
// for each of its branches, which products it has and their prices.
function newChain() {
  return { index: new Map(), products: [], branches: [] };
}

/** Adds a branch's products ([barcode, name, price, by weight]) to its chain. */
function addBranch(chainData, entry, items) {
  const places = new Int32Array(items.length);
  const prices = new Float64Array(items.length);
  items.forEach(([code, name, price, weighted], i) => {
    let place = chainData.index.get(code);
    if (place === undefined) {
      place = chainData.products.length;
      chainData.index.set(code, place);
      chainData.products.push([code, name, weighted]);
    }
    places[i] = place;
    prices[i] = price;
  });
  chainData.branches.push({ id: entry.id, places, prices });
  branches.push(entry);
  if (isChosenCity(entry.city)) addToOldFiles(entry, items);
}

/**
 * chains/<key>.json: the chain's products, [barcode, name, by weight (1/0)]. And
 * branches/<id>.json: each branch's prices, in the same order (0: not sold there).
 */
async function writeChain(chain, chainData) {
  if (chainData.branches.length === 0) return;
  await fs.writeFile(
    new URL(`./chains/${chain.key}.json`, OUT),
    JSON.stringify({ builtAt: report.builtAt, products: chainData.products })
  );
  for (const { id, places, prices } of chainData.branches) {
    const all = new Array(chainData.products.length).fill(0);
    places.forEach((place, i) => (all[place] = prices[i]));
    await fs.writeFile(new URL(`./branches/${id}.json`, OUT), JSON.stringify(all));
  }
}

// Last time's chains/<key>.json, read once each.
const lastChains = new Map();

/** A branch's products last time, [barcode, name, price, by weight], or null. */
async function lastItems(branch) {
  const prices = await readPrevious(`branches/${branch.id}.json`);
  if (prices) {
    if (!lastChains.has(branch.chain)) {
      lastChains.set(branch.chain, await readPrevious(`chains/${branch.chain}.json`));
    }
    const products = lastChains.get(branch.chain)?.products;
    if (products?.length === prices.length) {
      return prices.flatMap((price, i) =>
        price ? [[products[i][0], products[i][1], price, products[i][2]]] : []
      );
    }
  }
  // Before branches/ existed: prices/<id>.json, [barcode, name, maker, price, …, by weight].
  const old = await readPrevious(`prices/${branch.id}.json`);
  return old && old.map((item) => [item[0], item[1], item[3], item[7]]);
}

/** A branch with its prices from last time (if there are any): when they're from, else null. */
async function keepLastPrices(chainData, branch) {
  const items = await lastItems(branch);
  if (!items) return null;
  addBranch(chainData, branch, items);
  return branch.pricesFrom;
}

// ---- The files for the app's older versions (the Haifa area only) ----------
// stores.json and catalog.json, as before branches.json: older versions of the app
// read them until the phones have the new one.

const oldStores = [];
// Every product once (by barcode), with its price in each branch.
const oldCatalog = new Map();
const isChosenCity = (city) => config.cities.some((chosen) => chosen.name === city);

function addToOldFiles(entry, items) {
  oldStores.push(entry);
  const storeIndex = oldStores.length - 1;
  for (const [code, name, price, weighted] of items) {
    let product = oldCatalog.get(code);
    if (!product) {
      product = [name, weighted, [], code];
      oldCatalog.set(code, product);
    }
    product[2].push(storeIndex, price);
  }
}

// ---- Every chain -------------------------------------------------------------

async function readChain(chain) {
  const chainReport = { branches: 0, read: 0, citiesSeen: {}, errors: [] };
  report.chains[chain.key] = chainReport;
  const chainData = newChain();
  // Not read this time (or its site can't be reached): its branches as they were last time.
  const keepChain = async (reason) => {
    let kept = 0;
    for (const last of previousBranches.filter((branch) => branch.chain === chain.key)) {
      if (await keepLastPrices(chainData, last)) kept++;
    }
    chainReport.kept = kept;
    console.log(`${chain.key}: ${reason}, kept ${kept} branches from last time`);
  };
  let source;
  try {
    if (!readsChain(chain)) {
      await keepChain(chain.israel ? 'read at home' : 'read on GitHub');
      return;
    }
    source = await Sources[chain.source](chain);
    const found = await source.stores();
    chainReport.branches = found.length;
    for (const branch of found) {
      const seen = branch.city || '(none)';
      chainReport.citiesSeen[seen] = (chainReport.citiesSeen[seen] ?? 0) + 1;
    }
    chainReport.files = chain.fileSample;
    const extra = chain.branches ?? {};
    const city = (branch) => cityOf(branch) ?? extra[branch.storeId] ?? cityName(branch);
    // Branches whose city isn't known: their names and addresses, to match by hand.
    chainReport.unknownCity = found
      .filter((branch) => !city(branch))
      .map((branch) => `${branch.storeId} · ${branch.name} · ${branch.address}`);
    console.log(`${chain.key}: ${found.length} branches`);

    for (const branch of found) {
      const id = `${chain.key}-${branch.storeId}`;
      const entry = {
        id,
        chain: chain.key,
        chainName: chain.name,
        name: branch.name,
        city: city(branch),
        address: branch.address,
      };
      Object.assign(entry, await locate(entry, chain).catch(() => ({ located: 'unknown' })));
      try {
        if (Date.now() > ReadUntil) throw new Error('out of time this run');
        const { items, file } = await source.prices(branch);
        addBranch(
          chainData,
          { ...entry, products: items.length, sourceFile: file, pricesFrom: report.builtAt },
          items.map((item) => [item[0], item[1], item[3], item[7]])
        );
        chainReport.read++;
      } catch (error) {
        // No fresh file tonight: keep the last prices we had for this branch, if any.
        const last = lastTime.get(id);
        const pricesFrom =
          last &&
          (await keepLastPrices(chainData, {
            ...entry,
            products: last.products,
            sourceFile: last.sourceFile,
            pricesFrom: last.pricesFrom,
          }));
        chainReport.errors.push(
          `${branch.name}: ${error.message}${pricesFrom ? ` (kept prices from ${pricesFrom})` : ''}`
        );
      }
    }
    console.log(`${chain.key}: ✓ ${chainReport.read} branches read, ${chainReport.errors.length} not`);
  } catch (error) {
    // The chain's site can't be reached: as last time.
    chainReport.errors.push(error.message);
    await keepChain(`✗ ${error.message}`);
  } finally {
    source?.close();
    await writeChain(chain, chainData);
  }
}

// Several chains at a time: each mostly waits for its site, and the map searches
// take turns (see inTurn).
const Together = 3;
const waiting = [...config.chains];
await Promise.all(
  Array.from({ length: Together }, async () => {
    while (waiting.length > 0) await readChain(waiting.shift());
  })
);

// ---- The files ------------------------------------------------------------

// Every branch with prices: where it is, and when its prices are from.
await fs.writeFile(
  new URL('./branches.json', OUT),
  JSON.stringify({
    builtAt: report.builtAt,
    branches: branches.map((branch) => ({
      id: branch.id,
      chain: branch.chain,
      chainName: branch.chainName,
      name: branch.name,
      city: branch.city,
      address: branch.address,
      lat: branch.lat,
      lng: branch.lng,
      located: branch.located,
      products: branch.products,
      sourceFile: branch.sourceFile,
      pricesFrom: branch.pricesFrom,
    })),
  })
);
// The cities' centers found so far (so they aren't searched for again).
await fs.writeFile(
  new URL('./places.json', OUT),
  JSON.stringify({
    cityCenters: Object.fromEntries(
      [...cityCenters]
        .filter(([, center]) => center)
        .map(([city, { lat, lng }]) => [city, [lat, lng]])
    ),
  })
);
// For the app's older versions (the Haifa area):
// [name, by weight (1/0), [branch index, price, branch index, price…], barcode],
// branch index = place in stores.json's "stores".
await fs.writeFile(
  new URL('./stores.json', OUT),
  JSON.stringify(
    { builtAt: report.builtAt, cities: config.cities.map((c) => c.name), stores: oldStores },
    null,
    1
  )
);
await fs.writeFile(
  new URL('./catalog.json', OUT),
  JSON.stringify({ builtAt: report.builtAt, products: [...oldCatalog.values()] })
);
// The groceries on the map: [lat, lng, kind (supermarket, convenience…), name,
// address, every name and brand (lowercase, " | " between them)].
await fs.writeFile(
  new URL('./groceries.json', OUT),
  JSON.stringify({
    builtAt: foundShops ? report.builtAt : previousShops.builtAt,
    shops: osmShops.map(({ lat, lng, kind, name, address, names }) => [
      lat, lng, kind, name, address, names,
    ]),
  })
);
report.groceries = { count: osmShops.length, fresh: foundShops !== null };
report.searchedMinutes = Math.round(searchedMs / 60_000);
report.located = Object.fromEntries(
  ['manual', 'address', 'store', 'area', 'unknown'].map((how) => [
    how,
    branches.filter((branch) => branch.located === how).length,
  ])
);
// The branches not placed exactly yet (searched for again next time), by chain.
report.notPlaced = Object.fromEntries(
  config.chains.map((chain) => [
    chain.key,
    branches
      .filter((branch) => branch.chain === chain.key)
      .filter((branch) => branch.located === 'unknown' || branch.located === 'area')
      .map((branch) => `${branch.id} · ${branch.name} · ${branch.city}`),
  ])
);
await fs.writeFile(new URL('./report.json', OUT), JSON.stringify(report, null, 1));
console.log(
  `\nDone: ${branches.length} branches with prices (${oldStores.length} in the Haifa area), ` +
    `${report.located.unknown} not placed yet.`
);
