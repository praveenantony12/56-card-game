/**
 * Property-style simulation: many seeded games played by a deterministic
 * legal-action selector (never the bot strategy), with the invariants checked
 * after every single action.
 *
 * Each game is identified by its seed, so a failure names exactly the game to
 * replay. The number of games defaults to 100 and can be changed with the
 * SIM_GAMES environment variable (for example SIM_GAMES=1000 for a long run).
 *
 * Doubles and re-doubles are left out of the simulated bidding on purpose: how
 * they should affect the score is an open domain question, so no property here
 * depends on it.
 */

import { ALL_CARDS, GAME_ID, PLAYER_NAMES } from "../helpers/builders";
import { assertCardsConserved, assertPointsTotal56, assertSixUniquePlayers, cardsInPlay } from "../helpers/assertions";
import { Harness, bid, drop, emitsOf, liveGame, makeCore, snapshot, useQuietConsole } from "../helpers/harness";
import { roundTimerPending } from "../helpers/privateAccess";
import { biddingTeamScoreChange, legalCards, pointsOf, teamOfSeat, trickWinner } from "../helpers/referenceRules";
import { advanceTrick, mulberry32, seedMathRandom, useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

const GAMES = Math.max(1, Number(process.env.SIM_GAMES) || 100);
const SEEDS = Array.from({ length: GAMES }, (_unused, i) => [1000 + i]);
const SUITS = ["H", "D", "E", "C", "N"];

interface Transcript {
  actions: string[];
  finalScores: [number, number];
}

function seatOf(game: any, playerId: string): number {
  return game.players.findIndex((p: any) => p.playerId === playerId);
}

function invariantsHold(game: any): void {
  assertSixUniquePlayers(game);
  expect(cardsInPlay(game)).toHaveLength(48);
  assertCardsConserved(game, ALL_CARDS);
  expect(game.dropDetails.length).toBeLessThanOrEqual(6);
  expect(game.currentTurn).toBeGreaterThanOrEqual(0);
  expect(game.currentTurn).toBeLessThan(6);
}

function newTable(): Harness {
  const harness = makeCore();
  const players = PLAYER_NAMES.map((name, seat) => ({
    playerId: name,
    token: `tok-${seat}`,
    socketId: `sock-${seat}`,
    gameId: GAME_ID,
  }));
  players.forEach((p) => harness.io.addSocket(p.socketId));
  harness.core.startGame(GAME_ID, players, true);
  return harness;
}

function playBidding(harness: Harness, random: () => number, log: string[]): void {
  let bidsMade = 0;
  let guard = 0;
  while (liveGame(harness).isBiddingPhase) {
    if (guard++ > 60) throw new Error("bidding did not terminate");
    const game = liveGame(harness);

    if (game.bidRaisePhase) {
      const seat = seatOf(game, game.bidRaiseOfferedTo);
      const levels = [40, 48, 56].filter((level) => level > parseInt(game.currentBet, 10));
      if (levels.length && random() < 0.4) {
        const value = levels[Math.floor(random() * levels.length)];
        log.push(`raise ${seat} ${value}`);
        expect(bid(harness, seat, "raise-bid", { bidValue: value }).code).not.toBe("FAILED");
      } else {
        log.push(`skip ${seat}`);
        expect(bid(harness, seat, "skip-raise").code).not.toBe("FAILED");
      }
    } else if (game.postRaiseDoubleRound) {
      const seat = seatOf(game, game.currentBiddingPlayerId);
      log.push(`pass ${seat}`);
      expect(bid(harness, seat, "pass").code).not.toBe("FAILED");
    } else {
      const seat = seatOf(game, game.currentBiddingPlayerId);
      const current = parseInt(game.currentBet, 10);
      if (bidsMade < 3 && current < 55 && random() < 0.3) {
        const value = Math.min(56, Math.max(28, current + 1 + Math.floor(random() * 6)));
        const suit = SUITS[Math.floor(random() * SUITS.length)];
        bidsMade++;
        log.push(`bid ${seat} ${value}${suit}`);
        expect(bid(harness, seat, "bid", { bidValue: value, suit }).code).not.toBe("FAILED");
      } else {
        log.push(`pass ${seat}`);
        expect(bid(harness, seat, "pass").code).not.toBe("FAILED");
      }
    }
    invariantsHold(liveGame(harness));
  }
}

/** One illegal attempt that must change nothing: a wrong-seat play or a follow-suit violation. */
function probeIllegalPlay(harness: Harness, random: () => number): void {
  const game = liveGame(harness);
  const seat = game.currentTurn;
  const led = game.dropDetails.length ? game.dropDetails[0] : undefined;
  const hand: string[] = game[game.players[seat].token];
  const illegal = led ? hand.filter((card) => legalCards(hand, led).indexOf(card) === -1) : [];

  const before = snapshot(game);
  const emittedBefore = harness.emitted.length;
  let reply;
  if (illegal.length && random() < 0.5) {
    reply = drop(harness, seat, illegal[0]);
  } else {
    const other = (seat + 1 + Math.floor(random() * 5)) % 6;
    reply = drop(harness, other, liveGame(harness)[game.players[other].token][0] || "1HA");
  }
  expect(reply.code).toBe("FAILED");
  expect(snapshot(liveGame(harness))).toEqual(before);
  expect(harness.emitted.length).toBe(emittedBefore);
}

function playHand(seed: number): Transcript {
  const restore = seedMathRandom(seed);
  try {
    const random = mulberry32(seed ^ 0x9e3779b9);
    const log: string[] = [];
    const harness = newTable();
    invariantsHold(liveGame(harness));

    playBidding(harness, random, log);
    const contract = liveGame(harness);
    const trump: string = contract.trumpSuit;
    const finalBid: number = contract.finalBid;
    const biddingTeam: string = contract.biddingTeam;
    expect(finalBid).toBeGreaterThanOrEqual(28);
    expect(finalBid).toBeLessThanOrEqual(56);
    expect(["A", "B"]).toContain(biddingTeam);

    for (let trick = 0; trick < 8; trick++) {
      const leader = liveGame(harness).currentTurn;
      const plays: Array<{ seat: number; card: string }> = [];
      const pilesBefore = liveGame(harness).teamACards.length + liveGame(harness).teamBCards.length;

      for (let k = 0; k < 6; k++) {
        const game = liveGame(harness);
        const seat = game.currentTurn;
        expect(seat).toBe((leader + k) % 6);

        probeIllegalPlay(harness, random);

        const hand: string[] = game[game.players[seat].token];
        const led = plays.length ? plays[0].card : undefined;
        const options = legalCards(hand, led);
        expect(options.length).toBeGreaterThan(0);
        const card = options[Math.floor(random() * options.length)];

        log.push(`play ${seat} ${card}`);
        expect(drop(harness, seat, card).code).toBe("SUCCESS");
        plays.push({ seat, card });
        invariantsHold(liveGame(harness));
      }

      const winner = trickWinner(plays, trump);
      expect(roundTimerPending(harness.core, GAME_ID)).toBe(true);
      advanceTrick();

      const after = liveGame(harness);
      expect(after.currentTurn).toBe(winner.seat);
      expect(after.teamACards.length + after.teamBCards.length).toBe(pilesBefore + 6);
      const pile = teamOfSeat(winner.seat) === "A" ? after.teamACards : after.teamBCards;
      plays.forEach((play) => expect(pile).toContain(play.card));
      invariantsHold(after);
      log.push(`won ${winner.seat}`);
    }

    const game = liveGame(harness);
    assertPointsTotal56(game);
    expect(game.dropDetails).toEqual([]);
    game.players.forEach((p: any) => expect(game[p.token]).toEqual([]));

    const teamAPoints = pointsOf(game.teamACards);
    const teamBPoints = pointsOf(game.teamBCards);
    expect(teamAPoints + teamBPoints).toBe(56);

    const biddingPoints = biddingTeam === "A" ? teamAPoints : teamBPoints;
    const met = biddingPoints >= finalBid;
    const change = biddingTeamScoreChange(finalBid, met);
    const biddersScore = biddingTeam === "A" ? game.teamAScore : game.teamBScore;
    const defendersScore = biddingTeam === "A" ? game.teamBScore : game.teamAScore;
    expect(biddersScore).toBe(10 + change);
    expect(defendersScore).toBe(10 - change);

    expect(game.isGameComplete).toBe(true);
    expect(emitsOf(harness.emitted, "GAME_COMPLETE")).toHaveLength(1);

    jest.advanceTimersByTime(60000);
    expect(emitsOf(harness.emitted, "GAME_COMPLETE")).toHaveLength(1);
    expect(roundTimerPending(harness.core, GAME_ID)).toBe(false);

    return { actions: log, finalScores: [game.teamAScore, game.teamBScore] };
  } finally {
    restore();
  }
}

describe(`seeded legal-play simulation (${GAMES} games)`, () => {
  test.each(SEEDS)("seed %i plays a whole hand with every invariant holding after every action", (seed: number) => {
    playHand(seed);
  });

  test("the same seed replays the identical game, action for action", () => {
    const first = playHand(4242);
    const second = playHand(4242);
    expect(second).toEqual(first);
    expect(first.actions.length).toBeGreaterThan(48);
  });

  test("different seeds produce different games", () => {
    expect(playHand(1).actions).not.toEqual(playHand(2).actions);
  });

  test("the seeded games really exercise raises, both bidding teams and every trump choice", () => {
    const logs: string[][] = [];
    for (let seed = 1000; seed < 1060; seed++) logs.push(playHand(seed).actions);
    const lines = ([] as string[]).concat(...logs);

    expect(lines.some((line) => line.indexOf("raise ") === 0)).toBe(true);
    expect(lines.some((line) => line.indexOf("skip ") === 0)).toBe(true);
    expect(lines.some((line) => /^bid [135] /.test(line))).toBe(true);
    expect(lines.some((line) => /^bid [024] /.test(line))).toBe(true);
    SUITS.forEach((suit) => expect(lines.some((line) => /^bid \d \d+/.test(line) && line.slice(-1) === suit)).toBe(true));
  });
});
