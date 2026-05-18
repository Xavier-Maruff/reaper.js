import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// biome-ignore lint: bodging the browser
type ReaperWindow = Window & typeof globalThis & { Reaper: any };

test("Clean up detached btn", async ({ page }) => {
	const consoleLogs: string[] = [];
	page.on("console", (msg) => consoleLogs.push(msg.text()));

	const filePath = new URL("./sandbox.html", import.meta.url).href;
	const scriptPath = fileURLToPath(
		new URL("../../dist/index.global.js", import.meta.url),
	);

	await page.goto(filePath);
	await page.addScriptTag({ path: scriptPath });
	await page.evaluate(() => {
		const w = window as ReaperWindow;

		w.Reaper.run({ gracePeriod: 100, debug: true });

		const btn = document.getElementById("zombie-btn");
		if (btn) {
			btn.addEventListener("click", () => console.log("Clicked!"));
			btn.remove();
		}
	});

	await expect
		.poll(
			() =>
				consoleLogs.find((log) => log.includes("[reaperjs] Sweep complete.")) ??
				"",
			{ timeout: 2_000 },
		)
		.toContain("collected 1 garbage listeners");
});
