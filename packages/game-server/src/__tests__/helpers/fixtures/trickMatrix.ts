/**
 * Trick-winner matrix: hand-derived expectations for who wins a complete trick.
 *
 * Every row lists the six cards in play order starting from `leader`, the trump
 * suit letter ("N" = no trump), and the winning seat and card, worked out from
 * the rules (a trump beats the led suit; otherwise the highest card of the led
 * suit wins; J > 9 > A > 10 > K > Q; among equal cards the earlier play wins).
 *
 * Because each seat holds only the card it plays, every play is legal, which
 * isolates the winner rule from the follow-suit rule.
 *
 * This file is data only. It must not import production code or helpers.
 */

export interface TrickRow {
  name: string;
  trump: string;
  leader: number;
  /** In play order; the k-th card is played by seat (leader + k) mod 6. */
  cards: string[];
  winnerSeat: number;
  winningCard: string;
}

export const TRICK_MATRIX: TrickRow[] = [
  {
    name: "no trump played: the highest card of the led suit wins, off-suit Jacks cannot",
    trump: "D", leader: 0,
    cards: ["1H9", "1HA", "1HK", "1EJ", "1CJ", "1HQ"],
    winnerSeat: 0, winningCard: "1H9",
  },
  {
    name: "a single trump beats the led suit",
    trump: "D", leader: 0,
    cards: ["1HJ", "1H9", "1DQ", "1HA", "1HK", "1H10"],
    winnerSeat: 2, winningCard: "1DQ",
  },
  {
    name: "with several trumps the highest trump wins",
    trump: "D", leader: 0,
    cards: ["1HA", "1D10", "1D9", "1DK", "1HJ", "1DQ"],
    winnerSeat: 2, winningCard: "1D9",
  },
  {
    name: "an off-suit non-trump card cannot win",
    trump: "D", leader: 0,
    cards: ["1H10", "1EJ", "1CJ", "1E9", "1CA", "1HQ"],
    winnerSeat: 0, winningCard: "1H10",
  },
  {
    name: "Jack beats Nine",
    trump: "D", leader: 0,
    cards: ["1H9", "1HJ", "1HK", "1HQ", "2HK", "2HQ"],
    winnerSeat: 1, winningCard: "1HJ",
  },
  {
    name: "Nine beats Ace",
    trump: "D", leader: 0,
    cards: ["1HA", "1H9", "1HK", "1HQ", "2HK", "2HQ"],
    winnerSeat: 1, winningCard: "1H9",
  },
  {
    name: "Ace beats Ten",
    trump: "D", leader: 0,
    cards: ["1H10", "1HA", "1HK", "1HQ", "2HK", "2HQ"],
    winnerSeat: 1, winningCard: "1HA",
  },
  {
    name: "Ten beats King",
    trump: "D", leader: 0,
    cards: ["1HK", "1H10", "1HQ", "2HK", "2HQ", "1EA"],
    winnerSeat: 1, winningCard: "1H10",
  },
  {
    name: "King beats Queen",
    trump: "D", leader: 0,
    cards: ["1HQ", "1HK", "1EA", "1CA", "2EA", "2CA"],
    winnerSeat: 1, winningCard: "1HK",
  },
  {
    name: "duplicate Aces: the earlier identical card stays senior",
    trump: "D", leader: 0,
    cards: ["1HA", "2HA", "1HK", "2HK", "1HQ", "2HQ"],
    winnerSeat: 0, winningCard: "1HA",
  },
  {
    name: "a later identical card never overtakes the earlier one (winner not the leader)",
    trump: "D", leader: 0,
    cards: ["1HK", "1HQ", "1HJ", "2HK", "2HJ", "2HQ"],
    winnerSeat: 2, winningCard: "1HJ",
  },
  {
    name: "duplicate trump Jacks: the earlier trump Jack wins",
    trump: "D", leader: 0,
    cards: ["1HA", "1DJ", "2DJ", "1D9", "1HK", "1HQ"],
    winnerSeat: 1, winningCard: "1DJ",
  },
  {
    name: "duplicate Nines in a plain suit: the earlier Nine wins",
    trump: "D", leader: 0,
    cards: ["1H9", "2H9", "1HK", "1HQ", "2HK", "2HQ"],
    winnerSeat: 0, winningCard: "1H9",
  },
  {
    name: "duplicate Queens as the only led-suit cards: the earlier Queen wins",
    trump: "D", leader: 0,
    cards: ["1HQ", "2HQ", "1EA", "1CA", "2EA", "2CA"],
    winnerSeat: 0, winningCard: "1HQ",
  },
  {
    name: "the winning card is played first",
    trump: "D", leader: 0,
    cards: ["1HJ", "1H9", "1HA", "1H10", "1HK", "1HQ"],
    winnerSeat: 0, winningCard: "1HJ",
  },
  {
    name: "the winning card is played last",
    trump: "D", leader: 0,
    cards: ["1HK", "1HQ", "1H10", "1HA", "1H9", "1HJ"],
    winnerSeat: 5, winningCard: "1HJ",
  },
  {
    name: "the lowest trump beats a led-suit Jack",
    trump: "D", leader: 0,
    cards: ["1HJ", "1DQ", "1H9", "1HA", "1H10", "1HK"],
    winnerSeat: 1, winningCard: "1DQ",
  },
  {
    name: "a later higher trump beats an earlier lower trump",
    trump: "D", leader: 0,
    cards: ["1HA", "1D9", "1DJ", "1HK", "1HQ", "1H10"],
    winnerSeat: 2, winningCard: "1DJ",
  },
  {
    name: "no-trump game: only the led suit counts",
    trump: "N", leader: 0,
    cards: ["1HK", "1DJ", "1H10", "1EJ", "1HQ", "1H9"],
    winnerSeat: 5, winningCard: "1H9",
  },
  {
    name: "trump equal to the led suit: simply the highest trump",
    trump: "H", leader: 0,
    cards: ["1H9", "1HJ", "1HK", "1HQ", "2HK", "2HQ"],
    winnerSeat: 1, winningCard: "1HJ",
  },
  {
    name: "the trick is led by the trump suit itself and the leader wins",
    trump: "D", leader: 0,
    cards: ["1DJ", "1HJ", "1EJ", "1CJ", "2HJ", "2EJ"],
    winnerSeat: 0, winningCard: "1DJ",
  },
  {
    name: "a leader in the middle of the table: play order wraps past seat 5",
    trump: "D", leader: 4,
    cards: ["1HQ", "1HK", "1H9", "1H10", "1HA", "2HQ"],
    winnerSeat: 0, winningCard: "1H9",
  },
  {
    name: "seat 5 leads and a Team B seat wins",
    trump: "D", leader: 5,
    cards: ["1HK", "1HQ", "1HJ", "1H9", "1HA", "1H10"],
    winnerSeat: 1, winningCard: "1HJ",
  },
  {
    name: "Team B seat wins a trump contest",
    trump: "E", leader: 1,
    cards: ["1HA", "1EQ", "1E10", "1HK", "1HQ", "1H9"],
    winnerSeat: 3, winningCard: "1E10",
  },
];
