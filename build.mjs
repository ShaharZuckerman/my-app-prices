// Builds the price files for the Grocery List app, from the price files the
// chains publish by law (Israel's price transparency law).
//
// For each chain in config.json: read its list of branches, keep the ones in
// the chosen cities, and turn each kept branch's full price file into a small
// JSON file. Everything goes into ./out:
//   out/stores.json          the kept branches (which file has each one's prices)
//   out/prices/<id>.json     one branch's products and prices
//   out/report.json          what was found (every city seen, errors), to tune config.json
//
// Run with: node build.mjs   (GitHub runs it every night, see .github/workflows)
import { Client } from 'basic-ftp';
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { gunzipSync } from 'node:zlib';

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

/** A downloaded file as text: unzipped if needed, UTF-8 or UTF-16. */
function toText(buffer) {
  const data = buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer) : buffer;
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

/** The chosen city a branch is in, or null. Uses the city field, else the branch's name. */
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
async function shufersalLinks(category, storeId) {
  const query = new URLSearchParams({ catID: String(category) });
  if (storeId) query.set('storeId', storeId);
  const page = (await download(`${ShufersalSite}FileObject/UpdateCategory?${query}`)).toString();
  return [...page.matchAll(/href="(https:\/\/[^"]+\.blob\.core\.windows\.net[^"]+)"/g)].map(
    (match) => match[1].replace(/&amp;/g, '&')
  );
}

const shufersal = {
  async stores() {
    const [link] = (await shufersalLinks(5)).filter((url) => /Stores/i.test(url));
    if (!link) throw new Error('no branches file on the Shufersal site');
    return readStores(toText(await download(link)));
  },
  async prices(store) {
    const [link] = (await shufersalLinks(2, store.storeId)).filter((url) => /PriceFull/i.test(url));
    if (!link) throw new Error(`no full price file for branch ${store.storeId}`);
    return { items: readPrices(toText(await download(link))), file: link.split('?')[0].split('/').pop() };
  },
  close() {},
};

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
  console.log(`  ${names.length} files on the site`);
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
  console.log(`  ${names.length} files on the site`);
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
  console.log(`  ${names.length} files on the site`);
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
  console.log(`  ${names.length} files on the server`);
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
  shufersal: () => shufersal,
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
const cityCenters = new Map();

/**
 * A place's coordinates from OpenStreetMap, or null if it isn't found. With a
 * city, only a place within CityKm of its center.
 */
async function findOnMap(query, city) {
  const center = city ? await cityCenter(city) : null;
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
}

/** A city's center (asked once a night). */
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
  const last = previous.stores.find((store) => store.id === entry.id);
  // Kept from last night, unless it's out of its city (found before CityKm was checked).
  if (last?.located === 'address' || last?.located === 'store') {
    const center = await cityCenter(entry.city);
    if (!center || kmBetween(center, last) <= CityKm) {
      return { lat: last.lat, lng: last.lng, located: last.located };
    }
  }
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
    '[out:json][timeout:300];area["ISO3166-1"="IL"][admin_level=2]->.il;' +
    `nwr["shop"~"^(${ShopKinds.join('|')})$"](area.il);out center tags;`;
  for (const server of ShopSearch) {
    try {
      const response = await fetch(server, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        headers: { 'User-Agent': 'my-app-prices (github.com/ShaharZuckerman/my-app-prices)' },
        signal: AbortSignal.timeout(360_000),
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

// Last night's files (the workflow puts the data branch in ./previous), for branches
// without a fresh price file tonight.
const PREVIOUS = new URL('./previous/', import.meta.url);
const previous = JSON.parse(
  await fs.readFile(new URL('./stores.json', PREVIOUS), 'utf8').catch(() => '{"stores":[]}')
);

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(new URL('./prices/', OUT), { recursive: true });

// The groceries on the map first (they help place the branches). If no server
// answers tonight, last night's list is used.
console.log('Groceries on the map (OpenStreetMap)');
const previousShops = JSON.parse(
  await fs.readFile(new URL('./groceries.json', PREVIOUS), 'utf8').catch(() => '{"shops":[]}')
);
const foundShops = await findShops();
const osmShops =
  foundShops ??
  previousShops.shops.map(([lat, lng, kind, name, address, names]) => ({
    lat, lng, kind, name, address, names,
  }));
console.log(`  ${osmShops.length} groceries${foundShops ? '' : ' (from last night)'}`);

const stores = [];
const report = { builtAt: new Date().toISOString(), chains: {} };
// Every product once (by barcode), with its price in each branch: catalog.json.
const catalog = new Map();

function addToCatalog(items) {
  const storeIndex = stores.length - 1;
  for (const [code, name, , price, , , , weighted] of items) {
    let product = catalog.get(code);
    if (!product) {
      product = [name, weighted, [], code];
      catalog.set(code, product);
    }
    product[2].push(storeIndex, price);
  }
}

/** A branch with its prices from last time (if there are any): when they're from, else null. */
async function keepLastPrices(branch) {
  const lastFile = await fs.readFile(new URL(`./prices/${branch.id}.json`, PREVIOUS)).catch(() => null);
  if (!lastFile) return null;
  await fs.writeFile(new URL(`./prices/${branch.id}.json`, OUT), lastFile);
  stores.push(branch);
  addToCatalog(JSON.parse(lastFile.toString()));
  return branch.pricesFrom;
}

for (const chain of config.chains) {
  console.log(`\n${chain.name} (${chain.key})`);
  const chainReport = { branches: 0, kept: 0, citiesSeen: {}, errors: [] };
  report.chains[chain.key] = chainReport;
  let source;
  try {
    source = await Sources[chain.source](chain);
    const branches = await source.stores();
    chainReport.branches = branches.length;
    for (const branch of branches) {
      const seen = branch.city || '(none)';
      chainReport.citiesSeen[seen] = (chainReport.citiesSeen[seen] ?? 0) + 1;
    }
    // In a chosen city, or added by hand in config.json ("branches").
    const extra = chain.branches ?? {};
    const kept = branches.filter((branch) => cityOf(branch) || extra[branch.storeId]);
    chainReport.kept = kept.length;
    chainReport.files = chain.fileSample;
    // Branches whose city is unknown (code 0 or empty): their names and addresses, to match by hand.
    chainReport.unknownCity = branches
      .filter((branch) => !branch.city || /^0+$/.test(branch.city))
      .map((branch) => `${branch.storeId} · ${branch.name} · ${branch.address}`);
    chainReport.keptBranches = kept.map((branch) => `${branch.storeId} · ${branch.name}`);
    console.log(`  ${branches.length} branches, ${kept.length} in the chosen cities`);

    for (const branch of kept) {
      const id = `${chain.key}-${branch.storeId}`;
      const entry = {
        id,
        chain: chain.key,
        chainName: chain.name,
        subChain: branch.subChain,
        storeId: branch.storeId,
        name: branch.name,
        city: cityOf(branch) ?? extra[branch.storeId],
        address: branch.address,
      };
      Object.assign(entry, await locate(entry, chain).catch(() => ({})));
      try {
        const { items, file } = await source.prices(branch);
        await fs.writeFile(new URL(`./prices/${id}.json`, OUT), JSON.stringify(items));
        stores.push({ ...entry, products: items.length, sourceFile: file, pricesFrom: report.builtAt });
        addToCatalog(items);
        console.log(`  ✓ ${branch.name}: ${items.length} products`);
      } catch (error) {
        // No fresh file tonight: keep the last prices we had for this branch, if any.
        const last = previous.stores.find((store) => store.id === id);
        const pricesFrom =
          last &&
          (await keepLastPrices({
            ...entry,
            products: last.products,
            sourceFile: last.sourceFile,
            pricesFrom: last.pricesFrom,
          }));
        chainReport.errors.push(
          `${branch.name}: ${error.message}${pricesFrom ? ` (kept prices from ${pricesFrom})` : ''}`
        );
        console.log(`  ✗ ${branch.name}: ${error.message}`);
      }
    }
  } catch (error) {
    // The chain's site can't be reached (some block computers outside Israel, like
    // GitHub's): its branches as they were last time (from the run on a computer
    // in Israel, see run-at-home.ps1).
    let kept = 0;
    for (const last of previous.stores.filter((store) => store.chain === chain.key)) {
      if (await keepLastPrices(last)) kept++;
    }
    chainReport.errors.push(`${error.message}${kept ? ` (kept ${kept} branches from last time)` : ''}`);
    console.log(`  ✗ ${error.message}${kept ? ` (kept ${kept} branches from last time)` : ''}`);
  } finally {
    source?.close();
  }
}

await fs.writeFile(
  new URL('./stores.json', OUT),
  JSON.stringify({ builtAt: report.builtAt, cities: config.cities.map((c) => c.name), stores }, null, 1)
);
// The app's price estimates:
// [name, by weight (1/0), [branch index, price, branch index, price…], barcode],
// branch index = place in stores.json's "stores". The barcode finds products on receipts.
await fs.writeFile(
  new URL('./catalog.json', OUT),
  JSON.stringify({ builtAt: report.builtAt, products: [...catalog.values()] })
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
report.located = Object.fromEntries(
  ['manual', 'address', 'store', 'area', 'unknown'].map((how) => [
    how,
    stores.filter((store) => store.located === how).map((store) => `${store.id} · ${store.name}`),
  ])
);
await fs.writeFile(new URL('./report.json', OUT), JSON.stringify(report, null, 1));
console.log(`\nDone: ${stores.length} branches with prices.`);
