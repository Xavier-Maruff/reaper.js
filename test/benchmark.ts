import { bench, group, run } from "mitata";
import Reaper from "../src/index.ts";

class MockNode extends EventTarget {
	isConnected = true;
}
// biome-ignore lint: chill
globalThis.Node = MockNode as any;

let pendingSweep: ((deadlin: IdleDeadline) => void) | null = null;
globalThis.requestIdleCallback = ((cb: typeof pendingSweep) => {
	pendingSweep = cb;
	return 1;
}) as typeof globalThis.requestIdleCallback;

const nativeAdd = EventTarget.prototype.addEventListener;

Reaper.run({ gracePeriod: 0 });

group("addEventListener Overhead", () => {
	bench("Native EventTarget", () => {
		const node = new MockNode();
		const cb = () => {};
		nativeAdd.call(node, "click", cb);
	});

	bench("Reaper Proxy", () => {
		const node = new MockNode();
		const cb = () => {};
		node.addEventListener("click", cb);
	});
});

await run();
