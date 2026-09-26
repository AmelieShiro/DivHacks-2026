/**
 * Pulls the raw NYC OpenData sources Nova is built on.
 *
 *   DYCD Program Sites   ebkm-iyma   (COMPASS / Beacon / Cornerstone after-school sites)
 *   DOE School Locations wg9x-4ke6   (DBN, grades, principal, coordinates)
 *
 * Writes untouched JSON to data/raw/. Run `node scripts/build-dataset.mjs`
 * afterwards to normalize + enrich it into the shape the app reads.
 */
import { writeFile, mkdir } from "node:fs/promises";

const SODA = "https://data.cityofnewyork.us/resource";
const RAW = new URL("../../data/raw/", import.meta.url);

async function soda(dataset, params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${SODA}/${dataset}.json?${qs}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${dataset}: ${res.status} ${res.statusText}`);
  return res.json();
}

/** Socrata caps a response at 50k rows, so page through. */
async function sodaAll(dataset, params, pageSize = 5000) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await soda(dataset, { ...params, $limit: pageSize, $offset: offset });
    out.push(...page);
    process.stdout.write(`\r  ${dataset}: ${out.length} rows`);
    if (page.length < pageSize) break;
  }
  process.stdout.write("\n");
  return out;
}

export async function run() {
  await mkdir(RAW, { recursive: true });

  // Every DYCD site, all years. The extra years are what make the ZIP centroid
  // table dense enough to place a search anywhere in the five boroughs.
  const sites = await sodaAll("ebkm-iyma", { $order: "date DESC, program_site_name" });
  await writeFile(new URL("dycd-program-sites.json", RAW), JSON.stringify(sites));

  const schools = await sodaAll("wg9x-4ke6", { $order: "system_code" });
  await writeFile(new URL("doe-school-locations.json", RAW), JSON.stringify(schools));

  // DYCD rows carry a 2010 NTA code ("BK61"); this is the code -> name table
  // ("Crown Heights North") the site shows as the neighbourhood.
  const ntas = await soda("swpk-hqdp", { $select: "nta_code,nta_name,borough", $where: "year='2010'", $limit: 500 });
  await writeFile(new URL("nta-names.json", RAW), JSON.stringify(ntas));

  console.log(`\nWrote ${sites.length} DYCD sites, ${schools.length} DOE schools and ${ntas.length} neighbourhood names to data/raw/`);
  return { sites: sites.length, schools: schools.length };
}

// Allow `node pipeline/stages/00-fetch.mjs` as well as orchestrated runs.
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
