/**
 * Renders the social card (public/og.png, 1200x630) from the live hero.
 * Run against a preview server: bun scripts/og-image.ts <port>
 */
import { chromium } from "@playwright/test";

const port = process.argv[2] ?? "4400";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.addInitScript(() => localStorage.setItem("theme", "dark"));
await page.goto(`http://localhost:${port}/es/`);
await page.addStyleTag({
  content:
    ".site-header,.hint,.btn-row,.lede{display:none!important}.hero{min-height:630px!important;padding-block:40px!important}",
});
await page.waitForTimeout(2500);
await page.screenshot({ path: "public/og.png" });
await browser.close();
console.log("wrote public/og.png");
