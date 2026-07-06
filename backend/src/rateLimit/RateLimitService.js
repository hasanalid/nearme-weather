// Outbound throttling — protects shared public services we call OUT to
// (Nominatim, Overpass), as opposed to the inbound express-rate-limit
// middleware in app.js which protects OUR OWN API from being hammered.
//
// Each upstream gets its own queue so, e.g., a burst of Overpass calls
// doesn't also delay Nominatim calls. Calls to the same upstream are
// serialized and spaced at least `minIntervalMs` apart.
export class RateLimitService {
  constructor() {
    this.queues = new Map(); // upstream name -> { lastRunAt, chain (Promise) }
  }

  /**
   * Runs `fn` no sooner than `minIntervalMs` after the previous call
   * scheduled for the same `upstream` name. Returns whatever `fn` resolves to.
   */
  schedule(upstream, minIntervalMs, fn) {
    const queue = this.queues.get(upstream) || { lastRunAt: 0, chain: Promise.resolve() };

    const run = queue.chain.then(async () => {
      const waitMs = Math.max(0, queue.lastRunAt + minIntervalMs - Date.now());
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      queue.lastRunAt = Date.now();
      return fn();
    });

    // Store a chain that never rejects (so one failed call doesn't wedge
    // the queue for everyone after it), while still letting the caller
    // see the real result/error via `run`.
    queue.chain = run.catch(() => {});
    this.queues.set(upstream, queue);

    return run;
  }
}
