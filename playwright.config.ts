import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/e2e",
  reporter: process.env.CI ? "github" : "list",
  // The 3D world smoke tests boot whole worlds on SwiftShader (software WebGL), two workers at a time. Software GL
  // compiles every shader program on the CPU, and the skinned characters and animals add a dozen heavy programs
  // per world: the longest test (leave a world, stay, leave again) takes ~40 s locally and more on CI runners.
  timeout: 90_000,
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
