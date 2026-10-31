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
https://www.gov.il/he/pages/cpfta_prices_regulations. Chains on the shared
Cerberus server (`"source": "cerberus"`) use the user name and password listed
there; `"folder"` is for a chain that keeps its files in a folder (Super Yuda).
Not read yet: Dor Alon (its server sends files from a second address), and the
chains on other sites (Carrefour, Victory, Hazi Hinam, the binaprojects sites
and others).
