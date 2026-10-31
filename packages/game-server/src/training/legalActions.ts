/**
 * Cards a player may legally play now.
 *
 * Mirrors the live rule in Game.isCheating / isCardAvail: the suit is the second
 * character of a card ("1H", "2D" ...). The player must follow the suit of the
 * first card on the table if they hold one, otherwise any card is legal. With an
 * empty table (a lead) every card is legal.
 *
 * @param hand The acting player's hand.
 * @param trickCards Cards already on the table this trick, in play order.
 */
export function getLegalCards(hand: string[], trickCards: string[]): string[] {
  if (trickCards.length === 0) {
    return hand.slice();
  }
  const leadSuit = trickCards[0].charAt(1);
  const followers = hand.filter((card) => card.charAt(1) === leadSuit);
  return followers.length > 0 ? followers : hand.slice();
}
