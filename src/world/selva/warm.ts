/**
 * Warms the jungle's JavaScript from the mountain page (near the Antisuyu punku), so the navigation that
 * follows finds the runtime, layout, scenery and ambient chunks in the HTTP cache. Importing runs no world
 * code: these modules only define things until `mountSelva` is called on the jungle page.
 */
const chunks = import.meta.glob([
  "./index.ts",
  "./layout.ts",
  "./scenery.ts",
  "./ambient/*.ts",
  "!./ambient/*.test.ts",
]);

let warmed = false;
export function warmSelva(): void {
  if (warmed) return;
  warmed = true;
  const all = Object.values(chunks);
  // A few at a time in idle slots: the mountain keeps rendering while this downloads.
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
