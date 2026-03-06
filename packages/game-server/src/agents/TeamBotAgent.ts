import { ICardGame } from "../core/models/ICardGame";

/**
 * Bot bidding decision interface
 */
interface BotBidDecision {
  action: "bid" | "pass" | "double" | "re-double";
  bidValue?: number;
  suit?: string;
  bidSelectionType?: "direct" | "modifier" | null;
  bidModifier?: number;
  clickOrder?: "bidFirst" | "suitFirst" | null;
  noTrumpType?: "Noes" | "Pass" | "No-Trump" | null;
}

/**
 * Suit profile interface for hand analysis
 */
interface SuitProfile {
  length: number;
  jacks: number;
  nines: number;
  aces: number;
  points: number;
  cards: string[];
}

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
      // Bot has no cards - likely called during state transition or after all cards played
      console.log(
        `[BOT AGENT] Warning: Bot ${botAgentId} has no legal moves. Cards in hand: ${gameState[botToken]?.length || 0}. Game phase might be transitioning.`,
      );
      // Return empty string to indicate no move available
      return "";
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
      gameState.trumpSuit,
    );
    const winningPlayerId = winningCard
      ? this.extractPlayerFromCardDrop(winningCard)
      : null;
    const teammateWinning = this.isTeammateWinning(gameState, botAgentId);

    // Debug logging
    // console.log("[BOT AGENT DEBUG]", {
    //   botAgentId,
    //   currentRoundCards,
    //   winningCard,
    //   winningPlayerId,
    //   teammateWinning,
    //   botTeam: this.getTeamId(botAgentId, gameState),
    //   winnerTeam: winningPlayerId
    //     ? this.getTeamId(winningPlayerId, gameState)
    //     : null,
    // });

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

    // BIDDING INTELLIGENCE: Extract Jack knowledge from bidding phase
    const jackKnowledge = this.extractJackKnowledge(gameState, botAgentId);
    const safeSuits = this.getSafeSuits(gameState, botAgentId, jackKnowledge);

    // NOES INTELLIGENCE: Extract which players are missing which suits
    const noesKnowledge = this.extractNoesKnowledge(gameState);
    const teammates = this.getTeammates(botAgentId, gameState);
    const teammateMissingSuits: { [playerId: string]: string[] } = {};
    const opponentMissingSuits: { [playerId: string]: string[] } = {};

    Object.keys(noesKnowledge).forEach((playerId) => {
      if (teammates.includes(playerId)) {
        teammateMissingSuits[playerId] = noesKnowledge[playerId];
      } else {
        opponentMissingSuits[playerId] = noesKnowledge[playerId];
      }
    });

    // Add bidding intelligence to reasoning for logging
    const teammateJackSuits: string[] = [];
    Object.values(jackKnowledge.teammateJacks).forEach((jacks: any) => {
      jacks.forEach((suit: string) => {
        if (!teammateJackSuits.includes(suit)) {
          teammateJackSuits.push(suit);
        }
      });
    });

    const opponentJackSuits: string[] = [];
    Object.values(jackKnowledge.opponentJacks).forEach((jacks: any) => {
      jacks.forEach((suit: string) => {
        if (!opponentJackSuits.includes(suit)) {
          opponentJackSuits.push(suit);
        }
      });
    });

    (reasoning as any).biddingIntel = {
      teammateJacks:
        teammateJackSuits.length > 0 ? teammateJackSuits.join(",") : "None",
      opponentJacks:
        opponentJackSuits.length > 0 ? opponentJackSuits.join(",") : "None",
      safeSuits: safeSuits.length > 0 ? safeSuits.join(",") : "None",
      teammateMissingSuits:
        Object.keys(teammateMissingSuits).length > 0
          ? Object.entries(teammateMissingSuits)
              .map(([p, s]) => `${p}:${s.join(",")}`)
              .join(" | ")
          : "None",
      opponentMissingSuits:
        Object.keys(opponentMissingSuits).length > 0
          ? Object.entries(opponentMissingSuits)
              .map(([p, s]) => `${p}:${s.join(",")}`)
              .join(" | ")
          : "None",
    };

    console.log(
      "\n╔══════════════════════════════════════════════════════════════════════╗",
    );
    console.log(
      "║                  BOT DECISION REASONING OBSERVER                     ║",
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════════════╝",
    );

    // Log bidding intelligence
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(
      "│ BIDDING INTELLIGENCE:                                                │",
    );
    console.log(
      `│ Teammate Jacks: ${(reasoning as any).biddingIntel.teammateJacks.padEnd(52)} │`,
    );
    console.log(
      `│ Opponent Jacks: ${(reasoning as any).biddingIntel.opponentJacks.padEnd(52)} │`,
    );
    console.log(
      `│ Safe Suits: ${(reasoning as any).biddingIntel.safeSuits.padEnd(56)} │`,
    );
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(
      "│ NOES INTELLIGENCE (Missing Suits):                                   │",
    );
    console.log(
      `│ Teammates: ${(reasoning as any).biddingIntel.teammateMissingSuits.substring(0, 57).padEnd(57)} │`,
    );
    console.log(
      `│ Opponents: ${(reasoning as any).biddingIntel.opponentMissingSuits.substring(0, 57).padEnd(57)} │`,
    );

    // CARD COUNTING: Analyze remaining cards per suit
    const myCards = gameState[botToken] || [];
    const playedPerSuit = this.getPlayedCardsPerSuit(playedCards);
    const remainingTrumps = this.countRemainingTrumps(trumpSuit, playedCards);

    // STRATEGY 0: VOID SUIT EXPLOITATION - If bot has all remaining cards of a suit, play it!
    // This is a guaranteed winner strategy especially in No-Trump games
    const isNoesGame = !trumpSuit || gameState.trumpSuit === "N";

    for (const card of legalMoves) {
      const suit = this.getCardSuit(card);

      // Check if this is a void suit (others can't follow)
      if (!this.canOthersFollowSuit(suit, myCards, playedCards)) {
        // Bot has ALL remaining cards of this suit!
        const myCardsInSuit = myCards.filter(
          (c) => this.getCardSuit(c) === suit,
        );
        const selectedCard = this.highestCard(myCardsInSuit); // Play highest to win

        reasoning.strategy = "VOID_SUIT_GUARANTEED_WIN";
        reasoning.reasoning =
          `CARD COUNTING: Detected VOID SUIT (${suit}). ` +
          `Bot has ALL ${
            myCardsInSuit.length
          } remaining cards of suit ${suit}: [${myCardsInSuit.join(", ")}]. ` +
          `No other player can follow this suit - GUARANTEED WIN! ` +
          `Playing highest card [${selectedCard}] to maximize points captured. ` +
          `Can continue exploiting this suit in future rounds.`;
        reasoning.selectedCard = selectedCard;
        this.logReasoning(reasoning);
        return selectedCard;
      }
    }

    // STRATEGY 0.5: TRUMP EXHAUSTION - If team dominates trump (8+ cards, 2 Jacks),
    // lead with trump Jack to exhaust opponent trumps and protect other Jacks
    if (
      trumpSuit &&
      gameState.trumpSuit !== "N" &&
      currentRoundCards.length === 0
    ) {
      const teamTrumpCount = this.countTeamTrumpCards(
        gameState,
        botAgentId,
        botToken,
        trumpSuit,
      );
      const teamTrumpJacks = this.countTeamTrumpJacks(
        gameState,
        botAgentId,
        botToken,
        trumpSuit,
      );

      // If team has 8+ trumps AND 2 trump Jacks, opponents only have 4 trumps max
      if (teamTrumpCount >= 8 && teamTrumpJacks >= 2) {
        // Look for trump Jack in hand
        const trumpJacks = legalMoves.filter(
          (card) =>
            this.getCardSuit(card) === trumpSuit && card.slice(2) === "J",
        );

        if (trumpJacks.length > 0) {
          const selectedCard = trumpJacks[0]; // Play any trump Jack
          const opponentTrumpMax = 12 - teamTrumpCount; // Total 12 trumps per suit

          reasoning.strategy = "TRUMP_EXHAUSTION";
          reasoning.reasoning =
            `TRUMP DOMINANCE: Team controls ${teamTrumpCount}/12 trump cards (${trumpSuit}) with ${teamTrumpJacks} Jack(s). ` +
            `Opponents have at most ${opponentTrumpMax} trumps remaining. ` +
            `STRATEGY: Leading with trump Jack [${selectedCard}] to: ` +
            `(1) WIN this round with highest trump, ` +
            `(2) EXTRACT opponent trumps from their hands, ` +
            `(3) PROTECT other-suit Jacks from being trumped after opponents run out of trump. ` +
            `Once opponents are trump-free, our Jacks in other suits become safe to play. ` +
            `This is an aggressive control strategy to secure multiple future rounds.`;
          reasoning.selectedCard = selectedCard;
          this.logReasoning(reasoning);
          return selectedCard;
        }
      }
    }

    // STRATEGY 1: If teammate is winning, throw high-point cards to maximize team points
    // BUT: In Trump games, don't waste trump cards if teammate already winning with trump
    if (teammateWinning) {
      let selectedCard: string;
      let cardPoints: number;

      // TRUMP CONSERVATION: Don't waste trump cards if teammate winning with trump
      if (trumpSuit && gameState.trumpSuit !== "N") {
        const winningCardValue = winningCard?.split("-")[0];
        const winningSuit = winningCardValue
          ? this.getCardSuit(winningCardValue)
          : null;

        // If teammate is winning with trump, conserve our trump cards
        if (winningSuit === trumpSuit) {
          const nonTrumpMoves = legalMoves.filter(
            (card) => this.getCardSuit(card) !== trumpSuit,
          );

          if (nonTrumpMoves.length > 0) {
            // Throw highest-point non-trump card
            selectedCard = this.highestPointCard(nonTrumpMoves);
            cardPoints = this.getCardPoints(selectedCard);
            const trumpCardsInHand = legalMoves.filter(
              (c) => this.getCardSuit(c) === trumpSuit,
            );
            reasoning.strategy = "TEAMMATE_WINNING_TRUMP_CONSERVED";
            reasoning.reasoning =
              `Teammate (${winningPlayerId}) winning with TRUMP card ${winningCardValue}. ` +
              `TRUMP CONSERVATION: Saving our ${
                trumpCardsInHand.length
              } trump cards [${trumpCardsInHand.join(
                ", ",
              )}] for critical rounds. ` +
              `${remainingTrumps} trump cards remain in play. ` +
              `Throwing highest-point NON-TRUMP card [${selectedCard}] (${cardPoints} points). ` +
              `Available non-trump cards: [${nonTrumpMoves.join(", ")}].`;
            reasoning.selectedCard = selectedCard;
            this.logReasoning(reasoning);
            return selectedCard;
          } else {
            // Only have trump cards - throw LOWEST trump to conserve high ones
            selectedCard = this.lowestCard(legalMoves);
            cardPoints = this.getCardPoints(selectedCard);
            const trumpCardsInHand = legalMoves.filter(
              (c) => this.getCardSuit(c) === trumpSuit,
            );
            reasoning.strategy = "TEAMMATE_WINNING_TRUMP_CONSERVED";
            reasoning.reasoning =
              `Teammate (${winningPlayerId}) winning with TRUMP card ${winningCardValue}. ` +
              `TRUMP CONSERVATION: Have only trump cards [${trumpCardsInHand.join(
                ", ",
              )}]. ` +
              `Throwing LOWEST trump [${selectedCard}] (${cardPoints} points) to conserve high trumps for future rounds. ` +
              `${remainingTrumps} trump cards remain in play. High trumps saved for winning critical rounds.`;
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
        // Trump game - teammate NOT winning with trump, throw highest-point card
        selectedCard = this.highestPointCard(legalMoves);
        cardPoints = this.getCardPoints(selectedCard);
        reasoning.strategy = "TEAMMATE_WINNING";
        reasoning.reasoning =
          `Teammate (${winningPlayerId}) is currently winning (not with trump). ` +
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
      trumpSuit,
    );

    if (winningMoves.length > 0) {
      // We have cards that can currently win the round

      // Filter for "Highest" card - cards that are the highest remaining in their suit/trump
      const highestCardMoves = winningMoves.filter((card) =>
        this.isHighestCard(card, playedCards, trumpSuit),
      );

      if (highestCardMoves.length > 0) {
        // We have the Highest card that wins! Play the highest card.
        const selectedCard = this.highestCard(highestCardMoves);
        const selectedSuit = this.getCardSuit(selectedCard);
        const selectedRank = selectedCard.slice(2);
        const remainingInSuit = this.countRemainingInSuit(
          selectedSuit,
          playedCards,
        );

        reasoning.strategy = "HIGHEST_CARD_WIN";
        reasoning.reasoning =
          `CARD COUNTING: Have (${highestCardMoves.length}) - highest card(s) that can win (all other higher cards are already played). ` +
          `Highest cards: [${highestCardMoves.join(", ")}]. ` +
          `Selected [${selectedCard}] - rank ${selectedRank} is the highest of ${remainingInSuit} remaining cards in suit ${selectedSuit}. ` +
          `All higher-ranked cards in this suit have been played. ` +
          `This is a GUARANTEED SAFE WIN - no card in opponents' hands can beat this!`;
        reasoning.selectedCard = selectedCard;
        this.logReasoning(reasoning);
        return selectedCard;
      }

      // We can win, but we don't hold the Boss card.
      const isLastPlayer = this.isLastPlayerInRound(
        currentRoundCards.length,
        gameState,
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
          `but NONE are highest remaining cards (higher cards unknown - those are still left to play). ` +
          `Not the last player, opponents still to play. ` +
          `RISK: Playing high card could lose to unknown higher cards (e.g., playing 9 when J might still be out). ` +
          `DECISION: Duck with the lowest card [${selectedCard}] to avoid waste and save high cards for safer opportunities.`;
        reasoning.selectedCard = selectedCard;
        this.logReasoning(reasoning);
        return selectedCard;
      }
    }

    // STRATEGY 2.5: NOES-BASED TRUMP OPPORTUNITY
    // If teammate is missing a suit (from Noes bid), play that suit for teammate to trump
    // Avoid suits where opponent is missing (they might trump our high card)
    if (trumpSuit && currentRoundCards.length === 0 && !isNoesGame) {
      // Find suits where teammates are missing (can trump in trump games)
      const teammateTrumpSuits: string[] = [];
      Object.values(teammateMissingSuits).forEach((suits) => {
        suits.forEach((suit) => {
          if (!teammateTrumpSuits.includes(suit)) {
            teammateTrumpSuits.push(suit);
          }
        });
      });

      // Find suits where opponents are missing (risky - they can trump)
      const opponentTrumpSuits: string[] = [];
      Object.values(opponentMissingSuits).forEach((suits) => {
        suits.forEach((suit) => {
          if (!opponentTrumpSuits.includes(suit)) {
            opponentTrumpSuits.push(suit);
          }
        });
      });

      // Look for cards in suits where teammate can trump (but we don't have Jack)
      const teammateTrumpMoves = legalMoves.filter((card) => {
        const suit = this.getCardSuit(card);
        const rank = card.slice(2);
        return teammateTrumpSuits.includes(suit) && rank !== "J";
      });

      if (teammateTrumpMoves.length > 0) {
        // Play highest non-Jack card in teammate's void suit
        const selectedCard = this.highestCard(
          teammateTrumpMoves.filter((c) => c.slice(2) !== "J"),
        );
        const selectedSuit = this.getCardSuit(selectedCard);

        reasoning.strategy = "NOES_TEAMMATE_TRUMP";
        reasoning.reasoning =
          `NOES INTELLIGENCE: Teammate is missing ${selectedSuit} (signaled during bidding). ` +
          `Leading with ${selectedCard} - teammate will trump this with ${trumpSuit} to win the round. ` +
          `This is a safe play even without Jack because teammate's trump will beat opponents. ` +
          `Trump game advantage: forcing teammate to use trump strategically.`;
        reasoning.selectedCard = selectedCard;
        this.logReasoning(reasoning);
        return selectedCard;
      }

      // Avoid leading with high cards in suits where opponent can trump
      if (opponentTrumpSuits.length > 0) {
        const riskyMoves = legalMoves.filter((card) => {
          const suit = this.getCardSuit(card);
          const rank = card.slice(2);
          // Risky if: opponent missing this suit AND we have high card (J, 9, A)
          return (
            opponentTrumpSuits.includes(suit) &&
            (rank === "J" || rank === "9" || rank === "A")
          );
        });

        if (riskyMoves.length > 0) {
          // Avoid these risky moves - play from safe suits instead
          const safeMoves = legalMoves.filter(
            (card) => !riskyMoves.includes(card),
          );

          if (safeMoves.length > 0) {
            const selectedCard = this.lowestCard(safeMoves);
            const avoidedSuits = opponentTrumpSuits.join(",");

            reasoning.strategy = "NOES_AVOID_OPPONENT_TRUMP";
            reasoning.reasoning =
              `NOES INTELLIGENCE: Opponent is missing ${avoidedSuits} (signaled during bidding). ` +
              `AVOIDING high cards in these suits - opponent might trump them. ` +
              `Playing safer card ${selectedCard} instead. This prevents wasting valuable ` +
              `cards (J, 9, A) to opponent's trump. Risky cards avoided: [${riskyMoves.join(", ")}].`;
            reasoning.selectedCard = selectedCard;
            this.logReasoning(reasoning);
            return selectedCard;
          }
        }
      }
    }

    // STRATEGY 3: Cannot win or chose not to win - Duck strategy
    // BIDDING-AWARE: Prefer playing safe suits (where teammate has Jack or opponent doesn't)
    const safeSuitMoves = legalMoves.filter((card) =>
      safeSuits.includes(this.getCardSuit(card)),
    );

    let selectedCard: string;
    if (safeSuitMoves.length > 0 && currentRoundCards.length === 0) {
      // Leading the round - prefer safe suits
      selectedCard = this.lowestCard(safeSuitMoves);
      const selectedSuit = this.getCardSuit(selectedCard);
      const teammateHasJack = teammateJackSuits.includes(selectedSuit);

      reasoning.strategy = "DUCK_SAFE_SUIT";
      reasoning.reasoning =
        `Leading round. Using BIDDING INTELLIGENCE: Playing safe suit ${selectedSuit}. ` +
        (teammateHasJack
          ? `Teammate indicated Jack in ${selectedSuit} during bidding - safer to play this suit. `
          : `Opponent likely doesn't have Jack in ${selectedSuit} - safer to play. `) +
        `Ducking with lowest safe card [${selectedCard}] to minimize loss while giving ` +
        `better odds for teammate to win. Safe suits available: ${safeSuits.join(",")}. ` +
        `Legal moves: [${legalMoves.join(", ")}].`;
    } else {
      // No safe moves or following in round - play lowest
      selectedCard = this.lowestCard(legalMoves);
      reasoning.strategy = "DUCK_NO_WIN";
      reasoning.reasoning =
        `No winning moves available from legal cards: [${legalMoves.join(
          ", ",
        )}]. ` +
        `Current winning card: ${winningCard?.split("-")[0] || "None"}. ` +
        `Cannot beat current winning card, so ducking with lowest card to minimize loss. ` +
        `Saving higher cards for future rounds where we might have better opportunities.`;
    }

    reasoning.selectedCard = selectedCard;
    this.logReasoning(reasoning);
    return selectedCard;
  }

  /**
   * Log the reasoning behind a bot's decision
   */
  private logReasoning(reasoning: any): void {
    console.log(
      "┌──────────────────────────────────────────────────────────────────────┐",
    );
    console.log(`│ Bot ID: ${reasoning.botId.padEnd(60)} │`);
    console.log(`│ Game Mode: ${reasoning.gameMode.padEnd(57)} │`);
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(
      `│ Current Round Cards: ${String(reasoning.currentRoundCardsCount).padEnd(
        47,
      )} │`,
    );
    console.log(
      `│ Total Cards Played: ${String(reasoning.totalPlayedCards).padEnd(48)} │`,
    );
    console.log(
      `│ Legal Moves Available: ${String(reasoning.legalMovesCount).padEnd(
        45,
      )} │`,
    );
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );

    if (reasoning.currentWinningCard) {
      console.log(
        `│ Currently Winning: ${reasoning.currentWinningCard.padEnd(49)} │`,
      );
      console.log(
        `│ Winning Player: ${(
          reasoning.currentWinningPlayer || "Unknown"
        ).padEnd(52)} │`,
      );
    }

    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(`│ STRATEGY: ${reasoning.strategy.padEnd(58)} │`);
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(
      "│ REASONING:                                                           │",
    );

    // Wrap reasoning text to fit in box
    const maxWidth = 68;
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
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(`│ SELECTED CARD: ${reasoning.selectedCard.padEnd(53)} │`);
    console.log(
      "└──────────────────────────────────────────────────────────────────────┘\n",
    );
  }

  /**
   * Check if I am the last player in the current round
   */
  private isLastPlayerInRound(
    currentCount: number,
    gameState: ICardGame,
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
    playedCards: Set<string>,
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
   * Each suit has 12 cards total (6 ranks x 2 decks): J, 9, A, 10, K, Q
   * @param suit The suit to check
   * @param playedCards Set of all played cards
   * @returns Array of remaining cards in the suit
   */
  private getRemainingCardsInSuit(
    suit: string,
    playedCards: Set<string>,
  ): string[] {
    const ranks = ["J", "9", "A", "10", "K", "Q"];
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
   * @param myCards Bot's current hand
   * @param playedCards Set of all played cards
   * @returns True if other players likely have cards of this suit
   */
  private canOthersFollowSuit(
    suit: string,
    myCards: string[],
    playedCards: Set<string>,
  ): boolean {
    const remainingInSuit = this.getRemainingCardsInSuit(suit, playedCards);
    const myCardsInSuit = myCards.filter(
      (card) => this.getCardSuit(card) === suit,
    );

    // If all remaining cards of this suit are in my hand, others cannot follow
    return myCardsInSuit.length < remainingInSuit.length;
  }

  /**
   * Count remaining trump cards that haven't been played.
   * Critical for trump game strategy - avoid wasting trumps.
   * @param trumpSuit The trump suit
   * @param playedCards Set of all played cards
   * @returns Count of remaining trump cards
   */
  private countRemainingTrumps(
    trumpSuit: string | undefined,
    playedCards: Set<string>,
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
    playedCards: Set<string>,
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
    myCards: string[],
    playedCards: Set<string>,
  ): boolean {
    const highestRemaining = this.getHighestRemainingInSuit(suit, playedCards);
    if (!highestRemaining) return false;

    return myCards.includes(highestRemaining);
  }

  /**
   * CARD COUNTING: Determines if a card is the BOSS card (highest remaining in its suit).
   * Uses card counting to check if all higher-ranked cards of the same suit have been played.
   * Example: If both J's are played, then 9 becomes the boss. If 9's are also played, A becomes boss.
   * Each suit has 12 cards total (6 ranks x 2 decks): J, 9, A, 10, K, Q
   * @param card The card to check
   * @param playedCards Set of all played cards
   * @param trumpSuit The trump suit (unused in this method but kept for compatibility)
   * @returns True if this card is the highest remaining card in its suit
   */
  private isHighestCard(
    card: string,
    playedCards: Set<string>,
    trumpSuit?: string,
  ): boolean {
    const suit = this.getCardSuit(card);
    const ranks = ["J", "9", "A", "10", "K", "Q"]; // Descending order of power
    const myRank = card.slice(2);

    const myRankIndex = ranks.indexOf(myRank);
    if (myRankIndex === -1) return false;

    // CARD COUNTING: Loop through all ranks higher than my rank
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
    // This card is now the highest remaining card in its suit
    // Example: Both 1HJ and 2HJ played -> 1H9 and 2H9 becomes boss
    return true;
  }

  private getWinningMoves(
    legalMoves: string[],
    currentRoundCards: string[],
    trumpSuit?: string,
  ): string[] {
    return legalMoves.filter((card) =>
      this.willCardWin(card, currentRoundCards, trumpSuit),
    );
  }

  private willCardWin(
    myCard: string,
    currentRoundCards: string[],
    trumpSuit?: string,
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
    // console.log("[BOT AGENT] Lead suit detected:", leadSuit);

    if (!leadSuit) {
      return playerCards; // No clear lead suit, any card is legal
    }

    // Check if bot has cards of the lead suit
    const suitCards = playerCards.filter(
      (card) => this.getCardSuit(card) === leadSuit,
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
      gameState.trumpSuit,
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
    trumpSuit?: string,
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
    gameState: ICardGame,
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
      (p: any) => p.playerId === playerId,
    );

    if (playerIndex === -1) return 0; // Default to team A if not found

    // Team assignment: even positions (0,2,4) = Team A, odd positions (1,3,5) = Team B
    return playerIndex % 2;
  }

  /**
   * Get teammate player IDs (other players on the same team)
   * @param playerId The player's ID
   * @param gameState Current game state
   * @returns Array of teammate player IDs (excluding the player themselves)
   */
  private getTeammates(playerId: string, gameState: ICardGame): string[] {
    if (!gameState.players) return [];

    const teamId = this.getTeamId(playerId, gameState);
    const teammates: string[] = [];

    gameState.players.forEach((p: any) => {
      if (
        p.playerId !== playerId &&
        this.getTeamId(p.playerId, gameState) === teamId
      ) {
        teammates.push(p.playerId);
      }
    });

    return teammates;
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

  /**
   * =============================================================================
   * BIDDING INTELLIGENCE EXTRACTION
   * =============================================================================
   * Extract information from bidding phase to inform card play decisions
   */

  /**
   * Extract Jack knowledge from bidding history.
   * Players signal Jacks during bidding using clickOrder:
   * - bidFirst = has Jack in that suit
   * - suitFirst = no Jack in that suit
   */
  private extractJackKnowledge(
    gameState: ICardGame,
    botAgentId: string,
  ): {
    teammateJacks: { [playerId: string]: string[] }; // playerId -> suits where they have Jacks
    opponentJacks: { [playerId: string]: string[] }; // playerId -> suits where they have Jacks
    allKnownJacks: { [suit: string]: string[] }; // suit -> playerIds who have Jacks
  } {
    const bidHistory = gameState.bidHistory || [];
    const teamId = this.getTeamId(botAgentId, gameState);

    const teammateJacks: { [playerId: string]: string[] } = {};
    const opponentJacks: { [playerId: string]: string[] } = {};
    const allKnownJacks: { [suit: string]: string[] } = {};

    bidHistory.forEach((bid) => {
      if (bid.action === "bid" && bid.suit && bid.clickOrder === "bidFirst") {
        // bidFirst signals Jack in this suit
        const bidderTeam = this.getTeamId(bid.playerId, gameState);
        const isTeammate = bidderTeam === teamId && bid.playerId !== botAgentId;
        const isOpponent = bidderTeam !== teamId;

        if (isTeammate) {
          if (!teammateJacks[bid.playerId]) {
            teammateJacks[bid.playerId] = [];
          }
          if (!teammateJacks[bid.playerId].includes(bid.suit)) {
            teammateJacks[bid.playerId].push(bid.suit);
          }
        }

        if (isOpponent) {
          if (!opponentJacks[bid.playerId]) {
            opponentJacks[bid.playerId] = [];
          }
          if (!opponentJacks[bid.playerId].includes(bid.suit)) {
            opponentJacks[bid.playerId].push(bid.suit);
          }
        }

        // Track all known Jacks by suit
        if (!allKnownJacks[bid.suit]) {
          allKnownJacks[bid.suit] = [];
        }
        if (!allKnownJacks[bid.suit].includes(bid.playerId)) {
          allKnownJacks[bid.suit].push(bid.playerId);
        }
      }
    });

    return { teammateJacks, opponentJacks, allKnownJacks };
  }

  /**
   * Determine if it's safer to play a particular suit based on bidding knowledge.
   * Safer suits are those where:
   * - Teammate has Jack (they can win if they play after us)
   * - Opponent doesn't have Jack (less risk of being trumped if we play high card in that suit)
   */
  private getSafeSuits(
    gameState: ICardGame,
    botAgentId: string,
    jackKnowledge: any,
  ): string[] {
    const suits = ["H", "E", "D", "C"];
    const safeSuits: string[] = [];

    suits.forEach((suit) => {
      const hasTeammateJack = Object.values(jackKnowledge.teammateJacks).some(
        (jacks: any) => jacks.includes(suit),
      );
      const hasOpponentJack = Object.values(jackKnowledge.opponentJacks).some(
        (jacks: any) => jacks.includes(suit),
      );

      // Safer if teammate has Jack OR opponent doesn't have Jack
      if (hasTeammateJack || !hasOpponentJack) {
        safeSuits.push(suit);
      }
    });

    return safeSuits;
  }

  /**
   * Count trump cards held by the team.
   * Counts trump cards in:
   * - Bot's current hand
   * - Cards already played/won by the team
   * This helps determine if the team has enough trumps to exhaust opponents' trumps.
   */
  private countTeamTrumpCards(
    gameState: ICardGame,
    botAgentId: string,
    botToken: string,
    trumpSuit: string,
  ): number {
    let count = 0;

    // Count trump cards in bot's hand
    const botCards = gameState[botToken] || [];
    count += botCards.filter(
      (card) => this.getCardSuit(card) === trumpSuit,
    ).length;

    // Count trump cards in team's won pile
    const teamId = this.getTeamId(botAgentId, gameState);
    const teamCards =
      teamId === 0 ? gameState.teamACards : gameState.teamBCards;

    if (Array.isArray(teamCards)) {
      count += teamCards.filter(
        (card) => this.getCardSuit(card) === trumpSuit,
      ).length;
    }

    // Count trump cards in current round if teammate played them
    const currentRoundCards =
      gameState.dropCardPlayer || gameState.dropDetails || [];
    if (Array.isArray(currentRoundCards)) {
      currentRoundCards.forEach((drop) => {
        const [card, playerId] = drop.split("-");
        if (this.getCardSuit(card) === trumpSuit) {
          // Check if this is a teammate
          const playerTeamId = this.getTeamId(playerId, gameState);
          if (playerTeamId === teamId) {
            count++;
          }
        }
      });
    }

    return count;
  }

  /**
   * Count trump Jacks held by the team.
   * Similar to countTeamTrumpCards but specifically for Jacks.
   */
  private countTeamTrumpJacks(
    gameState: ICardGame,
    botAgentId: string,
    botToken: string,
    trumpSuit: string,
  ): number {
    let count = 0;

    // Count trump Jacks in bot's hand
    const botCards = gameState[botToken] || [];
    count += botCards.filter(
      (card) => this.getCardSuit(card) === trumpSuit && card.slice(2) === "J",
    ).length;

    // Count trump Jacks in team's won pile
    const teamId = this.getTeamId(botAgentId, gameState);
    const teamCards =
      teamId === 0 ? gameState.teamACards : gameState.teamBCards;

    if (Array.isArray(teamCards)) {
      count += teamCards.filter(
        (card) => this.getCardSuit(card) === trumpSuit && card.slice(2) === "J",
      ).length;
    }

    // Count trump Jacks in current round if teammate played them
    const currentRoundCards =
      gameState.dropCardPlayer || gameState.dropDetails || [];
    if (Array.isArray(currentRoundCards)) {
      currentRoundCards.forEach((drop) => {
        const [card, playerId] = drop.split("-");
        if (this.getCardSuit(card) === trumpSuit && card.slice(2) === "J") {
          const playerTeamId = this.getTeamId(playerId, gameState);
          if (playerTeamId === teamId) {
            count++;
          }
        }
      });
    }

    return count;
  }

  /**
   * Check if bot is the last player in team to bid.
   * Returns true if bot is the third teammate in bidding order.
   */
  private isLastTeamPlayer(botPlayerId: string, gameState: ICardGame): boolean {
    const teamId = this.getTeamId(botPlayerId, gameState);
    const teammates = this.getTeammates(botPlayerId, gameState);
    const bidHistory = gameState.bidHistory || [];

    // Count how many teammates have acted in this auction
    const teammateActions = bidHistory.filter((bid) =>
      teammates.includes(bid.playerId),
    );

    // If both teammates have acted, bot is last player
    return teammateActions.length === 2;
  }

  /**
   * Check if first teammate made a strong bid (direct bid with suit).
   * A strong bid is one where bidSelectionType is "direct" (not "modifier").
   * Auto-generated "Pass (28)" bids (clickOrder: null) are NOT strong bids.
   */
  private didFirstTeammateMakeStrongBid(
    botPlayerId: string,
    gameState: ICardGame,
  ): {
    madeStrongBid: boolean;
    firstBid: any;
    secondPassed: boolean;
  } {
    const teamId = this.getTeamId(botPlayerId, gameState);
    const teammates = this.getTeammates(botPlayerId, gameState);
    const bidHistory = gameState.bidHistory || [];

    // Find first teammate bid
    const firstTeamBid = bidHistory.find(
      (bid) => this.getTeamId(bid.playerId, gameState) === teamId,
    );

    if (!firstTeamBid || firstTeamBid.action !== "bid") {
      return { madeStrongBid: false, firstBid: null, secondPassed: false };
    }

    // Auto-generated "Pass (28)" (weak hand pass) is NOT a strong bid
    const isAutoGeneratedPass =
      firstTeamBid.noTrumpType === "Pass" &&
      firstTeamBid.clickOrder === null &&
      firstTeamBid.bidValue === 28;

    // Check if it's a strong bid (direct selection and not auto-generated pass)
    const isStrong =
      firstTeamBid.bidSelectionType === "direct" && !isAutoGeneratedPass;

    // Find if second teammate passed
    const secondTeammateAction = bidHistory.find((bid, idx) => {
      const prevIdx = bidHistory.indexOf(firstTeamBid);
      return (
        idx > prevIdx &&
        teammates.includes(bid.playerId) &&
        bid.playerId !== firstTeamBid.playerId
      );
    });

    const secondPassed = secondTeammateAction?.action === "pass";

    return {
      madeStrongBid: isStrong,
      firstBid: firstTeamBid,
      secondPassed: secondPassed || false,
    };
  }

  /**
   * Check if two teammates bid the same suit.
   * Returns the suit if true, null otherwise.
   */
  private getTwoTeammatesSameSuit(
    botPlayerId: string,
    gameState: ICardGame,
  ): { sameSuit: string | null; cardCounts: number[] } {
    const teamId = this.getTeamId(botPlayerId, gameState);
    const bidHistory = gameState.bidHistory || [];

    // Get all teammate bids (excluding bot's own)
    const teammateBids = bidHistory.filter(
      (bid) =>
        bid.action === "bid" &&
        bid.suit &&
        this.getTeamId(bid.playerId, gameState) === teamId &&
        bid.playerId !== botPlayerId,
    );

    // Check if two teammates bid the same suit
    if (teammateBids.length >= 2) {
      const suits = teammateBids.map((b) => b.suit);
      const suitCounts: { [suit: string]: number } = {};

      suits.forEach((suit) => {
        if (suit) {
          suitCounts[suit] = (suitCounts[suit] || 0) + 1;
        }
      });

      for (const suit in suitCounts) {
        if (suitCounts[suit] >= 2) {
          return { sameSuit: suit, cardCounts: [] };
        }
      }
    }

    return { sameSuit: null, cardCounts: [] };
  }

  /**
   * Extract Noes knowledge: which players are missing which suits.
   * When a player bids "Noes", it means they're missing the previously bid suit.
   * "+1 Noes" means they're missing the suit before the previous one, etc.
   */
  private extractNoesKnowledge(gameState: ICardGame): {
    [playerId: string]: string[];
  } {
    const bidHistory = gameState.bidHistory || [];
    const noesKnowledge: { [playerId: string]: string[] } = {};

    bidHistory.forEach((bid, idx) => {
      if (bid.action === "bid" && bid.suit === "N") {
        // This player bid Noes - find which suit they're missing
        const bidModifier = bid.bidModifier || 0;

        // Look back in bid history to find the suit they're signaling about
        let targetIdx = idx - 1 - bidModifier;

        while (targetIdx >= 0) {
          const prevBid = bidHistory[targetIdx];
          if (
            prevBid.action === "bid" &&
            prevBid.suit &&
            prevBid.suit !== "N"
          ) {
            // Found the suit this player is missing
            if (!noesKnowledge[bid.playerId]) {
              noesKnowledge[bid.playerId] = [];
            }
            noesKnowledge[bid.playerId].push(prevBid.suit);
            break;
          }
          targetIdx--;
        }
      }
    });

    return noesKnowledge;
  }

  /**
   * Find the best non-Noes suit from suit profiles.
   * Returns the suit with the highest trick estimation.
   */
  private findBestNonNoesSuit(suitProfiles: {
    [suit: string]: SuitProfile;
  }): string | null {
    const suits = ["H", "E", "D", "C"];
    let bestSuit: string | null = null;
    let bestTricks = 0;

    suits.forEach((suit) => {
      const profile = suitProfiles[suit];
      const tricks = this.estimateTricksForSuit(profile);

      if (tricks > bestTricks) {
        bestTricks = tricks;
        bestSuit = suit;
      }
    });

    return bestSuit;
  }

  /**
   * Format suit breakdown for logging
   */
  private formatSuitBreakdown(suitProfiles: {
    [suit: string]: SuitProfile;
  }): string[] {
    const suits = ["H", "E", "D", "C"];
    const formatted = suits.map((s) => {
      const p = suitProfiles[s];
      return `${s}:${p.length}(J:${p.jacks},9:${p.nines},A:${p.aces},pts:${p.points})`;
    });

    // Split into two lines to fit within border width
    return [
      `${formatted[0]} ${formatted[1]}`, // H and E
      `${formatted[2]} ${formatted[3]}`, // D and C
    ];
  }

  /**
   * Log bidding reasoning in a formatted box
   */
  private logBiddingReasoning(reasoning: any): void {
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(`│ Bot ID: ${reasoning.botId.padEnd(61)} │`);
    console.log(
      `│ Team: ${(reasoning.teamId === 0 ? "Team A" : "Team B").padEnd(63)} │`,
    );
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(
      `│ Hand Points: ${reasoning.handPoints.toString().padEnd(56)} │`,
    );
    console.log(`│ Best Suit: ${reasoning.bestSuit.padEnd(58)} │`);
    console.log(
      `│ Best Suit Trick: ${reasoning.bestSuitTricks.toFixed(1).padEnd(51)} │`,
    );
    console.log(
      `│ Noes Tricks: ${reasoning.noesTricks.toFixed(1).padEnd(56)} │`,
    );
    console.log(
      `│ Jack Pair: ${(reasoning.hasJackPair ? "Yes" : "No").padEnd(58)} │`,
    );
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(
      `│ Suit Breakdown:                                                      │`,
    );
    console.log(`│ ${reasoning.suitBreakdown[0].padEnd(68)} │`);
    console.log(`│ ${reasoning.suitBreakdown[1].padEnd(68)} │`);
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(`│ Current High Bid: ${reasoning.currentHighBid.padEnd(51)} │`);
    console.log(
      `│ Partner Bids: ${reasoning.partnerBids.toString().padEnd(55)} │`,
    );
    console.log(
      `│ Opponent Bids: ${reasoning.opponentBids.toString().padEnd(54)} │`,
    );
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(`│ STRATEGY: ${reasoning.strategy.padEnd(59)} │`);
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(
      "│ REASONING:                                                           │",
    );

    // Wrap reasoning text to fit in box
    const maxWidth = 68;
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
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(`│ DECISION: ${reasoning.decision.padEnd(59)} │`);
    console.log(
      "└──────────────────────────────────────────────────────────────────────┘\n",
    );
  }

  /**
   * =============================================================================
   * BIDDING DECISION ENGINE
   * =============================================================================
   * Make intelligent bidding decisions during the auction phase.
   * Key principles:
   * - Don't repeat the same bid
   * - Only bid if you can improve on partner's bid (higher value or better suit)
   * - Use double/re-double strategically
   * - Pass otherwise to avoid unnecessary bid increases
   */

  /**
   * Make a bidding decision based on hand analysis and auction state.
   * @param gameState Current game state
   * @param botToken Bot's token for card access
   * @param botPlayerId Bot's player ID
   * @returns Bidding decision
   */
  decideBid(
    gameState: ICardGame,
    botToken: string,
    botPlayerId: string,
  ): BotBidDecision {
    const myCards = gameState[botToken] || [];
    const bidHistory = gameState.bidHistory || [];

    // TEMPORARY: Log bot hand for analysis
    console.log(
      "\n┌──────────────────────────────────────────────────────────────────────┐",
    );
    console.log(`│ BOT HAND - Player: ${botPlayerId.padEnd(49)} │`);
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(`│ Cards: ${myCards.join(", ").padEnd(61)} │`);
    console.log(
      "└──────────────────────────────────────────────────────────────────────┘",
    );

    // Analyze hand to determine bidding strategy
    const handProfile = this.analyzeHandForBidding(myCards);

    // Get team context
    const teamId = this.getTeamId(botPlayerId, gameState);
    const partnerBids = this.getPartnerBids(botPlayerId, gameState);
    const opponentBids = this.getOpponentBids(botPlayerId, gameState);
    const currentHighBid = this.getCurrentHighBid(gameState);

    // Initialize bidding reasoning object
    const reasoning = {
      botId: botPlayerId,
      teamId: teamId,
      handPoints: handProfile.totalPoints,
      bestSuit: handProfile.bestSuit,
      bestSuitTricks: handProfile.bestSuitTricks,
      noesTricks: handProfile.noesTricks,
      hasJackPair: handProfile.hasJackPair,
      suitBreakdown: this.formatSuitBreakdown(handProfile.suitProfiles),
      currentHighBid: currentHighBid
        ? `${currentHighBid.bidValue} ${currentHighBid.suit} by ${currentHighBid.playerId}`
        : "None",
      partnerBids: partnerBids.length,
      opponentBids: opponentBids.length,
      bidHistoryCount: bidHistory.length,
      strategy: "",
      reasoning: "",
      decision: "",
    };

    console.log(
      "\n╔══════════════════════════════════════════════════════════════════════╗",
    );
    console.log(
      "║                  BOT BIDDING REASONING OBSERVER                      ║",
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════════════╝",
    );

    // PROGRESSIVE REVELATION: Check if we should reveal additional cards (5-6 card hands)
    const revealAdditional = this.shouldRevealAdditionalCards(
      botPlayerId,
      gameState,
      handProfile,
    );

    if (revealAdditional.shouldReveal && currentHighBid) {
      // Calculate new bid value (slightly higher than current)
      const suitProfile = handProfile.suitProfiles[revealAdditional.suit!];
      const tricks = this.estimateTricksForSuit(suitProfile);
      let bidValue = currentHighBid.bidValue + 2;
      bidValue = Math.min(56, bidValue);

      reasoning.strategy = "PROGRESSIVE_REVELATION";
      reasoning.reasoning = `Previously bid ${revealAdditional.suit}. Have ${suitProfile.length} cards total in this suit. Using progressive revelation to show ${revealAdditional.additionalCards} additional card(s) with +${revealAdditional.bidModifier} modifier. Bidding ${bidValue} ${revealAdditional.suit}.`;
      reasoning.decision = `BID ${bidValue} ${revealAdditional.suit} (+${revealAdditional.bidModifier})`;
      this.logBiddingReasoning(reasoning);
      return {
        action: "bid",
        bidValue: bidValue,
        suit: revealAdditional.suit!,
        bidSelectionType: "modifier",
        clickOrder: "bidFirst",
        bidModifier: revealAdditional.bidModifier,
        noTrumpType: null,
      };
    }

    // LAST PLAYER RESCUE: If first teammate made strong bid and second passed,
    // last player should bid to keep auction alive for progressive revelation
    const strongBidInfo = this.didFirstTeammateMakeStrongBid(
      botPlayerId,
      gameState,
    );
    const isLastPlayer = this.isLastTeamPlayer(botPlayerId, gameState);

    if (
      isLastPlayer &&
      strongBidInfo.madeStrongBid &&
      strongBidInfo.secondPassed
    ) {
      const firstBid = strongBidInfo.firstBid;

      // Try to support first teammate's suit, or bid our best suit, or worst case +1
      const firstBidSuit = firstBid.suit;
      const ourSuitProfile = handProfile.suitProfiles[firstBidSuit];

      if (ourSuitProfile && ourSuitProfile.length >= 2) {
        // We have support for first teammate's suit
        const supportTricks = this.estimateTricksForSuit(ourSuitProfile);
        let bidValue = currentHighBid
          ? currentHighBid.bidValue + 1
          : firstBid.bidValue + 1;
        bidValue = Math.min(56, Math.max(28, bidValue));

        const signal = this.determineBiddingSignal(
          ourSuitProfile.length,
          ourSuitProfile.jacks >= 1,
          true,
        );

        reasoning.strategy = "LAST_PLAYER_RESCUE_SUPPORT";
        reasoning.reasoning = `Last player rescue: First teammate made STRONG bid (${firstBid.bidValue} ${firstBidSuit}), second passed. Bidding to keep auction alive so first player can reveal more cards if they have 5-6 card hand. Have ${ourSuitProfile.length} cards in ${firstBidSuit} for support. Bidding ${firstBidSuit} ${bidValue}.`;
        const bidDisplay1 =
          signal.clickOrder === "bidFirst"
            ? `BID ${bidValue} ${firstBidSuit}`
            : `BID ${firstBidSuit} ${bidValue}`;
        reasoning.decision = `${bidDisplay1} (rescue)`;
        this.logBiddingReasoning(reasoning);
        return {
          action: "bid",
          bidValue: bidValue,
          suit: firstBidSuit,
          bidSelectionType: signal.bidSelectionType,
          clickOrder: signal.clickOrder,
          bidModifier: signal.bidModifier,
          noTrumpType: null,
        };
      } else if (
        handProfile.bestSuit !== "N" &&
        handProfile.bestSuitTricks >= 2
      ) {
        // Bid our best suit
        const bestSuitProfile = handProfile.suitProfiles[handProfile.bestSuit];
        let bidValue = currentHighBid
          ? currentHighBid.bidValue + 1
          : firstBid.bidValue + 1;
        bidValue = Math.min(56, Math.max(28, bidValue));

        const signal = this.determineBiddingSignal(
          bestSuitProfile.length,
          bestSuitProfile.jacks >= 1,
          false,
        );

        reasoning.strategy = "LAST_PLAYER_RESCUE_OWN_SUIT";
        reasoning.reasoning = `Last player rescue: First teammate made STRONG bid, second passed. Bidding our best suit ${handProfile.bestSuit} to keep auction alive. This allows first player to reveal additional cards if needed. Bidding ${handProfile.bestSuit} ${bidValue}.`;
        const bidDisplay2 =
          signal.clickOrder === "bidFirst"
            ? `BID ${bidValue} ${handProfile.bestSuit}`
            : `BID ${handProfile.bestSuit} ${bidValue}`;
        reasoning.decision = `${bidDisplay2} (rescue)`;
        this.logBiddingReasoning(reasoning);
        return {
          action: "bid",
          bidValue: bidValue,
          suit: handProfile.bestSuit,
          bidSelectionType: signal.bidSelectionType,
          clickOrder: signal.clickOrder,
          bidModifier: signal.bidModifier,
          noTrumpType:
            handProfile.bestSuit === "N"
              ? this.determineNoTrumpType(myCards)
              : null,
        };
      } else {
        // Worst case: just bid +1 to keep it alive
        let bidValue = currentHighBid
          ? currentHighBid.bidValue + 1
          : firstBid.bidValue + 1;
        bidValue = Math.min(56, bidValue);

        reasoning.strategy = "LAST_PLAYER_RESCUE_MINIMAL";
        reasoning.reasoning = `Last player rescue: First teammate made STRONG bid, second passed. Don't have good hand but bidding ${bidValue} ${firstBidSuit} (just +1) to keep auction alive for first player's potential progressive revelation.`;
        reasoning.decision = `BID ${firstBidSuit} ${bidValue} (+1 rescue)`;
        this.logBiddingReasoning(reasoning);
        return {
          action: "bid",
          bidValue: bidValue,
          suit: firstBidSuit,
          bidSelectionType: "modifier",
          clickOrder: "suitFirst",
          bidModifier: 1,
          noTrumpType: null,
        };
      }
    }

    // Defensive silence: If opponents started the auction, generally pass
    // UNLESS we have 5+ cards with J (strong hand worth competing)
    const opponentStartedAuction = this.didOpponentStartAuction(
      botPlayerId,
      gameState,
    );
    if (opponentStartedAuction) {
      // Check for strong hand (5+ cards with J)
      const suits = ["H", "E", "D", "C"];
      let hasStrongHand = false;

      for (const suit of suits) {
        const profile = handProfile.suitProfiles[suit];
        if (profile.length >= 5 && profile.jacks >= 1) {
          hasStrongHand = true;
          break;
        }
      }

      if (!hasStrongHand && handProfile.totalPoints < 20) {
        reasoning.strategy = "DEFENSIVE_SILENCE";
        reasoning.reasoning = `Opponents started auction. Hand points (${handProfile.totalPoints}) below threshold. No strong hand (5+ cards with J). Passing to avoid revealing weak hand strength.`;
        reasoning.decision = "PASS";
        this.logBiddingReasoning(reasoning);
        return { action: "pass" };
      }
    }

    // Check if partner has already bid
    if (partnerBids.length > 0) {
      const partnerLatestBid = partnerBids[partnerBids.length - 1];

      // SPECIAL CASE: Partner bid "28 Noes" = Pass (no good hand, asking for help)
      // Treat this like partner didn't bid - evaluate as opening bid instead
      const is28Noes =
        partnerLatestBid.action === "bid" &&
        partnerLatestBid.bidValue === 28 &&
        partnerLatestBid.suit === "N";

      if (is28Noes) {
        // Partner passed with 28 Noes - treat like no partner bid
        reasoning.strategy = "PARTNER_PASSED_28_NOES";
        reasoning.reasoning = `Partner bid 28 Noes (= Pass, no good hand). Treating as if partner didn't bid. Evaluating if we have hand to rescue team.`;

        // Evaluate as opening bid
        const decision = this.evaluateOpeningBid(
          myCards,
          handProfile,
          currentHighBid,
          opponentBids,
          gameState,
          reasoning,
        );
        this.logBiddingReasoning(reasoning);
        return decision;
      }

      // THIRD TEAMMATE SUIT REVELATION: If two teammates bid same suit,
      // third teammate should reveal their card count for complete team visibility
      const sameSuitInfo = this.getTwoTeammatesSameSuit(botPlayerId, gameState);

      if (sameSuitInfo.sameSuit) {
        const suit = sameSuitInfo.sameSuit;
        const ourSuitProfile = handProfile.suitProfiles[suit];

        // Check if we've already bid this suit - don't re-reveal same information
        const previousBotBids = this.getBotPreviousBids(botPlayerId, gameState);
        const alreadyBidThisSuit = previousBotBids.some(
          (bid) => bid.action === "bid" && bid.suit === suit,
        );

        if (
          ourSuitProfile &&
          ourSuitProfile.length > 0 &&
          !alreadyBidThisSuit
        ) {
          // Calculate bid increment based on high cards, or +1 if no high cards
          const highCardCount = ourSuitProfile.jacks + ourSuitProfile.nines;
          const bidIncrement = highCardCount > 0 ? highCardCount : 1;
          let bidValue = currentHighBid
            ? currentHighBid.bidValue + bidIncrement
            : 28 + bidIncrement;
          bidValue = Math.min(56, Math.max(28, bidValue));

          const signal = this.determineBiddingSignal(
            ourSuitProfile.length,
            ourSuitProfile.jacks >= 1,
            true,
          );

          reasoning.strategy = "THIRD_TEAMMATE_REVELATION";
          reasoning.reasoning = `Two teammates bid ${suit}. As third teammate, revealing our ${ourSuitProfile.length} cards in ${suit} with ${highCardCount} high card(s) (J:${ourSuitProfile.jacks}, 9:${ourSuitProfile.nines}). Increment by +${bidIncrement} ${highCardCount > 0 ? "for high cards" : "to signal presence"}. This gives team complete visibility of ${suit} distribution. Bidding ${suit} ${bidValue}.`;
          const bidDisplay3 =
            signal.clickOrder === "bidFirst"
              ? `BID ${bidValue} ${suit}`
              : `BID ${suit} ${bidValue}`;
          reasoning.decision = `${bidDisplay3} (revelation)`;
          this.logBiddingReasoning(reasoning);
          return {
            action: "bid",
            bidValue: bidValue,
            suit: suit,
            bidSelectionType: signal.bidSelectionType,
            clickOrder: signal.clickOrder,
            bidModifier: signal.bidModifier,
            noTrumpType:
              suit === "N" ? this.determineNoTrumpType(myCards) : null,
          };
        }
      }

      // Partner has bid - only support if we have better hand
      const decision = this.evaluatePartnerSupportBid(
        myCards,
        handProfile,
        partnerLatestBid,
        currentHighBid,
        gameState,
        reasoning,
      );
      this.logBiddingReasoning(reasoning);
      return decision;
    }

    // No partner bid yet - consider opening bid
    const decision = this.evaluateOpeningBid(
      myCards,
      handProfile,
      currentHighBid,
      opponentBids,
      gameState,
      reasoning,
    );
    this.logBiddingReasoning(reasoning);
    return decision;
  }

  /**
   * Analyze hand to create a bidding profile
   */
  private analyzeHandForBidding(cards: string[]): {
    totalPoints: number;
    suitProfiles: { [suit: string]: SuitProfile };
    bestSuit: string;
    bestSuitTricks: number;
    noesTricks: number;
    hasJackPair: boolean;
  } {
    const suits = ["H", "E", "D", "C"];
    const suitProfiles: { [suit: string]: SuitProfile } = {};

    // Analyze each suit
    suits.forEach((suit) => {
      const suitCards = cards.filter((c) => this.getCardSuit(c) === suit);
      suitProfiles[suit] = {
        length: suitCards.length,
        jacks: suitCards.filter((c) => c.slice(2) === "J").length,
        nines: suitCards.filter((c) => c.slice(2) === "9").length,
        aces: suitCards.filter((c) => c.slice(2) === "A").length,
        points: suitCards.reduce((sum, c) => sum + this.getCardPoints(c), 0),
        cards: suitCards,
      };
    });

    // Calculate total points
    const totalPoints = cards.reduce(
      (sum, c) => sum + this.getCardPoints(c),
      0,
    );

    // Check for jack pair (same rank from both decks)
    const hasJackPair = this.hasJackPair(cards);

    // Estimate tricks for each suit as trump
    let bestSuit = "N";
    let bestSuitTricks = 0;

    suits.forEach((suit) => {
      const profile = suitProfiles[suit];
      const tricks = this.estimateTricksForSuit(profile);

      if (tricks > bestSuitTricks) {
        bestSuitTricks = tricks;
        bestSuit = suit;
      }
    });

    // Estimate Noes (no-trump) tricks
    const noesTricks = this.estimateNoesTricks(cards, suitProfiles);

    if (noesTricks > bestSuitTricks) {
      bestSuit = "N";
      bestSuitTricks = noesTricks;
    }

    return {
      totalPoints,
      suitProfiles,
      bestSuit,
      bestSuitTricks,
      noesTricks,
      hasJackPair,
    };
  }

  /**
   * Estimate tricks for a suit as trump
   */
  private estimateTricksForSuit(profile: SuitProfile): number {
    let tricks = 0;

    // Each jack is worth 1-1.5 tricks
    tricks += profile.jacks * 1.5;

    // Each nine with a jack is worth 0.5 tricks
    if (profile.jacks > 0) {
      tricks += profile.nines * 0.5;
    }

    // Long suit bonus (5+ cards)
    if (profile.length >= 5) {
      tricks += 0.5;
    }
    if (profile.length >= 6) {
      tricks += 0.5;
    }

    // Ace in trump suit worth 0.3 tricks
    tricks += profile.aces * 0.3;

    return tricks;
  }

  /**
   * Estimate tricks for Noes (no-trump)
   */
  private estimateNoesTricks(
    cards: string[],
    suitProfiles: { [suit: string]: SuitProfile },
  ): number {
    let tricks = 0;

    // In Noes, jacks are still powerful
    const totalJacks = Object.values(suitProfiles).reduce(
      (sum, p) => sum + p.jacks,
      0,
    );
    tricks += totalJacks * 1.2;

    // Aces are valuable in Noes
    const totalAces = Object.values(suitProfiles).reduce(
      (sum, p) => sum + p.aces,
      0,
    );
    tricks += totalAces * 0.8;

    // Balanced hand bonus (all suits represented)
    const suitsWithCards = Object.values(suitProfiles).filter(
      (p) => p.length > 0,
    ).length;
    if (suitsWithCards === 4) {
      tricks += 0.5;
    }

    return tricks;
  }

  /**
   * Check if hand has a jack pair (same jack from both decks)
   */
  private hasJackPair(cards: string[]): boolean {
    const jacks = cards.filter((c) => c.slice(2) === "J");
    const jackBySuit: { [suit: string]: number } = {};

    jacks.forEach((jack) => {
      const suit = this.getCardSuit(jack);
      jackBySuit[suit] = (jackBySuit[suit] || 0) + 1;
    });

    return Object.values(jackBySuit).some((count) => count >= 2);
  }

  /**
   * Determine the appropriate no-trump type for a Noes bid based on hand composition.
   * - "Pass": 2 Jacks in different suits (signals to teammates)
   * - "No-Trump": 3 or more Jacks in different suits
   * - "Noes": Default for other hands
   */
  private determineNoTrumpType(cards: string[]): "Noes" | "Pass" | "No-Trump" {
    const jacks = cards.filter((c) => c.slice(2) === "J");

    // Count Jacks by suit (to get distinct suits)
    const jackBySuit: { [suit: string]: number } = {};
    jacks.forEach((jack) => {
      const suit = this.getCardSuit(jack);
      jackBySuit[suit] = (jackBySuit[suit] || 0) + 1;
    });

    const suitsWithJacks = Object.keys(jackBySuit).length;

    if (suitsWithJacks >= 3) {
      return "No-Trump";
    } else if (suitsWithJacks === 2) {
      return "Pass";
    } else {
      return "Noes";
    }
  }

  /**
   * Get bot's own previous bids from bid history
   */
  private getBotPreviousBids(
    botPlayerId: string,
    gameState: ICardGame,
  ): Array<{
    playerId: string;
    action: string;
    bidValue?: number;
    suit?: string;
  }> {
    const bidHistory = gameState.bidHistory || [];

    return bidHistory.filter((bid) => {
      return bid.playerId === botPlayerId && bid.action === "bid";
    });
  }

  /**
   * Check if bot should reveal additional cards (5+ card progressive revelation)
   * When you have 5-6 cards:
   * - First round: bid normally (shows 4 cards)
   * - Second round: bid same suit with +1 (shows 5th card) or +2 (shows 5th-6th cards)
   */
  private shouldRevealAdditionalCards(
    botPlayerId: string,
    gameState: ICardGame,
    handProfile: any,
  ): {
    shouldReveal: boolean;
    suit: string | null;
    additionalCards: number;
    bidModifier: number;
  } {
    const botPreviousBids = this.getBotPreviousBids(botPlayerId, gameState);

    // Check each suit the bot previously bid
    for (const previousBid of botPreviousBids) {
      if (!previousBid.suit) continue;

      const suitProfile = handProfile.suitProfiles[previousBid.suit];
      if (!suitProfile) continue;

      // If we have 5+ cards in a suit we already bid
      if (suitProfile.length >= 5) {
        // Calculate additional cards to reveal
        // First bid showed 4 cards, so we have (length - 4) additional
        const additionalCards = suitProfile.length - 4;
        const bidModifier = additionalCards; // +1 for 5 cards, +2 for 6 cards

        return {
          shouldReveal: true,
          suit: previousBid.suit,
          additionalCards: additionalCards,
          bidModifier: bidModifier,
        };
      }
    }

    return {
      shouldReveal: false,
      suit: null,
      additionalCards: 0,
      bidModifier: 0,
    };
  }

  /**
   * Get partner's bids from bid history
   */
  private getPartnerBids(
    botPlayerId: string,
    gameState: ICardGame,
  ): Array<{
    playerId: string;
    action: string;
    bidValue?: number;
    suit?: string;
  }> {
    const bidHistory = gameState.bidHistory || [];
    const teamId = this.getTeamId(botPlayerId, gameState);

    return bidHistory.filter((bid) => {
      const bidderTeam = this.getTeamId(bid.playerId, gameState);
      return (
        bidderTeam === teamId &&
        bid.playerId !== botPlayerId &&
        bid.action === "bid"
      );
    });
  }

  /**
   * Get opponent's bids from bid history
   */
  private getOpponentBids(
    botPlayerId: string,
    gameState: ICardGame,
  ): Array<{
    playerId: string;
    action: string;
    bidValue?: number;
    suit?: string;
  }> {
    const bidHistory = gameState.bidHistory || [];
    const teamId = this.getTeamId(botPlayerId, gameState);

    return bidHistory.filter((bid) => {
      const bidderTeam = this.getTeamId(bid.playerId, gameState);
      return bidderTeam !== teamId && bid.action === "bid";
    });
  }

  /**
   * Get current high bid
   */
  private getCurrentHighBid(gameState: ICardGame): {
    bidValue: number;
    suit: string;
    playerId: string;
  } | null {
    const bidHistory = gameState.bidHistory || [];

    // Find the last actual bid (not pass/double/re-double)
    for (let i = bidHistory.length - 1; i >= 0; i--) {
      const bid = bidHistory[i];
      if (bid.action === "bid" && bid.bidValue && bid.suit) {
        return {
          bidValue: bid.bidValue,
          suit: bid.suit,
          playerId: bid.playerId,
        };
      }
    }

    return null;
  }

  /**
   * Check if opponent team started the auction
   */
  private didOpponentStartAuction(
    botPlayerId: string,
    gameState: ICardGame,
  ): boolean {
    const bidHistory = gameState.bidHistory || [];
    const teamId = this.getTeamId(botPlayerId, gameState);

    // Find first bid in auction
    const firstBid = bidHistory.find((b) => b.action === "bid");
    if (!firstBid) return false;

    const firstBidderTeam = this.getTeamId(firstBid.playerId, gameState);
    return firstBidderTeam !== teamId;
  }

  /**
   * Check if teammate (partner) started the auction
   */
  private didTeammateStartAuction(
    botPlayerId: string,
    gameState: ICardGame,
  ): boolean {
    const bidHistory = gameState.bidHistory || [];
    const teamId = this.getTeamId(botPlayerId, gameState);

    // Find first bid in auction
    const firstBid = bidHistory.find((b) => b.action === "bid");
    if (!firstBid) return false;

    const firstBidderTeam = this.getTeamId(firstBid.playerId, gameState);
    return firstBidderTeam === teamId && firstBid.playerId !== botPlayerId;
  }

  /**
   * Check if hand has good support (3+ cards when supporting, 4+ when opening)
   * This is considered a revealing-worthy hand when teammate opens
   */
  private hasGoodSupportHand(
    suitProfiles: { [suit: string]: SuitProfile },
    isSupporting: boolean = false,
  ): {
    hasGoodSupport: boolean;
    suit: string | null;
    cardCount: number;
    hasJack: boolean;
  } {
    const suits = ["H", "E", "D", "C"];
    const minCards = isSupporting ? 3 : 4;

    for (const suit of suits) {
      const profile = suitProfiles[suit];
      if (profile.length >= minCards && profile.jacks >= 1) {
        return {
          hasGoodSupport: true,
          suit: suit,
          cardCount: profile.length,
          hasJack: true,
        };
      }
    }

    return { hasGoodSupport: false, suit: null, cardCount: 0, hasJack: false };
  }

  /**
   * Determine bidding signaling convention based on card count and Jack presence.
   *
   * Opening deck call:
   * - 4+ cards with J: bidFirst (number first) - signals 4 cards initially
   * - 4+ cards no J: suitFirst (suit first) - signals 4 cards initially
   * - 2-3 cards with J: modifier "direct" + bidFirst
   * - 2-3 cards no J: modifier "direct" + suitFirst
   * - 1 card with J: modifier with +1, bidFirst
   * - 1 card no J: modifier with +1, suitFirst
   *
   * Support deck call (when suit already bid):
   * - Same pattern but -1 card requirement (signals 3 cards initially)
   *
   * Note: For 5-6 card hands, first bid signals 4/3 cards, progressive revelation shows rest
   */
  private determineBiddingSignal(
    cardCount: number,
    hasJack: boolean,
    isSupporting: boolean,
  ): {
    bidSelectionType: "direct" | "modifier";
    clickOrder: "bidFirst" | "suitFirst";
    bidModifier?: number;
    signalType: string;
  } {
    const clickOrder = hasJack ? "bidFirst" : "suitFirst";

    // Cap initial signal: 4 for opening, 3 for supporting
    // Extra cards (5-6) will be revealed via progressive revelation in next round
    const signalThreshold = isSupporting ? 3 : 4;
    const displayCount = Math.min(cardCount, signalThreshold);

    const strongThreshold = isSupporting ? 3 : 4;
    const mediumThreshold = isSupporting ? 2 : 2;

    if (cardCount >= strongThreshold) {
      // Strong hand: direct bid (4+ for opening, 3+ for supporting)
      // But only signal up to threshold (4 or 3 cards)
      const actualSignal =
        cardCount > signalThreshold
          ? `${signalThreshold}+ cards (${cardCount} total)`
          : `${cardCount} cards`;
      return {
        bidSelectionType: "direct",
        clickOrder: clickOrder,
        signalType: hasJack ? `${actualSignal} with J` : `${actualSignal} no J`,
      };
    } else if (cardCount >= mediumThreshold) {
      // Medium hand: use + modifier (2-3 cards for opening, 2 cards for supporting)
      return {
        bidSelectionType: "modifier",
        clickOrder: clickOrder,
        bidModifier: 1, // + modifier
        signalType: hasJack
          ? `${cardCount} cards with J (+)`
          : `${cardCount} cards no J (+)`,
      };
    } else {
      // Weak hand: use +1 modifier (1 card)
      return {
        bidSelectionType: "modifier",
        clickOrder: clickOrder,
        bidModifier: 2, // +1 modifier
        signalType: hasJack ? `1 card with J (+1)` : `1 card no J (+1)`,
      };
    }
  }

  /**
   * Evaluate whether to support partner's bid
   * Key rule: Only bid if you can IMPROVE on partner's bid
   * Special case: If teammate opened, reveal good hands (4+ cards with J)
   */
  private evaluatePartnerSupportBid(
    myCards: string[],
    handProfile: any,
    partnerBid: any,
    currentHighBid: any,
    gameState: ICardGame,
    reasoning: any,
  ): BotBidDecision {
    // Partner has already bid
    const botPlayerId = reasoning.botId;
    const teammateOpened = this.didTeammateStartAuction(botPlayerId, gameState);

    // SPECIAL CASE: Teammate opened the auction
    // Standard practice: reveal hand if 3+ cards of same suit with at least one Jack (support convention)
    if (teammateOpened) {
      const supportHand = this.hasGoodSupportHand(
        handProfile.suitProfiles,
        true,
      );

      if (supportHand.hasGoodSupport) {
        // Calculate bid value for support suit
        const supportSuitProfile = handProfile.suitProfiles[supportHand.suit!];
        const supportTricks = this.estimateTricksForSuit(supportSuitProfile);
        let bidValue = 28 + Math.floor((supportTricks - 3) * 2);
        bidValue = Math.max(28, Math.min(56, bidValue));

        // Only bid if we can beat current high bid
        if (!currentHighBid || bidValue > currentHighBid.bidValue) {
          // Determine bidding signal based on card count and Jack presence
          const signal = this.determineBiddingSignal(
            supportHand.cardCount,
            supportHand.hasJack,
            true, // isSupporting
          );

          reasoning.strategy = "REVEAL_SUPPORT_HAND";
          reasoning.reasoning = `Teammate opened auction. Have support hand: ${signal.signalType} in ${supportHand.suit}. Using convention ${signal.clickOrder} to signal strength. Bidding ${supportHand.suit} ${bidValue}.`;
          const bidDisplay =
            signal.clickOrder === "bidFirst"
              ? `BID ${bidValue} ${supportHand.suit}`
              : `BID ${supportHand.suit} ${bidValue}`;
          reasoning.decision = `${bidDisplay} (${signal.clickOrder})`;
          return {
            action: "bid",
            bidValue: bidValue,
            suit: supportHand.suit!,
            bidSelectionType: signal.bidSelectionType,
            clickOrder: signal.clickOrder,
            bidModifier: signal.bidModifier,
            noTrumpType:
              supportHand.suit === "N"
                ? this.determineNoTrumpType(myCards)
                : null,
          };
        }
      }
    }

    // If we can double/re-double, consider it
    if (
      currentHighBid &&
      !gameState.bidDouble &&
      handProfile.totalPoints >= 18
    ) {
      reasoning.strategy = "DOUBLE_OPPONENT_BID";
      reasoning.reasoning = `Partner has bid ${partnerBid.suit} at ${partnerBid.bidValue}. Have strong hand (${handProfile.totalPoints} points) to double opponent's bid. Doubling to increase stakes.`;
      reasoning.decision = "DOUBLE (modifier x2)";
      return {
        action: "double",
        bidSelectionType: "modifier",
        bidModifier: 2,
      };
    }

    if (
      currentHighBid &&
      gameState.bidDouble &&
      !gameState.bidReDouble &&
      handProfile.totalPoints >= 22
    ) {
      reasoning.strategy = "RE_DOUBLE_OPPONENT_BID";
      reasoning.reasoning = `Partner has bid, opponent doubled. Have exceptional hand (${handProfile.totalPoints} points) to re-double. Re-doubling to increase stakes further.`;
      reasoning.decision = "RE-DOUBLE (modifier x3)";
      return {
        action: "re-double",
        bidSelectionType: "modifier",
        bidModifier: 4,
      };
    }

    // Check if we have same suit as partner to support, or significantly better suit
    const partnerSuit = partnerBid.suit;
    const partnerBidValue = partnerBid.bidValue;

    // Check if we've already bid this suit - don't re-reveal same information
    const previousBotBids = this.getBotPreviousBids(botPlayerId, gameState);
    const alreadyBidPartnerSuit = previousBotBids.some(
      (bid) => bid.action === "bid" && bid.suit === partnerSuit,
    );

    // SUPPORT PARTNER'S SUIT: If we have cards in partner's suit AND haven't already bid it
    if (partnerSuit && partnerSuit !== "N" && !alreadyBidPartnerSuit) {
      const partnerSuitProfile = handProfile.suitProfiles[partnerSuit];
      if (partnerSuitProfile && partnerSuitProfile.length >= 2) {
        // Calculate bid increment based on number of high cards (rounds we can win)
        // Each high card (J or 9) represents 1 additional round we can help win
        const highCardCount =
          partnerSuitProfile.jacks + partnerSuitProfile.nines;

        if (highCardCount > 0) {
          // Have high cards - increment by number of high cards
          const bidValue = partnerBidValue + highCardCount;
          const signal = this.determineBiddingSignal(
            partnerSuitProfile.length,
            partnerSuitProfile.jacks >= 1,
            true, // isSupporting
          );

          reasoning.strategy = "SUPPORT_PARTNER_SUIT";
          reasoning.reasoning = `Partner bid ${partnerSuit} at ${partnerBidValue}. Have ${partnerSuitProfile.length} cards in ${partnerSuit} with ${highCardCount} high card(s) (J:${partnerSuitProfile.jacks}, 9:${partnerSuitProfile.nines}). Each high card = 1 additional round win. Bidding ${partnerSuit} ${bidValue} (+${highCardCount} for ${highCardCount} high card(s). This confirms combined team strength.`;
          const bidDisplay4 =
            signal.clickOrder === "bidFirst"
              ? `BID ${bidValue} ${partnerSuit}`
              : `BID ${partnerSuit} ${bidValue}`;
          reasoning.decision = `${bidDisplay4} (support)`;
          return {
            action: "bid",
            bidValue: bidValue,
            suit: partnerSuit,
            bidSelectionType: signal.bidSelectionType,
            clickOrder: signal.clickOrder,
            bidModifier: signal.bidModifier,
            noTrumpType:
              partnerSuit === "N" ? this.determineNoTrumpType(myCards) : null,
          };
        } else {
          // Have cards but no high cards - just increment by 1 to signal presence
          const bidValue = partnerBidValue + 1;
          const signal = this.determineBiddingSignal(
            partnerSuitProfile.length,
            false, // no Jack
            true, // isSupporting
          );

          reasoning.strategy = "SUPPORT_PARTNER_SUIT";
          reasoning.reasoning = `Partner bid ${partnerSuit} at ${partnerBidValue}. Have ${partnerSuitProfile.length} cards in ${partnerSuit} but no high cards (J:0, 9:0). Increment by +1 to signal presence in this suit. Bidding ${partnerSuit} ${bidValue}.`;
          const bidDisplay5 =
            signal.clickOrder === "bidFirst"
              ? `BID ${bidValue} ${partnerSuit}`
              : `BID ${partnerSuit} ${bidValue}`;
          reasoning.decision = `${bidDisplay5} (support)`;
          return {
            action: "bid",
            bidValue: bidValue,
            suit: partnerSuit,
            bidSelectionType: signal.bidSelectionType,
            clickOrder: signal.clickOrder,
            bidModifier: signal.bidModifier,
            noTrumpType:
              partnerSuit === "N" ? this.determineNoTrumpType(myCards) : null,
          };
        }
      }
    }

    // Only rebid different suit if we have MUCH better hand (not Noes)
    // 28 Noes = Pass, so never bid Noes as improvement
    if (handProfile.bestSuit !== partnerSuit && handProfile.bestSuit !== "N") {
      const suitDifference = handProfile.bestSuitTricks - 3; // Need 3 more tricks
      if (suitDifference > 0) {
        const newBidValue = Math.min(
          partnerBidValue + 2,
          28 + Math.floor(handProfile.bestSuitTricks * 2),
        );

        if (newBidValue > partnerBidValue) {
          // Use bidding convention to signal hand strength (regular suit only)
          const bestSuitProfile =
            handProfile.suitProfiles[handProfile.bestSuit];
          const signal = this.determineBiddingSignal(
            bestSuitProfile.length,
            bestSuitProfile.jacks >= 1,
            false,
          );

          reasoning.strategy = "IMPROVE_PARTNER_BID";
          reasoning.reasoning = `Partner bid ${partnerSuit} at ${partnerBidValue}. My ${handProfile.bestSuit} is significantly stronger (${handProfile.bestSuitTricks.toFixed(1)} tricks, ${bestSuitProfile.length} cards with ${bestSuitProfile.jacks} J). Worth changing suit. ${signal.signalType}. Using convention ${signal.clickOrder}. Bidding ${handProfile.bestSuit} ${newBidValue}.`;
          const bidDisplay =
            signal.clickOrder === "bidFirst"
              ? `BID ${newBidValue} ${handProfile.bestSuit}`
              : `BID ${handProfile.bestSuit} ${newBidValue}`;
          reasoning.decision = `${bidDisplay} (${signal.clickOrder})`;

          const noTrumpType =
            handProfile.bestSuit === "N"
              ? this.determineNoTrumpType(myCards)
              : null;

          return {
            action: "bid",
            bidValue: newBidValue,
            suit: handProfile.bestSuit,
            bidSelectionType: signal.bidSelectionType,
            clickOrder: signal.clickOrder,
            bidModifier: signal.bidModifier,
            noTrumpType: noTrumpType,
          };
        }
      }
    }

    // Otherwise, pass and let partner's bid stand
    reasoning.strategy = "SUPPORT_PARTNER";
    reasoning.reasoning = `Partner already bid ${partnerBid.suit} at ${partnerBid.bidValue}. Cannot support (no high cards in ${partnerBid.suit}) or improve (bestSuit: ${handProfile.bestSuit} not strong enough). Passing to support partner's bid.`;
    reasoning.decision = "PASS";
    return { action: "pass" };
  }

  /**
   * Evaluate whether to make an opening bid
   */
  private evaluateOpeningBid(
    myCards: string[],
    handProfile: any,
    currentHighBid: any,
    opponentBids: any[],
    gameState: ICardGame,
    reasoning: any,
  ): BotBidDecision {
    const bidHistory = gameState.bidHistory || [];
    const botPlayerId = reasoning.botId;
    const teamId = this.getTeamId(botPlayerId, gameState);

    // Check if team has no real bid yet (excluding 28 Noes which is effectively a pass)
    const teamHasNotBid = bidHistory.every((bid) => {
      if (bid.action !== "bid") return true;
      const bidderTeam = this.getTeamId(bid.playerId, gameState);
      if (bidderTeam !== teamId) return true; // Not our team
      // Exclude "28 Noes" as it's effectively a pass, not a real bid
      if (bid.bidValue === 28 && bid.suit === "N") return true;
      return false; // Team has made a real bid
    });

    // SPECIAL CASE: Both teammates passed without opening bid (EMERGENCY OPENING)
    // Team starts = aggressive bid with any 4+ cards + J
    // 28 Noes = Pass (no good hand), so never bid Noes in emergency
    if (teamHasNotBid) {
      // Check if we have any suit with 3+ cards and Jack
      const suits = ["H", "E", "D", "C"];
      let emergencySuit: string | null = null;
      let emergencyProfile: SuitProfile | null = null;

      for (const suit of suits) {
        const profile = handProfile.suitProfiles[suit];
        if (profile.length >= 3 && profile.jacks >= 1) {
          emergencySuit = suit;
          emergencyProfile = profile;
          break;
        }
      }

      // If no 3+ with J, check for 4+ with two 9s (decent hand)
      if (!emergencySuit) {
        for (const suit of suits) {
          const profile = handProfile.suitProfiles[suit];
          if (profile.length >= 4 && profile.nines >= 2) {
            emergencySuit = suit;
            emergencyProfile = profile;
            break;
          }
        }
      }

      if (emergencySuit && emergencyProfile) {
        // If there's already a bid (e.g., auto-generated "Pass (28)"), increment it
        const bidValue = currentHighBid ? currentHighBid.bidValue + 1 : 28;
        const signal = this.determineBiddingSignal(
          emergencyProfile.length,
          emergencyProfile.jacks >= 1,
          false,
        );

        reasoning.strategy = "EMERGENCY_OPENING";
        reasoning.reasoning = `Both teammates passed - EMERGENCY OPENING needed. Have ${emergencyProfile.length} cards in ${emergencySuit} with ${emergencyProfile.jacks} J, ${emergencyProfile.nines} 9. ${signal.signalType}. Team starts = aggressive bid. Never bid Noes in emergency (28 Noes = Pass). Bidding ${emergencySuit} ${bidValue}.`;
        const bidDisplay =
          signal.clickOrder === "bidFirst"
            ? `BID ${bidValue} ${emergencySuit}`
            : `BID ${emergencySuit} ${bidValue}`;
        reasoning.decision = `${bidDisplay} (${signal.clickOrder})`;
        return {
          action: "bid",
          bidValue: bidValue,
          suit: emergencySuit,
          bidSelectionType: signal.bidSelectionType,
          clickOrder: signal.clickOrder,
          bidModifier: signal.bidModifier,
          noTrumpType:
            emergencySuit === "N" ? this.determineNoTrumpType(myCards) : null,
        };
      }
    }

    // NOES BID SIGNALING: Check if teammate bid Noes
    // Noes signals teammate is missing that suit and can trump it
    // Teammates should change to a stronger suit rather than leaving it (avoid no-trump game)
    const lastBid =
      bidHistory.length > 0 ? bidHistory[bidHistory.length - 1] : null;
    if (lastBid && lastBid.action === "bid" && lastBid.suit === "N") {
      const bidderTeam = this.getTeamId(lastBid.playerId, gameState);

      if (bidderTeam === teamId) {
        // Teammate bid Noes - they're signaling they're missing a suit and can trump it
        // We should change to a stronger suit instead of letting it be no-trump
        const noesKnowledge = this.extractNoesKnowledge(gameState);
        const missingSuits = noesKnowledge[lastBid.playerId] || [];

        // Find our best suit that's NOT Noes
        const nonNoesSuit =
          handProfile.bestSuit !== "N"
            ? handProfile.bestSuit
            : this.findBestNonNoesSuit(handProfile.suitProfiles);

        if (nonNoesSuit && handProfile.bestSuitTricks >= 2.5) {
          const nonNoesSuitProfile = handProfile.suitProfiles[nonNoesSuit];
          let bidValue = currentHighBid ? currentHighBid.bidValue + 2 : 28;
          bidValue = Math.min(56, Math.max(28, bidValue));

          const signal = this.determineBiddingSignal(
            nonNoesSuitProfile.length,
            nonNoesSuitProfile.jacks >= 1,
            false,
          );

          reasoning.strategy = "NOES_RESPONSE_CHANGE_SUIT";
          reasoning.reasoning = `Teammate bid Noes signaling they're missing ${missingSuits.join(",")} and can trump it when opponents play. Changing to stronger suit ${nonNoesSuit} instead of leaving it no-trump. Our ${nonNoesSuit}: ${signal.signalType}. This allows teammate to use trump effectively during gameplay.`;
          const bidDisplay6 =
            signal.clickOrder === "bidFirst"
              ? `BID ${bidValue} ${nonNoesSuit}`
              : `BID ${nonNoesSuit} ${bidValue}`;
          reasoning.decision = `${bidDisplay6} (response to Noes)`;

          const noTrumpType =
            nonNoesSuit === "N" ? this.determineNoTrumpType(myCards) : null;

          return {
            action: "bid",
            bidValue: bidValue,
            suit: nonNoesSuit,
            bidSelectionType: signal.bidSelectionType,
            clickOrder: signal.clickOrder,
            bidModifier: signal.bidModifier,
            noTrumpType: noTrumpType,
          };
        }
      }
    }

    // Determine minimum strength needed to open
    // Team starts = aggressive (4+ cards with J is enough)
    // Opponents started = need stronger hand to compete
    const teamStarted = !this.didOpponentStartAuction(botPlayerId, gameState);

    // Check for 3+ cards with J (minimum opening hand when team starts)
    const suits = ["H", "E", "D", "C"];
    let hasOpeningHand = false;

    for (const suit of suits) {
      const profile = handProfile.suitProfiles[suit];
      if (profile.length >= 3 && profile.jacks >= 1) {
        hasOpeningHand = true;
        break;
      }
    }

    // If team starts and we have 3+ with J, always bid (never let it pass to 28 Noes)
    if (teamStarted && !hasOpeningHand) {
      reasoning.strategy = "INSUFFICIENT_STRENGTH";
      reasoning.reasoning = `Team starts but no opening hand (need 3+ cards with J). Best suit ${handProfile.bestSuit}: ${handProfile.suitProfile[handProfile.bestSuit]?.length || 0} cards, ${handProfile.suitProfiles[handProfile.bestSuit]?.jacks || 0} J. Passing - will default to 28 Noes.`;
      reasoning.decision = "PASS";
      return { action: "pass" };
    }

    // Opponents started - need stronger hand (tricks threshold)
    const minTricksToOpen = currentHighBid ? 4 : 3.5;
    if (!teamStarted && handProfile.bestSuitTricks < minTricksToOpen) {
      reasoning.strategy = "INSUFFICIENT_STRENGTH";
      reasoning.reasoning = `Opponents started. Best suit ${handProfile.bestSuit} has only ${handProfile.bestSuitTricks.toFixed(1)} estimated tricks. Need at least ${minTricksToOpen} tricks to compete. Passing.`;
      reasoning.decision = "PASS";
      return { action: "pass" };
    }

    // Calculate conservative bid value
    let bidValue = 28 + Math.floor((handProfile.bestSuitTricks - 3) * 2);
    bidValue = Math.max(28, Math.min(56, bidValue));

    // If there's already a high bid, we need to beat it
    if (currentHighBid && bidValue <= currentHighBid.bidValue) {
      // Can't beat current bid - pass
      reasoning.strategy = "CANNOT_COMPETE";
      reasoning.reasoning = `Best suit ${handProfile.bestSuit} worth ${bidValue} points. Current high bid is ${currentHighBid.bidValue}. Cannot beat current bid safely. Passing.`;
      reasoning.decision = "PASS";
      return { action: "pass" };
    }

    // Avoid bidding the same suit opponents have bid (reveals information)
    const opponentSuits = opponentBids.map((b) => b.suit);
    if (
      opponentSuits.includes(handProfile.bestSuit) &&
      handProfile.bestSuit !== "N"
    ) {
      // Opponents already bid this suit - pass to avoid revealing strength
      reasoning.strategy = "INFORMATION_HIDING";
      reasoning.reasoning = `Best suit ${handProfile.bestSuit} was already bid by opponent. Bidding same suit revels jack ownership and will help opponents. Passing to hide hand strength.`;
      reasoning.decision = "PASS";
      return { action: "pass" };
    }

    // Make the opening bid (never bid Noes as opening - only actual suits)
    // 28 Noes = Pass (no good hand), so bestSuit should be H/E/D/C
    if (handProfile.bestSuit === "N") {
      reasoning.strategy = "NO_SUIT_OPENING";
      reasoning.reasoning = `Best suit is Noes but 28 Noes = Pass (no good hand). Cannot open with Noes. Passing.`;
      reasoning.decision = "PASS";
      return { action: "pass" };
    }

    // Use bidding convention to signal hand strength (regular suit only)
    const bestSuitProfile = handProfile.suitProfiles[handProfile.bestSuit];
    const signal = this.determineBiddingSignal(
      bestSuitProfile.length,
      bestSuitProfile.jacks >= 1,
      false,
    );

    reasoning.strategy = currentHighBid ? "COMPETITIVE_BID" : "OPENING_BID";
    reasoning.reasoning = `${handProfile.bestSuit} is strongest suit: ${bestSuitProfile.length} cards, ${bestSuitProfile.jacks} J, ${bestSuitProfile.nines} 9, ${bestSuitProfile.points} pts. ${signal.signalType}. Using convention ${signal.clickOrder} to signal hand. ${handProfile.hasJackPair ? "Have jack pair for combination potential. " : ""}Bidding ${handProfile.bestSuit} ${bidValue}.`;
    const bidDisplay =
      signal.clickOrder === "bidFirst"
        ? `BID ${bidValue} ${handProfile.bestSuit}`
        : `BID ${handProfile.bestSuit} ${bidValue}`;
    reasoning.decision = `${bidDisplay} (${signal.clickOrder})`;

    // Determine noTrumpType if bidding suit "N"
    const noTrumpType =
      handProfile.bestSuit === "N" ? this.determineNoTrumpType(myCards) : null;

    return {
      action: "bid",
      bidValue: bidValue,
      suit: handProfile.bestSuit,
      bidSelectionType: signal.bidSelectionType,
      clickOrder: signal.clickOrder,
      bidModifier: signal.bidModifier,
      noTrumpType: noTrumpType,
    };
  }
}
