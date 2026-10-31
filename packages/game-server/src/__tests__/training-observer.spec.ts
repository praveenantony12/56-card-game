/**
 * TrainingObserver tests: one final record per decision, skip rules, trick
 * fields, sequence numbers, shadow evaluation, and failure isolation. These
 * call the observer directly with a stub evaluator;
 * training-gamecore.spec.ts runs the real bot through onDropCard.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BOT_POLICY_VERSION } from "../agents/botPolicyVersion";
import { resolveTrainingConfig } from "../core/trainingConfig";
import {
  SLOW_EVALUATION_MS,
  TrainingObserver,
  TrainingObserverDeps,
  toHandId,
} from "../training/TrainingObserver";
import { ShadowDecision, ShadowEvaluator, ShadowEvaluatorLike } from "../training/ShadowEvaluator";
import { RULESET_VERSION, ShadowVisibleState } from "../training/types";
import {
  GAME_ID,
  HAND_ID,
  REAL_NAMES,
  REAL_SOCKETS,
  REAL_TOKENS,
  makePlayers,
  makeTrainingGame,
} from "./helpers/training-fixtures";

let dir: string;

function config() {
  return {
    ...resolveTrainingConfig({ BOT_TRAINING_MODE: "true", npm_package_version: "9.9.9", GIT_COMMIT: "abc123" }),
    outputDir: dir,
  };
}

/** Plays the first legal card, like a bot that always matches a lead. */
const firstLegal: ShadowEvaluatorLike = {
  evaluate: (state) => ({ card: state.hand[0], strategy: "STUB", reasoning: "stub reasoning" }),
};

const created: TrainingObserver[] = [];

function observer(deps: TrainingObserverDeps = {}) {
  const obs = new TrainingObserver(config(), { evaluator: firstLegal, ...deps });
  created.push(obs);
  return obs;
}

function evaluatorReturning(decision: ShadowDecision | (() => ShadowDecision)): ShadowEvaluatorLike & { calls: number } {
  const evaluator: any = {
    calls: 0,
    evaluate() {
      evaluator.calls++;
      return typeof decision === "function" ? decision() : decision;
    },
  };
  return evaluator;
}

function readRecords(file = `${GAME_ID}--${HAND_ID}.jsonl`): any[] {
  return fs
    .readFileSync(path.join(dir, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "training-observer-"));
});

afterEach(async () => {
  // Wait for in-flight evaluations and writes before removing the directory.
  await Promise.all(created.map((o) => o.flush()));
  created.length = 0;
  fs.readdirSync(dir).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  fs.rmdirSync(dir);
});

describe("TrainingObserver", () => {
  test("writes exactly one final record per human decision", async () => {
    const obs = observer();
    obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
    await obs.flush();

    const records = readRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      schemaVersion: 2,
      gameId: GAME_ID,
      handId: HAND_ID,
      seq: 1,
      phase: "CARD_PLAY",
      decisionKind: "LEAD",
      positionInTrick: 0,
      trickNumber: 1,
      actor: { ref: "seat_0", seat: 0, team: "A" },
      actorTrust: "SERVER_DERIVED_TOKEN_VERIFIED",
      legalActions: ["1HA", "1D9"],
      humanAction: { card: "1HA" },
      botPolicyVersion: BOT_POLICY_VERSION,
      rulesetVersion: RULESET_VERSION,
      appVersion: "9.9.9",
      gitCommit: "abc123",
    });
    expect(records[0].decisionId).toEqual(expect.any(String));
    expect(records[0]).not.toHaveProperty("agreement");
  });

  test("records follow plays with their position in the trick", async () => {
    const obs = observer();
    const game = makeTrainingGame({
      currentTurn: 3,
      dropCardPlayer: ["1HA-Zephyrine", "1HK-Quixote-9", "1H9-MxOBrien"],
    });

    obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[3], "1EA", false);
    await obs.flush();

    const [record] = readRecords();
    expect(record.decisionKind).toBe("FOLLOW");
    expect(record.positionInTrick).toBe(3);
    expect(record.legalActions).toEqual(["1DJ", "1EA"]); // void in H: both legal
    expect(record.visibleState.currentTrick).toHaveLength(3);
  });

  test("numbers tricks from the completed piles", async () => {
    const obs = observer();
    const piles = ["1C9", "1C10", "1CJ", "1CQ", "1CK", "2C9"];
    const game = makeTrainingGame({ teamACards: piles, teamBCards: piles.map((c) => "2" + c.slice(1)) });

    obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], "1HA", false);
    await obs.flush();
    expect(readRecords()[0].trickNumber).toBe(3);
  });

  test("sequence numbers are gap-free per hand and restart for a new hand", async () => {
    const obs = observer();
    const handOne = makeTrainingGame();
    const handTwo = makeTrainingGame({ gameStartTime: new Date("2026-02-02T00:00:00.000Z") });

    obs.observeHumanCardPlay(handOne, GAME_ID, REAL_NAMES[0], "1HA", false);
    obs.observeHumanCardPlay(handOne, GAME_ID, REAL_NAMES[0], "1D9", false);
    obs.observeHumanCardPlay(handTwo, GAME_ID, REAL_NAMES[0], "1HA", false);
    obs.observeHumanCardPlay(handOne, GAME_ID, REAL_NAMES[0], "1HA", false);
    await obs.flush();

    expect(readRecords().map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(readRecords(`${GAME_ID}--2026-02-02T00-00-00-000Z.jsonl`).map((r) => r.seq)).toEqual([1]);
    expect(fs.readdirSync(dir)).toHaveLength(2);
  });

  describe("decisions that must not be trained on are marked SKIPPED and never evaluated", () => {
    function skipped(game: any, claimed: string, card: string, defaults = false) {
      const evaluator = evaluatorReturning({ card: "1HA", strategy: null, reasoning: null });
      const obs = observer({ evaluator });
      obs.observeHumanCardPlay(game, GAME_ID, claimed, card, defaults);
      return { obs, evaluator };
    }

    test("first-card defaults inserted before the hook", async () => {
      const { obs, evaluator } = skipped(makeTrainingGame(), REAL_NAMES[0], "1HA", true);
      await obs.flush();

      const [record] = readRecords();
      expect(record.evaluationStatus).toBe("SKIPPED");
      expect(record.skipReason).toBe("FIRST_CARD_DEFAULTS_APPLIED");
      expect(record.visibleState).toBeNull();
      expect(record.legalActions).toBeNull();
      expect(evaluator.calls).toBe(0);
    });

    test("the request claims a different player than the seat to act", async () => {
      const { obs, evaluator } = skipped(makeTrainingGame(), REAL_NAMES[1], "1HA");
      await obs.flush();

      const [record] = readRecords();
      expect(record.skipReason).toBe("ACTOR_MISMATCH");
      expect(record.actor.ref).toBe("seat_0"); // from the server's seat, not the claim
      expect(record.visibleState).toBeNull();
      expect(evaluator.calls).toBe(0);
    });

    test("a trick that cannot be attributed to the seats", async () => {
      const game = makeTrainingGame({ currentTurn: 1, dropCardPlayer: ["1HA-Quixote-9"] });
      const { obs, evaluator } = skipped(game, REAL_NAMES[1], "1HK");
      await obs.flush();
      expect(readRecords()[0].skipReason).toBe("INCONSISTENT_TRICK");
      expect(evaluator.calls).toBe(0);
    });

    test("a card that is not among the legal actions", async () => {
      const { obs, evaluator } = skipped(makeTrainingGame(), REAL_NAMES[0], "2CK");
      await obs.flush();

      const [record] = readRecords();
      expect(record.skipReason).toBe("CARD_NOT_IN_LEGAL_ACTIONS");
      expect(record.legalActions).toEqual(["1HA", "1D9"]);
      expect(evaluator.calls).toBe(0);
    });

    test("with comparison disabled (evaluator: null) valid plays are SKIPPED", async () => {
      const obs = observer({ evaluator: null });
      obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
      await obs.flush();

      const [record] = readRecords();
      expect(record).toMatchObject({
        evaluationStatus: "SKIPPED",
        skipReason: "EVALUATOR_NOT_ENABLED",
        botAction: null,
        exactActionAgreement: null,
      });
      expect(record.visibleState).not.toBeNull();
    });
  });

  test("bot turns are not recorded or evaluated", async () => {
    const evaluator = evaluatorReturning({ card: "1HA", strategy: null, reasoning: null });
    const obs = observer({ evaluator });
    const players = makePlayers({ 0: { isBotAgent: true, playerId: "Bot_1" } });
    obs.observeHumanCardPlay(makeTrainingGame({}, players), GAME_ID, "Bot_1", "1HA", false);
    await obs.flush();
    expect(fs.readdirSync(dir)).toHaveLength(0);
    expect(obs.getCounters().captured).toBe(0);
    expect(evaluator.calls).toBe(0);
  });

  test("uses the injected clock and id generator", async () => {
    const obs = observer({
      now: () => new Date("2030-05-05T05:05:05.000Z"),
      newId: () => "fixed-id",
    });
    obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
    await obs.flush();
    expect(readRecords()[0]).toMatchObject({
      decisionId: "fixed-id",
      timestamp: "2030-05-05T05:05:05.000Z",
    });
  });
});

describe("shadow evaluation", () => {
  test("a matching bot card is a COMPLETED exact-action MATCH", async () => {
    const obs = observer({
      evaluator: evaluatorReturning({ card: "1HA", strategy: "LEAD_HIGH", reasoning: "because" }),
    });
    obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
    await obs.flush();

    const [record] = readRecords();
    expect(record).toMatchObject({
      evaluationStatus: "COMPLETED",
      skipReason: null,
      evaluationError: null,
      botAction: { card: "1HA" },
      botActionLegal: true,
      botStrategy: "LEAD_HIGH",
      botReasoning: "because",
      exactActionAgreement: "MATCH",
    });
    expect(typeof record.evaluationMs).toBe("number");
  });

  test("a different bot card is recorded as an exact-action MISMATCH", async () => {
    const obs = observer({
      evaluator: evaluatorReturning({ card: "1D9", strategy: null, reasoning: null }),
    });
    obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
    await obs.flush();

    const [record] = readRecords();
    expect(record.exactActionAgreement).toBe("MISMATCH");
    expect(record.botAction).toEqual({ card: "1D9" });
    expect(record.botActionLegal).toBe(true);
    expect(record.humanAction).toEqual({ card: "1HA" });
  });

  test("a bot card outside the legal actions is flagged, not hidden", async () => {
    const obs = observer({
      evaluator: evaluatorReturning({ card: "2CK", strategy: null, reasoning: null }),
    });
    obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
    await obs.flush();

    const [record] = readRecords();
    expect(record.evaluationStatus).toBe("COMPLETED");
    expect(record.botActionLegal).toBe(false);
    expect(record.exactActionAgreement).toBe("MISMATCH");
  });

  test("never uses the old field name 'agreement'", async () => {
    const obs = observer();
    obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
    await obs.flush();
    expect(Object.keys(readRecords()[0])).not.toContain("agreement");
  });

  test("long free text is truncated", async () => {
    const obs = observer({
      evaluator: evaluatorReturning({ card: "1HA", strategy: "s".repeat(500), reasoning: "r".repeat(5000) }),
    });
    obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
    await obs.flush();

    const [record] = readRecords();
    expect(record.botStrategy).toHaveLength(200);
    expect(record.botReasoning).toHaveLength(2000);
  });

  describe("timing and isolation", () => {
    test("the evaluation runs after the live move, not inside it", async () => {
      const evaluator = evaluatorReturning({ card: "1HA", strategy: null, reasoning: null });
      const obs = observer({ evaluator });

      obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);

      expect(evaluator.calls).toBe(0); // not yet: the caller is not delayed
      expect(obs.getPendingCount()).toBe(1);
      expect(obs.getPendingCount(GAME_ID, HAND_ID)).toBe(1);
      expect(obs.getCounters().pending).toBe(1);

      await obs.flush();

      expect(evaluator.calls).toBe(1);
      expect(obs.getPendingCount()).toBe(0);
      expect(obs.getPendingCount(GAME_ID, HAND_ID)).toBe(0);
    });

    test("the evaluator sees only a frozen, pseudonymized snapshot of the actor's view", async () => {
      let seen: ShadowVisibleState | undefined;
      const obs = observer({
        evaluator: {
          evaluate: (state) => {
            seen = state;
            return { card: state.hand[0], strategy: null, reasoning: null };
          },
        },
      });
      const game = makeTrainingGame({
        currentTurn: 1,
        dropCardPlayer: ["1HA-Zephyrine"],
        forfeitRequestedBy: "Wren",
      });

      obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[1], "1HK", false);
      await obs.flush();

      expect(Object.isFrozen(seen)).toBe(true);
      expect(Object.isFrozen(seen!.hand)).toBe(true);
      expect(seen!.hand).toEqual(["1HK", "1DA"]);

      const text = JSON.stringify(seen);
      REAL_NAMES.concat(REAL_TOKENS, REAL_SOCKETS).forEach((secret) =>
        expect(text).not.toContain(secret),
      );
      ["1D9", "1H9", "1DJ", "1HJ", "1HQ"].forEach((otherCard) =>
        expect(text).not.toContain(otherCard),
      );
      expect(text).not.toContain("forfeit");
    });

    test("later changes to the live game do not alter the snapshot the evaluator sees", async () => {
      let seenHand: string[] | undefined;
      const obs = observer({
        evaluator: {
          evaluate: (state) => {
            seenHand = state.hand.slice();
            return { card: state.hand[0], strategy: null, reasoning: null };
          },
        },
      });
      const game: any = makeTrainingGame();

      obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], "1HA", false);
      // The live move proceeds before the evaluator runs.
      game[REAL_TOKENS[0]] = game[REAL_TOKENS[0]].filter((c: string) => c !== "1HA");
      game.dropCardPlayer.push("1HA-Zephyrine");
      game.currentTurn = 1;
      await obs.flush();

      expect(seenHand).toEqual(["1HA", "1D9"]);
      expect(readRecords()[0].visibleState.currentTrick).toEqual([]);
    });

    test("an evaluator cannot mutate the live game through its input", async () => {
      const obs = observer({
        evaluator: {
          evaluate: (state: any) => {
            state.hand.push("1CK"); // frozen: must throw
            return { card: "1HA", strategy: null, reasoning: null };
          },
        },
      });
      const game: any = makeTrainingGame();
      const before = JSON.stringify(game);

      obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], "1HA", false);
      await obs.flush();

      expect(JSON.stringify(game)).toBe(before);
      expect(readRecords()[0].evaluationStatus).toBe("FAILED");
    });

    test("the live game is untouched by capture and evaluation", async () => {
      const obs = observer();
      const game: any = makeTrainingGame({ currentTurn: 1, dropCardPlayer: ["1HA-Zephyrine"] });
      const before = JSON.stringify(game);

      obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[1], "1HK", false);
      await obs.flush();

      expect(JSON.stringify(game)).toBe(before);
    });
  });

  describe("failures are recorded and contained", () => {
    test("an evaluator that throws yields a FAILED final record", async () => {
      const errors: string[] = [];
      const obs = observer({
        evaluator: {
          evaluate: () => {
            throw new Error("boom");
          },
        },
        onError: (context) => errors.push(context),
      });

      expect(() =>
        obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false),
      ).not.toThrow();
      await obs.flush();

      const records = readRecords();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        evaluationStatus: "FAILED",
        evaluationError: "Error: boom",
        botAction: null,
        botActionLegal: null,
        exactActionAgreement: null,
        humanAction: { card: "1HA" },
      });
      expect(obs.getCounters()).toMatchObject({ captured: 1, completed: 0, failed: 1, pending: 0 });
      expect(errors).toEqual(["Shadow evaluation failed"]);
    });

    test("an empty or malformed decision is a FAILED INVALID_DECISION", async () => {
      for (const bad of [{ card: "" }, null, undefined, { card: 7 }]) {
        const obs = observer({ evaluator: { evaluate: () => bad as any } });
        obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
        await obs.flush();
      }
      const records = readRecords();
      expect(records).toHaveLength(4);
      records.forEach((r) => {
        expect(r.evaluationStatus).toBe("FAILED");
        expect(r.evaluationError).toBe("Error: INVALID_DECISION");
      });
    });

    test("error text is truncated", async () => {
      const obs = observer({
        evaluator: {
          evaluate: () => {
            throw new Error("e".repeat(1000));
          },
        },
      });
      obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
      await obs.flush();
      expect(readRecords()[0].evaluationError.length).toBeLessThanOrEqual(300);
    });

    test("a failing decision does not stop later decisions", async () => {
      let n = 0;
      const obs = observer({
        evaluator: {
          evaluate: (state) => {
            if (++n === 1) throw new Error("first fails");
            return { card: state.hand[0], strategy: null, reasoning: null };
          },
        },
      });
      const game = makeTrainingGame();
      obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], "1HA", false);
      obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], "1HA", false);
      await obs.flush();

      expect(readRecords().map((r) => [r.seq, r.evaluationStatus])).toEqual([
        [1, "FAILED"],
        [2, "COMPLETED"],
      ]);
    });

    test("a throwing error reporter cannot escape", async () => {
      const obs = observer({
        evaluator: {
          evaluate: () => {
            throw new Error("boom");
          },
        },
        onError: () => {
          throw new Error("reporter failure");
        },
      });
      obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
      await expect(obs.flush()).resolves.toBeUndefined();
      expect(readRecords()[0].evaluationStatus).toBe("FAILED");
    });

    test("a capture error is reported and never thrown", () => {
      const errors: string[] = [];
      const obs = observer({ onError: (context) => errors.push(context) });
      const broken: any = makeTrainingGame();
      broken.players = undefined;

      expect(() =>
        obs.observeHumanCardPlay(broken, GAME_ID, REAL_NAMES[0], "1HA", false),
      ).not.toThrow();
      expect(errors).toHaveLength(1);
      expect(obs.getCounters().captureFailures).toBe(1);
      expect(obs.getPendingCount()).toBe(0);
    });

    test("a write failure is counted and the observer keeps working", async () => {
      const blocker = path.join(dir, "blocker");
      fs.writeFileSync(blocker, "x");
      const errors: string[] = [];
      const obs = new TrainingObserver(
        { ...config(), outputDir: blocker },
        { evaluator: firstLegal, onError: (context) => errors.push(context) },
      );

      expect(() => {
        obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
        obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1D9", false);
      }).not.toThrow();
      await obs.flush();

      expect(obs.getCounters()).toMatchObject({ captured: 2, completed: 2, writeFailures: 2, pending: 0 });
      expect(errors.length).toBeGreaterThan(0);
      fs.unlinkSync(blocker);
    });
  });

  describe("slow evaluations", () => {
    test("are reported with their duration", async () => {
      const warnings: string[] = [];
      const clock = jest.spyOn(Date, "now");
      clock.mockReturnValueOnce(1000).mockReturnValueOnce(1000 + SLOW_EVALUATION_MS + 50);
      try {
        const obs = observer({ onWarn: (m) => warnings.push(m), newId: () => "slow-1" });
        obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
        await obs.flush();
        clock.mockRestore();

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("slow-1");
        expect(readRecords()[0].evaluationMs).toBe(SLOW_EVALUATION_MS + 50);
      } finally {
        clock.mockRestore();
      }
    });

    test("fast evaluations are not reported", async () => {
      const warnings: string[] = [];
      const obs = observer({ onWarn: (m) => warnings.push(m) });
      obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
      await obs.flush();
      expect(warnings).toHaveLength(0);
    });
  });

  describe("with the production bot", () => {
    let log: jest.SpyInstance;
    beforeEach(() => {
      log = jest.spyOn(console, "log").mockImplementation(() => {});
    });
    afterEach(() => log.mockRestore());

    test("compares against TeamBotAgent and records a legal bot card", async () => {
      const obs = new TrainingObserver(config(), { evaluator: new ShadowEvaluator() });
      obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
      await obs.flush();

      const [record] = readRecords();
      expect(record.evaluationStatus).toBe("COMPLETED");
      expect(record.legalActions).toContain(record.botAction.card);
      expect(record.botActionLegal).toBe(true);
      expect(["MATCH", "MISMATCH"]).toContain(record.exactActionAgreement);
    });

    test("is the default evaluator", async () => {
      const obs = new TrainingObserver(config());
      obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
      await obs.flush();
      expect(readRecords()[0].evaluationStatus).toBe("COMPLETED");
    });

    test("does not replace console.log or any other console method", async () => {
      const before = { log: console.log, warn: console.warn, error: console.error };
      const obs = new TrainingObserver(config());
      obs.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
      expect(console.log).toBe(before.log);
      await obs.flush();
      expect(console.log).toBe(before.log);
      expect(console.warn).toBe(before.warn);
      expect(console.error).toBe(before.error);
    });
  });
});

describe("counters", () => {
  test("reflect captured, skipped, completed and failed decisions", async () => {
    let n = 0;
    const obs = observer({
      evaluator: {
        evaluate: (state) => {
          if (++n === 2) throw new Error("x");
          return { card: state.hand[0], strategy: null, reasoning: null };
        },
      },
    });
    const game = makeTrainingGame();
    obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], "1HA", false); // completed
    obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], "1HA", false); // failed
    obs.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], "1HA", true); //  skipped
    await obs.flush();

    expect(obs.getCounters()).toEqual({
      captured: 3,
      skipped: 1,
      completed: 1,
      failed: 1,
      pending: 0,
      captureFailures: 0,
      recordsWritten: 3,
      writeFailures: 0,
    });
  });
});

describe("toHandId", () => {
  test("is a filename-safe timestamp", () => {
    expect(toHandId(new Date("2026-01-01T00:00:00.000Z"))).toBe(HAND_ID);
    expect(toHandId("2026-01-01T00:00:00.000Z")).toBe(HAND_ID);
  });

  test("falls back for a missing or invalid start time", () => {
    expect(toHandId(undefined)).toBe("unknown-hand");
    expect(toHandId("not a date")).toBe("unknown-hand");
  });
});
