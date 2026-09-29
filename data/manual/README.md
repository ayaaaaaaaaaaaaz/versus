# Manual price entry

For shops the collector cannot reach. A101 and CarrefourSA both sit behind
Cloudflare challenges, and getting past those would mean defeating bot
protection, so their prices can only be entered by hand.

## How

Copy `template.csv`, name it `YYYY-MM.csv`, and fill in a row per price. The next
build picks it up automatically and merges it into the same dataset the scraper
writes to, tagged `source: manual` so it is always distinguishable.

```csv
date,store,item_id,shelf_price,pack_size,pack_unit
2026-09-29,a101,ekmek,12.50,350,g
2026-09-29,a101,sut,48.00,1,l
```

- `date` — `YYYY-MM-DD`, the day you saw the price
- `store` — any label; use the same one each time for the same shop
- `item_id` — must match an id in `src/data/street-basket.json`, or the row is
  skipped with a warning rather than silently inventing an item
- `shelf_price` — the price on the label, in lira, as a plain number
- `pack_size` + `pack_unit` — `g`, `kg`, `ml`, `l` or `unit`

The unit price is computed from the pack, exactly as it is for scraped rows, so
a 350 g loaf at 12,50 lira becomes 35,71 lira per kilo.

## Why CSV and not a form

A form needs a password, and a password needs somewhere safe to live. A file in
the repository needs neither, goes through the same review as any other change,
and leaves a history of who entered what.
