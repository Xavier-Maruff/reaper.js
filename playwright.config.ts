import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./test/browser",
	testMatch: /.*\.e2e\.ts/,
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
