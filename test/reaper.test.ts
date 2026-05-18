import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { MockNode, triggerIdleSweep } from "./helpers/reaper-env.ts";
import Reaper from "../src/index.ts";

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

	it("should track duplicate native listener registrations once", () => {
		Reaper.run({ gracePeriod: 0, debug: false });

		const node = new MockNode();
		const callback = () => {};
		const removeSpy = spyOn(node, "removeEventListener");

		node.addEventListener("click", callback);
		node.addEventListener("click", callback);
		node.isConnected = false;

		triggerIdleSweep();

		expect(removeSpy).toHaveBeenCalledTimes(1);
	});

	it("should reap zombie listeners immediately when grace period is zero", () => {
		Reaper.run({ gracePeriod: 0, debug: false });

		const node = new MockNode();
		const callback = () => {};
		const removeSpy = spyOn(node, "removeEventListener");

		node.addEventListener("click", callback);
		node.isConnected = false;

		triggerIdleSweep();

		expect(removeSpy).toHaveBeenCalledWith("click", callback, false);
	});

	it("should preserve capture identity when listener options mutate", () => {
		Reaper.run({ gracePeriod: 0, debug: false });

		const node = new MockNode();
		const callback = () => {};
		const options = { capture: false };
		const removeSpy = spyOn(node, "removeEventListener");

		node.addEventListener("click", callback, options);
		options.capture = true;
		node.isConnected = false;

		triggerIdleSweep();

		expect(removeSpy).toHaveBeenCalledWith("click", callback, false);
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
		expect(removeSpy).toHaveBeenCalledWith("click", callback, false);

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
