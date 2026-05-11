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
  options?: boolean | AddEventListenerOptions;
}

interface NodeMeta {
  detachedAt: number | null;
  listeners: Set<ListenerRecord>;
}

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

function getCapture(options?: boolean | AddEventListenerOptions): boolean {
  if (typeof options === "boolean") return options;
  return !!options?.capture;
}

function proxyAddEventListener(
  this: EventTarget,
  eventName: string,
  callback: EventListenerOrEventListenerObject | null,
  options?: boolean | AddEventListenerOptions,
) {
  if (!(this instanceof Node) || !callback) {
    return _addEventListener.call(this, eventName, callback as any, options);
  }

  let meta = nodeRegistry.get(this);
  if (!meta) {
    meta = {
      detachedAt: null,
      listeners: new Set(),
    };
    nodeRegistry.set(this, meta);
    sweepList.add(new WeakRef(this));
  }

  meta.listeners.add({
    eventName,
    callback: new WeakRef(callback),
    options,
  });

  _addEventListener.call(this, eventName, callback, options);
}

function proxyRemoveEventListener(
  this: EventTarget,
  eventName: string,
  callback: EventListenerOrEventListenerObject | null,
  options?: boolean | EventListenerOptions,
) {
  if (!(this instanceof Node) || !callback) {
    _removeEventListener.call(this, eventName, callback as any, options);
    return;
  }

  const meta = nodeRegistry.get(this);
  if (meta) {
    const capture = getCapture(options);
    for (const listener of meta.listeners) {
      if (
        listener.eventName === eventName &&
        listener.callback.deref() === callback &&
        getCapture(listener.options) === capture
      ) {
        meta.listeners.delete(listener);
        break;
      }
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

  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(sweep);
  }
}

function sweep(deadline: IdleDeadline) {
  stats.sweepStart = Date.now();
  stats.initSweepListSize = sweepList.size;
  stats.leakedListenersCleaned = 0;

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
      meta.detachedAt = null;
      sweepList.add(ref);
    } else {
      if (!meta.detachedAt) {
        meta.detachedAt = Date.now();
      }

      if (Date.now() - meta.detachedAt > _config.gracePeriod) {
        for (const listener of meta.listeners) {
          const callback = listener.callback.deref();
          if (!callback) {
            continue;
          }

          el.removeEventListener(
            listener.eventName,
            callback,
            listener.options,
          );
          stats.leakedListenersCleaned += 1;
        }
        nodeRegistry.delete(el);
      } else {
        sweepList.add(ref);
      }
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

  requestIdleCallback(sweep);
}

function run(config?: Partial<ReaperConfig>): void {
  _config = config ? { ...DEFAULT_CONFIG, ...config } : _config;
  init();
}

export { run };

export default {
  run,
} as Reaper;
