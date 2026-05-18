export interface ReaperConfig {
	gracePeriod: number;
	debug: boolean;
}

export interface Reaper {
	run(config?: Partial<ReaperConfig>): void;
}

interface ListenerRecord {
	eventName: string;
	callback: WeakRef<EventListenerOrEventListenerObject>;
	capture: boolean;
}

interface NodeMeta {
	seenConnected: boolean;
	detachedAt: number | null;
	listeners: Set<ListenerRecord>;
}

type TimeoutHandle = ReturnType<typeof setTimeout> & { unref?: () => void };

const DEFAULT_CONFIG: ReaperConfig = {
	gracePeriod: 0,
	debug: false,
};

let _config: ReaperConfig = DEFAULT_CONFIG;
let initialised = false;
const nodeRegistry = new WeakMap<Node, NodeMeta>();
const sweepList = new Set<WeakRef<Node>>();
const stats: {
	sweepStart: number;
	sweepEnd: number;
	initSweepListSize: number;
	postSweepListSize: number;
	leakedListenersCleaned: number;
} = {
	sweepStart: 0,
	sweepEnd: 0,
	initSweepListSize: 0,
	postSweepListSize: 0,
	leakedListenersCleaned: 0,
};

const _addEventListener = EventTarget.prototype.addEventListener;
const _removeEventListener = EventTarget.prototype.removeEventListener;

function debug(msg: string) {
	console.log(`[reaperjs] ${msg}`);
}

// naive polyfill for ssr-ish envs, resolves at call time so requestidlecallback can
// be installed after module import
function schedule(cb: IdleRequestCallback) {
	if (typeof globalThis.requestIdleCallback === "function") {
		return globalThis.requestIdleCallback(cb);
	}

	const handle = setTimeout(
		() => cb({ timeRemaining: () => 10 } as IdleDeadline),
		50,
	) as TimeoutHandle;

	handle.unref?.();
	return handle;
}

function getCapture(options?: boolean | AddEventListenerOptions): boolean {
	if (typeof options === "boolean") return options;
	return !!options?.capture;
}

function isDOMNode(target: EventTarget): target is Node {
	return typeof Node !== "undefined" && target instanceof Node;
}

function matchesListener(
	listener: ListenerRecord,
	eventName: string,
	callback: EventListenerOrEventListenerObject,
	options?: boolean | EventListenerOptions,
): boolean {
	return (
		listener.eventName === eventName &&
		listener.callback.deref() === callback &&
		listener.capture === getCapture(options)
	);
}

function proxyAddEventListener(
	this: EventTarget,
	eventName: string,
	callback: EventListenerOrEventListenerObject | null,
	options?: boolean | AddEventListenerOptions,
) {
	if (!isDOMNode(this) || !callback) {
		return _addEventListener.call(this, eventName, callback as any, options);
	}

	let meta = nodeRegistry.get(this);
	if (!meta) {
		meta = {
			seenConnected: (this as Node).isConnected ?? false,
			detachedAt: null,
			listeners: new Set(),
		};
		nodeRegistry.set(this, meta);
		sweepList.add(new WeakRef(this));
	}

	let hasRecord = false;
	for (const listener of meta.listeners) {
		if (matchesListener(listener, eventName, callback, options)) {
			hasRecord = true;
			break;
		}
	}

	if (!hasRecord) {
		meta.listeners.add({
			eventName,
			callback: new WeakRef(callback),
			capture: getCapture(options),
		});
	}

	_addEventListener.call(this, eventName, callback, options);
}

function proxyRemoveEventListener(
	this: EventTarget,
	eventName: string,
	callback: EventListenerOrEventListenerObject | null,
	options?: boolean | EventListenerOptions,
) {
	if (!isDOMNode(this) || !callback) {
		_removeEventListener.call(this, eventName, callback as any, options);
		return;
	}

	const meta = nodeRegistry.get(this);
	if (meta) {
		for (const listener of meta.listeners) {
			if (matchesListener(listener, eventName, callback, options)) {
				meta.listeners.delete(listener);
			}
		}

		if (meta.listeners.size === 0) {
			nodeRegistry.delete(this);
		}
	}
	_removeEventListener.call(this, eventName, callback, options);
}

function init() {
	if (initialised) {
		return;
	}

	EventTarget.prototype.addEventListener = proxyAddEventListener;
	EventTarget.prototype.removeEventListener = proxyRemoveEventListener;
	initialised = true;

	schedule(sweep);
}

function sweep(deadline: IdleDeadline) {
	stats.sweepStart = Date.now();
	stats.initSweepListSize = sweepList.size;
	stats.leakedListenersCleaned = 0;
	const now = Date.now();

	const refs = Array.from(sweepList);
	for (const ref of refs) {
		if (deadline.timeRemaining() < 1) {
			break;
		}

		sweepList.delete(ref);

		const el = ref.deref();
		if (!el) {
			continue;
		}

		const meta = nodeRegistry.get(el);
		if (!meta) {
			continue;
		}

		if (el.isConnected) {
			meta.seenConnected = true;
			meta.detachedAt = null;
			sweepList.add(ref);
		} else if (meta.seenConnected) {
			if (meta.detachedAt === null) {
				meta.detachedAt = now;
			}

			if (now - meta.detachedAt >= _config.gracePeriod) {
				for (const listener of meta.listeners) {
					const callback = listener.callback.deref();
					if (!callback) {
						continue;
					}

					el.removeEventListener(
						listener.eventName,
						callback,
						listener.capture,
					);
					stats.leakedListenersCleaned += 1;
				}
				nodeRegistry.delete(el);
			} else {
				sweepList.add(ref);
			}
		} else {
			//noop, if never connected it's probably a node being constructed etc.,
			//cannot safely assume it's a leaked node/listener
		}
	}

	if (_config.debug && stats.leakedListenersCleaned > 0) {
		stats.sweepEnd = Date.now();
		stats.postSweepListSize = sweepList.size;
		debug(
			`Sweep complete. Manually collected ${stats.leakedListenersCleaned} garbage listeners` +
				` and ${stats.initSweepListSize - stats.postSweepListSize} nodes` +
				` over ${stats.sweepEnd - stats.sweepStart}ms.`,
		);
	}

	schedule(sweep);
}

function run(config?: Partial<ReaperConfig>): void {
	_config = config ? { ...DEFAULT_CONFIG, ...config } : _config;
	init();
}

export { run };

export default {
	run,
} as Reaper;
