/**
 * Screenshot one arcade game through the dev harness.
 * Usage: bun scripts/shot-game.ts <slug> <port> [outDir]
 * Run `bunx vite --config src/games/dev/vite.config.ts --port <port>` first.
 * Captures desktop + mobile, dark + light, after autostart, and prints console errors.
 */
import { chromium } from "@playwright/test";

const [slug = "snake", port = "5180", out = `test-results/${slug}`] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors: string[] = [];
for (const [name, w, h, mobile] of [
  ["desktop", 1280, 900, false],
  ["mobile", 390, 844, true],
] as const) {
  for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    page.on("pageerror", (e) => errors.push(`${name}/${theme}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${name}/${theme}: ${m.text()}`);
    });
    await page.goto(`http://localhost:${port}/?game=${slug}&theme=${theme}&autostart=1`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${name}-${theme}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
