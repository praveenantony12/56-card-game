import { ICardGame } from "../core/models/ICardGame";

/**
* Basic bot agent for team-based card game decision making.
* This can be extended later to support LLM-based decisions.
*/

export class TeamBotAgent {
    /**
     * Make a decision about which card to play based on game state.
     * @param gameState Current game state
     * @param botToken The bot agent's token (used to access cards in game state)
     * @param botAgentId The bot agent's player ID
     * @returns The selected card to play
     */
    decide(gameState: ICardGame, botToken: string, botAgentId: string): string {
        const legalMoves = this.getLegalMoves(gameState, botToken);

        if (legalMoves.length === 0) {
            throw new Error('No legal moves available for bot ${botAgentId}');
        }

        // Basic heuristic (start here)
        const teammateWinning = this.isTeammateWinning(gameState, botAgentId);

        console.log("[BOT AGENT]", {
            botAgentId,
            botToken,
            teammateWinning,
            LegalMovesCount: legalMoves.length
        });

        if (!teammateWinning) {
            return this.highestCard(legalMoves);
        }

        return this.lowestCard(legalMoves);
    }

    /**
    * Get all legal moves(cards) that the bot can play.
    * @param gameState Current game state
    * @param botToken The bot agent's token (used to access cards in game state)
    * @returns Array of legal card moves
    */
    private getLegalMoves(gameState: ICardGame, botToken: string): string[] {
        const playerCards = gameState[botToken] || [];

        // If no cards, return empty array 
        if (!Array.isArray(playerCards) || playerCards.length == 0) {
            return [];
        }

        // Basic logic: If it's the first card in the round, all cards are legal
        // Use dropDetails instead of tableCards for current round's played cards 
        const currentRoundCards = gameState.dropDetails || [];

        console.log("[BOT AGENT] getLegalMoves debug:", {
            botToken,
            playerCardCount: playerCards.length,
            playerCards: playerCards.slice(0, 3), // Show first 3 cards for debugging 
            currentRoundCardsCount: currentRoundCards.length,
            currentRoundCards
        });

        if (currentRoundCards.length === 0) {
            console.log("[BOT AGENT] First card of round, all cards legal");
            return playerCards;
        }

        // If there are cards played in this round, try to follow suit if possible 
        const leadSuit = this.getLeadSuit(currentRoundCards);
        console.log("[BOT AGENT] Lead suit detected:", leadSuit);

        if (!leadSuit) {
            console.log("[BOT AGENT] No clear lead suit, all cards legal");
            return playerCards; // No clear lead suit, any card is legal
        }

        // Check if bot has cards of the lead suit
        const suitCards = playerCards.filter(card => this.getCardSuit(card) === leadSuit);
        console.log("[BOT AGENT] Suit cards available:", {
            leadSuit,
            suitCardsCount: suitCards.length,
            suitCards
        });

        if (suitCards.length > 0) {
            console.log("[BOT AGENT] Must follow suit, returning suit cards");
            return suitCards; // Must follow suit
        }

        // If bot can't follow suit, any card is legal 
        console.log("[BOT AGENT] Can't follow suit, any card legal");
        return playerCards;
    }

    /**
    * Check if a teammate is currently winning the current round.
    * @param gameState Current game state
    * @param botAgentId The bot agent's player ID
    * @returns True if teammate is winning
    */
    private isTeammateWinning(gameState: ICardGame, botAgentId: string): boolean {
        // Use dropDetails instead of tableCards for current round's played carc
        const currentRoundCards = gameState.dropDetails || [];
        if (currentRoundCards.length == 0) return false;
        const winningCard = this.getWinningCard(currentRoundCards, gameState.trumpSuit);
        if (!winningCard) return false;
        const winningPlayerId = this.extractPlayerFromCardDrop(winningCard);
        return this.isSameTeam(winningPlayerId, botAgentId);
    }

    /**
     * Determine the winning card from the current round's played cards.
     * @param currentRoundCards Array of cards played in the current round
     * @param trumpSuit The trump suit for the game
     * @returns The winning card or null
     */
    private getWinningCard(currentRoundCards: string[], trumpSuit?: string): string | null {
        if (currentRoundCards.length === 0) return null;

        let winningCard = currentRoundCards[0];
        const leadSuit = this.getLeadSuit(currentRoundCards);

        for (const cardDrop of currentRoundCards) {
            const card = cardDrop.split('-')[0]; // Extract card from "card-playerId"
            const currentSuit = this.getCardSuit(card);
            const winningCardPart = winningCard.split('-')[0];
            const winningSuit = this.getCardSuit(winningCardPart);

            // Trump cards beat everything
            if (currentSuit === trumpSuit && winningSuit !== trumpSuit) {
                winningCard = cardDrop;
                continue;
            }

            // If both are trump or both are same suit, higher value wins 
            if ((currentSuit === trumpSuit && winningSuit === trumpSuit) ||
                (currentSuit === winningSuit && currentSuit === leadSuit)) {
                if (this.getCardValue(card) > this.getCardValue(winningCardPart)) {
                    winningCard = cardDrop;
                }
            }

            // If current card follows lead suit but winning doesn't 
            if (currentSuit === leadSuit && winningSuit !== leadSuit && winningSuit !== trumpSuit) {
                winningCard = cardDrop;
            }

            return winningCard;
        }
    }

    /**
     * Check if two players are on the same team.
     * @param playerId1 First player ID
     * @param playerId2 Second player ID
     * @returns True if players are on the same tean
     */
    private isSameTeam(playerId1: string, playerId2: string): boolean {
        // Basic team assignment: players 0,2,4 vs 1,3,5
        // TODO: Implement proper team logic based on your game rules
        const team1 = this.getTeamId(playerId1);
        const team2 = this.getTeamId(playerId2);
        return team1 === team2;
    }

    /**
     * Get team ID for a player(for team A, 1 for team B).
     * @param playerId Player ID
     * @returns Team ID
     * */

    private getTeamId(playerId: string): number {
        // Simple hash-based team assignment
        let hash = 0;
        for (let i = 0; i < playerId.length; i++) {
            hash += playerId.charCodeAt(i);
        }
        return hash % 2;
    }

    /**
    * Extract player ID from a card drop string(format: "card-playerId"
    * @param cardDrop Card drop string
    * @returns Player ID
    */

    private extractPlayerFromCardDrop(cardDrop: string): string {
        const parts = cardDrop.split('-');
        return parts.length > 1 ? parts[parts.length - 1] : '';
    }

    /**
    * Select the highest value card from available moves.
    * @param cards Array of cards
    * @returns Highest card
    */
    private highestCard(cards: string[]): string {
        if (cards.length === 0) return '';

        return cards.reduce((highest, current) => {
            return this.getCardValue(current) > this.getCardValue(highest) ? current : highest;
        });
    }

    /**
    * Select the lowest value card from available moves.
    * @param cards Array of cards
    * @returns Lowest card
    */
    private lowestCard(cards: string[]): string {
        if (cards.length === 0) return '';

        return cards.reduce((lowest, current) => {
            return this.getCardValue(current) < this.getCardValue(lowest) ? current : lowest;
        });
    }

    /**
    * Get the suit of a card.
    * Card format: [deck] [suit] [rank) (e.g., "1EK" deck 1, suit E, rank
    * @param card Card string
    * @returns Suit character
    */
    private getCardSuit(card: string): string {
        if (!card || card.length < 3) return '';
        return card.charAt(1); // Suit is always at position 1
    }

    /**
    * Get the lead suit from current round's played cards.
    * @param currentRoundCards Array of cards played in the current round
    * @returns Lead suit or null
    */
    private getLeadSuit(currentRoundCards: string[]): string | null {
        if (currentRoundCards.length == 0) return null;

        // Extract the first card played to determine lead suit 
        const firstCard = currentRoundCards[0];
        if (!firstCard) return null;

        // If the format is "card-playerId", extract just the card part 
        const cardPart = firstCard.split('-')[0];
        const leadSuit = this.getCardSuit(cardPart);
        console.log("[BOT AGENT] getLeadSuit debug:", {
            firstCard,
            cardPart,
            leadSuit
        });

        return leadSuit;
    }

    /**
     * Get numeric value of a card for comparison.
     * @param card Card string
     * @returns Numeric value for comparison
     */
    private getCardValue(card: string): number {
        if (!card || card.length < 1) return 0;
        const rank = card.slice(0, -1); // All but last character is the rank

        // Basic value mapping
        const valueMap: { [key: string]: number } = {
            'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
        };
        return valueMap[rank] || 0;
    }
}