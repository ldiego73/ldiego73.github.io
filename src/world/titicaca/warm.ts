/**
 * Warms the Collasuyu's JavaScript from another world's page (near the punku that leads here), so the
 * navigation that follows finds the runtime, definition, scenery and ambient chunks in the HTTP cache.
 * Importing runs no world code: these modules only define things until `mountTiticaca` is called.
 */
const chunks = import.meta.glob(["./index.ts", "./def.ts", "./scenery.ts", "./ambient/*.ts", "!./ambient/*.test.ts"]);

let warmed = false;
export function warmTiticaca(): void {
  if (warmed) return;
  warmed = true;
  const all = Object.values(chunks);
  // A few at a time in idle slots: the current world keeps rendering while this downloads.
  const next = () => {
    const batch = all.splice(0, 4);
    if (!batch.length) return;
    void Promise.allSettled(batch.map((load) => load())).then(() => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
      if (idle) idle(next);
      else window.setTimeout(next, 50);
    });
  };
  next();
}
