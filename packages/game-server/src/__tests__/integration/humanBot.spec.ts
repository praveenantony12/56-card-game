/**
 * Humans and bots share one rule path.
 *
 * A bot's card goes through GameCore.onDropCard and its bid through
 * GameCore.onBiddingAction, exactly like a human's, so it is judged by the same
 * legality checks. These tests stub the bot's DECISION (never asserting what a
 * good decision is) and prove the plumbing: pacing, payload shape, rejection of
 * illegal choices, and that a real bot never chooses a card the server rejects.
 */

import { TeamBotAgent } from "../../agents/TeamBotAgent";
import { ALL_CARDS, GAME_ID, biddingGame, cardPlayGame, sixPlayers } from "../helpers/builders";
import { Harness, drop, liveGame, makeCore, seedGame, snapshot, useQuietConsole } from "../helpers/harness";
import { botTimerPending, triggerBotBidding } from "../helpers/privateAccess";
import { legalCards } from "../helpers/referenceRules";
import { mulberry32, seedMathRandom, useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

const REASONING_FLAG = "REACT_APP_ENABLE_BOT_REASONING_IN_UI";
let savedFlag: string | undefined;

beforeEach(() => {
  savedFlag = process.env[REASONING_FLAG];
  delete process.env[REASONING_FLAG];
});
afterEach(() => {
  jest.restoreAllMocks();
  if (savedFlag === undefined) delete process.env[REASONING_FLAG];
  else process.env[REASONING_FLAG] = savedFlag;
});

const botAtSeat1 = () => sixPlayers({ 1: { isBotAgent: true, socketId: "bot-socket-1" } });
const botAtSeat0 = () => sixPlayers({ 0: { isBotAgent: true, socketId: "bot-socket-0" } });

function botTurn(): Harness {
  const harness = makeCore();
  seedGame(
    harness,
    cardPlayGame({
      players: botAtSeat1(),
      trick: [[0, "1HA"]],
      hands: [["1D9"], ["1HK", "1DA"], ["1H9"], ["1DJ"], ["1HJ"], ["1HQ"]],
    }),
  );
  return harness;
}

describe("a bot's card", () => {
  test("is chosen after 500 ms and played after a further second, through onDropCard with the bot's own token", () => {
    const harness = botTurn();
    const decide = jest.spyOn(TeamBotAgent.prototype, "decide").mockReturnValue("1HK");
    const onDropCard = jest.spyOn(harness.core, "onDropCard");

    harness.core.checkAndPlayBotTurn(GAME_ID);
    jest.advanceTimersByTime(499);
    expect(decide).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(decide).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(999);
    expect(onDropCard).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(onDropCard).toHaveBeenCalledTimes(1);
    expect(onDropCard.mock.calls[0][0]).toEqual({ card: "1HK", gameId: GAME_ID, token: "tok-1", playerId: "Ben" });
    expect(liveGame(harness).droppedCards).toEqual(["1HA", "1HK"]);
    expect(liveGame(harness).currentTurn).toBe(2);
    expect(botTimerPending(harness.core, GAME_ID)).toBe(false);
  });

  test("is rejected like a human's when it breaks the follow-suit duty, and nothing changes", () => {
    const harness = botTurn();
    jest.spyOn(TeamBotAgent.prototype, "decide").mockReturnValue("1DA");
    const before = snapshot(liveGame(harness));

    harness.core.checkAndPlayBotTurn(GAME_ID);
    jest.advanceTimersByTime(1500);

    expect(snapshot(liveGame(harness))).toEqual(before);
  });

  test("is not played at all when the bot reports no move", () => {
    const harness = botTurn();
    jest.spyOn(TeamBotAgent.prototype, "decide").mockReturnValue("");
    const onDropCard = jest.spyOn(harness.core, "onDropCard");

    harness.core.checkAndPlayBotTurn(GAME_ID);
    jest.advanceTimersByTime(5000);

    expect(onDropCard).not.toHaveBeenCalled();
  });

  test("is not scheduled when it is a human's turn", () => {
    const harness = makeCore();
    seedGame(harness, cardPlayGame({ players: botAtSeat1() }));
    const decide = jest.spyOn(TeamBotAgent.prototype, "decide");

    harness.core.checkAndPlayBotTurn(GAME_ID);
    jest.advanceTimersByTime(5000);

    expect(decide).not.toHaveBeenCalled();
    expect(botTimerPending(harness.core, GAME_ID)).toBe(false);
  });

  test("a restart before the bot plays cancels its move", () => {
    const harness = botTurn();
    jest.spyOn(TeamBotAgent.prototype, "decide").mockReturnValue("1HK");
    const onDropCard = jest.spyOn(harness.core, "onDropCard");

    harness.core.checkAndPlayBotTurn(GAME_ID);
    jest.advanceTimersByTime(500);
    expect(botTimerPending(harness.core, GAME_ID)).toBe(true);

    harness.core.onRestartGame({ gameId: GAME_ID } as any, () => {});
    jest.advanceTimersByTime(5000);

    expect(onDropCard).not.toHaveBeenCalled();
  });
});

describe("a bot's bid", () => {
  function botBids(): Harness {
    const harness = makeCore();
    seedGame(harness, biddingGame({ players: botAtSeat0() }));
    return harness;
  }

  test("a bid is made after two seconds through onBiddingAction with the bot's token", () => {
    const harness = botBids();
    const decision = { action: "bid", bidValue: 30, suit: "H", bidSelectionType: "direct", clickOrder: null, noTrumpType: null };
    jest.spyOn(TeamBotAgent.prototype, "decideBid").mockReturnValue(decision as any);
    const onBiddingAction = jest.spyOn(harness.core, "onBiddingAction");

    triggerBotBidding(harness.core, GAME_ID);
    jest.advanceTimersByTime(1999);
    expect(onBiddingAction).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(onBiddingAction).toHaveBeenCalledTimes(1);
    expect(onBiddingAction.mock.calls[0][0]).toEqual({
      gameId: GAME_ID,
      token: "tok-0",
      action: "bid",
      bidValue: 30,
      suit: "H",
      bidSelectionType: "direct",
      clickOrder: null,
      noTrumpType: null,
    });
    const game = liveGame(harness);
    expect(game.currentBet).toBe("30");
    expect(game.currentBiddingPlayerId).toBe("Ben");
  });

  test("a pass is made after one second", () => {
    const harness = botBids();
    jest.spyOn(TeamBotAgent.prototype, "decideBid").mockReturnValue({ action: "pass" } as any);
    const onBiddingAction = jest.spyOn(harness.core, "onBiddingAction");

    triggerBotBidding(harness.core, GAME_ID);
    jest.advanceTimersByTime(999);
    expect(onBiddingAction).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onBiddingAction).toHaveBeenCalledTimes(1);
    expect(onBiddingAction.mock.calls[0][0]).toMatchObject({ gameId: GAME_ID, token: "tok-0", action: "pass" });
  });

  test("an illegal bid from a bot is rejected exactly like a human's and changes nothing", () => {
    const harness = botBids();
    jest
      .spyOn(TeamBotAgent.prototype, "decideBid")
      .mockReturnValue({ action: "bid", bidValue: 20, suit: "H" } as any);
    const before = snapshot(liveGame(harness));

    triggerBotBidding(harness.core, GAME_ID);
    jest.advanceTimersByTime(2000);

    expect(snapshot(liveGame(harness))).toEqual(before);
  });

  test("a bot whose turn has passed by the time it acts does nothing", () => {
    const harness = botBids();
    jest.spyOn(TeamBotAgent.prototype, "decideBid").mockReturnValue({ action: "pass" } as any);
    const onBiddingAction = jest.spyOn(harness.core, "onBiddingAction");

    triggerBotBidding(harness.core, GAME_ID);
    liveGame(harness).currentBiddingPlayerId = "Ben";
    jest.advanceTimersByTime(5000);

    expect(onBiddingAction).not.toHaveBeenCalled();
  });

  test("a human on turn is never bid for", () => {
    const harness = makeCore();
    seedGame(harness, biddingGame({ players: botAtSeat1() }));
    const decideBid = jest.spyOn(TeamBotAgent.prototype, "decideBid");

    triggerBotBidding(harness.core, GAME_ID);
    jest.advanceTimersByTime(5000);

    expect(decideBid).not.toHaveBeenCalled();
  });
});

describe("a real bot and the server agree on legality", () => {
  test("seeded positions: whatever card the bot chooses is legal by the oracle and accepted by the server", () => {
    const restore = seedMathRandom(8);
    try {
      const random = mulberry32(56);
      const suits = ["H", "D", "E", "C", "N"];

      for (let round = 0; round < 40; round++) {
        const deck = ALL_CARDS.slice();
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          const tmp = deck[i];
          deck[i] = deck[j];
          deck[j] = tmp;
        }
        const leader = Math.floor(random() * 6);
        const played = Math.floor(random() * 6);
        const actor = (leader + played) % 6;
        const trick: Array<[number, string]> = [];
        for (let k = 0; k < played; k++) trick.push([(leader + k) % 6, deck[k]]);

        const hands: string[][] = [[], [], [], [], [], []];
        let cursor = played;
        for (let seat = 0; seat < 6; seat++) {
          const size = seat === actor ? 1 + Math.floor(random() * 8) : 2;
          hands[seat] = deck.slice(cursor, cursor + size);
          cursor += size;
        }

        const players = sixPlayers({ [actor]: { isBotAgent: true, socketId: `bot-socket-${actor}` } });
        const harness = makeCore();
        const game = cardPlayGame({ players, hands, trick, leader, trump: suits[Math.floor(random() * 5)] });
        seedGame(harness, game);

        const chosen = new TeamBotAgent().decide(game, players[actor].token, players[actor].playerId);
        const led = played > 0 ? trick[0][1] : undefined;
        expect(legalCards(hands[actor], led)).toContain(chosen);
        expect(drop(harness, actor, chosen).code).toBe("SUCCESS");
      }
    } finally {
      restore();
    }
  });
});
