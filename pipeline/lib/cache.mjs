/**
 * Content-addressed disk cache.
 *
 * Every network call and every model call goes through here, so a re-run of
 * the pipeline costs nothing and works with the wifi off. Cache keys are a
 * hash of the full request, so changing a prompt or a URL naturally misses.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "../config.mjs";

const key = (parts) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);

function slot(namespace, hash) {
  // Shard by first byte so directories stay small.
  return path.join(paths.cache, namespace, hash.slice(0, 2), `${hash}.json`);
}

/**
 * Fetch from cache or produce and store.
 *
 * `shouldCache` decides which results are worth keeping. It is applied on READ
 * as well as write, so an entry cached before the predicate tightened is
 * treated as a miss and retried rather than poisoning every future run.
 */
export async function cached(namespace, keyParts, produce, { shouldCache } = {}) {
  const keep = shouldCache ?? (() => true);
  const hash = key(keyParts);
  const file = slot(namespace, hash);

  try {
    const hit = JSON.parse(await readFile(file, "utf8"));
    if (keep(hit)) return { ...hit, fromCache: true };
    // Stale entry the current policy would not have stored: fall through.
  } catch {
    /* miss */
  }

  const value = await produce();
  if (keep(value)) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value));
  }
  return { ...value, fromCache: false };
}

export async function cacheStats(namespace) {
  const { readdir } = await import("node:fs/promises");
  try {
    const dirs = await readdir(path.join(paths.cache, namespace));
    let n = 0;
    for (const d of dirs) {
      n += (await readdir(path.join(paths.cache, namespace, d))).length;
    }
    return n;
  } catch {
    return 0;
  }
}
