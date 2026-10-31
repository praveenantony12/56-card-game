/**
 * TrainingObserver tests: one final record per decision, skip rules, trick
 * fields, sequence numbers, and failure isolation. These call the observer
 * directly; training-gamecore.spec.ts exercises it through onDropCard.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BOT_POLICY_VERSION } from "../agents/botPolicyVersion";
import { resolveTrainingConfig } from "../core/trainingConfig";
import { TrainingObserver, toHandId } from "../training/TrainingObserver";
import { RULESET_VERSION } from "../training/types";
import {
  GAME_ID,
  HAND_ID,
  REAL_NAMES,
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

afterEach(() => {
  fs.readdirSync(dir).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  fs.rmdirSync(dir);
});

describe("TrainingObserver", () => {
  test("writes exactly one final record per human decision", async () => {
    const observer = new TrainingObserver(config());
    const game = makeTrainingGame();

    observer.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], "1HA", false);
    await observer.flush();

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
      botAction: null,
      exactActionAgreement: null,
      evaluationStatus: "SKIPPED",
      skipReason: "EVALUATOR_NOT_ENABLED",
      evaluationError: null,
      botPolicyVersion: BOT_POLICY_VERSION,
      rulesetVersion: RULESET_VERSION,
      appVersion: "9.9.9",
      gitCommit: "abc123",
    });
    expect(records[0].decisionId).toEqual(expect.any(String));
    expect(records[0]).not.toHaveProperty("agreement");
  });

  test("records follow plays with their position in the trick", async () => {
    const observer = new TrainingObserver(config());
    const game = makeTrainingGame({
      currentTurn: 3,
      dropCardPlayer: ["1HA-Zephyrine", "1HK-Quixote-9", "1H9-MxOBrien"],
    });

    observer.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[3], "1EA", false);
    await observer.flush();

    const [record] = readRecords();
    expect(record.decisionKind).toBe("FOLLOW");
    expect(record.positionInTrick).toBe(3);
    // Seat 3 is void in H, so both cards are legal.
    expect(record.legalActions).toEqual(["1DJ", "1EA"]);
    expect(record.visibleState.currentTrick).toHaveLength(3);
  });

  test("numbers tricks from the completed piles", async () => {
    const observer = new TrainingObserver(config());
    const piles = ["1C9", "1C10", "1CJ", "1CQ", "1CK", "2C9"];
    const game = makeTrainingGame({ teamACards: piles, teamBCards: piles.map((c) => "2" + c.slice(1)) });

    observer.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[0], "1HA", false);
    await observer.flush();
    expect(readRecords()[0].trickNumber).toBe(3);
  });

  test("sequence numbers are gap-free per hand and restart for a new hand", async () => {
    const observer = new TrainingObserver(config());
    const handOne = makeTrainingGame();
    const handTwo = makeTrainingGame({ gameStartTime: new Date("2026-02-02T00:00:00.000Z") });

    observer.observeHumanCardPlay(handOne, GAME_ID, REAL_NAMES[0], "1HA", false);
    observer.observeHumanCardPlay(handOne, GAME_ID, REAL_NAMES[0], "1D9", false);
    observer.observeHumanCardPlay(handTwo, GAME_ID, REAL_NAMES[0], "1HA", false);
    observer.observeHumanCardPlay(handOne, GAME_ID, REAL_NAMES[0], "1HA", false);
    await observer.flush();

    expect(readRecords().map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(readRecords(`${GAME_ID}--2026-02-02T00-00-00-000Z.jsonl`).map((r) => r.seq)).toEqual([1]);
    expect(fs.readdirSync(dir)).toHaveLength(2);
  });

  describe("decisions that must not be trained on are marked SKIPPED", () => {
    test("first-card defaults inserted before the hook", async () => {
      const observer = new TrainingObserver(config());
      observer.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", true);
      await observer.flush();

      const [record] = readRecords();
      expect(record.evaluationStatus).toBe("SKIPPED");
      expect(record.skipReason).toBe("FIRST_CARD_DEFAULTS_APPLIED");
      expect(record.visibleState).toBeNull();
      expect(record.legalActions).toBeNull();
    });

    test("the request claims a different player than the seat to act", async () => {
      const observer = new TrainingObserver(config());
      observer.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[1], "1HA", false);
      await observer.flush();

      const [record] = readRecords();
      expect(record.skipReason).toBe("ACTOR_MISMATCH");
      expect(record.actor.ref).toBe("seat_0"); // taken from the server's seat, not the claim
      expect(record.visibleState).toBeNull();
    });

    test("a trick that cannot be attributed to the seats", async () => {
      const observer = new TrainingObserver(config());
      const game = makeTrainingGame({ currentTurn: 1, dropCardPlayer: ["1HA-Quixote-9"] });
      observer.observeHumanCardPlay(game, GAME_ID, REAL_NAMES[1], "1HK", false);
      await observer.flush();
      expect(readRecords()[0].skipReason).toBe("INCONSISTENT_TRICK");
    });

    test("a card that is not among the legal actions", async () => {
      const observer = new TrainingObserver(config());
      observer.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "2CK", false);
      await observer.flush();

      const [record] = readRecords();
      expect(record.skipReason).toBe("CARD_NOT_IN_LEGAL_ACTIONS");
      expect(record.legalActions).toEqual(["1HA", "1D9"]);
    });
  });

  test("bot turns are not recorded", async () => {
    const observer = new TrainingObserver(config());
    const players = makePlayers({ 0: { isBotAgent: true, playerId: "Bot_1" } });
    observer.observeHumanCardPlay(makeTrainingGame({}, players), GAME_ID, "Bot_1", "1HA", false);
    await observer.flush();
    expect(fs.readdirSync(dir)).toHaveLength(0);
    expect(observer.getCounters().captured).toBe(0);
  });

  test("counters reflect captured and skipped decisions", async () => {
    const observer = new TrainingObserver(config());
    observer.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
    observer.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", true);
    await observer.flush();
    expect(observer.getCounters()).toEqual({
      captured: 2,
      skipped: 2,
      captureFailures: 0,
      recordsWritten: 2,
      writeFailures: 0,
    });
  });

  test("uses the injected clock and id generator", async () => {
    const observer = new TrainingObserver(config(), {
      now: () => new Date("2030-05-05T05:05:05.000Z"),
      newId: () => "fixed-id",
    });
    observer.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
    await observer.flush();
    expect(readRecords()[0]).toMatchObject({
      decisionId: "fixed-id",
      timestamp: "2030-05-05T05:05:05.000Z",
    });
  });

  describe("failure isolation", () => {
    test("a capture error is reported and never thrown", async () => {
      const errors: string[] = [];
      const observer = new TrainingObserver(config(), {
        onError: (context) => errors.push(context),
      });
      const broken: any = makeTrainingGame();
      broken.players = undefined;

      expect(() =>
        observer.observeHumanCardPlay(broken, GAME_ID, REAL_NAMES[0], "1HA", false),
      ).not.toThrow();
      expect(errors).toHaveLength(1);
      expect(observer.getCounters().captureFailures).toBe(1);
    });

    test("a throwing error reporter cannot escape", () => {
      const observer = new TrainingObserver(config(), {
        onError: () => {
          throw new Error("reporter failure");
        },
      });
      const broken: any = makeTrainingGame();
      broken.players = undefined;
      expect(() =>
        observer.observeHumanCardPlay(broken, GAME_ID, REAL_NAMES[0], "1HA", false),
      ).not.toThrow();
    });

    test("a write failure is counted and the observer keeps working", async () => {
      const blocker = path.join(dir, "blocker");
      fs.writeFileSync(blocker, "x");
      const errors: string[] = [];
      const observer = new TrainingObserver(
        { ...config(), outputDir: blocker },
        { onError: (context) => errors.push(context) },
      );

      expect(() => {
        observer.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1HA", false);
        observer.observeHumanCardPlay(makeTrainingGame(), GAME_ID, REAL_NAMES[0], "1D9", false);
      }).not.toThrow();
      await observer.flush();

      expect(observer.getCounters().captured).toBe(2);
      expect(observer.getCounters().writeFailures).toBe(2);
      expect(errors.length).toBeGreaterThan(0);
      fs.unlinkSync(blocker);
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
