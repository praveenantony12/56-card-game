/**
 * Complete-game scenario fixtures: hand-written 48-card deals with every trick
 * spelled out. Winners and points are written here by hand, independently of
 * the production code, and the scenario spec checks them three ways: against
 * these literals, against the independent oracle in referenceRules.ts, and
 * against what the game actually does.
 *
 * Seating: seats 0,2,4 are Team A and seats 1,3,5 are Team B. Seat 0 leads the
 * first trick (the game's starter seat).
 *
 * This file is data only. It must not import production code or helpers.
 */

export interface ScriptedBid {
  seat: number;
  action: "bid" | "pass" | "skip-raise" | "raise-bid" | "double" | "re-double";
  bidValue?: number;
  suit?: string;
}

export interface ExpectedTrick {
  leader: number;
  /** Cards in play order, starting with the leader. */
  cards: string[];
  winnerSeat: number;
  winningCard: string;
  points: number;
  /** Team that captures the trick. */
  team: "A" | "B";
}

export interface ScenarioDef {
  name: string;
  /** hands[seat] = the seat's eight cards. */
  hands: string[][];
  bidding: ScriptedBid[];
  tricks: ExpectedTrick[];
  expected: {
    finalBid: number;
    trump: string;
    biddingSeat: number;
    biddingTeam: "A" | "B";
    teamAPoints: number;
    teamBPoints: number;
    contractMet: boolean;
    /** Score after the hand, starting from 10-10. */
    teamAScore: number;
    teamBScore: number;
    scoreResetOccurred: boolean;
  };
}

/** Five consecutive passes by the five seats following `lastBidder`. */
function passesAfter(lastBidder: number): ScriptedBid[] {
  const passes: ScriptedBid[] = [];
  for (let k = 1; k <= 5; k++) {
    passes.push({ seat: (lastBidder + k) % 6, action: "pass" });
  }
  return passes;
}

/** The bids, then five passes, then the last bidder declining to raise. */
function bidScript(bids: ScriptedBid[], lastBidder: number): ScriptedBid[] {
  return bids.concat(passesAfter(lastBidder), [
    { seat: lastBidder, action: "skip-raise" },
  ]);
}

// ---------------------------------------------------------------------------
// Deal ONE: every player holds two cards of every suit, so everyone can always
// follow suit and no trump is ever played on a non-trump trick. Duplicate
// cards decide most tricks (the earlier identical card stays senior).
// ---------------------------------------------------------------------------

export const DEAL_ONE: string[][] = [
  ["1DQ", "1DK", "1EA", "1E10", "1CA", "1CK", "1HQ", "1HK"],
  ["2DQ", "2DK", "2EA", "2E10", "2CA", "2CK", "2HQ", "2HK"],
  ["1DJ", "1D9", "1EQ", "1EK", "1C10", "1CQ", "1HA", "1H10"],
  ["2DJ", "2D9", "1EJ", "1E9", "2CQ", "2C10", "2HA", "2H10"],
  ["1DA", "1D10", "2EQ", "2EK", "1CJ", "1C9", "1H9", "2H9"],
  ["2DA", "2D10", "2EJ", "2E9", "2CJ", "2C9", "1HJ", "2HJ"],
];

export const DEAL_ONE_TRICKS: ExpectedTrick[] = [
  { leader: 0, cards: ["1DQ", "2DQ", "1DJ", "2DJ", "1DA", "2DA"], winnerSeat: 2, winningCard: "1DJ", points: 8, team: "A" },
  { leader: 2, cards: ["1D9", "2D9", "1D10", "2D10", "1DK", "2DK"], winnerSeat: 2, winningCard: "1D9", points: 6, team: "A" },
  { leader: 2, cards: ["1EQ", "1EJ", "2EQ", "2EJ", "1EA", "2EA"], winnerSeat: 3, winningCard: "1EJ", points: 8, team: "B" },
  { leader: 3, cards: ["1E9", "2EK", "2E9", "1E10", "2E10", "1EK"], winnerSeat: 3, winningCard: "1E9", points: 6, team: "B" },
  { leader: 3, cards: ["2CQ", "1CJ", "2CJ", "1CA", "2CA", "1C10"], winnerSeat: 4, winningCard: "1CJ", points: 9, team: "A" },
  { leader: 4, cards: ["1C9", "2C9", "1CK", "2CK", "1CQ", "2C10"], winnerSeat: 4, winningCard: "1C9", points: 5, team: "A" },
  { leader: 4, cards: ["1H9", "1HJ", "1HQ", "2HQ", "1HA", "2HA"], winnerSeat: 5, winningCard: "1HJ", points: 7, team: "B" },
  { leader: 5, cards: ["2HJ", "1HK", "2HK", "1H10", "2H10", "2H9"], winnerSeat: 5, winningCard: "2HJ", points: 7, team: "B" },
];

// Scenario 1: Team A bids 28 with Hearts trump and captures exactly 28.
export const SCENARIO_CONTRACT_MET: ScenarioDef = {
  name: "Team A bids 28 and captures exactly 28 points",
  hands: DEAL_ONE,
  bidding: bidScript([{ seat: 0, action: "bid", bidValue: 28, suit: "H" }], 0),
  tricks: DEAL_ONE_TRICKS,
  expected: {
    finalBid: 28,
    trump: "H",
    biddingSeat: 0,
    biddingTeam: "A",
    teamAPoints: 28,
    teamBPoints: 28,
    contractMet: true,
    teamAScore: 11,
    teamBScore: 9,
    scoreResetOccurred: false,
  },
};

// Scenario 2: Team B outbids Team A at 40 with suit E as trump, but the
// defenders (Team A) keep 28 points, so the contract fails by 12.
export const SCENARIO_CONTRACT_FAILS: ScenarioDef = {
  name: "Team B bids 40 and the defenders keep their 28 points",
  hands: DEAL_ONE,
  bidding: bidScript(
    [
      { seat: 0, action: "bid", bidValue: 28, suit: "H" },
      { seat: 1, action: "bid", bidValue: 40, suit: "E" },
    ],
    1,
  ),
  tricks: DEAL_ONE_TRICKS,
  expected: {
    finalBid: 40,
    trump: "E",
    biddingSeat: 1,
    biddingTeam: "B",
    teamAPoints: 28,
    teamBPoints: 28,
    contractMet: false,
    teamAScore: 13,
    teamBScore: 7,
    scoreResetOccurred: false,
  },
};

// ---------------------------------------------------------------------------
// Deal THREE: duplicate and trump stress. Diamonds (D) are trump. Seats 3, 4 and
// 5 hold no Hearts, so they trump, over-trump and discard; duplicate Jacks meet
// in the trump suit; duplicate Nines meet in a plain suit; plain-suit cards
// played off-suit never win; the lead changes hands several times.
// ---------------------------------------------------------------------------

export const DEAL_THREE: string[][] = [
  ["1HA", "2DA", "1DQ", "1CA", "1HQ", "2CK", "2HQ", "1H10"],
  ["1HK", "1DK", "1EA", "2CA", "2HK", "2EA", "2H10", "2HA"],
  ["1H9", "2D9", "1EK", "2DK", "1HJ", "2EQ", "2H9", "2HJ"],
  ["1D10", "2D10", "1E10", "1C9", "1DA", "1E9", "1CJ", "1C10"],
  ["1D9", "1DJ", "1EJ", "1CQ", "2CJ", "2E9", "2C10", "2CQ"],
  ["1EQ", "2DJ", "2EJ", "1CK", "2DQ", "2EK", "2C9", "2E10"],
];

export const DEAL_THREE_TRICKS: ExpectedTrick[] = [
  // Hearts led. Seats 3 and 4 trump (the Nine over-trumps the Ten); seat 5 discards.
  { leader: 0, cards: ["1HA", "1HK", "1H9", "1D10", "1D9", "1EQ"], winnerSeat: 4, winningCard: "1D9", points: 6, team: "A" },
  // Trump led with duplicate Jacks: the earlier Jack stays senior.
  { leader: 4, cards: ["1DJ", "2DJ", "2DA", "1DK", "2D9", "2D10"], winnerSeat: 4, winningCard: "1DJ", points: 10, team: "A" },
  // Suit E led with duplicate Jacks, but seat 0 is void and trumps.
  { leader: 4, cards: ["1EJ", "2EJ", "1DQ", "1EA", "1EK", "1E10"], winnerSeat: 0, winningCard: "1DQ", points: 8, team: "A" },
  // Clubs led with duplicate Aces; seat 2 is void in Clubs and trumps.
  { leader: 0, cards: ["1CA", "2CA", "2DK", "1C9", "1CQ", "1CK"], winnerSeat: 2, winningCard: "2DK", points: 4, team: "A" },
  // Hearts led. Seats 3 and 5 trump (Ace beats Queen); seat 4 discards a Jack.
  { leader: 2, cards: ["1HJ", "1DA", "2CJ", "2DQ", "1HQ", "2HK"], winnerSeat: 3, winningCard: "1DA", points: 7, team: "B" },
  // Suit E led with duplicate Nines in a plain suit: the earlier Nine wins.
  { leader: 3, cards: ["1E9", "2E9", "2EK", "2CK", "2EA", "2EQ"], winnerSeat: 3, winningCard: "1E9", points: 5, team: "B" },
  // Clubs led; Hearts played off-suit by the void seats can never win.
  { leader: 3, cards: ["1CJ", "2C10", "2C9", "2HQ", "2H10", "2H9"], winnerSeat: 3, winningCard: "1CJ", points: 9, team: "B" },
  // Clubs led again; seat 5 is now void and discards a plain-suit card.
  { leader: 3, cards: ["1C10", "2CQ", "2E10", "1H10", "2HA", "2HJ"], winnerSeat: 3, winningCard: "1C10", points: 7, team: "B" },
];

// Scenario 3: Team B bids 29 in the trump-heavy deal and misses by exactly one.
export const SCENARIO_TRUMP_STRESS: ScenarioDef = {
  name: "Team B bids 29 with duplicate and trump stress and misses by one point",
  hands: DEAL_THREE,
  bidding: bidScript(
    [
      { seat: 0, action: "bid", bidValue: 28, suit: "H" },
      { seat: 1, action: "bid", bidValue: 29, suit: "D" },
    ],
    1,
  ),
  tricks: DEAL_THREE_TRICKS,
  expected: {
    finalBid: 29,
    trump: "D",
    biddingSeat: 1,
    biddingTeam: "B",
    teamAPoints: 28,
    teamBPoints: 28,
    contractMet: false,
    teamAScore: 12,
    teamBScore: 8,
    scoreResetOccurred: false,
  },
};

export const SCENARIOS: ScenarioDef[] = [
  SCENARIO_CONTRACT_MET,
  SCENARIO_CONTRACT_FAILS,
  SCENARIO_TRUMP_STRESS,
];
