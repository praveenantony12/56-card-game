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
      throw new Error(`No legal moves available for bot ${botAgentId}`);
    }

    // Use dropCardPlayer for current round (this has the format "card-playerId")
    const currentRoundCards =
      gameState.dropCardPlayer || gameState.dropDetails || [];
    const playedCards = this.getAllPlayedCards(gameState);

    // Determine trump suit (if "N", it's No-Trump game)
    const trumpSuit =
      gameState.trumpSuit === "N" ? undefined : gameState.trumpSuit;

    // Check if teammate is currently winning
    const winningCard = this.getWinningCard(
      currentRoundCards,
      gameState.trumpSuit
    );
    const winningPlayerId = winningCard
      ? this.extractPlayerFromCardDrop(winningCard)
      : null;
    const teammateWinning = this.isTeammateWinning(gameState, botAgentId);

    // Debug logging
    console.log("[BOT AGENT DEBUG]", {
      botAgentId,
      currentRoundCards,
      winningCard,
      winningPlayerId,
      teammateWinning,
      botTeam: this.getTeamId(botAgentId, gameState),
      winnerTeam: winningPlayerId
        ? this.getTeamId(winningPlayerId, gameState)
        : null,
    });

    // Initialize reasoning object
    const reasoning = {
      botId: botAgentId,
      gameMode: trumpSuit ? `Trump: ${trumpSuit}` : "No-Trump(Noes)",
      totalPlayedCards: playedCards.size,
      currentRoundCardsCount: currentRoundCards.length,
      legalMovesCount: legalMoves.length,
      legalMoves: legalMoves,
      teammateWinning: teammateWinning,
      currentWinningCard: winningCard,
      currentWinningPlayer: winningPlayerId,
      strategy: "",
      reasoning: "",
      selectedCard: "",
    };

    console.log(
      "\n╔════════════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║                BOT DECISION REASONING OBSERVER                     ║"
    );
    console.log(
      "╚════════════════════════════════════════════════════════════════════╝"
    );

    //CARD COUNTING: Analyze remaining cards per suit
    const myCards = gameState[botToken] || [];
    const playedPerSuit = this.getPlayedCardsPerSuit(playedCards);
    const remainingTrumps = this.countRemainingTrumps(trumpSuit, playedCards);

    // STRATEGY #: VOID SUIT EXPLOITATION - If bot has all remaining cards of a suit, play st!
    // This is a guaranteed winner strategy especially in No-Trump games
    const isNoesGame = !trumpSuit || gameState.trumpSuit === "N";

    for (const card of legalMoves) {
      const suit = this.getCardSuit(card);

      // Check if this is a void suit (others can't follow)
      if (this.canOthersFollowSuit(suit, myCards, playedCards)) {
        //Bot has ALL remaining cards of this suit!
        const myCardsInSuit = myCards.filter(
          (c) => this.getCardSuit(c) === suit
        );
        const selectedCard = this.highestCard(myCardsInSuit); // Play highest to win

        reasoning.strategy = "VOID_SUIT_GUARANTEED_MIN";

        reasoning.reasoning =
          `CARD COUNTING: Detected VOID SUIT (${suit}). ` +
          `Bot has ALL ${
            myCardsInSuit.length
          } remaining cards of suit ${suit}: (${myCardsInSuit.join(",")}]. ` +
          `No other player can follow this suit GUARANTEED WIN! ` +
          `Playing highest card [${selectedCard}] to maximize points captured. ` +
          `Can continue exploiting this suit in future rounds. `;

        this.logReasoning(reasoning);

        reasoning.selectedCard = selectedCard;

        return selectedCard;
      }
    }

    // STRATEGY 1: If teammate is winning, throw high-point cards to maximize team points
    // BUT: In Trump don't waste trump cards if teammate already winning with trump
    if (teammateWinning) {
      let selectedCard: string;
      let cardPoints: number;

      // TRUMP CONSERVATION: Don't waste trump cards if teammate winning with trump
      if (trumpSuit && gameState.trumpSuit !== "N") {
        const winningCardValue = winningCard?.split("-")[0];
        const winningSuit = winningCardValue
          ? this.getCardSuit(winningCardValue)
          : null;

        // If teammate is winning with trump, don't throw our trump cards
        if (winningSuit === trumpSuit) {
          const nonTrumpMoves = legalMoves.filter(
            (card) => this.getCardSuit(card) !== trumpSuit
          );

          if (nonTrumpMoves.length > 0) {
            // Throw highest-point non-trump card
            selectedCard = this.highestPointCard(nonTrumpMoves);
            cardPoints = this.getCardPoints(selectedCard);
            const trumpCardsInHand = legalMoves.filter(
              (c) => this.getCardSuit(c) === trumpSuit
            );
            reasoning.strategy = "TEAMMATE WINNING_TRUMP_CONSERVED";
            reasoning.reasoning =
              `Teammate (${winningPlayerId}) winning with TRUMP card ${winningCardValue}. ` +
              `TRUMP CONSERVATION: Saving our ${
                trumpCardsInHand.length
              } trump cards [${trumpCardsInHand.join(
                ", "
              )}] for critical rounds. ` +
              `${remainingTrumps} trump cards remain in play. ` +
              `Throwing highest-point NON-TRUMP card [${selectedCard}] (${cardPoints} points). ` +
              `Available non-trump cards: [${nonTrumpMoves.join(", ")}].`;
            reasoning.selectedCard = selectedCard;
            this.logReasoning(reasoning);
            return selectedCard;
          }
        }
      }

      // Special rule for "Noes" (No-Trump) games: NEVER throw Jacks
      // Jacks are crucial for winning future rounds since there's no trump
      const isNoesGame = !trumpSuit || gameState.trumpSuit === "N";

      if (isNoesGame) {
        // Filter out Jacks from legal moves
        const nonJackMoves = legalMoves.filter((card) => {
          const rank = card.slice(2);
          return rank !== "J";
        });

        if (nonJackMoves.length > 0) {
          // Throw highest-point non-Jack card
          selectedCard = this.highestPointCard(nonJackMoves);
          cardPoints = this.getCardPoints(selectedCard);
          reasoning.strategy = "TEAMMATE_WINNING";
          reasoning.reasoning =
            `Teammate (${winningPlayerId}) is currently winning with ${
              winningCard?.split("-")[0]
            }. ` +
            `NOES GAME: Preserving all Jacks for future rounds (Jacks guarantee wins in No-Trump(Noes) game. ` +
            `SUPPORTING teammate by throwing highest-point NON-JACK card [${selectedCard}] (${cardPoints} points). ` +
            `Available non - Jack cards: [${nonJackMoves.join(", ")}]. ` +
            `Jacks preserved: [${legalMoves
              .filter((c) => c.slice(2) === "J")
              .join(", ")}].`;
        } else {
          // Only have Jacks left - must throw one, but note this in reasoning
          selectedCard = this.highestPointCard(legalMoves);
          cardPoints = this.getCardPoints(selectedCard);
          reasoning.strategy = "TEAMMATE_WINNING";
          reasoning.reasoning =
            `Teammate (${winningPlayerId}) is currently winning with ${
              winningCard?.split("-")[0]
            }. ` +
            `NOES GAME: Would prefer to preserve Jacks, but only Jacks remain in legal moves. ` +
            `Forced to throw Jack [${selectedCard}] (${cardPoints} points). ` +
            `This Jack won't be available for future rounds - strategic cost accepted.`;
        }
      } else {
        // Trump game - normal strategy, throw highest-point card (including Jacks)
        selectedCard = this.highestPointCard(legalMoves);
        cardPoints = this.getCardPoints(selectedCard);
        reasoning.strategy = "TEAMMATE_WINNING";
        reasoning.reasoning =
          `Teammate (${winningPlayerId}) is currently winning with ${
            winningCard?.split("-")[0]
          }. ` +
          `TRUMP GAME (${trumpSuit}): SUPPORTING teammate by throwing highest-point card [${selectedCard}] (${cardPoints} points) ` +
          `to maximize team's score for this round. This is standard strategy - ` +
          `drop valuable cards when teammate has secured the win`;
      }

      reasoning.selectedCard = selectedCard;
      this.logReasoning(reasoning);
      return selectedCard;
    }

    // STRATEGY 2: If leading (first card) or trying to win
    const winningMoves = this.getWinningMoves(
      legalMoves,
      currentRoundCards,
      trumpSuit
    );

    if (winningMoves.length > 0) {
      // We have cards that can currently win the round

      // Filter for "Highest" card - cards that are the highest remaining in their suit/trump
      const highestCardMoves = winningMoves.filter((card) =>
        this.isHighestCard(card, playedCards, trumpSuit)
      );

      if (highestCardMoves.length > 0) {
        // We have the Highest card that wins! Play the highest card.
        const selectedCard = this.highestCard(highestCardMoves);
        const selectedSuit = this.getCardSuit(selectedCard);
        const selectedRank = selectedCard.slice(2);
        const remainingSuit = this.countRemainingInSuit(
          selectedSuit,
          playedCards
        );

        reasoning.strategy = "HIGHEST_CARD_WINS";
        reasoning.reasoning =
          `CARD COUNTING: Have (${highestCardMoves.length}) - highest card(s) that can win (all other higher cards are already played). ` +
          `Highest cards: [${highestCardMoves.join(", ")}]. ` +
          `Selected [${selectedCard}] - rank ${selectedRank} is the highest of ${remainingSuit} remaining cards in suit ${selectedSuit}. ` +
          `All higher-ranked cards in this suit have been played. ` +
          `This is a GUARANTEED SAFE WIN - no card in opponents' hands can beat this!`;
        reasoning.selectedCard = selectedCard;
        this.logReasoning(reasoning);
        return selectedCard;
      }

      // We can win, but we don't hold the Boss card.
      const isLastPlayer = this.isLastPlayerInRound(
        currentRoundCards.length,
        gameState
      );

      if (isLastPlayer) {
        // If we are last, and we can win, we win! Play the lowest card that is sufficient to win.
        const selectedCard = this.lowestCard(winningMoves);
        reasoning.strategy = "LAST_PLAYER_WIN";
        reasoning.reasoning =
          `Last player in round with ${
            winningMoves.length
          } winning move(s): [${winningMoves.join(", ")}]. ` +
          `Currently winning card: ${winningCard?.split("-")[0]}. ` +
          `Playing lowest sufficient winning card to capture the round while conserving higher cards. ` +
          `SAFE to play as no more players can beat us.`;
        reasoning.selectedCard = selectedCard;
        this.logReasoning(reasoning);
        return selectedCard;
      } else {
        // No last player, and no HIGHEST card
        const selectedCard = this.lowestCard(legalMoves);
        reasoning.strategy = "RISKY_WIN_AVOIDED";
        reasoning.reasoning =
          `Have ${
            winningMoves.length
          } - potential winning card(s): [${winningMoves.join(", ")}]. ` +
          `but NONE are highest remaining cards (higher cards unknown - those are still left to play)` +
          `Not the last player, opponents still to play. ` +
          `RISK: Playing high card could lose to unknown higher cards (e.g., playing 9 when J might still be out). ` +
          `DECISION: Duck with the lowest card [${selectedCard}] to avoid waste and save high cards for safer opportunities.`;
        reasoning.selectedCard = selectedCard;
        this.logReasoning(reasoning);
        return selectedCard;
      }
    }

    // STRATEGY 3: Cannot win or chose not to win.
    const selectedCard = this.lowestCard(legalMoves);
    reasoning.strategy = "DUCK_NO_WIN";
    reasoning.reasoning =
      `No winning moves available from legal cards: [${legalMoves.join(
        ", "
      )}]. ` +
      `Current winning card: ${winningCard?.split("-")[0] || "None"}. ` +
      `Cannot beat current winning card, so ducking with lowest card to minimize loss. ` +
      `Saving higher cards for future rounds where we might have better opportunities.`;
    reasoning.selectedCard = selectedCard;
    this.logReasoning(reasoning);
    return selectedCard;
  }

  /**
   * Log the reasoning behind a bot's decision
   */
  private logReasoning(reasoning: any): void {
    console.log(
      "\n┌─────────────────────────────────────────────────────────────┐"
    );
    console.log(`│ Bot ID: ${reasoning.botId.padEnd(52)} │`);
    console.log(`│ Game Mode: ${reasoning.gameMode.padEnd(49)} │`);
    console.log(
      "├─────────────────────────────────────────────────────────────┤"
    );
    console.log(
      `│ Current Round Cards: ${String(reasoning.currentRoundCardsCount).padEnd(
        38
      )} │`
    );
    console.log(
      `│ Total Cards Played: ${String(reasoning.totalPlayedCards).padEnd(39)} │`
    );
    console.log(
      `│ Legal Moves Available: ${String(reasoning.legalMovesCount).padEnd(
        36
      )} │`
    );
    console.log(
      "├─────────────────────────────────────────────────────────────┤"
    );

    if (reasoning.currentWinningCard) {
      console.log(
        `│ Currently Winning: ${reasoning.currentWinningCard.padEnd(41)} │`
      );
      console.log(
        `│ Winning Player: ${(
          reasoning.currentWinningPlayer || "Unknown"
        ).padEnd(44)} │`
      );
    }

    console.log(
      "├─────────────────────────────────────────────────────────────┤"
    );
    console.log(`│ STRATEGY: ${reasoning.strategy.padEnd(50)} │`);
    console.log(
      "├─────────────────────────────────────────────────────────────┤"
    );
    console.log(
      "│ REASONING:                                                   │"
    );

    // Wrap reasoning text to fit in box
    const maxWidth = 59;
    const words = reasoning.reasoning.split(" ");
    let line = "";

    words.forEach((word: string) => {
      if ((line + word).length > maxWidth) {
        console.log(`│ ${line.padEnd(maxWidth)} │`);
        line = word + " ";
      } else {
        line += word + " ";
      }
    });

    if (line.trim().length > 0) {
      console.log(`│ ${line.trim().padEnd(maxWidth)} │`);
    }

    console.log(
      "├─────────────────────────────────────────────────────────────┤"
    );
    console.log(`│ SELECTED CARD: ${reasoning.selectedCard.padEnd(45)} │`);
    console.log(
      "└─────────────────────────────────────────────────────────────┘\n"
    );
  }

  /**
   * Check if I am the last player in the current round
   */
  private isLastPlayerInRound(
    currentCount: number,
    gameState: ICardGame
  ): boolean {
    const totalPlayers = gameState.players ? gameState.players.length : 0;
    if (totalPlayers === 0) return false;
    const currentRoundCards =
      gameState.dropCardPlayer || gameState.dropDetails || [];
    return currentRoundCards.length === totalPlayers - 1;
  }

  private getAllPlayedCards(gameState: ICardGame): Set<string> {
    const played = new Set<string>();

    // Add cards from team piles (previous rounds)
    if (Array.isArray(gameState.teamACards)) {
      gameState.teamACards.forEach((c) => played.add(c));
    }
    if (Array.isArray(gameState.teamBCards)) {
      gameState.teamBCards.forEach((c) => played.add(c));
    }

    // Add current round cards (dropCardPlayer has format "card-player")
    const currentRoundCards =
      gameState.dropCardPlayer || gameState.dropDetails || [];
    if (Array.isArray(currentRoundCards)) {
      currentRoundCards.forEach((drop) => {
        const card = drop.split("-")[0];
        played.add(card);
      });
    }

    return played;
  }

  /**
   * Get played cards organized by suit for card counting analysis.
   * @param playedCards Set of all played cards
   * @returns Map of suit to set of played cards in that suit
   */

  private getPlayedCardsPerSuit(
    playedCards: Set<string>
  ): Map<string, Set<string>> {
    const perSuit = new Map<string, Set<string>>();

    playedCards.forEach((card) => {
      const suit = this.getCardSuit(card);

      if (!perSuit.has(suit)) {
        perSuit.set(suit, new Set<string>());
      }
      perSuit.get(suit)!.add(card);
    });

    return perSuit;
  }

  /**
   * Get all remaining cards in a specific suit that haven't been played yet.
   * Each suit has 12 cards total (6 ranks x 2 decks): 3, 9, A, 10, K, Q
   * @param suit The suit to check
   * @param playedCards Set of all played cards
   * @returns Array of remaining cards in the suit
   */

  private getRemainingCardsInSuit(
    suit: string,

    playedCards: Set<string>
  ): string[] {
    const ranks = ["3", "9", "A", "10", "K", "0"];

    const remaining: string[] = [];

    // Check both decks (1 and 2)
    for (const deck of ["1", "2"]) {
      for (const rank of ranks) {
        const card = `${deck}${suit}${rank}`;
        if (!playedCards.has(card)) {
          remaining.push(card);
        }
      }
    }
    return remaining;
  }

  /**
   * Count how many cards of a specific suit are still unplayed.
   * @param suit The suit to count
   * @param playedCards Set of all played cards
   * @returns Count of remaining cards in the suit
   */
  private countRemainingInSuit(suit: string, playedCards: Set<string>): number {
    return this.getRemainingCardsInSuit(suit, playedCards).length;
  }

  /**
   * Check if other players can follow a specific suit.
   * If bot has all remaining cards of a suit, others cannot follow.
   * @param suit The suit to check
   * @param #yCards Bot's current hand
   * @param playedCards Set of all played cards
   * @returns True if other players likely have cards of this suit
   */

  private canothersFollowSuit(
    suit: string,
    myCards: string[],
    playedCards: Set<string>
  ): boolean {
    const remainingInSuit = this.getRemainingCardsInSuit(suit, playedCards);
    const myCardsInSuit = myCards.filter(
      (card) => this.getCardSuit(card) === suit
    );

    // If all remaining cards of this suit are in my hare, others cannot follow
    return myCardsInSuit.length < remainingInSuit.length;
  }

  /**
   * Count remaining trump cards that haven't been played.
   * Critical for trump game strategy avoid wasting trumps.
   * @param trumpSuit The trump suit
   * @param playedCards Set of all played cards
   * @returns Count of remaining trump cards
   */
  private countRemainingTrumps(
    trumpSuit: string | undefined,

    playedCards: Set<string>
  ): number {
    if (!trumpSuit || trumpSuit === "N") return 0;
    return this.countRemainingInSuit(trumpSuit, playedCards);
  }

  /**
   * Get the highest remaining card in a specific suit (considering what's been played).
   * This is THE card that will win if the suit is led.
   * @param suit The suit to check
   * @param playedCards Set of all played cards
   * @returns The highest remaining card in the suit, or null if all played
   */
  private getHighestRemainingInSuit(
    suit: string,
    playedCards: Set<string>
  ): string | null {
    const ranks = ["J", "9", "A", "10", "K", "Q"]; // Descending order

    for (const rank of ranks) {
      // Check both decks

      const card1 = `1${suit}${rank}`;
      const card2 = `2${suit}${rank}`;

      if (!playedCards.has(card1)) return card1;
      if (!playedCards.has(card2)) return card2;
    }

    return null; // All cards of this suit have been played
  }

  /**
   * Check if the bot has the absolute highest card in a suit (guaranteed winner).
   * @param suit The suit to check
   * @param myCards Bot's current hand
   * @param playedCards Set of all played cards
   * @returns True if bot has the highest remaining card in this suit
   */

  private haveHighestInSuit(
    suit: string,

    myCards: string,

    playedCards: Set<string>
  ): boolean {
    const highestRemaining = this.getHighestRemainingInSuit(suit, playedCards);
    if (highestRemaining) return false;

    return myCards.includes(highestRemaining);
  }

  /**
   * CARD COUNTING: Determines if a card is the BOSS card (highest remaining in its suit).
   * Uses card counting to check if all higher-ranked cards of the same suit have been played.
   * Example: If both 3's are played, then 9 becomes the boss. If 9's are also played, A becomes boss.
   * Each suit has 12 cards total 16 ranks 2 decks): J, 9, A, 10, K, Q
   * @param card The card to check
   * @param playedCards Set of all played cards
   * @param trumpSuit The trump suit (unused in this method but kept for compatibility)
   * @returns True if this card is the highest remaining card in its suit
   */
  private isHighestCard(
    card: string,
    playedCards: Set<string>,
    trumpSuit?: string
  ): boolean {
    const suit = this.getCardSuit(card);
    const ranks = ["J", "9", "A", "10", "K", "Q"]; // Descending order of power
    const myRank = card.slice(2);

    const myRankIndex = ranks.indexOf(myRank);
    if (myRankIndex === -1) return false;

    // CARD COUNTING: Loop through all ranks higher thank my rank
    // Check if BOTH copies (from deck 1 and deck 2) of each higher rank have been played
    for (let i = 0; i < myRankIndex; i++) {
      const higherRank = ranks[i];

      // Construct the two possible cards for this higher rank (Deck 1 and Deck 2)
      const higherCard1 = `1${suit}${higherRank}`;
      const higherCard2 = `2${suit}${higherRank}`;

      // If either of these higher cards is NOT in playedCards (and not the card itself),
      // then my card is NOT higher card - someone could still have a higher card.
      if (!playedCards.has(higherCard1) && higherCard1 !== card) return false;
      if (!playedCards.has(higherCard2) && higherCard2 !== card) return false;
    }

    // CARD COUNTING SUCCESS: All higher-ranked cards have been played
    // This card is now the highest remaining card in the suit
    // Example: Both 1HJ and 2HJ played - 1H9 and 2H9 becomes boss
    return true;
  }

  private getWinningMoves(
    legalMoves: string[],
    currentRoundCards: string[],
    trumpSuit?: string
  ): string[] {
    return legalMoves.filter((card) =>
      this.willCardWin(card, currentRoundCards, trumpSuit)
    );
  }

  private willCardWin(
    myCard: string,
    currentRoundCards: string[],
    trumpSuit?: string
  ): boolean {
    if (currentRoundCards.length === 0) return true; // Leading always "wins" initially

    const potentialRound = [...currentRoundCards, `${myCard}-me`];
    const winner = this.getWinningCard(potentialRound, trumpSuit);

    return winner === `${myCard}-me`;
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

    // Use dropCardPlayer for current round cards
    const currentRoundCards =
      gameState.dropCardPlayer || gameState.dropDetails || [];

    if (currentRoundCards.length === 0) {
      return playerCards;
    }

    // If there are cards played in this round, try to follow suit if possible
    const leadSuit = this.getLeadSuit(currentRoundCards);
    console.log("[BOT AGENT] Lead suit detected:", leadSuit);

    if (!leadSuit) {
      return playerCards; // No clear lead suit, any card is legal
    }

    // Check if bot has cards of the lead suit
    const suitCards = playerCards.filter(
      (card) => this.getCardSuit(card) === leadSuit
    );

    if (suitCards.length > 0) {
      return suitCards; // Must follow suit
    }

    // If bot can't follow suit, any card is legal
    return playerCards;
  }

  /**
   * Check if a teammate is currently winning the current round.
   * @param gameState Current game state
   * @param botAgentId The bot agent's player ID
   * @returns True if teammate is winning
   */
  private isTeammateWinning(gameState: ICardGame, botAgentId: string): boolean {
    // Use dropCardPlayer for current round's played cards (format: "card-playerId")
    const currentRoundCards =
      gameState.dropCardPlayer || gameState.dropDetails || [];
    if (currentRoundCards.length == 0) return false;
    const winningCard = this.getWinningCard(
      currentRoundCards,
      gameState.trumpSuit
    );
    if (!winningCard) return false;
    const winningPlayerId = this.extractPlayerFromCardDrop(winningCard);
    if (!winningPlayerId) return false;
    return this.isSameTeam(winningPlayerId, botAgentId, gameState);
  }

  /**
   * Determine the winning card from the current round's played cards.
   * @param currentRoundCards Array of cards played in the current round
   * @param trumpSuit The trump suit for the game
   * @returns The winning card or null
   */
  private getWinningCard(
    currentRoundCards: string[],
    trumpSuit?: string
  ): string | null {
    if (currentRoundCards.length === 0) return null;

    let winningCard = currentRoundCards[0];
    const leadSuit = this.getLeadSuit(currentRoundCards);

    // FIX: Iterate through ALL cards to find the true winner
    for (let i = 1; i < currentRoundCards.length; i++) {
      const cardDrop = currentRoundCards[i];
      const card = cardDrop.split("-")[0]; // Extract card from "card-playerId"
      const currentSuit = this.getCardSuit(card);
      const winningCardPart = winningCard.split("-")[0];
      const winningSuit = this.getCardSuit(winningCardPart);

      // Trump cards beat everything
      if (currentSuit === trumpSuit && winningSuit !== trumpSuit) {
        winningCard = cardDrop;
        continue;
      }

      // If both are trump or both are same suit, higher value wins
      if (
        (currentSuit === trumpSuit && winningSuit === trumpSuit) ||
        (currentSuit === winningSuit && currentSuit === leadSuit)
      ) {
        if (this.getCardValue(card) > this.getCardValue(winningCardPart)) {
          winningCard = cardDrop;
        }
      }
      // If current card follows lead suit but winning doesn't, it loses, so does nothing.
    }
    return winningCard;
  }

  /**
   * Check if two players are on the same team.
   * Team A: positions 0, 2, 4
   * Team B: positions 1, 3, 5
   * @param playerId1 First player ID
   * @param playerId2 Second player ID
   * @returns True if players are on the same team
   */
  private isSameTeam(
    playerId1: string,
    playerId2: string,
    gameState: ICardGame
  ): boolean {
    if (!playerId1 || !playerId2) return false;

    const team1 = this.getTeamId(playerId1, gameState);
    const team2 = this.getTeamId(playerId2, gameState);

    return team1 === team2;
  }

  /**
   * Get team ID for a player based on position (0 for team A, 1 for team B).
   * Team A: positions 0, 2, 4
   * Team B: positions 1, 3, 5
   * @param playerId Player ID
   * @param gameState Game state to find player position
   * @returns Team ID (0 or 1)
   */
  private getTeamId(playerId: string, gameState: ICardGame): number {
    if (!gameState.players) return 0;

    // Find player index in the players array
    const playerIndex = gameState.players.findIndex(
      (p: any) => p.playerId === playerId
    );

    if (playerIndex === -1) return 0; // Default to team A if not found

    // Team assignment: even positions (0,2,4) = Team A, odd positions (1,3,5) = Team B
    return playerIndex % 2;
  }

  /**
   * Extract player ID from a card drop string(format: "card-playerId"
   * @param cardDrop Card drop string
   * @returns Player ID
   */
  private extractPlayerFromCardDrop(cardDrop: string): string {
    const parts = cardDrop.split("-");
    return parts.length > 1 ? parts[parts.length - 1] : "";
  }

  /**
   * Select the highest value card from available moves.
   * @param cards Array of cards
   * @returns Highest card
   */
  private highestCard(cards: string[]): string {
    if (cards.length === 0) return "";

    return cards.reduce((highest, current) => {
      return this.getCardValue(current) > this.getCardValue(highest)
        ? current
        : highest;
    });
  }

  /**
   * Select the lowest value card from available moves.
   * @param cards Array of cards
   * @returns Lowest card
   */
  private lowestCard(cards: string[]): string {
    if (cards.length === 0) return "";

    return cards.reduce((lowest, current) => {
      return this.getCardValue(current) < this.getCardValue(lowest)
        ? current
        : lowest;
    });
  }

  /**
   * Select the card with highest point value from available moves.
   * Useful for dumping points when teammate is winning.
   * @param cards Array of cards
   * @returns Highest point card
   */

  private highestPointCard(cards: string[]): string {
    if (cards.length === 0) return "";

    return cards.reduce((highest, current) => {
      return this.getCardPoints(current) > this.getCardPoints(highest)
        ? current
        : highest;
    });
  }

  /**
   * Get the point value of a card.
   * @param card Card string
   * @returns Point value (J=3, 9=2, A=1, 10=1, K=0, Q=0)
   */
  private getCardPoints(card: string): number {
    if (!card || card.length < 3) return 0;
    const rank = card.slice(2);

    const pointMap: { [key: string]: number } = {
      J: 3,
      "9": 2,
      A: 1,
      "10": 1,
      K: 0,
      Q: 0,
    };

    return pointMap[rank] || 0;
  }

  /**
   * Get the suit of a card.
   * Card format: [deck] [suit] [rank) (e.g., "1EK" deck 1, suit E, rank
   * @param card Card string
   * @returns Suit character
   */
  private getCardSuit(card: string): string {
    if (!card || card.length < 3) return "";
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
    const cardPart = firstCard.split("-")[0];
    const leadSuit = this.getCardSuit(cardPart);

    return leadSuit;
  }

  /**
   * Get numeric value of a card for comparison.
   * @param card Card string
   * @returns Numeric value for comparison
   */
  private getCardValue(card: string): number {
    if (!card || card.length < 3) return 0;

    // FIX: Slicing from index 2 to handle "10" (length 2 rank) and "J" (length 1 rank)
    const rank = card.slice(2);

    // Point system: J=3, 9=2, A=1, 10=1, К=0, Q=0

    const pointMap: { [key: string]: number } = {
      J: 3,
      "9": 2,
      A: 1,
      "10": 1,
      K: 0,
      Q: 0,
    };

    const points = pointMap[rank] || 0;

    // For tie-breaking when points are equal: A > 10, K > Q
    // Use a secondary value for ordering
    const tieBreaker: { [key: string]: number } = {
      J: 0, // Highest points, no tie possible
      "9": 0, // Second highest points, no tie possible
      A: 2, // Points=1, but higher than 10
      "10": 1, // Points=1, but lower than A
      K: 2, // Points=0, but higher than Q
      Q: 1, // Points=0, but lower than K
    };

    // Return combined value: points * 10 + tie-breaker for proper ordering
    return points * 10 + (tieBreaker[rank] || 0);
  }
}
