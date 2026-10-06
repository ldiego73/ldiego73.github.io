/**
 * Lighthouse CI → Markdown summary (GitHub job summary): one row per URL from the representative
 * (median) run, mobile emulation. Usage: bun scripts/lhci-summary.ts [reportDir] >> "$GITHUB_STEP_SUMMARY"
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Entry {
  url: string;
  isRepresentativeRun: boolean;
  jsonPath: string;
}
interface Audit {
  numericValue?: number;
}
interface Lhr {
  categories: Record<string, { score: number | null }>;
  audits: Record<string, Audit>;
}

const dir = process.argv[2] ?? "lhci-report";
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Entry[];
const ms = (a?: Audit) => (a?.numericValue === undefined ? "—" : `${(a.numericValue / 1000).toFixed(2)} s`);
const score = (n: number | null | undefined) => (n == null ? "—" : String(Math.round(n * 100)));
const flag = (v: number | undefined, good: number, poor: number) =>
  v === undefined ? "" : v <= good ? "🟢" : v <= poor ? "🟠" : "🔴";

const rows = manifest
  .filter((e) => e.isRepresentativeRun)
  .map((e) => {
    const lhr = JSON.parse(
      readFileSync(e.jsonPath.startsWith("/") ? e.jsonPath : join(dir, e.jsonPath), "utf8"),
    ) as Lhr;
    const lcp = lhr.audits["largest-contentful-paint"];
    const cls = lhr.audits["cumulative-layout-shift"]?.numericValue;
    const tbt = lhr.audits["total-blocking-time"]?.numericValue;
    const path = new URL(e.url).pathname;
    return `| \`${path}\` | ${score(lhr.categories.performance?.score)} | ${flag(lcp?.numericValue, 2500, 4000)} ${ms(lcp)} | ${flag(cls, 0.1, 0.25)} ${cls?.toFixed(3) ?? "—"} | ${flag(tbt, 200, 600)} ${tbt === undefined ? "—" : `${Math.round(tbt)} ms`} | ${ms(lhr.audits["first-contentful-paint"])} | ${score(lhr.categories.accessibility?.score)} |`;
  });

console.log(
  [
    "### Lighthouse (mobile, median of 3 runs)",
    "",
    "| Page | Perf | LCP | CLS | TBT | FCP | A11y |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "Targets: LCP ≤ 2.5 s · CLS ≤ 0.1 · TBT ≤ 200 ms. Full HTML reports are in the `lighthouse-report` artifact.",
  ].join("\n"),
);
