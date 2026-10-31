/**
 * Training through the real onDropCard path: behavior must be identical with
 * training on or off, and training failures must never reach the player.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GameCore } from "../core/GameCore";
import { resolveTrainingConfig, TrainingConfig } from "../core/trainingConfig";
import { TrainingObserver } from "../training/TrainingObserver";
import { ShadowEvaluator } from "../training/ShadowEvaluator";
import {
  GAME_ID,
  HAND_ID,
  REAL_NAMES,
  REAL_SOCKETS,
  REAL_TOKENS,
  fakeIoServer,
  makePlayers,
  makeTrainingGame,
  recordingIoServer,
} from "./helpers/training-fixtures";

let dir: string;
let warn: jest.SpyInstance;
let log: jest.SpyInstance;
let observe: jest.SpyInstance;
const usedObservers: TrainingObserver[] = [];

function trainingConfig(outputDir = dir): TrainingConfig {
  return {
    ...resolveTrainingConfig({ BOT_TRAINING_MODE: "true" }),
    outputDir,
  };
}

function seatDrop(core: GameCore, seat: number, card: string, playerId = REAL_NAMES[seat]) {
  const results: any[] = [];
  core.onDropCard(
    { gameId: GAME_ID, card, token: REAL_TOKENS[seat], playerId } as any,
    (err: any, res: any) => results.push({ err, res }),
  );
  return results;
}

/** Four plays of one trick; seat 3 is void in H and discards. */
const SEQUENCE: Array<[number, string]> = [
  [0, "1HA"],
  [1, "1HK"],
  [2, "1H9"],
  [3, "1EA"],
];

function playSequence(core: GameCore, game = makeTrainingGame()) {
  core.inMemoryStore.saveGame(GAME_ID, game);
  const callbacks = SEQUENCE.map(([seat, card]) => seatDrop(core, seat, card));
  const finalGame = JSON.parse(JSON.stringify(core.inMemoryStore.fetchGame(GAME_ID)));
  core.inMemoryStore.deleteGame(GAME_ID);
  return { callbacks: JSON.parse(JSON.stringify(callbacks)), finalGame };
}

function readRecords(): any[] {
  const file = path.join(dir, `${GAME_ID}--${HAND_ID}.jsonl`);
  return fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "training-gamecore-"));
  // notifyTurn warns about the (absent) sockets of the fake server, and the
  // bot prints decision banners when the shadow comparison runs.
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  log = jest.spyOn(console, "log").mockImplementation(() => {});

  // Remember every observer that was used, so cleanup can wait for its
  // in-flight evaluations and writes instead of racing them.
  const original = TrainingObserver.prototype.observeHumanCardPlay;
  observe = jest
    .spyOn(TrainingObserver.prototype, "observeHumanCardPlay")
    .mockImplementation(function (this: TrainingObserver, ...args: any[]) {
      if (usedObservers.indexOf(this) === -1) usedObservers.push(this);
      return (original as any).apply(this, args);
    });
});

afterEach(async () => {
  await Promise.all(usedObservers.map((o) => o.flush()));
  usedObservers.length = 0;
  observe.mockRestore();
  warn.mockRestore();
  log.mockRestore();
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    fs.statSync(p).isDirectory() ? fs.rmdirSync(p) : fs.unlinkSync(p);
  });
  fs.rmdirSync(dir);
});

describe("training disabled (normal startup)", () => {
  test("no observer exists and nothing is written", () => {
    const core = new GameCore(fakeIoServer());
    expect(core.trainingObserver).toBeUndefined();
    playSequence(core);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  test("a disabled config never creates an observer, even with an output dir", () => {
    const core = new GameCore(fakeIoServer(), {
      training: { ...trainingConfig(), botTrainingEnabled: false },
    });
    expect(core.trainingObserver).toBeUndefined();
  });
});

describe("a human action behaves identically with training on and off", () => {
  test("same callbacks and same final game state", () => {
    const off = playSequence(new GameCore(fakeIoServer()));
    const on = playSequence(new GameCore(fakeIoServer(), { training: trainingConfig() }));

    expect(on.callbacks).toEqual(off.callbacks);
    expect(on.finalGame).toEqual(off.finalGame);
    expect(on.finalGame.dropCardPlayer).toEqual([
      "1HA-Zephyrine",
      "1HK-Quixote-9",
      "1H9-MxOBrien",
      "1EA-Ulysses",
    ]);
  });

  test("rejected plays are not recorded and behave the same", async () => {
    const core = new GameCore(fakeIoServer(), { training: trainingConfig() });
    core.inMemoryStore.saveGame(GAME_ID, makeTrainingGame());

    // Seat 2 is not on turn; seat 0 holds no 2CK but may play any card (lead).
    const outOfTurn = seatDrop(core, 2, "1H9");
    expect(outOfTurn[0].res.code).toBe("FAILED");

    await core.trainingObserver!.flush();
    expect(readRecords()).toHaveLength(0);
    core.inMemoryStore.deleteGame(GAME_ID);
  });
});

describe("training records", () => {
  test("one pseudonymized final record per accepted human play", async () => {
    const core = new GameCore(fakeIoServer(), { training: trainingConfig() });
    playSequence(core);
    await core.trainingObserver!.flush();

    const records = readRecords();
    expect(records.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
    expect(records.map((r) => r.humanAction.card)).toEqual(["1HA", "1HK", "1H9", "1EA"]);
    expect(records.map((r) => r.decisionKind)).toEqual(["LEAD", "FOLLOW", "FOLLOW", "FOLLOW"]);
    expect(records.map((r) => r.positionInTrick)).toEqual([0, 1, 2, 3]);
    expect(records.map((r) => r.actor.ref)).toEqual(["seat_0", "seat_1", "seat_2", "seat_3"]);
    expect(records.every((r) => r.skipReason === null)).toBe(true);
    expect(records.every((r) => r.evaluationStatus === "COMPLETED")).toBe(true);
    expect(records.every((r) => r.botActionLegal === true)).toBe(true);
    expect(records.every((r) => r.legalActions.indexOf(r.botAction.card) !== -1)).toBe(true);
    expect(records.every((r) => ["MATCH", "MISMATCH"].indexOf(r.exactActionAgreement) !== -1)).toBe(true);
    expect(records.every((r) => r.botPolicyVersion === "team-bot-agent@1")).toBe(true);
    expect(records[3].legalActions).toEqual(["1DJ", "1EA"]);
  });

  test("the comparison runs after the live move: records appear only once evaluations finish", async () => {
    const evaluate = jest.spyOn(ShadowEvaluator.prototype, "evaluate");
    try {
      const core = new GameCore(fakeIoServer(), { training: trainingConfig() });
      playSequence(core);

      // All four human plays are already applied, but the bot has not been asked yet.
      expect(evaluate).not.toHaveBeenCalled();
      expect(core.trainingObserver!.getCounters().pending).toBe(SEQUENCE.length);
      expect(readRecords()).toHaveLength(0);

      await core.trainingObserver!.flush();

      expect(evaluate).toHaveBeenCalledTimes(SEQUENCE.length);
      expect(core.trainingObserver!.getCounters()).toMatchObject({
        captured: 4,
        completed: 4,
        failed: 0,
        pending: 0,
      });
      expect(readRecords()).toHaveLength(4);
    } finally {
      evaluate.mockRestore();
    }
  });

  test("training sends nothing extra to players and never emits bot_reasoning", async () => {
    const off = recordingIoServer();
    playSequence(new GameCore(off.io));

    const on = recordingIoServer();
    const core = new GameCore(on.io, { training: trainingConfig() });
    playSequence(core);
    await core.trainingObserver!.flush();

    expect(on.emitted).toEqual(off.emitted);
    expect(on.emitted.some((e) => e.event === "bot_reasoning")).toBe(false);
    expect(on.emitted.length).toBeGreaterThan(0);
  });

  test("the file contains no names, tokens or socket ids", async () => {
    const core = new GameCore(fakeIoServer(), { training: trainingConfig() });
    playSequence(core);
    await core.trainingObserver!.flush();

    const text = fs.readFileSync(path.join(dir, `${GAME_ID}--${HAND_ID}.jsonl`), "utf8");
    REAL_NAMES.concat(REAL_TOKENS, REAL_SOCKETS).forEach((secret) =>
      expect(text).not.toContain(secret),
    );
  });

  test("a record never contains another player's hand", async () => {
    const core = new GameCore(fakeIoServer(), { training: trainingConfig() });
    playSequence(core);
    await core.trainingObserver!.flush();

    const first = readRecords()[0];
    const text = JSON.stringify(first.visibleState);
    // Seat 1..5 hands: none of these cards is visible to seat 0 at this point.
    ["1DA", "1D10", "1DJ", "1EJ", "1CA", "1HQ", "1HJ"].forEach((card) =>
      expect(text).not.toContain(card),
    );
    expect(first.visibleState.hand).toEqual(["1HA", "1D9"]);
  });

  test("a spoofed playerId is recorded as ACTOR_MISMATCH and poisons the trick", async () => {
    const core = new GameCore(fakeIoServer(), { training: trainingConfig() });
    core.inMemoryStore.saveGame(GAME_ID, makeTrainingGame());

    // Seat 0's token with seat 1's name: the live game accepts it (existing behavior).
    const spoofed = seatDrop(core, 0, "1HA", REAL_NAMES[1]);
    expect(spoofed[0].res.code).not.toBe("FAILED");
    seatDrop(core, 1, "1HK");
    await core.trainingObserver!.flush();

    const records = readRecords();
    expect(records[0].skipReason).toBe("ACTOR_MISMATCH");
    expect(records[0].actor.ref).toBe("seat_0");
    expect(records[1].skipReason).toBe("INCONSISTENT_TRICK");
    core.inMemoryStore.deleteGame(GAME_ID);
  });

  test("bot plays are not recorded but appear as aliases in later tricks", async () => {
    const core = new GameCore(fakeIoServer(), { training: trainingConfig() });
    const players = makePlayers({ 0: { isBotAgent: true, playerId: "Bot_1" } });
    core.inMemoryStore.saveGame(GAME_ID, makeTrainingGame({}, players));

    core.onDropCard(
      { gameId: GAME_ID, card: "1HA", token: REAL_TOKENS[0], playerId: "Bot_1" } as any,
      () => {},
    );
    seatDrop(core, 1, "1HK");
    await core.trainingObserver!.flush();

    const records = readRecords();
    expect(records).toHaveLength(1);
    expect(records[0].actor.ref).toBe("seat_1");
    expect(records[0].visibleState.currentTrick).toEqual([{ card: "1HA", by: "seat_0" }]);
    expect(records[0].visibleState.seats[0].isBot).toBe(true);
    expect(JSON.stringify(records[0])).not.toContain("Bot_1");
    core.inMemoryStore.deleteGame(GAME_ID);
  });

  test("first-card defaults are skipped but still applied to the live game", async () => {
    const core = new GameCore(fakeIoServer(), { training: trainingConfig() });
    core.inMemoryStore.saveGame(
      GAME_ID,
      makeTrainingGame({ finalBid: undefined, trumpSuit: undefined }),
    );

    seatDrop(core, 0, "1HA");
    await core.trainingObserver!.flush();

    const live: any = core.inMemoryStore.fetchGame(GAME_ID);
    expect(live.finalBid).toBe(28);
    expect(live.trumpSuit).toBe("N");
    expect(readRecords()[0].skipReason).toBe("FIRST_CARD_DEFAULTS_APPLIED");
    expect(readRecords()[0].visibleState).toBeNull();
    core.inMemoryStore.deleteGame(GAME_ID);
  });
});

describe("training failures never interrupt the game", () => {
  test("a shadow evaluation that fails is recorded and the game is unaffected", async () => {
    const off = recordingIoServer();
    const offRun = playSequence(new GameCore(off.io));

    const on = recordingIoServer();
    const core = new GameCore(on.io, { training: trainingConfig() });
    (core.trainingObserver as any).evaluator = {
      evaluate: () => {
        throw new Error("bot exploded");
      },
    };
    const onRun = playSequence(core);
    await core.trainingObserver!.flush();

    expect(onRun.callbacks).toEqual(offRun.callbacks);
    expect(onRun.finalGame).toEqual(offRun.finalGame);
    expect(on.emitted).toEqual(off.emitted);

    const records = readRecords();
    expect(records).toHaveLength(SEQUENCE.length);
    records.forEach((r) => {
      expect(r.evaluationStatus).toBe("FAILED");
      expect(r.evaluationError).toBe("Error: bot exploded");
      expect(r.humanAction.card).toEqual(expect.any(String));
    });
    expect(core.trainingObserver!.getCounters()).toMatchObject({ failed: 4, completed: 0, pending: 0 });
  });

  test("an observer that throws is contained", () => {
    const core = new GameCore(fakeIoServer(), { training: trainingConfig() });
    const observer: any = core.trainingObserver;
    jest.spyOn(observer, "capture").mockImplementation(() => {
      throw new Error("capture exploded");
    });
    const off = playSequence(new GameCore(fakeIoServer()));
    const on = playSequence(core);

    expect(on.callbacks).toEqual(off.callbacks);
    expect(on.finalGame).toEqual(off.finalGame);
    expect(observer.getCounters().captureFailures).toBe(SEQUENCE.length);
  });

  test("an unwritable output location is contained", async () => {
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "x");
    const core = new GameCore(fakeIoServer(), { training: trainingConfig(blocker) });

    const off = playSequence(new GameCore(fakeIoServer()));
    const on = playSequence(core);
    await core.trainingObserver!.flush();

    expect(on.callbacks).toEqual(off.callbacks);
    expect(on.finalGame).toEqual(off.finalGame);
    expect(core.trainingObserver!.getCounters().writeFailures).toBe(SEQUENCE.length);
    fs.unlinkSync(blocker);
  });
});
