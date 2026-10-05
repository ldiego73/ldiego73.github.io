/**
 * Lobby screenshots against a running dev server. Usage: bun src/arcade-lobby/shoot.ts <port> [out-dir]
 * Shoots /es/arcade/ (desktop+mobile, dark+light, plus after ArrowRight), one game page and the home strip.
 */
import { chromium } from "@playwright/test";

const [port = "4401", out = "test-results/lobby"] = process.argv.slice(2);
const base = `http://localhost:${port}`;
/** HMR reloads from parallel edits can interrupt a step: log and keep going. */
const step = async (label: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    console.log(`  skipped ${label}: ${(e as Error).message.split("\n")[0]}`);
  }
};
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

for (const theme of ["dark", "light"]) {
  for (const [name, w, h, mobile] of [
    ["desktop", 1440, 900, false],
    ["mobile", 390, 844, true],
  ] as const) {
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    const tag = `${name}-${theme}`;

    let state: string | undefined = "?";
    let overflow = 0;
    await step(`hall ${tag}`, async () => {
      await page.goto(`${base}/es/arcade/`);
      state = await page
        .waitForSelector("[data-hall][data-state=ready]", { timeout: 30000 })
        .then(() => "ready")
        .catch(() => page.evaluate(() => document.querySelector<HTMLElement>("[data-hall]")?.dataset.state));
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${out}/hall-${tag}.png` });
      if (theme === "dark") {
        await page.focus("[data-dial] a[aria-current=true]");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${out}/hall-${tag}-focus.png` });
      }
      await page.evaluate(() => window.scrollTo(0, innerHeight * 0.9));
      await page.waitForTimeout(600);
      await page.screenshot({
        path: `${out}/below-${tag}.png`,
        fullPage: false,
      });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - innerHeight * 1.6));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/records-${tag}.png` });
      overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    });

    await step(`game ${tag}`, async () => {
      await page.goto(`${base}/es/arcade/snake/`);
      await page.waitForTimeout(3000);
      await page.screenshot({
        path: `${out}/game-${tag}.png`,
        timeout: 120000,
      });
      if (mobile) {
        await page.evaluate(() => window.scrollTo(0, innerHeight));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}/game-${tag}-info.png` });
      }
    });
    await step(`strip ${tag}`, async () => {
      await page.goto(`${base}/es/`);
      await page.waitForTimeout(1200);
      const strip = await page.$("#arcade-strip-title");
      await strip?.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/strip-${tag}.png` });
    });

    console.log(`${tag}: hall=${state} overflow=${overflow}${errors.length ? ` errors=${errors.join(" | ")}` : ""}`);
    await page.close();
  }
}
// No-WebGL fallback: hide webgl contexts and shoot the HTML hall.
await step("fallback", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.startsWith("webgl") ? null : (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto(`${base}/es/arcade/`);
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => document.querySelector<HTMLElement>("[data-hall]")?.dataset.state);
  await page.screenshot({ path: `${out}/fallback.png` });
  console.log(`fallback: hall=${st}`);
  await page.close();
});
await browser.close();
