#!/usr/bin/env node
/**
 * Pipeline orchestrator.
 *
 *   node pipeline/run.mjs                 # every stage, in order
 *   node pipeline/run.mjs 40 50 60        # only these stages
 *   node pipeline/run.mjs --from 30       # stage 30 onwards
 *   node pipeline/run.mjs 30 --limit 5    # smoke test on 5 providers
 *   node pipeline/run.mjs --list
 *
 * Stages are independent and re-runnable: each reads files on disk and writes
 * files on disk, and every network/model call is cached, so re-running is
 * cheap and safe.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

// `node` does not read .env files unless told to, so `cp .env.example
// .env.local` would otherwise do nothing.
//
// This must happen before ANY module that reads process.env is evaluated, and
// static imports are hoisted above top-level code — so config.mjs and every
// stage are imported dynamically, below. Do not convert these to static
// imports: config.mjs snapshots process.env at module-evaluation time.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(ROOT, name));
    break;
  } catch {
    /* absent is fine */
  }
}

const { isEnabled, usage, preflight } = await import("./lib/gemini.mjs");

const STAGES = [
  ["00", "fetch",     "Download raw NYC OpenData",              () => import("./stages/00-fetch.mjs")],
  ["10", "providers", "Reduce sites to distinct providers",     () => import("./stages/10-providers.mjs")],
  ["20", "resolve",   "Provider -> verified website",           () => import("./stages/20-resolve.mjs")],
  ["30", "crawl",     "Crawl provider sites for text + images", () => import("./stages/30-crawl.mjs")],
  ["40", "extract",   "Gemini: page text -> program facts",     () => import("./stages/40-extract.mjs")],
  ["50", "images",    "Gemini vision: screen program photos",   () => import("./stages/50-images.mjs")],
  ["60", "build",     "Emit dist/ dataset contract",            () => import("./stages/60-build.mjs")],
];

function parseArgs(argv) {
  const opts = { only: [], from: null, limit: null, list: false, noGemini: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") opts.list = true;
    else if (a === "--from") opts.from = argv[++i];
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a === "--no-gemini") opts.noGemini = true;
    else if (/^\d{2}$/.test(a)) opts.only.push(a);
    else if (!a.startsWith("--")) {
      const hit = STAGES.find(([, name]) => name === a);
      if (hit) opts.only.push(hit[0]);
      else throw new Error(`unknown stage: ${a}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    for (const [id, name, desc] of STAGES) console.log(`  ${id}  ${name.padEnd(10)} ${desc}`);
    return;
  }

  let selected = STAGES;
  if (opts.only.length) selected = STAGES.filter(([id]) => opts.only.includes(id));
  else if (opts.from) selected = STAGES.filter(([id]) => id >= opts.from);

  const needsGemini = selected.some(([id]) => ["40", "50"].includes(id));
  if (needsGemini && !opts.noGemini) {
    if (!isEnabled()) {
      console.log("! GEMINI_API_KEY not set - stages 40/50 will use their non-model fallback.\n");
    } else {
      process.stdout.write("· verifying Gemini key ... ");
      try {
        if (await preflight()) {
          console.log("ok");
        } else {
          // The call succeeded but the answer was not what we asked for.
          // Continuing would spend ~800 calls writing unusable results.
          console.log("FAILED: key works but the reply could not be parsed.");
          console.log("  Run with --no-gemini to use the fallback path instead.");
          process.exitCode = 1;
          return;
        }
      } catch (e) {
        console.log(`FAILED: ${e.message}`);
        process.exitCode = 1;
        return;
      }
    }
  }

  const summary = [];
  for (const [id, name, , load] of selected) {
    console.log(`\n${"=".repeat(64)}\n  stage ${id} - ${name}\n${"=".repeat(64)}`);
    const mod = await load();
    const result = await mod.run({ limit: opts.limit, useGemini: !opts.noGemini });
    summary.push([id, name, result]);
  }

  console.log(`\n${"=".repeat(64)}\n  summary\n${"=".repeat(64)}`);
  for (const [id, name, r] of summary) {
    console.log(`  ${id} ${name.padEnd(10)} ${JSON.stringify(r ?? {})}`);
  }
  if (isEnabled()) {
    const u = usage();
    console.log(`\n  gemini calls this run: ${u.callsMade} / budget ${u.budget}`);
  }
}

main().catch((e) => {
  console.error("\npipeline failed:", e);
  process.exit(1);
});
