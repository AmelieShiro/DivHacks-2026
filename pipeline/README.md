# Nova enrichment pipeline

Turns NYC OpenData records into the enriched dataset the Nova site renders.

**Website team: you only need [The contract](#the-contract).** Everything else
describes how `dist/` gets produced.

---

## Why this exists

NYC OpenData publishes *where* K-5 after-school programs are, and nothing about
*what they are like*. Every field a parent actually wants is absent.

Verified against the K-5 rows of `ebkm-iyma`:

| Field | In OpenData? |
|---|---|
| Name, provider, address, borough, ZIP | yes |
| Latitude / longitude | yes (564 of 569) |
| Age band, funded seats | yes (all 569) |
| **Website** | **no** |
| **Hours, cost, description** | **no** |
| **Tools / equipment** | **no** |
| **Photos** | **no** |

There is also no sibling dataset to join against — `75e9-fg2t`, `graj-69em` and
`9f5n-qdib` were each checked, plus a catalog sweep for any `url`/`web`/`email`
column. So enrichment is not a polish step; it is the product.

**The leverage:** 569 sites are run by only **111 providers**, and a provider's
website describes all of its sites. Enrich once per provider, fan out to sites.

---

## Stages

Each stage reads files and writes files. They are independent, re-runnable and
idempotent, and every network and model call is cached on disk — so re-running
costs nothing and works offline.

| # | Name | Input | Output | Needs Gemini |
|---|---|---|---|---|
| 00 | `fetch` | NYC OpenData API | `data/raw/*.json` | no |
| 10 | `providers` | raw sites | `data/enrichment/providers.json` | no |
| 20 | `resolve` | providers | same file, `website` filled | optional fallback |
| 30 | `crawl` | resolved sites | `data/enrichment/crawl.json` | no |
| 40 | `extract` | crawl text | `data/enrichment/facts.json` | yes (falls back) |
| 50 | `images` | crawl images | `data/enrichment/photos.json` | yes (falls back) |
| 60 | `build` | everything | **`dist/*.json`** | no |

```bash
node pipeline/run.mjs                # all stages
node pipeline/run.mjs --from 30      # stage 30 onward
node pipeline/run.mjs 40 60          # just these
node pipeline/run.mjs 30 --limit 5   # smoke test on 5 providers
node pipeline/run.mjs --no-gemini    # force the non-model path
node pipeline/run.mjs --list
```

## Tests

```bash
npm test          # node --test, no dependencies
```

78 tests across seven suites. The interesting ones are regressions: every case
in `verify.test.mjs` is a false positive that actually reached the dataset
during development (`hugedomains`, `brooklyn.org`, `goddard.org`,
`sunnyside-wa.gov`), and `cost.test.mjs` / `cache.test.mjs` pin the two bugs
described below. `contract.test.mjs` asserts the `dist/` invariants the
website team is told to rely on, so a pipeline change that breaks one fails
here rather than in someone else's UI.

One test is named `KNOWN LIMITATION` on purpose: `looksNewYork()` skips pages
under 400 characters so client-rendered sites are not lost, which means a
*short* page for a same-named org elsewhere can still pass. Pinned so the
tradeoff stays visible.

---

### 20 — resolve: the part that needs care

Three sources propose a domain, cheapest first:

1. `data/enrichment/known-domains.json` — hand-maintained, ~49 entries
2. generated candidates from the legal name (stage 10)
3. Gemini, asked for the official site of an unresolved org

**All three are treated as guesses.** Nothing is accepted until the page is
fetched and shown to belong to that organization. A proposal is rejected if:

- the host (or its redirect target) is a domain parking service
- the page text offers the domain for sale
- the page has real text but never mentions New York or a borough
- too few distinctive words from the legal name appear on the page

That last one matters: matching only a weak word like `brooklyn` or `women` is
not evidence. These four rules were each added after a real false positive —
`hugedomains.com`, `brooklyn.org` (a different charity), `goddard.org` (a
Vermont college), `sunnyside-wa.gov` (a city in Washington State).

The same verification runs on Gemini's suggestions, so a hallucinated domain
cannot enter the dataset — it simply fails to verify.

### 40 / 50 — the Gemini stages

Both are constrained to avoid invention:

- **40** extracts facts from the provider's own page text. `stemTools` is a
  closed enum, every tool must be backed by a verbatim quote in `evidence`, and
  every field may be null. Without a key it falls back to a keyword classifier
  and marks `method: "keyword"`.
- **50** screens images. Cheap filters run first — filename patterns, real pixel
  dimensions parsed from the file header, aspect ratio — so a vision call is
  only spent on something that could plausibly be a photo. Gemini then answers
  whether it is a genuine program photo and what equipment is visible. Without a
  key, images pass the size filter with `judged: false`.

---

## Setup

```bash
cp .env.example .env.local     # add GEMINI_API_KEY
node pipeline/run.mjs          # run.mjs loads .env.local itself
```

`run.mjs` calls `process.loadEnvFile` before importing anything that reads
`process.env`. Plain `node` does not read `.env` files, so if you invoke a
stage module directly rather than through `run.mjs`, pass the key yourself:

```bash
node --env-file=.env.local pipeline/stages/40-extract.mjs
```

If the key is present but the reply cannot be parsed, the run **stops** rather
than continuing — a full run is ~800 model calls, and caching an unusable
result for each of them is worse than failing on the first.

Get a key at <https://aistudio.google.com/apikey>. Everything runs without one;
enrichment quality is just lower and honestly labelled as such.

Tunables (concurrency, rate limits, models, call budget) are in
`pipeline/config.mjs`, all overridable by environment variable.

---

## The contract

Stage 60 writes four files to `dist/`. TypeScript types are in
[`pipeline/schema/program.d.ts`](schema/program.d.ts).

| File | Shape | What it is |
|---|---|---|
| `programs.json` | `Program[]` | the 565 K-5 programs |
| `schools.json` | `School[]` | 2,189 DOE schools, DBN + coords |
| `zips.json` | `ZipStat[]` | 192 ZIP centroids + program density |
| `meta.json` | `Meta` | version, timestamp, counts, sources |

```ts
import type { Program } from "../pipeline/schema/program";
import programs from "../dist/programs.json";
```

### Three guarantees

1. **Enrichment is additive.** A program with no enrichment still ships with its
   complete OpenData record. `enrichment.stemTools` is `[]`, never missing.
   Nothing in the UI should assume enrichment exists.
2. **`id` is stable** across rebuilds — safe for deep links and routing.
3. **Every enriched field carries provenance.** `provenance` and
   `enrichment.method` say where each value came from.

### Please show provenance in the UI

This is the difference between a directory judges trust and one they do not:

| Value | Means | Suggested badge |
|---|---|---|
| `provenance.core` | from NYC OpenData | "City data" |
| `enrichment.method: "gemini"` | read off the provider's site | "From provider website" |
| `enrichment.method: "keyword"` | pattern-matched, low confidence | "Inferred" |
| `photos[].judged: false` | size-filtered only, unreviewed | don't feature it |

`enrichment.evidence` holds the verbatim quotes behind `stemTools` — showing
them on hover is the cheapest credibility win available.

### Useful fields

- **`inSchoolBuilding`** — the host school, set when a DOE point is within 120m
  (444 of 565). Nova is K-5 only, so a school that serves K-5
  wins over a closer one that does not — NYC stacks several schools per
  building, and nearest-point alone picked a high school for roughly one
  elementary program in five. 393 now resolve to a K-5 school; the rest
  carry `servesK5: false`, meaning no K-5 school was in range. **Do not print
  the school name when `servesK5` is false.**
- **`coLocatedSchools`** — every school within 120m, nearest first.
  176 programs sit on a shared campus (length > 1).
- **`zips.json`** — `k5ProgramsNow === 0` is a STEM access desert. That field
  is the heatmap.
- **`seats`** — real funded seat counts, populated on every record.
- **`cost`** — read this carefully. OpenData publishes **no** cost field, so
  `cost.tier` is `"unknown"` unless a provider's own site stated a price
  (279 of 565 do). What *is* factual is `cost.publiclyFunded`: every K-5 row
  carries a DYCD contract number, so all 565 are publicly funded. Publicly
  funded is not the same claim as free to families — do not render `unknown`
  as "Free".
- **`photos[]`** — already ordered for the hero band: carousel-ready first,
  then model `suitability`, then size. For the toroidal left-to-right band
  take `photos.filter(p => p.carouselReady)`; 296 programs have at least one.
  `carouselReady` means >= 600px tall (sharp at 2x in a band occupying a third
  of the viewport) and not portrait, which letterboxes in a fixed-height
  track. Shorter and portrait images still ship for cards and detail pages.
- **Image bounds** — candidates are capped at 4000px on the longest side,
  12 MP and 8 MB. Nonprofit sites ship raw camera JPEGs and the odd sprite
  sheet; those are rejected rather than resized, since a smaller copy of the
  same photo is usually on the same page.

### A note on OSIS

An OSIS is a student's private ID. No public OSIS-to-school mapping exists, and
building one would be a privacy problem. School **name** and **DBN** lookup
delivers the same feature and is fully supported by `schools.json`.

### Photos

`photos[].url` points at the provider's own server, and `sourcePage` is where it
was found. Hotlinking is fine for a demo; credit the provider and link back to
`sourcePage`. Do not present the images as Nova's own.

---

## Current numbers

Last full run, **without** a Gemini key:

```
20 resolve   59/111 providers      67% of sites
30 crawl     59 sites              1,644 candidate images
40 extract   47 providers with tools      (keyword fallback)
50 images    513 photos                   (size filter only)
60 build     565 programs · 2,189 schools · 192 ZIPs
             website 376 · tools 317 · photos 357
             in-school 444 (of which K-5 393)
             publicly funded 565 · cost confirmed 279
```

Adding a key should improve 40 and 50 substantially — the keyword classifier is
deliberately conservative, and no image has been visually reviewed yet.

## Raising coverage

The 52 unresolved providers are the biggest lever, and the cheapest fix is
hand-editing `data/enrichment/known-domains.json`. Entries there are still
verified by fetching, so a wrong guess fails safely rather than corrupting the
data. Re-run `node pipeline/run.mjs --from 20`.
