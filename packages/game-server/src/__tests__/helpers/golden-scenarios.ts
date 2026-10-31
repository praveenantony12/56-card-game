import { ShadowVisibleState } from "../../training/types";

export interface GoldenScenario {
  name: string;
  state: ShadowVisibleState;
}

interface ScenarioInput {
  actor: number;
  hand: string[];
  /** Cards already played this trick, oldest first, as [card, seat]. */
  trick?: Array<[string, number]>;
  trump: string;
  bidSeat?: number;
  bidValue?: number;
  teamA?: string[];
  teamB?: string[];
  noTrumpType?: "Noes" | "Pass" | "No-Trump";
}

/** Builds a consistent ShadowVisibleState for a fixed, hand-written situation. */
export function scenario(input: ScenarioInput): ShadowVisibleState {
  const bidSeat = input.bidSeat === undefined ? 0 : input.bidSeat;
  const bidValue = input.bidValue || 28;
  const ref = (seat: number) => `seat_${seat}`;
  const biddingTeam = bidSeat % 2 === 0 ? "A" : "B";

  return {
    actorRef: ref(input.actor),
    seats: [0, 1, 2, 3, 4, 5].map((seat) => ({
      ref: ref(seat),
      seat,
      team: seat % 2 === 0 ? ("A" as const) : ("B" as const),
      isBot: false,
    })),
    hand: input.hand,
    currentTrick: (input.trick || []).map(([card, seat]) => ({ card, by: ref(seat) })),
    teamACards: input.teamA || [],
    teamBCards: input.teamB || [],
    trumpSuit: input.trump,
    finalBid: bidValue,
    currentBet: String(bidValue),
    biddingTeam,
    biddingPlayer: ref(bidSeat),
    lastBiddingTeam: biddingTeam,
    bidDouble: false,
    bidReDouble: false,
    bidHistory: [
      {
        by: ref(bidSeat),
        action: "bid",
        bidValue,
        suit: input.trump,
        bidSelectionType: "direct",
        bidModifier: 0,
        clickOrder: null,
        noTrumpType: input.trump === "N" ? input.noTrumpType || "Noes" : null,
      },
      { by: ref((bidSeat + 1) % 6), action: "pass" },
    ],
    teamAScore: 10,
    teamBScore: 10,
  };
}

/**
 * Fixed situations whose bot decisions are pinned by bot-golden.spec.ts.
 * Together they exercise leading, following, ruffing, discarding, teammate
 * and opponent winning, last-to-play point counting and No-Trump (Noes) play.
 */
export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  {
    name: "lead with trump jack and ace as the bidder",
    state: scenario({
      actor: 0,
      hand: ["1HJ", "1HA", "1H9", "1DA", "1D10", "1EK", "1CQ", "2CK"],
      trump: "H",
      bidSeat: 0,
      bidValue: 32,
    }),
  },
  {
    name: "follow suit while a teammate is winning",
    state: scenario({
      actor: 3,
      hand: ["1DK", "1DQ", "1H9", "1EA", "1C10"],
      trick: [["1DA", 1], ["1D10", 2]],
      trump: "H",
      bidSeat: 1,
    }),
  },
  {
    name: "follow suit while an opponent is winning",
    state: scenario({
      actor: 2,
      hand: ["1DK", "1DJ", "1H9", "1EA"],
      trick: [["1DQ", 0], ["1DA", 1]],
      trump: "H",
      bidSeat: 0,
    }),
  },
  {
    name: "void in the led suit with trump available",
    state: scenario({
      actor: 4,
      hand: ["1H9", "1HK", "1EA", "1C10", "2CQ"],
      trick: [["1D9", 1], ["1DQ", 2], ["1DK", 3]],
      trump: "H",
      bidSeat: 1,
    }),
  },
  {
    name: "void in the led suit with no trump to play",
    state: scenario({
      actor: 5,
      hand: ["1EA", "1EK", "1C10", "2CQ"],
      trick: [["1D9", 2], ["1DQ", 3], ["1DK", 4]],
      trump: "H",
      bidSeat: 2,
    }),
  },
  {
    name: "last to play with points on the table",
    state: scenario({
      actor: 5,
      hand: ["1DJ", "1D10", "1H9"],
      trick: [["1DK", 0], ["1DA", 1], ["1D9", 2], ["1DQ", 3], ["2DA", 4]],
      trump: "H",
      bidSeat: 0,
      bidValue: 40,
      teamA: ["1HJ", "1H9", "1CJ", "2C9", "1EJ", "2E9"],
      teamB: ["1CA", "1C10", "2CA", "2C10", "1EA", "1E10"],
    }),
  },
  {
    name: "lead late in the hand with few cards left",
    state: scenario({
      actor: 2,
      hand: ["1HQ", "1DA"],
      trump: "H",
      bidSeat: 3,
      bidValue: 36,
      teamA: ["1HJ", "1H9", "1HA", "1H10", "2HJ", "2H9", "1CJ", "2C9", "1EJ", "2E9", "1DJ", "2D9"],
      teamB: ["1CA", "1C10", "2CA", "2C10", "1EA", "1E10", "2EA", "2E10", "1D9", "2DJ", "1HK", "2HK"],
    }),
  },
  {
    name: "No-Trump (Noes) lead",
    state: scenario({
      actor: 0,
      hand: ["1HA", "1HK", "1DJ", "1D9", "1EQ", "1C10", "2C9", "2EK"],
      trump: "N",
      noTrumpType: "Noes",
      bidSeat: 0,
    }),
  },
  {
    name: "No-Trump (Noes) follow with a teammate winning",
    state: scenario({
      actor: 2,
      hand: ["1HK", "1HQ", "1D9", "1EA"],
      trick: [["1H9", 0], ["1H10", 1]],
      trump: "N",
      noTrumpType: "Noes",
      bidSeat: 0,
    }),
  },
];
