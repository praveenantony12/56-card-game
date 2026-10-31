import { ICardGame } from "../../core/models/ICardGame";
import { ALL_CARDS } from "./builders";
import { pointsOf } from "./referenceRules";

/** Every card currently in the game: hands, the trick on the table, and both piles. */
export function cardsInPlay(game: any): string[] {
  const cards: string[] = [];
  game.players.forEach((p: any) => {
    (game[p.token] || []).forEach((c: string) => cards.push(c));
  });
  (game.dropCardPlayer || []).forEach((entry: string) => {
    cards.push(entry.slice(0, entry.indexOf("-")));
  });
  (game.teamACards || []).forEach((c: string) => cards.push(c));
  (game.teamBCards || []).forEach((c: string) => cards.push(c));
  return cards;
}

/**
 * Nothing was lost, duplicated or invented: the cards across hands, trick and
 * piles are exactly the expected universe (the full 48-card deck by default).
 */
export function assertCardsConserved(game: ICardGame, universe: string[] = ALL_CARDS): void {
  expect(cardsInPlay(game).sort()).toEqual(universe.slice().sort());
}

export function assertSixUniquePlayers(game: ICardGame): void {
  const players: any[] = game.players as any;
  expect(players).toHaveLength(6);
  const ids = players.map((p) => p.playerId);
  const tokens = players.map((p) => p.token);
  expect(new Set(ids).size).toBe(6);
  expect(new Set(tokens).size).toBe(6);
}

/** The two piles together hold all 48 cards and exactly 56 card points. */
export function assertPointsTotal56(game: ICardGame): void {
  const a: string[] = (game as any).teamACards;
  const b: string[] = (game as any).teamBCards;
  expect(a.length + b.length).toBe(48);
  expect(pointsOf(a) + pointsOf(b)).toBe(56);
}
