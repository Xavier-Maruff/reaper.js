import { spawnSync } from "bun";
import Reaper from "../src/index.ts";

if (!process.argv.includes("--worker")) {
	console.log("Running heavy DOM simulation....");

	function getStats(reaper: boolean) {
		const timeStart = Date.now();
		const proc = spawnSync([
			"bun",
			"test/memory-stats.ts",
			...(reaper ? ["--reaper", "--worker"] : ["--worker"]),
		]);
		const mem = Number.parseFloat(proc.stdout.toString());
		const elapsed = Date.now() - timeStart;

		return [mem, elapsed];
	}

	let reaperMB = 0;
	let reaperTime = 0;
	let baselineMB = 0;
	let baselineTime = 0;

	const ITERS = 4;
	for (let i = 0; i < ITERS; i++) {
		const [r, rt] = getStats(true);
		const [b, bt] = getStats(false);

		reaperMB += r as number;
		reaperTime += rt as number;
		baselineMB += b as number;
		baselineTime += bt as number;
	}

	reaperMB /= ITERS;
	reaperTime /= ITERS;
	baselineMB /= ITERS;
	baselineTime /= ITERS;

	console.log(`Reaper inactive (leaked):  ${baselineMB.toFixed(2)} MB`);
	console.log(`Reaper active:             ${reaperMB.toFixed(2)} MB`);
	console.log(`------------------------------------------------`);
	console.log(
		`Total Memory Saved:        ${(baselineMB - reaperMB).toFixed(2)} MB`,
	);

	console.log("");
	console.log("");
	console.log(`Reaper inactive (leaked):  ${baselineTime.toFixed(2)} ms`);
	console.log(`Reaper active:             ${reaperTime.toFixed(2)} ms`);
	console.log(`------------------------------------------------`);
	console.log(
		`Total Perf Diff:           ${(baselineTime - reaperTime).toFixed(2)} ms`,
	);

	process.exit(0);
}

const isReaperRun = process.argv.includes("--reaper");

class MockNode extends EventTarget {
	isConnected = true;
}
// biome-ignore lint: asdf
globalThis.Node = MockNode as any;

let pendingSweep: ((deadline: IdleDeadline) => void) | null = null;
globalThis.requestIdleCallback = ((cb: (deadline: IdleDeadline) => void) => {
	pendingSweep = cb;
	return 1;
}) as typeof globalThis.requestIdleCallback;

if (isReaperRun) {
	Reaper.run({ gracePeriod: 0, debug: false });
}

const ITERATIONS = 50000;
const leakyCache: MockNode[] = [];

Bun.gc(true);
const initialMemory = process.memoryUsage().heapUsed;

for (let i = 0; i < ITERATIONS; i++) {
	const node = new MockNode();

	const heavyComponentState = new Array(1000)
		.fill("component_data_payload")
		.join("");

	node.addEventListener("click", () => {
		console.log(heavyComponentState.length);
	});

	node.isConnected = false;

	leakyCache.push(node);

	if (i % 100 === 0 && pendingSweep) {
		//@ts-ignore
		pendingSweep({ timeRemaining: () => 50 });
		//@ts-ignore
		pendingSweep({ timeRemaining: () => 50 });
	}
}

Bun.gc(true);

const finalMemory = process.memoryUsage().heapUsed;
const usedMB = (finalMemory - initialMemory) / 1024 / 1024;

console.log(usedMB);
