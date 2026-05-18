# reaper

![CI Badge](https://github.com/xavier-maruff/reaper.js/actions/workflows/ci.yml/badge.svg)

A tiny garbage collector for the browser that cleans up silent memory leaks caused by event listeners on detached DOM nodes.

## Installation

Package managers:

```sh
npm install @xavier-maruff/reaper
```

CDN:

```
<script src="https://unpkg.com/@xavier-maruff/reaper"></script>
```

## Usage

Super simple to use, just whack it into your codebase and hit run:

```ts
import Reaper from '@xavier-maruff/reaper';

//that's all!
Reaper.run();

//or for a tiny bit more control
Reaper.run({
  //will not free memory until gracePeriod ms has passed
  //after the initial detection of the leak.
  //useful if the node could be reattached in the meantime
  gracePeriod: 3000,
  //logs stats after each cleanup event
  debug: true
})
```

## Performance

With any GC there will be a small minimal perf overhead. Reaper proxies native `addEventListener` and `removeEventListener` functions, slightly decreasing their performance (still under 1ms p99 in the benchmarking tests).
However, in a codebase with even a small amount of memory leaks, this overhead quickly becomes insignificant relative the perf boost and memory pressure decrease that you get in exchange (run 'bun stats' for a comparison best case scenario). It is advised to run a benchmark test on your codebase before installing reaper.js to know if it will actually provide a net benefit.
