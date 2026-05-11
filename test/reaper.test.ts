import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import Reaper from "../src/index.ts";

class MockNode extends EventTarget {
	isConnected: boolean = true;
}

// biome-ignore lint: shhhhh it's just a test
globalThis.Node = MockNode as any;
// biome-ignore lint: this is fine
globalThis.EventTarget = MockNode as any;

let pendingSweep: ((deadline: IdleDeadline) => void) | null = null;
globalThis.requestIdleCallback = ((callback: typeof pendingSweep) => {
	pendingSweep = callback;
	return 1;
}) as typeof globalThis.requestIdleCallback;

function triggerIdleSweep() {
	if (pendingSweep) {
		const deadline = {
			timeRemaining: () => 50,
		};
		pendingSweep(deadline as IdleDeadline);
	}
}

describe("Reaper Core Funcitonality", () => {
	beforeEach(() => {
		Reaper.run({ gracePeriod: 100, debug: false });
	});

	it("should intercept addEventListener without breaking native behavior", () => {
		const node = new MockNode();
		const callback = mock(() => {});

		node.addEventListener("click", callback);
		node.dispatchEvent(new Event("click"));

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("should clean up manual removeEventListener calls to prevent registry bloat", () => {
		const node = new MockNode();
		const callback = () => {};

		const removeSpy = spyOn(node, "removeEventListener");

		node.addEventListener("click", callback);
		node.removeEventListener("click", callback);

		expect(removeSpy).toHaveBeenCalled();
	});

	it("should reap zombie listeners after the grace period", async () => {
		const node = new MockNode();
		const callback = () => {};

		const removeSpy = spyOn(node, "removeEventListener");
		node.addEventListener("click", callback);

		node.isConnected = false;

		triggerIdleSweep();
		expect(removeSpy).not.toHaveBeenCalled();

		await Bun.sleep(150);

		triggerIdleSweep();
		expect(removeSpy).toHaveBeenCalledWith("click", callback, undefined);

		expect(node.isConnected).toBe(false);
	});

	it("should drop tracking safely if the browser natively garbage collects the node", () => {
		(() => {
			const tempNode = new MockNode();
			tempNode.addEventListener("click", () => {});
		})();

		Bun.gc(true);

		expect(() => triggerIdleSweep()).not.toThrow();
	});
});
