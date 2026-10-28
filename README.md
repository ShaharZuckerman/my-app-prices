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

- `stores.json`: the branches, with their chain, name, city and address.
- `prices/<branch id>.json`: one branch's products, each as
  `[barcode, name, maker, price, amount, unit, price per unit, by weight (1/0)]`.
- `report.json`: every city each chain lists, how many branches were kept, and
  any errors. Use it to adjust the city names in `config.json`.

## Changing the cities or chains

Edit `config.json` (city names in Hebrew, with their official city codes). A chain
whose branches have no city (code 0) can list branches by number instead, in its
`"branches"` (branch number → city). Then
on GitHub: **Actions → Prices → Run workflow**, or wait for the next night.
