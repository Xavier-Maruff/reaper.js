import { beforeEach, describe, expect, it } from "bun:test";
import Reaper from "../src/index.ts";

class MockNode extends EventTarget {
	isConnected: boolean = true;
}
// biome-ignore lint: calm down
globalThis.Node = MockNode as any;

let pendingSweep: ((deadlin: IdleDeadline) => void) | null = null;
globalThis.requestIdleCallback = ((cb: typeof pendingSweep) => {
	pendingSweep = cb;
	return 1;
}) as typeof globalThis.requestIdleCallback;

function triggerIdleSweep() {
	if (pendingSweep) pendingSweep({ timeRemaining: () => 50 } as IdleDeadline);
}

describe("Reaper Fuzzer", () => {
	beforeEach(() => {
		Reaper.run({ gracePeriod: 0, debug: false });
	});

	it("survives chaotic DOM manipulation", () => {
		const nodes: MockNode[] = [];
		const EVENT_TYPES = ["click", "scroll", "mousemove", "keydown"];
		const ITERATIONS = 10_000;

		for (let i = 0; i < ITERATIONS; i++) {
			const action = Math.random();

			if (action < 0.4) {
				//create node + add listener
				const node = new MockNode();
				node.addEventListener(
					EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)] as string,
					() => {},
				);
				nodes.push(node);
			} else if (action < 0.7 && nodes.length > 0) {
				//detach random node
				const target = nodes[
					Math.floor(Math.random() * nodes.length)
				] as MockNode;
				target.isConnected = false;
			} else if (action < 0.9) {
				triggerIdleSweep();
			} else {
				Bun.gc(true);
			}
		}

		//clear out
		triggerIdleSweep();

		//pass
		expect(true).toBe(true);
	});
});
