# reaper

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

Reaper proxies native `addEventListener` and `removeEventListener` functions, slightly increasing the raw perf overhead of their usage (still under 1ms p99 in the benchmarking tests). The memory savings that this little bit of overhead buy will differ greatly depending on the context, the best option is to run a benchmark on your own codebase.
