/**
 * Training projection tests: legal actions, pseudonymization, isolation and
 * the visible-state allowlist.
 */

import { Game } from "../core/Game";
import { InMemoryStore } from "../persistence/InMemoryStore";
import { getLegalCards } from "../training/legalActions";
import { buildAliasMap, seatAlias } from "../training/pseudonyms";
import { buildVisibleState } from "../training/visibleState";
import {
  GAME_ID,
  HANDS,
  REAL_NAMES,
  REAL_SOCKETS,
  REAL_TOKENS,
  makePlayers,
  makeTrainingGame,
} from "./helpers/training-fixtures";

describe("getLegalCards", () => {
  test("every card is legal when leading", () => {
    expect(getLegalCards(["1HA", "1D9"], [])).toEqual(["1HA", "1D9"]);
  });

  test("must follow the suit of the first card on the table", () => {
    expect(getLegalCards(["1HA", "1D9", "2HK"], ["1HQ", "1DA"])).toEqual([
      "1HA",
      "2HK",
    ]);
  });

  test("any card is legal when void in the led suit", () => {
    expect(getLegalCards(["1DJ", "1EA"], ["1HK"])).toEqual(["1DJ", "1EA"]);
  });

  test("returns a copy, never the caller's array", () => {
    const hand = ["1HA"];
    expect(getLegalCards(hand, [])).not.toBe(hand);
  });

  describe("agrees with the live Game.isCheating rule", () => {
    const scenarios: Array<[string, string[], string[]]> = [
      ["lead", ["1HA", "1D9", "1EJ"], []],
      ["follow with the suit", ["1HA", "1D9", "2HK"], ["1HQ"]],
      ["void in the led suit", ["1DJ", "1EA"], ["1HQ", "1HK"]],
    ];

    scenarios.forEach(([name, hand, trick]) => {
      test(name, () => {
        hand.forEach((card) => {
          const store = new InMemoryStore();
          const players = makePlayers();
          const game: any = makeTrainingGame(
            { droppedCards: trick.slice(), currentTurn: trick.length },
            players,
          );
          game[players[trick.length].token] = hand.slice();
          store.saveGame(GAME_ID, game);

          const live = new Game(store, GAME_ID, card, players[trick.length].token);
          expect(getLegalCards(hand, trick).indexOf(card) !== -1).toBe(!live.isCheating);
        });
      });
    });
  });
});

describe("pseudonyms", () => {
  test("aliases are seat_<n> with no hyphen", () => {
    expect(seatAlias(2)).toBe("seat_2");
    const map = buildAliasMap(makePlayers());
    expect(map.get("Quixote-9")).toBe("seat_1");
    map.forEach((alias) => expect(alias).not.toContain("-"));
  });
});

describe("buildVisibleState", () => {
  const players = makePlayers();

  function build(overrides: any = {}, seat = 0) {
    const game: any = makeTrainingGame(overrides, players);
    const result = buildVisibleState(game, seat);
    return { game, result };
  }

  test("contains the actor's hand and none of the other hands", () => {
    const { result } = build();
    const state = result.state!;
    expect(state.hand).toEqual(HANDS[0]);

    const text = JSON.stringify(state);
    HANDS.slice(1).forEach((hand) =>
      hand.forEach((card) => expect(text).not.toContain(card)),
    );
  });

  test("never reads another player's hand from the game", () => {
    const game: any = makeTrainingGame({}, players);
    const reads: string[] = [];
    const watched = new Proxy(game, {
      get(target: any, key: any) {
        if (typeof key === "string") reads.push(key);
        return target[key];
      },
    });

    buildVisibleState(watched, 0);

    REAL_TOKENS.slice(1).forEach((token) => expect(reads).not.toContain(token));
    expect(reads).toContain(REAL_TOKENS[0]);
  });

  test("reads only allowlisted fields", () => {
    const game: any = makeTrainingGame({}, players);
    const reads: { [key: string]: boolean } = {};
    const watched = new Proxy(game, {
      get(target: any, key: any) {
        if (typeof key === "string") reads[key] = true;
        return target[key];
      },
    });

    buildVisibleState(watched, 0);

    const allowed = [
      "players", "dropCardPlayer", "currentTurn", "bidHistory", "teamACards",
      "teamBCards", "trumpSuit", "finalBid", "currentBet", "biddingTeam",
      "biddingPlayer", "lastBiddingTeam", "bidDouble", "bidReDouble",
      "teamAScore", "teamBScore", REAL_TOKENS[0],
    ];
    Object.keys(reads).forEach((key) => expect(allowed).toContain(key));
  });

  test("contains no real names, tokens or socket ids", () => {
    const { result } = build({
      dropCardPlayer: ["1HA-Zephyrine"],
      currentTurn: 1,
    }, 1);
    const text = JSON.stringify(result.state);
    REAL_NAMES.concat(REAL_TOKENS, REAL_SOCKETS).forEach((secret) =>
      expect(text).not.toContain(secret),
    );
  });

  test("excludes fields that are not allowlisted", () => {
    const { result } = build({
      forfeitRequestedBy: "Zephyrine",
      pendingPositionSwitch: { requestedBy: "Wren", team: "A", approvals: [] },
      futureHiddenField: "secret",
    });
    const text = JSON.stringify(result.state);
    ["forfeit", "pendingPositionSwitch", "futureHiddenField", "playerTrumpSuit"].forEach((key) =>
      expect(text).not.toContain(key),
    );
  });

  test("replaces players with aliases in the trick and bidding history", () => {
    const { result } = build({
      dropCardPlayer: ["1HA-Zephyrine", "1HK-Quixote-9"],
      currentTurn: 2,
    }, 2);
    const state = result.state!;
    expect(state.currentTrick).toEqual([
      { card: "1HA", by: "seat_0" },
      { card: "1HK", by: "seat_1" },
    ]);
    expect(state.biddingPlayer).toBe("seat_0");
    expect(state.bidHistory.map((b) => b.by)).toEqual(["seat_0", "seat_1"]);
    expect(state.seats.map((s) => s.team)).toEqual(["A", "B", "A", "B", "A", "B"]);
  });

  test("is deeply frozen", () => {
    const state = build().result.state!;
    expect(() => state.hand.push("1CK")).toThrow();
    expect(() => {
      (state as any).trumpSuit = "D";
    }).toThrow();
    expect(() => state.seats[0].ref.length).not.toThrow();
    expect(Object.isFrozen(state.seats[0])).toBe(true);
  });

  test("is a copy: later changes to the live game do not leak in", () => {
    const { game, result } = build();
    game[REAL_TOKENS[0]].push("2CK");
    game.teamACards.push("1CK");
    expect(result.state!.hand).toEqual(HANDS[0]);
    expect(result.state!.teamACards).toEqual([]);
  });

  test("does not mutate the live game", () => {
    const game: any = makeTrainingGame({}, players);
    const before = JSON.stringify(game);
    buildVisibleState(game, 0);
    expect(JSON.stringify(game)).toBe(before);
  });

  describe("inconsistent tricks are rejected", () => {
    test("an unknown player on the table", () => {
      const { result } = build({ dropCardPlayer: ["1HA-Stranger"], currentTurn: 1 }, 1);
      expect(result.skipReason).toBe("INCONSISTENT_TRICK");
    });

    test("a card attributed to the wrong seat", () => {
      const { result } = build({ dropCardPlayer: ["1HA-Quixote-9"], currentTurn: 1 }, 1);
      expect(result.skipReason).toBe("INCONSISTENT_TRICK");
    });

    test("a trick that already has every seat's card", () => {
      const trick = REAL_NAMES.map((n, i) => `1H${i}-${n}`);
      const { result } = build({ dropCardPlayer: trick, currentTurn: 0 }, 0);
      expect(result.skipReason).toBe("INCONSISTENT_TRICK");
    });

    test("a malformed entry", () => {
      const { result } = build({ dropCardPlayer: ["nodash"], currentTurn: 1 }, 1);
      expect(result.skipReason).toBe("INCONSISTENT_TRICK");
    });
  });

  test("a trick that wraps past the last seat is consistent", () => {
    const { result } = build({
      dropCardPlayer: ["1HA-Tamsin", "1HK-Zephyrine"],
      currentTurn: 1,
    }, 1);
    expect(result.skipReason).toBeUndefined();
    expect(result.state!.currentTrick.map((c) => c.by)).toEqual(["seat_5", "seat_0"]);
  });
});
