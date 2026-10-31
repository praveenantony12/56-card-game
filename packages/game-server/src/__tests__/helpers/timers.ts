/**
 * Fake-timer and seeded-random helpers.
 *
 * The production code resolves a finished trick after a fixed delay and paces
 * bots with timeouts. Tests never wait for real time: they install Jest's fake
 * timers and advance them explicitly, and they restore everything afterwards.
 */

/** The delay between the sixth card of a trick and its resolution. */
export const TRICK_RESOLUTION_MS = 5000;

/** Installs fake timers for each test in the file and restores real ones after. */
export function useGameTimers(): void {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });
}

/** Lets a finished trick resolve. */
export function advanceTrick(): void {
  jest.advanceTimersByTime(TRICK_RESOLUTION_MS);
}

/** Lets pending promise callbacks run (fake timers do not touch microtasks). */
export async function flushPromises(times: number = 25): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

/**
 * Advances fake time in small steps until `done()` or the virtual budget is
 * spent. Returns the virtual milliseconds consumed. Throws if the budget runs
 * out, so a stuck game fails loudly instead of hanging.
 */
export function advanceUntil(done: () => boolean, options: { stepMs?: number; maxMs?: number } = {}): number {
  const stepMs = options.stepMs || 250;
  const maxMs = options.maxMs || 30 * 60 * 1000;
  let elapsed = 0;
  while (!done()) {
    if (elapsed >= maxMs) {
      throw new Error(`Condition not reached within ${maxMs} virtual ms`);
    }
    jest.advanceTimersByTime(stepMs);
    elapsed += stepMs;
  }
  return elapsed;
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/** Small deterministic generator (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Replaces Math.random with a seeded generator; returns the restore function. */
export function seedMathRandom(seed: number): () => void {
  const spy = jest.spyOn(Math, "random").mockImplementation(mulberry32(seed));
  return () => spy.mockRestore();
}
