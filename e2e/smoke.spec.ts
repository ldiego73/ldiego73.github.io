import { expect, type Page, test } from "@playwright/test";

const pages = [
  "/es/",
  "/en/",
  "/es/projects/",
  "/en/blog/",
  "/es/blog/this-site-is-a-khipu/",
  "/en/arcade/",
  "/es/cv/",
  "/en/uses/",
  "/es/services/",
  "/en/services/",
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
    // On phones a too-wide page doesn't scroll sideways: the browser zooms out and widens the layout viewport.
    expect(await page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    expect(errors).toEqual([]);
  });
}

test("language switch keeps the page", async ({ page }) => {
  await page.goto("/es/projects/");
  await page.locator("a.lang").click();
  await expect(page).toHaveURL(/\/en\/projects\/?$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("nav groups open as dropdowns on desktop and flat on phones", async ({ page }, info) => {
  await page.goto("/es/services/");
  const about = page.locator("#nav-about a", { hasText: "Lo que uso" });
  if (info.project.name === "mobile") {
    await page.locator("[data-menu]").click();
    await expect(about).toBeVisible();
    return;
  }
  await expect(about).toBeHidden();
  const btn = page.locator(".group-btn").first();
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(about).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
  await expect(btn).toBeFocused();
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

test("Antisuyu jungle world loads on its own page", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/es/world/selva/");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("Cusco hub world loads on its own page", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/es/world/cusco/");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("Kuntisuyu world loads on its own page", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/es/world/colca/");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("arriving at the Cusco hub through the Kuntisuyu punku", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en/world/cusco/?from=colca");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("arriving at the Cusco hub through the Antisuyu punku", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en/world/cusco/?from=selva");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("Chinchaysuyu coast world loads on its own page", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/es/world/costa/?from=cusco");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("arriving at the Cusco hub through the Chinchaysuyu punku", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en/world/cusco/?from=costa");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("Collasuyu lake world loads on its own page", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/es/world/titicaca/");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("arriving at the Cusco hub through the Collasuyu punku", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en/world/cusco/?from=titicaca");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("coming back from Cusco starts on the mountain without the title", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/es/world/?from=cusco");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("coming back from the jungle starts on the mountain without the title", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en/world/?from=selva");
  await expect(page.locator("#world canvas").first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test("leaving a world asks first: Stay keeps the page, Leave goes to the site", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/es/world/cusco/");
  const back = page.locator(".kw-back");
  await expect(back).toBeVisible({ timeout: 20000 });
  await back.click();
  const dialog = page.getByRole("dialog", { name: "¿Salir del mundo?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Quedarme" })).toBeFocused();
  await dialog.getByRole("button", { name: "Quedarme" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/es\/world\/cusco\/$/);
  await back.click();
  await dialog.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/$/);
  expect(errors).toEqual([]);
});

test("Travel lists every world and asks before jumping: Stay keeps the page", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/es/world/cusco/");
  const travel = page.getByRole("button", { name: "Viajar a otro mundo (V)" });
  await expect(travel).toBeVisible({ timeout: 20000 });
  await travel.click();
  const panel = page.getByRole("dialog", { name: "Viajar por el Tawantinsuyu" });
  await expect(panel).toBeVisible();
  await expect(panel.locator(".kw-trip-card")).toHaveCount(6);
  const here = panel.locator('[data-world="cusco"]');
  await expect(here).toHaveAttribute("aria-current", "location");
  await expect(here).toContainText("Estás aquí");
  await panel.locator('[data-world="costa"]').click();
  await expect(panel).toBeHidden();
  const confirm = page.getByRole("dialog", { name: "¿Salir del mundo?" });
  await expect(confirm).toContainText("al Chinchaysuyu");
  await confirm.getByRole("button", { name: "Quedarme" }).click();
  await expect(confirm).toBeHidden();
  await expect(page).toHaveURL(/\/es\/world\/cusco\/$/);
  await expect(travel).toBeFocused();
  expect(errors).toEqual([]);
});

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
