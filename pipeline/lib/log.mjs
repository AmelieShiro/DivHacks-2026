/** Consistent, greppable stage logging. */
const t0 = Date.now();
const ms = () => String(Date.now() - t0).padStart(6, " ");

export function makeLogger(stage) {
  const tag = `[${stage}]`.padEnd(14);
  const w = (icon, msg) => console.log(`${ms()}ms ${tag} ${icon} ${msg}`);
  return {
    info: (m) => w("·", m),
    ok: (m) => w("✓", m),
    warn: (m) => w("!", m),
    fail: (m) => w("✗", m),
    step: (m) => console.log(`\n=== ${stage}: ${m} ===`),
  };
}
