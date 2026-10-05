import { expect, type Page, test } from "@playwright/test";

const pages = [
  "/es/",
  "/en/",
  "/es/projects/",
  "/en/blog/",
  "/es/blog/this-site-is-a-khipu/",
  "/en/arcade/",
  "/es/cv/",
];

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
};

for (const path of pages) {
  test(`${path} renders without errors or horizontal scroll`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("language switch keeps the page", async ({ page }) => {
  await page.goto("/es/projects/");
  await page.locator("a.lang").click();
  await expect(page).toHaveURL(/\/en\/projects\/?$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("theme toggle persists", async ({ page }) => {
  await page.goto("/es/");
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator("[data-theme-toggle]").click();
  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(after).not.toBe(before);
  await page.reload();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(after);
});

for (const slug of [
  "snake",
  "pac-bug",
  "monolith-breaker",
  "zero-day-sweeper",
  "request-invaders",
  "catch-the-bug",
  "incident-commander",
  "deploy-hero",
  "keep-alive",
]) {
  test(`game ${slug} starts`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/es/arcade/${slug}/`);
    const play = page.locator("[data-action]");
    await expect(play).toBeEnabled();
    await play.click();
    await expect(page.locator("[data-overlay]")).toBeHidden();
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });
}

test("3D world intro loads and enters", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/es/world/");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("cabinet has an audio slot and Start survives missing Web Audio", async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.AudioContext = undefined;
    w.webkitAudioContext = undefined;
  });
  await page.goto("/en/arcade/snake/");
  await expect(page.locator(".cab-hud [data-audio]")).toBeAttached();
  // The Play button is server-rendered before the game module mounts: retry until the handler exists.
  await expect(async () => {
    await page.locator("[data-action]").click({ timeout: 1000 });
    await expect(page.locator("[data-overlay]")).toBeHidden({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.keyboard.press("p");
  await expect(page.locator("[data-overlay]")).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
