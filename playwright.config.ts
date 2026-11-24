import { defineConfig, devices } from "@playwright/test";
const port = process.env.E2E_PORT || "3100";
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL, trace: "retain-on-failure" },
  // Firefox catches engine differences (CSS compilation, vendor prefixes, focus handling).
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
