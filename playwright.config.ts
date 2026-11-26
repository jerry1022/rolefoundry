import { defineConfig, devices } from "@playwright/test";
const port = process.env.E2E_PORT || "3100";
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // A cold dev server compiles each route on first visit; CI runners need more than 30s for the
  // first journey in each engine (WebKit timed out on #63 and #64).
  timeout: process.env.CI ? 60000 : 30000,
  use: { baseURL, trace: "retain-on-failure" },
  // Three engines catch differences in CSS compilation, vendor prefixes and focus handling;
  // WebKit stands in for Safari, which many zh-TW mobile visitors use.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
