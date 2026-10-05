// @ts-check
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  site: "https://ldiego73.github.io",
  trailingSlash: "ignore",
  integrations: [
    mdx(),
    sitemap({
      i18n: { defaultLocale: "es", locales: { es: "es-PE", en: "en-US" } },
    }),
  ],
  i18n: {
    locales: ["es", "en"],
    defaultLocale: "es",
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Archivo",
      cssVariable: "--font-archivo",
      weights: ["400 900"],
      stretch: "62% 125%",
      options: { experimental: { variableAxis: { wdth: [["62", "125"]] } } },
      styles: ["normal"],
      fallbacks: ["sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Hanken Grotesk",
      cssVariable: "--font-hanken",
      weights: ["400 700"],
      styles: ["normal", "italic"],
      fallbacks: ["sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Silkscreen",
      cssVariable: "--font-pixel",
      weights: [400, 700],
      styles: ["normal"],
      fallbacks: ["monospace"],
    },
    {
      provider: fontProviders.google(),
      name: "JetBrains Mono",
      cssVariable: "--font-jetbrains",
      weights: ["400 600"],
      styles: ["normal"],
      fallbacks: ["monospace"],
    },
  ],
  markdown: { shikiConfig: { themes: { light: "github-light", dark: "github-dark" } } },
});
