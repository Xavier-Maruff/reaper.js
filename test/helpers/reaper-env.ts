export class MockNode extends EventTarget {
  isConnected: boolean = true;
}

// biome-ignore lint: mock dom node for bun tests
globalThis.Node = MockNode as any;

let pendingSweep: ((deadline: IdleDeadline) => void) | null = null;

globalThis.requestIdleCallback = ((callback: typeof pendingSweep) => {
  pendingSweep = callback;
  return 1;
}) as typeof globalThis.requestIdleCallback;

export function triggerIdleSweep(initialBudget = Number.POSITIVE_INFINITY) {
  let budget = initialBudget;
  if (pendingSweep) {
    pendingSweep({ timeRemaining: () => budget-- } as IdleDeadline);
  }
}
