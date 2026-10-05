/**
 * Screenshot built pages via `astro preview`. Usage: bun scripts/shot-site.ts <port> <path...>
 * Writes test-results/site/<name>-{desktop,mobile}.png and prints console errors and horizontal overflow.
 */
import { chromium } from "@playwright/test";

const [port = "4321", ...paths] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const theme = process.env.THEME ?? "dark";
for (const path of paths.length ? paths : ["/es/"]) {
  for (const [name, w, h, mobile] of [
    ["desktop", 1440, 900, false],
    ["mobile", 390, 844, true],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await page.goto(`http://localhost:${port}${path}`);
    await page.waitForTimeout(1500);
    // Scroll through so lazy scenes mount, then back to top.
    const height = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < height; y += 700) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(250);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const slug = path.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "root";
    // Long pages exceed the GPU texture limit for one full-page capture: shoot viewport tiles instead.
    const tiles = Math.min(10, Math.ceil(height / h));
    for (let i = 0; i < tiles; i++) {
      await page.evaluate((yy) => window.scrollTo(0, yy), i * h);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `test-results/site/${slug}-${name}-${theme}-${i}.png` });
    }
    console.log(`${path} ${name}: overflow=${overflow}${errors.length ? ` errors=${errors.join(" | ")}` : ""}`);
    await page.close();
  }
}
await browser.close();
