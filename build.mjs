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

// ---- Cerberus: the shared server (Rami Levy, Osher Ad, Salach Dabach) --------

async function cerberus(chain) {
  const client = new Client(60_000);
  await client.access({
    host: 'url.retail.publishedprices.co.il',
    user: chain.username,
    password: chain.password,
    secure: false,
  });
  const names = (await client.list('/')).map((file) => file.name);
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
    await client.downloadTo(sink, name);
    return Buffer.concat(chunks);
  }

  return {
    async stores() {
      const name = newest(`Stores${chain.chainId}`) ?? newest('Stores');
      if (!name) throw new Error('no branches file on the server');
      return readStores(toText(await fetchFile(name)));
    },
    async prices(store) {
      // e.g. PriceFull7290058140886-001-015-20261028-060951.gz: chain, sub-chain (001),
      // branch (zeros in front), date. Some chains leave out the sub-chain.
      const pattern = new RegExp(`^PriceFull${chain.chainId}(?:-\\d+)?-0*${store.storeId}-\\d{8}`);
      const name = names.filter((each) => pattern.test(each)).sort().at(-1);
      if (!name) throw new Error(`no full price file for branch ${store.storeId}`);
      return { items: readPrices(toText(await fetchFile(name))), file: name };
    },
    close() {
      client.close();
    },
  };
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

const stores = [];
const report = { builtAt: new Date().toISOString(), chains: {} };
// Every product once (by barcode), with its price in each branch: catalog.json.
const catalog = new Map();

function addToCatalog(items) {
  const storeIndex = stores.length - 1;
  for (const [code, name, , price, , , , weighted] of items) {
    let product = catalog.get(code);
    if (!product) {
      product = [name, weighted, []];
      catalog.set(code, product);
    }
    product[2].push(storeIndex, price);
  }
}

for (const chain of config.chains) {
  console.log(`\n${chain.name} (${chain.key})`);
  const chainReport = { branches: 0, kept: 0, citiesSeen: {}, errors: [] };
  report.chains[chain.key] = chainReport;
  let source;
  try {
    source = chain.source === 'shufersal' ? shufersal : await cerberus(chain);
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
      try {
        const { items, file } = await source.prices(branch);
        await fs.writeFile(new URL(`./prices/${id}.json`, OUT), JSON.stringify(items));
        stores.push({ ...entry, products: items.length, sourceFile: file, pricesFrom: report.builtAt });
        addToCatalog(items);
        console.log(`  ✓ ${branch.name}: ${items.length} products`);
      } catch (error) {
        // No fresh file tonight: keep the last prices we had for this branch, if any.
        const last = previous.stores.find((store) => store.id === id);
        const lastFile = await fs
          .readFile(new URL(`./prices/${id}.json`, PREVIOUS))
          .catch(() => null);
        if (last && lastFile) {
          await fs.writeFile(new URL(`./prices/${id}.json`, OUT), lastFile);
          const { products, sourceFile, pricesFrom } = last;
          stores.push({ ...entry, products, sourceFile, pricesFrom });
          addToCatalog(JSON.parse(lastFile.toString()));
          chainReport.errors.push(`${branch.name}: ${error.message} (kept prices from ${pricesFrom})`);
        } else {
          chainReport.errors.push(`${branch.name}: ${error.message}`);
        }
        console.log(`  ✗ ${branch.name}: ${error.message}`);
      }
    }
  } catch (error) {
    chainReport.errors.push(error.message);
    console.log(`  ✗ ${error.message}`);
  } finally {
    source?.close();
  }
}

await fs.writeFile(
  new URL('./stores.json', OUT),
  JSON.stringify({ builtAt: report.builtAt, cities: config.cities.map((c) => c.name), stores }, null, 1)
);
// The app's price estimates: [name, by weight (1/0), [branch index, price, branch index, price…]],
// branch index = place in stores.json's "stores".
await fs.writeFile(
  new URL('./catalog.json', OUT),
  JSON.stringify({ builtAt: report.builtAt, products: [...catalog.values()] })
);
await fs.writeFile(new URL('./report.json', OUT), JSON.stringify(report, null, 1));
console.log(`\nDone: ${stores.length} branches with prices.`);
