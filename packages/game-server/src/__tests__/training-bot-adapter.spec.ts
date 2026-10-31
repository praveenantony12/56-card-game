/**
 * Shadow bot input tests.
 *
 * The shadow comparison is only meaningful if the bot decides from the
 * projection exactly as it would from the full live state. These tests prove
 * that over many simulated hands, and show the bot never needs hidden hands.
 */

import * as fs from "fs";
import * as path from "path";
import { TeamBotAgent } from "../agents/TeamBotAgent";
import { cardToWeightageDict, names as cardNames, suits } from "../constants/deck";
import { toBotInput, shadowHandKey } from "../training/botAdapter";
import { getLegalCards } from "../training/legalActions";
import { ShadowEvaluator } from "../training/ShadowEvaluator";
import { buildVisibleState } from "../training/visibleState";

// ---------------------------------------------------------------------------
// Seeded hand simulator (deterministic, no hyphens in names so that the live
// bot's own "card-playerId" parsing is not the thing under test)
// ---------------------------------------------------------------------------

const SIM_NAMES = ["Ann", "Ben", "Cal", "Dee", "Eli", "Fay"];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weight(card: string): number {
  return cardToWeightageDict[card.slice(2)] || 0;
}

type Decision = (game: any, seat: number) => void;

/** Plays a full hand with random legal cards, calling onDecision before each play. */
function simulateHand(seed: number, onDecision: Decision): void {
  const rng = mulberry32(seed);
  const deck: string[] = [];
  suits.forEach((s) => cardNames.forEach((n) => deck.push(s + n)));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const players = SIM_NAMES.map((playerId, i) => ({
    playerId,
    token: `sim-token-${i}`,
    socketId: `sim-socket-${i}`,
    gameId: "sim",
    isBotAgent: false,
  }));
  const hands = players.map((_, i) => deck.slice(i * 8, i * 8 + 8));

  const trumpOptions = ["H", "D", "E", "C", "N"];
  const trumpSuit = trumpOptions[Math.floor(rng() * trumpOptions.length)];
  const finalBid = 28 + Math.floor(rng() * 29);
  const bidSeat = Math.floor(rng() * 6);
  const bidHistory: any[] = [
    {
      playerId: SIM_NAMES[bidSeat],
      action: "bid",
      bidValue: finalBid,
      suit: trumpSuit,
      bidSelectionType: "direct",
      bidModifier: 0,
      clickOrder: null,
      noTrumpType: trumpSuit === "N" ? "Noes" : null,
    },
  ];
  for (let k = 1; k <= 3; k++) {
    bidHistory.push({ playerId: SIM_NAMES[(bidSeat + k) % 6], action: "pass" });
  }

  const game: any = {
    players,
    currentTurn: 0,
    dropCardPlayer: [],
    droppedCards: [],
    dropDetails: [],
    teamACards: [],
    teamBCards: [],
    trumpSuit,
    finalBid,
    currentBet: String(finalBid),
    biddingTeam: bidSeat % 2 === 0 ? "A" : "B",
    biddingPlayer: SIM_NAMES[bidSeat],
    lastBiddingTeam: bidSeat % 2 === 0 ? "A" : "B",
    bidDouble: rng() < 0.2,
    bidReDouble: false,
    bidHistory,
    playerTrumpSuit: { [SIM_NAMES[bidSeat]]: trumpSuit },
    teamAScore: 10,
    teamBScore: 10,
  };
  players.forEach((p, i) => {
    game[p.token] = hands[i];
  });

  let leader = Math.floor(rng() * 6);
  for (let trick = 0; trick < 8; trick++) {
    const played: Array<{ card: string; seat: number }> = [];
    for (let k = 0; k < 6; k++) {
      const seat = (leader + k) % 6;
      game.currentTurn = seat;
      game.dropCardPlayer = played.map((p) => `${p.card}-${SIM_NAMES[p.seat]}`);

      onDecision(game, seat);

      const legal = getLegalCards(game[players[seat].token], played.map((p) => p.card));
      const card = legal[Math.floor(rng() * legal.length)];
      game[players[seat].token] = game[players[seat].token].filter((c: string) => c !== card);
      played.push({ card, seat });
    }

    const leadSuit = played[0].card[1];
    const trumps = trumpSuit === "N" ? [] : played.filter((p) => p.card[1] === trumpSuit);
    const pool = trumps.length > 0 ? trumps : played.filter((p) => p.card[1] === leadSuit);
    const winner = pool.reduce((best, p) => (weight(p.card) > weight(best.card) ? p : best));

    const pile = winner.seat % 2 === 0 ? "teamACards" : "teamBCards";
    game[pile] = played.map((p) => p.card).concat(game[pile]);
    leader = winner.seat;
  }
}

const quietConsole = () => jest.spyOn(console, "log").mockImplementation(() => {});

// ---------------------------------------------------------------------------

describe("toBotInput", () => {
  let log: jest.SpyInstance;
  beforeEach(() => (log = quietConsole()));
  afterEach(() => log.mockRestore());

  function firstDecisionState(seed = 1, seat = 0) {
    let result: any;
    simulateHand(seed, (game, s) => {
      if (!result && s === seat) result = { game, state: buildVisibleState(game, s).state! };
    });
    return result;
  }

  test("provides only the actor's hand, under a single hand key", () => {
    const { state } = firstDecisionState(3, 0);
    const input = toBotInput(state);
    const handKeys = Object.keys(input.gameState).filter((k) => k.indexOf("hand:") === 0);

    expect(handKeys).toEqual([shadowHandKey("seat_0")]);
    expect(input.botToken).toBe("hand:seat_0");
    expect(input.botAgentId).toBe("seat_0");
    expect((input.gameState as any)[input.botToken]).toEqual(state.hand);
  });

  test("provides no real names, tokens or server-only fields", () => {
    const { state } = firstDecisionState(4, 2);
    const text = JSON.stringify(toBotInput(state));
    SIM_NAMES.forEach((n) => expect(text).not.toContain(n));
    ["sim-token", "sim-socket", "playerTrumpSuit", "droppedCards", "dropDetails"].forEach((s) =>
      expect(text).not.toContain(s),
    );
  });

  test("provides only the keys the bot reads", () => {
    const { state } = firstDecisionState(5, 1);
    expect(Object.keys(toBotInput(state).gameState).sort()).toEqual(
      [
        "bidDouble", "bidHistory", "bidReDouble", "biddingTeam", "currentBet",
        "dropCardPlayer", "finalBid", "hand:seat_1", "lastBiddingTeam", "players",
        "teamACards", "teamBCards", "trumpSuit",
      ].sort(),
    );
  });

  test("builds the trick as card-alias strings with no hyphen in the alias", () => {
    let trick: string[] = [];
    simulateHand(6, (game, seat) => {
      if (game.dropCardPlayer.length === 3 && trick.length === 0) {
        trick = (toBotInput(buildVisibleState(game, seat).state!).gameState as any).dropCardPlayer;
      }
    });
    expect(trick).toHaveLength(3);
    trick.forEach((entry) => expect(entry).toMatch(/^[0-9A-Z]{3,4}-seat_[0-5]$/));
  });

  test("is deeply frozen, so the bot cannot mutate its input", () => {
    const { state } = firstDecisionState(7, 0);
    const { gameState } = toBotInput(state) as any;
    expect(Object.isFrozen(gameState)).toBe(true);
    expect(Object.isFrozen(gameState.players[0])).toBe(true);
    expect(() => gameState.teamACards.push("1HA")).toThrow();
    expect(() => gameState[toBotInput(state).botToken].push("1HA")).toThrow();
    expect(() => {
      gameState.trumpSuit = "X";
    }).toThrow();
  });

  test("does not alias the snapshot it was built from", () => {
    const { state } = firstDecisionState(8, 0);
    const { gameState } = toBotInput(state) as any;
    expect(gameState.teamACards).not.toBe(state.teamACards);
    expect(gameState[toBotInput(state).botToken]).not.toBe(state.hand);
  });
});

describe("the shadow bot decides exactly like the live bot", () => {
  let log: jest.SpyInstance;
  beforeEach(() => (log = quietConsole()));
  afterEach(() => log.mockRestore());

  const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);

  test("on the projection as on the full live state, for every decision of 25 simulated hands", () => {
    const mismatches: string[] = [];
    const failures: string[] = [];
    let decisions = 0;

    SEEDS.forEach((seed) => {
      simulateHand(seed, (game, seat) => {
        decisions++;
        const built = buildVisibleState(game, seat);
        if (!built.state) {
          failures.push(`seed ${seed} seat ${seat}: ${built.skipReason}`);
          return;
        }
        const player = game.players[seat];
        try {
          const live = new TeamBotAgent().decide(game, player.token, player.playerId);
          const input = toBotInput(built.state);
          const shadow = new TeamBotAgent().decide(input.gameState, input.botToken, input.botAgentId);
          if (live !== shadow) {
            mismatches.push(`seed ${seed} seat ${seat}: live=${live} shadow=${shadow}`);
          }
        } catch (error) {
          failures.push(`seed ${seed} seat ${seat}: threw ${error.message}`);
        }
      });
    });

    expect(decisions).toBe(SEEDS.length * 48);
    expect(failures).toEqual([]);
    expect(mismatches).toEqual([]);
  });

  test("and the live bot ignores every other player's hand (scrambling them changes nothing)", () => {
    const changed: string[] = [];

    SEEDS.forEach((seed) => {
      simulateHand(seed, (game, seat) => {
        const player = game.players[seat];
        const before = new TeamBotAgent().decide(game, player.token, player.playerId);

        // Rotate the other players' hands among themselves.
        const others = game.players.filter((_: any, i: number) => i !== seat);
        const rotated = others.map((_: any, i: number) => game[others[(i + 1) % others.length].token]);
        const scrambled = { ...game };
        others.forEach((p: any, i: number) => {
          scrambled[p.token] = rotated[i];
        });

        const after = new TeamBotAgent().decide(scrambled, player.token, player.playerId);
        if (before !== after) changed.push(`seed ${seed} seat ${seat}: ${before} -> ${after}`);
      });
    });

    expect(changed).toEqual([]);
  });

  test("every property the bot reads is provided (roundHistory, never set by the server, is the one allowed exception)", () => {
    const offenders: string[] = [];
    SEEDS.forEach((seed) => {
      simulateHand(seed, (game, seat) => {
        const input = toBotInput(buildVisibleState(game, seat).state!);
        const provided = Object.keys(input.gameState);
        const watched = new Proxy(input.gameState as any, {
          get(target: any, key: any) {
            if (typeof key === "string" && provided.indexOf(key) === -1 && key !== "roundHistory") {
              offenders.push(`seed ${seed} seat ${seat}: read ${key}`);
            }
            return target[key];
          },
        });
        new TeamBotAgent().decide(watched, input.botToken, input.botAgentId);
      });
    });

    expect(offenders).toEqual([]);
  });

  test("roundHistory (the one unprovided read) is never set by the live server", () => {
    const coreDir = path.resolve(__dirname, "../core");
    const offenders = fs
      .readdirSync(coreDir)
      .filter((f) => /\.ts$/.test(f))
      .filter((f) => fs.readFileSync(path.join(coreDir, f), "utf8").indexOf("roundHistory") !== -1);

    // If this fails, the live bot now sees data the shadow bot does not:
    // extend the projection and BOT_POLICY_VERSION before trusting comparisons.
    expect(offenders).toEqual([]);
  });
});

describe("ShadowEvaluator", () => {
  let log: jest.SpyInstance;
  beforeEach(() => (log = quietConsole()));
  afterEach(() => log.mockRestore());

  function stateAt(seed: number, seat: number) {
    let state: any;
    simulateHand(seed, (game, s) => {
      if (!state && s === seat) state = buildVisibleState(game, s).state!;
    });
    return state;
  }

  test("returns a legal card with the bot's strategy and reasoning", () => {
    const state = stateAt(2, 0);
    const decision = new ShadowEvaluator().evaluate(state);
    expect(getLegalCards(state.hand, [])).toContain(decision.card);
    expect(typeof decision.strategy === "string" || decision.strategy === null).toBe(true);
  });

  test("is deterministic for the same state", () => {
    const state = stateAt(9, 3);
    const evaluator = new ShadowEvaluator();
    expect(evaluator.evaluate(state).card).toBe(evaluator.evaluate(state).card);
  });

  test("does not modify the state it is given", () => {
    const state = stateAt(10, 4);
    const before = JSON.stringify(state);
    new ShadowEvaluator().evaluate(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  test("fails with BOT_NO_DECISION when the hand is empty", () => {
    const state = { ...stateAt(2, 0), hand: [] as string[] };
    expect(() => new ShadowEvaluator().evaluate(state)).toThrow("BOT_NO_DECISION");
  });

  test("reasoning text contains no real names (only aliases)", () => {
    const state = stateAt(11, 2);
    const decision = new ShadowEvaluator().evaluate(state);
    const text = `${decision.strategy} ${decision.reasoning}`;
    SIM_NAMES.forEach((n) => expect(text).not.toContain(n));
  });
});
