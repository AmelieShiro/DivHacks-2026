/**
 * Stage 60 — emit the dataset contract in dist/.
 *
 * This is the only stage the website team needs to care about. It joins the
 * verified OpenData facts with whatever enrichment succeeded and writes a
 * stable, versioned shape. Enrichment is always ADDITIVE: a program with no
 * enrichment still ships with its full OpenData record.
 *
 * Every enriched field carries its provenance so the UI can badge honestly.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { paths, K5_AGE_RANGES, PROGRAM_YEAR } from "../config.mjs";
import { makeLogger } from "../lib/log.mjs";
import { loadBlocklist, applyBlocklist, isBlocked } from "../lib/blocklist.mjs";
import { SUBJECT_GROUPS } from "./40-extract.mjs";

const log = makeLogger("60-build");
export const SCHEMA_VERSION = "2.5.0";

/** A DOE point this close means the program runs in that building. */
export const SCHOOL_RADIUS_M = 120;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function readOptional(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Stable id so the site can deep-link a program across rebuilds. */
const programId = (r) =>
  `${slug(r.program_site_name ?? "site")}-${slug(r.street_address ?? "")}-${r.zipcode ?? ""}`
    .replace(/-+/g, "-")
    .slice(0, 100);

/**
 * What we can honestly say about price.
 *
 * NYC OpenData publishes no cost field, so an unqualified "free" would be an
 * invention attributed to the City. What the data DOES support is that every
 * K-5 row carries a DYCD contract number, i.e. the site is publicly funded.
 * That is reported as its own fact; the price tier only claims what a source
 * actually said.
 */
/** Every DOE school whose point falls inside the building radius, nearest first. */
export function schoolsWithin(schools, lat, lng, radiusM = SCHOOL_RADIUS_M) {
  const hits = [];
  for (const s of schools) {
    const d = haversineMeters({ lat, lng }, s);
    if (d <= radiusM) {
      hits.push({ dbn: s.dbn, name: s.name, distanceM: Math.round(d), servesK5: s.servesK5 });
    }
  }
  return hits.sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * Which school to call the host.
 *
 * NYC stacks several schools in one building and clusters them on one campus,
 * so "nearest point" alone picks a high school for an elementary program about
 * one time in five. Nova is a K-5 product, so a school that actually serves
 * K-5 wins over a closer one that does not.
 */
export function pickHostSchool(nearby) {
  if (!nearby.length) return null;
  return nearby.find((s) => s.servesK5) ?? nearby[0];
}

export function deriveCost({ contract, programArea, extracted }) {
  const publiclyFunded = Boolean(contract && contract !== "NULL");

  const fromSite = extracted?.costTier;
  if (fromSite && fromSite !== "unknown") {
    return {
      tier: fromSite,
      source: "provider-website",
      publiclyFunded,
      note: `Stated on the provider's own site (${extracted.method ?? "extracted"}).`,
    };
  }

  return {
    tier: "unknown",
    source: "not-published",
    publiclyFunded,
    note: publiclyFunded
      ? `DYCD-contracted ${programArea ?? "program"}; the City does not publish a family fee, so cost is unconfirmed.`
      : "No cost information published.",
  };
}

function haversineMeters(a, b) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function run() {
  const rawSites = JSON.parse(
    await readFile(path.join(paths.raw, "dycd-program-sites.json"), "utf8"),
  );
  const rawSchools = JSON.parse(
    await readFile(path.join(paths.raw, "doe-school-locations.json"), "utf8"),
  );
  const providers = await readOptional(path.join(paths.work, "providers.json"), []);
  const facts = await readOptional(path.join(paths.work, "facts.json"), []);
  const photos = await readOptional(path.join(paths.work, "photos.json"), []);
  const ntaName = new Map(
    (await readOptional(path.join(paths.raw, "nta-names.json"), [])).map((n) => [n.nta_code, n.nta_name]),
  );

  // Last line of defence for hand-blocked websites: even if earlier stages
  // were not re-run, nothing read off a wrong org's site reaches dist/.
  const blocklist = await loadBlocklist();
  for (const c of applyBlocklist(providers, blocklist)) log.warn(`blocked ${c.website} for ${c.provider}`);
  const fromAllowedSite = (x) => !isBlocked(blocklist, x.provider, x.website);

  const factByProvider = new Map(facts.filter(fromAllowedSite).map((f) => [f.provider, f]));
  const photoByProvider = new Map(photos.filter(fromAllowedSite).map((p) => [p.provider, p.photos]));
  const provByName = new Map(providers.map((p) => [p.provider, p]));

  // --- schools -------------------------------------------------------------
  const schools = rawSchools
    .filter((s) => s.latitude && s.longitude)
    .map((s) => ({
      dbn: s.system_code ?? null,
      name: s.location_name ?? null,
      grades: s.grades_final_text ?? s.grades_text ?? null,
      category: s.location_category_description ?? null,
      address: s.primary_address_line_1 ?? null,
      district: s.geographical_district_code ?? null,
      principal: s.principal_name ?? null,
      phone: s.principal_phone_number ?? null,
      lat: num(s.latitude),
      lng: num(s.longitude),
      servesK5: /(^|,)(0K|01|02|03|04|05)(,|$)/.test(s.grades_final_text ?? s.grades_text ?? ""),
    }))
    .filter((s) => s.lat !== null && s.lng !== null);

  // --- programs ------------------------------------------------------------
  const k5 = rawSites.filter(
    (r) => r.date === PROGRAM_YEAR && K5_AGE_RANGES.has(r.age_range),
  );

  const seen = new Set();
  const programs = [];
  for (const r of k5) {
    const id = programId(r);
    if (seen.has(id)) continue;
    seen.add(id);

    const lat = num(r.latitude);
    const lng = num(r.longitude);
    const prov = provByName.get(r.provider);
    const fact = factByProvider.get(r.provider);
    const pics = photoByProvider.get(r.provider) ?? [];

    const nearby = lat === null || lng === null ? [] : schoolsWithin(schools, lat, lng);
    const school = pickHostSchool(nearby);

    programs.push({
      id,
      name: r.program_site_name ?? null,
      provider: r.provider ?? null,
      programArea: r.program_area ?? null,
      programType: r.program_type ?? null,
      ageRange: r.age_range ?? null,
      address: {
        street: r.street_address ?? null,
        city: r.city ?? null,
        borough: r.borough ?? null,
        zip: r.zipcode ?? null,
        nta: r.nta && r.nta !== "NULL" ? r.nta : null,
        neighborhood: ntaName.get(r.nta) ?? null,
      },
      lat,
      lng,
      seats: num(r.totalslots),
      participants: num(r.totalparticipants),
      cost: deriveCost({
        contract: r.contract,
        programArea: r.program_area,
        extracted: fact,
      }),
      inSchoolBuilding: school,
      // Shared campuses are common; keep every school in range rather than
      // collapsing a co-located site to one arbitrary name.
      coLocatedSchools: nearby,

      enrichment: {
        website: prov?.website ?? null,
        websiteConfidence: prov?.confidence ?? "unresolved",
        websiteSource: prov?.source ?? null,
        summary: fact?.summary || null,
        stemTools: fact?.stemTools ?? [],
        subjects: fact?.subjects ?? [],
        subjectEvidence: fact?.subjectEvidence ?? [],
        activities: fact?.activities ?? [],
        hoursText: fact?.hoursText || null,
        contactEmail: fact?.contactEmail || null,
        contactPhone: fact?.contactPhone || null,
        evidence: fact?.evidence ?? [],
        method: fact?.method ?? null,
        confidence: fact?.confidence ?? null,
      },

      // Ordered for the hero band: carousel-ready first (stage 50 sorts).
      photos: pics.map((p) => ({
        url: p.url,
        sourcePage: p.page,
        caption: p.caption ?? p.alt ?? null,
        width: p.width,
        height: p.height,
        aspect: p.aspect ?? null,
        orientation: p.orientation ?? null,
        carouselReady: Boolean(p.carouselReady),
        kind: p.judged ? p.kind ?? null : null,
        visibleTools: p.visibleTools ?? [],
        judged: Boolean(p.judged),
        suitability: p.suitability ?? null,
      })),

      provenance: {
        core: "nyc-opendata:ebkm-iyma",
        schoolMatch: school
        ? `nyc-opendata:wg9x-4ke6 (<=${SCHOOL_RADIUS_M}m, K-5 preferred)`
        : null,
        enrichment: fact?.method ?? "none",
        photos: pics.some((p) => p.judged) ? "gemini-vision" : pics.length ? "crawl-unjudged" : "none",
      },
    });
  }

  // --- ZIP centroids (for search + access-desert math) ----------------------
  const acc = new Map();
  for (const r of rawSites) {
    const zip = r.zipcode;
    const lat = num(r.latitude);
    const lng = num(r.longitude);
    if (!zip || lat === null || lng === null) continue;
    const e = acc.get(zip) ?? { zip, lat: 0, lng: 0, n: 0 };
    e.lat += lat; e.lng += lng; e.n += 1;
    acc.set(zip, e);
  }
  const zips = [...acc.values()].map((e) => ({
    zip: e.zip,
    lat: +(e.lat / e.n).toFixed(6),
    lng: +(e.lng / e.n).toFixed(6),
    dycdSitesAllYears: e.n,
    k5ProgramsNow: programs.filter((p) => p.address.zip === e.zip).length,
  }));

  const meta = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    programYear: PROGRAM_YEAR,
    counts: {
      programs: programs.length,
      schools: schools.length,
      zips: zips.length,
      withWebsite: programs.filter((p) => p.enrichment.website).length,
      withTools: programs.filter((p) => p.enrichment.stemTools.length).length,
      withSubjects: programs.filter((p) => p.enrichment.subjects.length).length,
      withPhotos: programs.filter((p) => p.photos.length).length,
      withCarouselPhoto: programs.filter((p) => p.photos.some((x) => x.carouselReady)).length,
      inSchoolBuilding: programs.filter((p) => p.inSchoolBuilding).length,
      inK5SchoolBuilding: programs.filter((p) => p.inSchoolBuilding?.servesK5).length,
      onSharedCampus: programs.filter((p) => p.coLocatedSchools.length > 1).length,
      publiclyFunded: programs.filter((p) => p.cost.publiclyFunded).length,
      costConfirmed: programs.filter((p) => p.cost.tier !== "unknown").length,
    },
    sources: {
      programs: "NYC OpenData DYCD Program Sites (ebkm-iyma)",
      schools: "NYC OpenData DOE School Locations (wg9x-4ke6)",
      enrichment: "provider websites, extracted with Google Gemini",
    },
    // Shipped with the data so the site can build filter headings without
    // importing pipeline code.
    subjectGroups: SUBJECT_GROUPS,
  };

  await mkdir(paths.dist, { recursive: true });
  const write = (name, data) =>
    writeFile(path.join(paths.dist, name), JSON.stringify(data, null, 2) + "\n");
  await Promise.all([
    write("programs.json", programs),
    write("schools.json", schools),
    write("zips.json", zips),
    write("meta.json", meta),
  ]);

  log.ok(`programs=${meta.counts.programs} schools=${meta.counts.schools} zips=${meta.counts.zips}`);
  log.ok(`enriched: website=${meta.counts.withWebsite} tools=${meta.counts.withTools} photos=${meta.counts.withPhotos}`);
  return meta;
}
