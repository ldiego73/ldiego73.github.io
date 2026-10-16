import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/e2e",
  reporter: process.env.CI ? "github" : "list",
  // The 3D world smoke tests boot whole worlds on SwiftShader (software WebGL), two workers at a time; locally
  // they already take 15–22 s, and CI runners are slower, so the 30 s default left too little headroom.
  timeout: 60_000,
  use: { baseURL: "http://localhost:4321" },
  webServer: {
    command: "bunx astro preview --port 4321 --ignore-lock",
    port: 4321,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
  ],
});
