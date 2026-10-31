# Grocery List – prices

Daily grocery prices for the Grocery List app, for all of Israel.

Israeli supermarket chains publish their prices every day, by law (the price
transparency law). Every morning, GitHub runs `build.mjs`, which:

1. reads each chain's list of branches (all of Israel),
2. finds where each branch is on the map (OpenStreetMap's address search: at
   most 25 minutes a run, so new branches are placed over a few runs),
3. turns each branch's full price file into a small JSON file,
4. publishes them on the **`data`** branch of this repository.

The app downloads `branches.json`, then only the branches near the phone and
their chains' product lists.

## Files on the `data` branch

- `branches.json`: every branch, with its chain, name, city, address and place on
  the map (`located` says how it was found; `unknown`: not placed yet).
- `chains/<chain>.json`: a chain's products, each `[barcode, name, by weight (1/0)]`.
- `branches/<branch id>.json`: one branch's prices, in its chain's product order
  (0: not sold there).
- `report.json`: every city each chain lists, errors, how many branches were
  placed how, and the ones not placed yet (`notPlaced`).
- `groceries.json`: every grocery in Israel that OpenStreetMap knows of
  (supermarkets, minimarkets, greengrocers, butchers, delis), asked once a night,
  for the app's map. Also used to put branches exactly on their store.
- `places.json`: the cities' centers found so far (not searched for again).
- `stores.json`, `catalog.json`: the Haifa area only (`"cities"` in
  `config.json`), for the app's versions before 2026-11; can go once every phone
  has the new one.

## Changing the cities or chains

Every branch in Israel is read; a city given as a code is named with
`city-codes.json` (the official list of towns, from data.gov.il). A chain
whose branches have no city (code 0) can list branches by number instead, in its
`"branches"` (branch number → city). A branch the map can't find by its address
can be placed by hand in `"locations"` (branch id → [latitude, longitude]), and
each chain's `"mapNames"` are the names its stores have on OpenStreetMap. Then
on GitHub: **Actions → Prices → Run workflow**, or wait for the next night.

The chains and their logins come from the Consumer Protection Authority's list,
https://www.gov.il/he/pages/cpfta_prices_regulations. Each chain's `"source"` is
how its files are read:

- `cerberus`: the shared server, with the user name and password listed there;
  `"folder"` for a chain that keeps its files in a folder (Super Yuda).
- `shufersal`, `carrefour`: their own sites.
- `laibcatalog`: the shared site of Victory, H. Cohen and Mahsanei HaShuk.
- `pages`: pages of download links, in `"pages"` (Hazi Hinam, Super-Pharm, Wolt
  Market, K.T.). `{iso}` / `{dmy}` stand for today's and yesterday's date,
  `{page}` for page 1, 2, 3…

Not read: Dor Alon (its server sends files from a second address); the
binaprojects sites (King Store, Maayan 2000, Good Pharm, Zol Vebegadol, Super
Sapir, City Market, Bareket, Shuk Hayir, Shefa Birkat Hashem: their security
certificate is revoked); Netiv Hesed (its site shows a database error).

## The run at home

Some chains' sites (Carrefour, Victory, H. Cohen, Mahsanei HaShuk, Hazi Hinam,
Super-Pharm, K.T.) block computers outside Israel, like GitHub's. So a computer
in Israel also runs the build every morning, `run-at-home.cmd`, from Windows Task
Scheduler (task "Grocery prices", daily at 08:30, or as soon as the computer is
on). Those chains are marked `"israel": true` in `config.json`: at home
(`RUN_AT=home`) only they are read, and on GitHub (`RUN_AT=github`) only the
others; each run keeps the other half from the last published files ("kept N
branches from last time" in report.json). What the last run did is in
`logs\run-at-home.log`.
