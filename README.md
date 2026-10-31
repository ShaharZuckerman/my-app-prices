# Grocery List – prices

Nightly grocery prices for the Grocery List app, for a few cities only.

Israeli supermarket chains publish their prices every day, by law (the price
transparency law). Every night, GitHub runs `build.mjs`, which:

1. reads each chain's list of branches,
2. keeps the branches in the cities listed in `config.json`,
3. turns each kept branch's full price file into a small JSON file,
4. publishes them on the **`data`** branch of this repository.

The app reads `stores.json` and the files in `prices/` from the `data` branch.

## Files on the `data` branch

- `stores.json`: the branches, with their chain, name, city, address and place on
  the map (`located` says how it was found: by address, or set by hand).
- `prices/<branch id>.json`: one branch's products, each as
  `[barcode, name, maker, price, amount, unit, price per unit, by weight (1/0)]`.
- `report.json`: every city each chain lists, how many branches were kept, and
  any errors. Use it to adjust the city names in `config.json`. Its `located`
  lists which branches were placed how.
- `groceries.json`: every grocery in Israel that OpenStreetMap knows of
  (supermarkets, minimarkets, greengrocers, butchers, delis), asked once a night,
  for the app's map. Also used to put branches exactly on their store.

## Changing the cities or chains

Edit `config.json` (city names in Hebrew, with their official city codes). A chain
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
on). It publishes every chain; GitHub's run keeps the blocked chains' prices from
it ("kept N branches from last time" in report.json). What the last run did is in
`logs\run-at-home.log`.
