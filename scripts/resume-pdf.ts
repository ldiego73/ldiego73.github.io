/**
 * Renders /en/cv/ to public/resume/luis-diego-cv-en.pdf.
 * The Spanish PDF is the original Resume.pdf. Run after `bun run build`:
 *   bunx astro preview --port 4330 --ignore-lock &  then  bun scripts/resume-pdf.ts 4330
 */
import { chromium } from "@playwright/test";

const port = process.argv[2] ?? "4330";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/en/cv/`, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });
await page.pdf({ path: "public/resume/luis-diego-cv-en.pdf", format: "A4", printBackground: true });
await browser.close();
console.log("wrote public/resume/luis-diego-cv-en.pdf");
