/**
 * @jest-environment node
 *
 * End-of-hand summary tests: accuracy, bounded and asynchronous finalization,
 * pending/late evaluations, superseded hands, idempotence, and failure
 * isolation. Evaluations are held with the observer's `defer` hook so that
 * "still pending" can be reproduced deterministically.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveTrainingConfig } from "../core/trainingConfig";
import { formatHandSummary, TrainingHandSummary } from "../training/summary";
import {
  TrainingObserver,
  TrainingObserverDeps,
} from "../training/TrainingObserver";
import { ShadowEvaluatorLike } from "../training/ShadowEvaluator";
import {
  GAME_ID,
  HAND_ID,
  REAL_NAMES,
  makeTrainingGame,
} from "./helpers/training-fixtures";

const OTHER_HAND_ID = "2026-02-02T00-00-00-000Z";

let dir: string;
const created: TrainingObserver[] = [];

function config() {
  return { ...resolveTrainingConfig({ BOT_TRAINING_MODE: "true" }), outputDir: dir };
}

/** The shadow bot "plays" the first card of the hand. */
const playsFirstCard: ShadowEvaluatorLike = {
  evaluate: (state) => ({ card: state.hand[0], strategy: "STUB", reasoning: null }),
};

function make(deps: TrainingObserverDeps = {}) {
  const printed: Array<{ text: string; summary: TrainingHandSummary }> = [];
  const obs = new TrainingObserver(config(), {
    evaluator: playsFirstCard,
    printSummary: (text, summary) => printed.push({ text, summary }),
    finalizeTimeoutMs: 1000,
    ...deps,
  });
  created.push(obs);
  return { obs, printed };
}

/** Holds scheduled evaluations until released (always released again in afterEach). */
const holders: Array<{ release: () => void }> = [];

function holdJobs() {
  const held: Array<() => void> = [];
  const holder = {
    defer: (job: () => void) => {
      held.push(job);
    },
    release: () => held.splice(0).forEach((job) => job()),
    count: () => held.length,
  };
  holders.push(holder);
  return holder;
}

const settle = async (obs: TrainingObserver) => {
  await obs.flush();
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

function play(obs: TrainingObserver, card: string, options: { defaults?: boolean; handStart?: Date } = {}) {
  const game = makeTrainingGame(options.handStart ? { gameStartTime: options.handStart } : {});
  obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], card, !!options.defaults);
}

function readRecords(handId = HAND_ID): any[] {
  const file = path.join(dir, `${GAME_ID}--${handId}.jsonl`);
  return fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "training-summary-"));
});

afterEach(async () => {
  // Release held evaluations first, otherwise flush() would wait for them forever.
  holders.splice(0).forEach((holder) => holder.release());
  await Promise.all(created.map((o) => o.flush()));
  created.length = 0;
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
  fs.readdirSync(dir).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  fs.rmdirSync(dir);
});

describe("hand summary content", () => {
  /** 3 matches, 1 mismatch, 1 failed evaluation, 1 skipped decision. */
  async function mixedHand() {
    let calls = 0;
    const { obs, printed } = make({
      evaluator: {
        evaluate: (state) => {
          if (++calls === 3) throw new Error("bot failed");
          return { card: state.hand[0], strategy: null, reasoning: null };
        },
      },
    });
    play(obs, "1HA"); // match
    play(obs, "1HA"); // match
    play(obs, "1HA"); // evaluation #3 fails
    play(obs, "1D9"); // mismatch
    play(obs, "1HA"); // match
    play(obs, "1HA", { defaults: true }); // skipped
    const summary = await obs.finalizeHand(GAME_ID);
    return { obs, printed, summary: summary! };
  }

  test("reports every required total", async () => {
    const { summary } = await mixedHand();

    expect(summary).toMatchObject({
      gameId: GAME_ID,
      handId: HAND_ID,
      reason: "GAME_COMPLETE",
      decisionsCaptured: 6,
      evaluationsCompleted: 4,
      evaluationsFailed: 1,
      decisionsSkipped: 1,
      pendingEvaluations: 0,
      exactActionMatches: 3,
      exactActionMismatches: 1,
      recordsWritten: 6,
      writeFailures: 0,
      timedOut: false,
    });
    expect(summary.exactActionMatchByPhase).toEqual({ CARD_PLAY: { matches: 3, completed: 4 } });
    expect(summary.filePath).toBe(path.join(dir, `${GAME_ID}--${HAND_ID}.jsonl`));
  });

  test("every decision is accounted for exactly once", async () => {
    const { summary } = await mixedHand();
    expect(
      summary.evaluationsCompleted +
        summary.evaluationsFailed +
        summary.decisionsSkipped +
        summary.pendingEvaluations,
    ).toBe(summary.decisionsCaptured);
  });

  test("matches what is actually in the JSONL file", async () => {
    const { summary } = await mixedHand();
    const records = readRecords();
    const count = (predicate: (r: any) => boolean) => records.filter(predicate).length;

    expect(records).toHaveLength(summary.decisionsCaptured);
    expect(count((r) => r.evaluationStatus === "COMPLETED")).toBe(summary.evaluationsCompleted);
    expect(count((r) => r.evaluationStatus === "FAILED")).toBe(summary.evaluationsFailed);
    expect(count((r) => r.evaluationStatus === "SKIPPED")).toBe(summary.decisionsSkipped);
    expect(count((r) => r.exactActionAgreement === "MATCH")).toBe(summary.exactActionMatches);
    expect(count((r) => r.exactActionAgreement === "MISMATCH")).toBe(summary.exactActionMismatches);
  });

  test("prints the figures and the file location", async () => {
    const { printed, summary } = await mixedHand();

    expect(printed).toHaveLength(1);
    const text = printed[0].text;
    expect(text).toContain(`game=${GAME_ID}`);
    expect(text).toContain(`hand=${HAND_ID}`);
    expect(text).toContain("Decisions captured: 6");
    expect(text).toContain("Evaluations completed: 4");
    expect(text).toContain("Evaluations failed: 1");
    expect(text).toContain("Exact-action matches: 3");
    expect(text).toContain("Exact-action mismatches: 1");
    expect(text).toContain("CARD_PLAY 3/4 (75%)");
    expect(text).toContain("Pending evaluations: 0");
    expect(text).toContain("Write failures: 0");
    expect(text).toContain(`File: ${summary.filePath}`);
    expect(text).not.toContain("Agreement");
  });

  test("contains no player names", async () => {
    const { printed } = await mixedHand();
    REAL_NAMES.forEach((name) => expect(printed[0].text).not.toContain(name));
  });
});

describe("formatHandSummary", () => {
  const base: TrainingHandSummary = {
    gameId: "g",
    handId: "h",
    reason: "GAME_COMPLETE",
    decisionsCaptured: 0,
    evaluationsCompleted: 0,
    evaluationsFailed: 0,
    decisionsSkipped: 0,
    pendingEvaluations: 0,
    exactActionMatches: 0,
    exactActionMismatches: 0,
    exactActionMatchByPhase: {},
    recordsWritten: 0,
    writeFailures: 0,
    timedOut: false,
    filePath: "/x/g--h.jsonl",
  };

  test("shows 'none' when no phase has completed comparisons", () => {
    expect(formatHandSummary(base)).toContain("Exact-action match by phase: none");
  });

  test("rounds percentages and handles a zero denominator", () => {
    const text = formatHandSummary({
      ...base,
      exactActionMatchByPhase: { CARD_PLAY: { matches: 1, completed: 3 }, OTHER: { matches: 0, completed: 0 } },
    });
    expect(text).toContain("CARD_PLAY 1/3 (33%)");
    expect(text).toContain("OTHER 0/0 (n/a)");
  });

  test("only mentions a timeout when evaluations are actually pending", () => {
    expect(formatHandSummary({ ...base, timedOut: true, pendingEvaluations: 0 })).not.toContain("timed out");
    expect(formatHandSummary({ ...base, timedOut: true, pendingEvaluations: 2 })).toContain("timed out");
  });

  test("labels the superseded reason", () => {
    expect(formatHandSummary({ ...base, reason: "SUPERSEDED" })).toContain("(SUPERSEDED)");
  });
});

describe("finalization is asynchronous and bounded", () => {
  test("returns immediately and waits at most the timeout, reporting what is pending", async () => {
    const held = holdJobs();
    const { obs, printed } = make({ defer: held.defer, finalizeTimeoutMs: 40 });
    play(obs, "1HA");
    play(obs, "1HA");
    expect(held.count()).toBe(2);

    const started = Date.now();
    const promise = obs.finalizeHand(GAME_ID);
    expect(Date.now() - started).toBeLessThan(20); // the call itself does not wait
    expect(printed).toHaveLength(0);

    const summary = (await promise)!;
    const waited = Date.now() - started;

    expect(waited).toBeGreaterThanOrEqual(35);
    expect(waited).toBeLessThan(900);
    expect(summary).toMatchObject({
      decisionsCaptured: 2,
      evaluationsCompleted: 0,
      pendingEvaluations: 2,
      timedOut: true,
    });
    expect(printed).toHaveLength(1);
    expect(printed[0].text).toContain("Pending evaluations: 2");
    expect(printed[0].text).toContain("timed out");
  });

  test("unfinished evaluations are still appended later and announced", async () => {
    const held = holdJobs();
    const { obs, printed } = make({ defer: held.defer, finalizeTimeoutMs: 20 });
    play(obs, "1HA");
    play(obs, "1D9");
    await obs.finalizeHand(GAME_ID);
    expect(readRecords()).toHaveLength(0);

    held.release();
    await settle(obs);

    expect(readRecords().map((r) => r.exactActionAgreement)).toEqual(["MATCH", "MISMATCH"]);
    expect(printed).toHaveLength(2);
    expect(printed[1].text).toContain("2 record(s) finished after the summary");
    expect(printed[1].text).toContain(path.join(dir, `${GAME_ID}--${HAND_ID}.jsonl`));
  });

  test("resolves as soon as the last evaluation finishes, without waiting for the timeout", async () => {
    const held = holdJobs();
    const { obs } = make({ defer: held.defer, finalizeTimeoutMs: 5000 });
    play(obs, "1HA");

    const started = Date.now();
    const promise = obs.finalizeHand(GAME_ID);
    setTimeout(held.release, 15);
    const summary = (await promise)!;

    expect(Date.now() - started).toBeLessThan(900);
    expect(summary).toMatchObject({ pendingEvaluations: 0, timedOut: false, evaluationsCompleted: 1 });
  });

  test("does not wait at all when nothing is pending", async () => {
    const { obs } = make({ finalizeTimeoutMs: 60000 });
    play(obs, "1HA");
    await obs.flush();

    const started = Date.now();
    await obs.finalizeHand(GAME_ID);
    expect(Date.now() - started).toBeLessThan(900);
  });

  test("its timer never keeps the process alive and is cleared afterwards", async () => {
    const real = global.setTimeout;
    const timers: Array<{ ms: number; timer: any }> = [];
    const spy = jest.spyOn(global, "setTimeout").mockImplementation(((fn: any, ms: number, ...rest: any[]) => {
      const timer = (real as any)(fn, ms, ...rest);
      timers.push({ ms, timer });
      return timer;
    }) as any);

    try {
      const { obs } = make({ finalizeTimeoutMs: 777 });
      play(obs, "1HA");
      await obs.finalizeHand(GAME_ID);

      const ours = timers.filter((t) => t.ms === 777);
      expect(ours).toHaveLength(1);
      expect(ours[0].timer.hasRef()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  test("the configured timeout comes from TrainingConfig by default", () => {
    expect(config().finalizeTimeoutMs).toBe(2000);
    const obs = new TrainingObserver({ ...config(), finalizeTimeoutMs: 1234 }, { evaluator: null });
    expect((obs as any).finalizeTimeoutMs).toBe(1234);
  });
});

describe("finalizeHand semantics", () => {
  test("is null and silent when the game has no captured human decisions", async () => {
    const { obs, printed } = make();
    expect(await obs.finalizeHand(GAME_ID)).toBeNull();
    expect(await obs.finalizeHand("some-other-game")).toBeNull();
    expect(printed).toHaveLength(0);
  });

  test("is idempotent: a repeat call after completion prints nothing more", async () => {
    const { obs, printed } = make();
    play(obs, "1HA");

    const first = await obs.finalizeHand(GAME_ID);
    const second = await obs.finalizeHand(GAME_ID);

    expect(first).not.toBeNull();
    expect(second).toBeNull(); // the hand's bookkeeping was released with its summary
    expect(printed).toHaveLength(1);
  });

  test("concurrent calls share one summary", async () => {
    const { obs, printed } = make();
    play(obs, "1HA");
    const [a, b] = await Promise.all([obs.finalizeHand(GAME_ID), obs.finalizeHand(GAME_ID)]);
    expect(a).toBe(b);
    expect(printed).toHaveLength(1);
  });

  test("a hand that already has a summary is not summarized again when the next hand starts", async () => {
    const { obs, printed } = make();
    play(obs, "1HA");
    await obs.finalizeHand(GAME_ID);
    play(obs, "1HA", { handStart: new Date("2026-02-02T00:00:00.000Z") });
    await settle(obs);

    expect(printed).toHaveLength(1);
    expect(printed[0].summary.handId).toBe(HAND_ID);
  });

  test("releases all per-hand bookkeeping once the summary is complete", async () => {
    const { obs } = make();
    play(obs, "1HA");
    await obs.finalizeHand(GAME_ID);
    await settle(obs);

    const internals = obs as any;
    expect(Object.keys(internals.hands)).toEqual([]);
    expect(Object.keys(internals.seqByHand)).toEqual([]);
    expect(Object.keys(internals.currentHandByGame)).toEqual([]);
    expect(Object.keys(internals.pendingJobs)).toEqual([]);
    expect(Object.keys(internals.waiters)).toEqual([]);
  });

  test("keeps bookkeeping while evaluations are still pending, then releases it", async () => {
    const held = holdJobs();
    const { obs } = make({ defer: held.defer, finalizeTimeoutMs: 10 });
    play(obs, "1HA");
    await obs.finalizeHand(GAME_ID);
    expect(Object.keys((obs as any).hands)).toHaveLength(1);

    held.release();
    await settle(obs);
    expect(Object.keys((obs as any).hands)).toHaveLength(0);
  });

  test("a later hand of the same game starts its sequence numbers again", async () => {
    const { obs } = make();
    play(obs, "1HA");
    await obs.finalizeHand(GAME_ID);
    await settle(obs);

    play(obs, "1HA");
    await obs.flush();
    expect(readRecords().map((r) => r.seq)).toEqual([1, 1]);
  });
});

describe("hands that end without a completion event", () => {
  test("starting the next hand finalizes the previous one as SUPERSEDED, without blocking", async () => {
    const { obs, printed } = make();
    play(obs, "1HA");
    play(obs, "1D9");
    await obs.flush();

    expect(printed).toHaveLength(0);
    play(obs, "1HA", { handStart: new Date("2026-02-02T00:00:00.000Z") });
    await settle(obs);

    expect(printed).toHaveLength(1);
    expect(printed[0].summary).toMatchObject({
      handId: HAND_ID,
      reason: "SUPERSEDED",
      decisionsCaptured: 2,
      evaluationsCompleted: 2,
      exactActionMatches: 1,
      exactActionMismatches: 1,
    });

    // The new hand is tracked on its own and gets its own completion summary.
    const second = (await obs.finalizeHand(GAME_ID))!;
    expect(second).toMatchObject({ handId: OTHER_HAND_ID, reason: "GAME_COMPLETE", decisionsCaptured: 1 });
    expect(printed).toHaveLength(2);
  });

  test("a different game never supersedes this one", async () => {
    const { obs, printed } = make();
    play(obs, "1HA");
    const otherGame = makeTrainingGame({ gameStartTime: new Date("2026-03-03T00:00:00.000Z") });
    obs.observeHumanCardPlay(otherGame, "another-game", REAL_NAMES[0], "1HA", false);
    await settle(obs);
    expect(printed).toHaveLength(0);
  });
});

describe("failures are contained", () => {
  test("a throwing printer cannot break finalization", async () => {
    const errors: string[] = [];
    const obs = new TrainingObserver(config(), {
      evaluator: playsFirstCard,
      finalizeTimeoutMs: 1000,
      printSummary: () => {
        throw new Error("printer failed");
      },
      onError: (context) => errors.push(context),
    });
    created.push(obs);
    play(obs, "1HA");

    const summary = await obs.finalizeHand(GAME_ID);

    expect(summary).not.toBeNull();
    expect(errors).toContain("Failed to print a hand summary");
  });

  test("write failures are reported in the summary", async () => {
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "x");
    const printed: string[] = [];
    const obs = new TrainingObserver(
      { ...config(), outputDir: blocker },
      { evaluator: playsFirstCard, finalizeTimeoutMs: 1000, printSummary: (t) => printed.push(t), onError: () => {} },
    );
    created.push(obs);
    play(obs, "1HA");
    play(obs, "1HA");

    const summary = (await obs.finalizeHand(GAME_ID))!;

    expect(summary).toMatchObject({ decisionsCaptured: 2, evaluationsCompleted: 2, recordsWritten: 0, writeFailures: 2 });
    expect(printed[0]).toContain("Write failures: 2");
    fs.unlinkSync(blocker);
  });

  test("an internal error never rejects the returned promise", async () => {
    const errors: string[] = [];
    const { obs } = make({ onError: (context) => errors.push(context) });
    play(obs, "1HA");
    jest.spyOn(obs as any, "buildSummary").mockImplementation(() => {
      throw new Error("summary exploded");
    });

    await expect(obs.finalizeHand(GAME_ID)).resolves.toBeNull();
    expect(errors).toContain("Failed to produce a hand summary");
  });

  test("an error while looking up the hand never throws to the caller", () => {
    const { obs } = make();
    (obs as any).currentHandByGame = null;
    expect(() => obs.finalizeHand(GAME_ID)).not.toThrow();
  });

  test("evaluation failures are counted, not hidden", async () => {
    const { obs } = make({
      evaluator: {
        evaluate: () => {
          throw new Error("always fails");
        },
      },
      onError: () => {},
    });
    play(obs, "1HA");
    const summary = (await obs.finalizeHand(GAME_ID))!;
    expect(summary).toMatchObject({ evaluationsCompleted: 0, evaluationsFailed: 1, exactActionMatches: 0 });
    expect(summary.exactActionMatchByPhase).toEqual({});
  });
});
