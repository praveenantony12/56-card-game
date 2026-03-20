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
 * Bot bid raise decision interface (for doubling/re-doubling)
 */
interface BotBidRaiseDecision {
  raise: boolean;
  newBidValue?: number;
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
  /** Most recent reasoning snapshot — read by GameCore after calling decide() or decideBid() */
  public lastReasoning: {
    botId: string;
    type: "card" | "bid";
    strategy: string;
    reasoning: string;
    decision: string;
    gameMode: string;
  } | null = null;

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

    // POINT STATUS: Track team/opponent points and bid target
    const pointStatus = this.computePointStatus(gameState, botAgentId);
    (reasoning as any).pointStatus = pointStatus;

    // Log point status
    const bidTeamLabel = pointStatus.myTeamIsTarget ? "US" : "OPPONENTS";
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(
      "│ POINT STATUS:                                                        │",
    );
    console.log(
      `│ Our points: ${pointStatus.myTeamPoints} | Opp points: ${pointStatus.opponentPoints} | Bid: ${pointStatus.bidTarget} by ${bidTeamLabel}`.padEnd(
        70,
      ) + " │",
    );
    console.log(
      `│ Current round pts: ${pointStatus.currentRoundPoints} | Need: ${pointStatus.myTeamIsTarget ? pointStatus.pointsNeededByUs + " more" : "deny opp " + pointStatus.pointsNeededByOpp}`.padEnd(
        70,
      ) + " │",
    );

    const isLastPlayer = this.isLastPlayerInRound(
      currentRoundCards.length,
      gameState,
    );

    // STRATEGY CLINCH: If we are the last player and can clinch the game this trick,
    // play the minimum card needed to do so — even if that means playing a Jack.
    // "Clinching" = our team reaches the bid target on this trick.
    if (
      isLastPlayer &&
      pointStatus.myTeamIsTarget &&
      pointStatus.pointsNeededByUs > 0
    ) {
      const pointsIfWinTrick =
        pointStatus.myTeamPoints + pointStatus.currentRoundPoints;
      // Would winning this trick with any card push us to target?
      const winningMovesClinch = this.getWinningMoves(
        legalMoves,
        currentRoundCards,
        trumpSuit,
      );

      if (winningMovesClinch.length > 0) {
        // Sort by card value ascending — use the weakest win possible to clinch
        const sortedWinners = [...winningMovesClinch].sort(
          (a, b) => this.getCardValue(a) - this.getCardValue(b),
        );

        for (const candidate of sortedWinners) {
          const pointsAfterWin =
            pointsIfWinTrick + this.getCardPoints(candidate);
          if (pointsAfterWin >= pointStatus.bidTarget) {
            reasoning.strategy = "CLINCH_GAME";
            reasoning.reasoning =
              `POINT COUNTING: Last player in trick. My team needs ${pointStatus.pointsNeededByUs} more point(s) to reach bid target ${pointStatus.bidTarget}. ` +
              `Points on table: ${pointStatus.currentRoundPoints}. My team currently has ${pointStatus.myTeamPoints} pts. ` +
              `Playing [${candidate}] (${this.getCardPoints(candidate)} pts) will give team ${pointsAfterWin} total — ` +
              `CLINCHING THE GAME! No need to hold strong cards; the goal is won this trick.`;
            reasoning.selectedCard = candidate;
            this.logReasoning(reasoning);
            return candidate;
          }
        }
      }
    }

    // STRATEGY DENY: If we are the last player and opponents are 1 trick away from winning,
    // play the minimum card that beats the current winning card to deny them the trick.
    if (
      isLastPlayer &&
      !pointStatus.myTeamIsTarget &&
      pointStatus.pointsNeededByOpp > 0
    ) {
      const opponentCurrentWinner =
        winningCard !== null &&
        winningPlayerId !== null &&
        !this.isSameTeam(winningPlayerId, botAgentId, gameState);

      if (opponentCurrentWinner) {
        const pointsOppWouldGet =
          pointStatus.opponentPoints + pointStatus.currentRoundPoints;
        const opponentWouldWin = pointsOppWouldGet >= pointStatus.bidTarget;

        if (opponentWouldWin) {
          const winningMovesForDeny = this.getWinningMoves(
            legalMoves,
            currentRoundCards,
            trumpSuit,
          );

          if (winningMovesForDeny.length > 0) {
            // Use the lowest-value card that beats the current winner
            const lowestWinner = this.lowestCard(winningMovesForDeny);
            reasoning.strategy = "DENY_OPPONENT_WIN";
            reasoning.reasoning =
              `POINT COUNTING: Last player in trick. Opponents need ${pointStatus.pointsNeededByOpp} more point(s) to reach bid target ${pointStatus.bidTarget}. ` +
              `Points on table: ${pointStatus.currentRoundPoints}. Opponents currently have ${pointStatus.opponentPoints} pts. ` +
              `If opponents win this trick they reach ${pointsOppWouldGet} — winning the game! ` +
              `Playing [${lowestWinner}] to DENY opponents this trick even at the cost of a high card. ` +
              `Blocking this trick is more important than conserving cards for future rounds.`;
            reasoning.selectedCard = lowestWinner;
            this.logReasoning(reasoning);
            return lowestWinner;
          }
        }
      }
    }

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

      // COVER TEAMMATE'S LOW TRUMP WITH JACK
      // When a teammate leads with a low trump (not J/9), play our J of trump to
      // guarantee the team wins the trick — an opponent playing after us could still
      // have a 9/J and steal it if we just dump points.
      // Key insight from bidding: if both Jacks were signalled as within the team,
      // opponents can't have a Jack to beat ours, making this 100% safe.
      if (trumpSuit && gameState.trumpSuit !== "N") {
        const leadSuitOfRound = this.getLeadSuit(currentRoundCards);

        if (leadSuitOfRound === trumpSuit) {
          // Find which card the teammate played in this trick
          const teammateCardDrop = currentRoundCards.find((cardDrop) => {
            const playerId = this.extractPlayerFromCardDrop(cardDrop);
            return (
              playerId !== botAgentId &&
              this.isSameTeam(playerId, botAgentId, gameState)
            );
          });

          if (teammateCardDrop) {
            const teammateCardStr = teammateCardDrop.split("-")[0];
            const teammateRank = teammateCardStr.slice(2);

            // Teammate played a low trump (not J, not 9) — they want us to cover with J
            if (teammateRank !== "J" && teammateRank !== "9") {
              const trumpJacks = legalMoves.filter(
                (c) => this.getCardSuit(c) === trumpSuit && c.slice(2) === "J",
              );

              if (trumpJacks.length > 0) {
                // Prefer the lower-deck Jack first (1xx) to save the second Jack
                const jackToPlay =
                  trumpJacks.find((c) => c.startsWith("1")) || trumpJacks[0];

                // Count total team trump Jacks (from bidding + hand)
                const teamJacksFromBidding = Object.values(
                  jackKnowledge.teammateJacks,
                ).some((suits: any) => suits.includes(trumpSuit));
                const botHasJack = true; // we already found one above
                const teamHasBothJacks = teamJacksFromBidding || botHasJack;

                reasoning.strategy = "COVER_LOW_TRUMP_WITH_JACK";
                reasoning.reasoning =
                  `Teammate (${winningPlayerId}) led with LOW trump [${teammateCardStr}] (rank ${teammateRank}). ` +
                  `This is the standard signal: "I don't have J, please cover with yours." ` +
                  `Covering with J [${jackToPlay}] to GUARANTEE team wins this trick. ` +
                  `${teamHasBothJacks ? "Bidding confirms both trump Jacks are with the team — opponents cannot beat our J." : "Playing J to secure the trick before remaining players act."} ` +
                  `This also exhausts any opponent trump cards from their hand.`;
                reasoning.selectedCard = jackToPlay;
                this.logReasoning(reasoning);
                return jackToPlay;
              }
            }
          }
        }
      }

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
            // IMPROVEMENT #2: Prioritize discarding single-card non-trump suits
            const singleCardSuits = this.findSingleCardNonTrumpSuits(
              myCards,
              trumpSuit,
            );
            const singleCardSuitMoves = nonTrumpMoves.filter((card) =>
              singleCardSuits.includes(card),
            );

            if (singleCardSuitMoves.length > 0) {
              // Discard the single-card suit to create future trumping opportunity
              selectedCard = singleCardSuitMoves[0]; // Any single-card suit is good
              cardPoints = this.getCardPoints(selectedCard);
              const trumpCardsInHand = legalMoves.filter(
                (c) => this.getCardSuit(c) === trumpSuit,
              );

              reasoning.strategy = "TEAMMATE_WINNING_DISCARD_SINGLE_SUIT";
              reasoning.reasoning =
                `Teammate (${winningPlayerId}) winning with TRUMP card ${winningCardValue}. ` +
                `TRUMP CONSERVATION: Saving trump cards for critical rounds. ` +
                `Found single-card non-trump suit [${this.getCardSuit(selectedCard)}] - discarding this to create future trumping opportunity. ` +
                `Selected [${selectedCard}] (${cardPoints} points). ` +
                `Single-card suits in hand: [${singleCardSuits.join(", ")}]. ` +
                `Trump cards in hand: [${trumpCardsInHand.join(", ")}]. `;
              reasoning.selectedCard = selectedCard;
              this.logReasoning(reasoning);
              return selectedCard;
            }

            // No single-card suits - throw highest non-trump card
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
              `No single-card suits to discard. Throwing highest-point NON-TRUMP card [${selectedCard}] (${cardPoints} points). ` +
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
        // Filter out Jacks AND last-connection cards from discard candidates
        const nonJackMoves = legalMoves.filter((card) => {
          const rank = card.slice(2);
          return rank !== "J";
        });

        // Further filter: protect the last card in a suit where a teammate has Jacks
        // (that card is the "connection" needed to pass control later)
        const safeDiscards = nonJackMoves.filter(
          (card) =>
            !this.isLastConnectionCard(card, myCards, gameState, botAgentId),
        );
        const movesToDiscard =
          safeDiscards.length > 0 ? safeDiscards : nonJackMoves;

        if (movesToDiscard.length > 0) {
          // Throw highest-point non-Jack, non-last-connection card
          selectedCard = this.highestPointCard(movesToDiscard);
          cardPoints = this.getCardPoints(selectedCard);
          const protectedCards = legalMoves.filter(
            (c) =>
              c.slice(2) === "J" ||
              this.isLastConnectionCard(c, myCards, gameState, botAgentId),
          );
          reasoning.strategy = "TEAMMATE_WINNING";
          reasoning.reasoning =
            `Teammate (${winningPlayerId}) is currently winning with ${
              winningCard?.split("-")[0]
            }. ` +
            `NOES GAME: Preserving Jacks (winning moves) and last connection cards (needed to pass control). ` +
            `SUPPORTING teammate by throwing highest-point safe card [${selectedCard}] (${cardPoints} points). ` +
            `Available discard candidates: [${movesToDiscard.join(", ")}]. ` +
            `Protected cards: [${protectedCards.join(", ")}].`;
        } else {
          // Only have Jacks left - must throw one, but note this in reasoning
          selectedCard = this.highestPointCard(legalMoves);
          cardPoints = this.getCardPoints(selectedCard);
          reasoning.strategy = "TEAMMATE_WINNING";
          reasoning.reasoning =
            `Teammate (${winningPlayerId}) is currently winning with ${
              winningCard?.split("-")[0]
            }. ` +
            `NOES GAME: Would prefer to preserve Jacks/connection cards, but only they remain. ` +
            `Forced to throw [${selectedCard}] (${cardPoints} points). ` +
            `This card won't be available for future rounds — strategic cost accepted.`;
        }
      } else {
        // Trump game — teammate winning with a NON-trump card (e.g. Jack of spades).
        // CRITICAL: NEVER trump your own teammate's winning card.
        // If legalMoves includes trump cards (because we couldn't follow suit),
        // discard a non-trump card instead — preserve trumps for rounds we need them.
        const nonTrumpMoves = legalMoves.filter(
          (card) => !trumpSuit || this.getCardSuit(card) !== trumpSuit,
        );

        if (nonTrumpMoves.length > 0) {
          // JACK PROTECTION RULE:
          // A Jack in a non-trump suit is a potential round-winner IF:
          //   - We bid it (clickOrder=bidFirst signals "I have a Jack in this suit"), OR
          //   - A teammate bid it (they are counting on it in the 56 plan).
          // Such Jacks must NOT be discarded — they are needed to win future rounds.
          //
          // A Jack is SAFE to discard (maximise points dump) if:
          //   - Neither we nor any teammate ever signalled a Jack in that suit via bidding.
          //   - It is an "unaccounted" Jack that isn't part of the team's winning plan.

          // Build set of "protected" Jack suits (bot's own + teammate-revealed Jacks)
          const protectedJackSuits = new Set<string>();

          // Jacks the bot itself revealed via bidding (bidFirst = has Jack)
          const botPreviousBids = this.getBotPreviousBids(
            botAgentId,
            gameState,
          );
          botPreviousBids.forEach((bid) => {
            if (
              bid.suit &&
              bid.suit !== "N" &&
              (bid as any).clickOrder === "bidFirst"
            ) {
              protectedJackSuits.add(bid.suit);
            }
          });

          // Jacks teammates revealed via bidding
          Object.values(jackKnowledge.teammateJacks).forEach((suits: any) => {
            (suits as string[]).forEach((s: string) =>
              protectedJackSuits.add(s),
            );
          });

          // Separate discard candidates: prefer non-Jack cards, then unaccounted Jacks
          const nonJackNonTrump = nonTrumpMoves.filter(
            (c) => c.slice(2) !== "J",
          );
          const unaccountedJackMoves = nonTrumpMoves.filter(
            (c) =>
              c.slice(2) === "J" &&
              !protectedJackSuits.has(this.getCardSuit(c)),
          );
          const protectedJackMoves = nonTrumpMoves.filter(
            (c) =>
              c.slice(2) === "J" && protectedJackSuits.has(this.getCardSuit(c)),
          );

          let discardPool: string[];
          let jackProtectionNote: string;

          if (nonJackNonTrump.length > 0) {
            // Best case: discard high-point non-Jack, non-trump card
            discardPool = nonJackNonTrump;
            jackProtectionNote =
              `${protectedJackMoves.length} protected Jack(s) [${protectedJackMoves.join(", ")}] preserved ` +
              `(bid-signalled by self or teammate). ` +
              (unaccountedJackMoves.length > 0
                ? `Unaccounted Jack(s) [${unaccountedJackMoves.join(", ")}] also preserved as backup.`
                : "");
          } else if (unaccountedJackMoves.length > 0) {
            // No plain non-trump cards — discard unaccounted Jacks for max points
            discardPool = unaccountedJackMoves;
            jackProtectionNote =
              `No plain non-trump cards to discard. ` +
              `Discarding unaccounted Jack(s) [${unaccountedJackMoves.join(", ")}] — ` +
              `not part of team's bid-revealed winning plan, so safe to use as point dump. ` +
              (protectedJackMoves.length > 0
                ? `Protected (plan-critical) Jack(s) [${protectedJackMoves.join(", ")}] still preserved.`
                : "");
          } else {
            // Only protected Jacks or trump left in non-trump pool — use lowest-value protected Jack
            discardPool =
              protectedJackMoves.length > 0
                ? protectedJackMoves
                : nonTrumpMoves;
            jackProtectionNote =
              `Only bid-signalled Jacks remain as non-trump options — forced to discard one. ` +
              `Choosing lowest-value Jack to minimise strategic loss.`;
          }

          selectedCard =
            discardPool === protectedJackMoves
              ? this.lowestCard(discardPool) // lose least when forced
              : this.highestPointCard(discardPool);
          cardPoints = this.getCardPoints(selectedCard);
          const trumpCardsInHand = legalMoves.filter(
            (c) => trumpSuit && this.getCardSuit(c) === trumpSuit,
          );
          reasoning.strategy = "TEAMMATE_WINNING_NO_TRUMP_DISCARD";
          reasoning.reasoning =
            `Teammate (${winningPlayerId}) is currently winning with NON-trump card ${winningCard?.split("-")[0]}. ` +
            `TRUMP GAME (${trumpSuit}): NEVER trump your own teammate's winning trick! ` +
            `Jack protection: [${Array.from(protectedJackSuits).join(", ") || "none"}] (bid-signalled suits). ` +
            `${jackProtectionNote} ` +
            `Discarding [${selectedCard}] (${cardPoints} pts). ` +
            `Preserving ${trumpCardsInHand.length} trump card(s) [${trumpCardsInHand.join(", ")}] for rounds we need to win.`;
        } else {
          // Only trump cards available — throw lowest to waste as few as possible
          selectedCard = this.lowestCard(legalMoves);
          cardPoints = this.getCardPoints(selectedCard);
          reasoning.strategy = "TEAMMATE_WINNING_FORCED_TRUMP_DISCARD";
          reasoning.reasoning =
            `Teammate (${winningPlayerId}) is currently winning with NON-trump card ${winningCard?.split("-")[0]}. ` +
            `TRUMP GAME (${trumpSuit}): Would prefer not to play trump, but only trump cards remain. ` +
            `Throwing LOWEST trump [${selectedCard}] (${cardPoints} points) to waste as little trump strength as possible.`;
        }
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

      // LEAD WITH SAFE JACK (Trump game, leading the round)
      // After collecting trump Jacks, it's time to lead with Jacks of other suits
      // where opponents haven't announced a Jack (so less risk of being trumped or
      // beaten by an opponent's Jack of the same suit).
      // This is the classic "cash your safe Jacks" strategy.
      if (
        trumpSuit &&
        gameState.trumpSuit !== "N" &&
        currentRoundCards.length === 0
      ) {
        const myJacks = legalMoves.filter((c) => c.slice(2) === "J");
        const nonTrumpJacks = myJacks.filter(
          (c) => this.getCardSuit(c) !== trumpSuit,
        );

        if (nonTrumpJacks.length > 0) {
          // Find a Jack in a suit where NO opponent has a Jack (safe suit)
          // and where the OTHER Jack of that suit has already been played
          // (making our Jack the highest remaining)
          const safeJacks = nonTrumpJacks.filter((c) =>
            this.isHighestCard(c, playedCards, trumpSuit),
          );

          // Also find Jacks in suits not claimed by opponents in bidding
          const opponentJackSuits = new Set<string>();
          Object.values(jackKnowledge.opponentJacks).forEach((suits: any) => {
            (suits as string[]).forEach((s: string) =>
              opponentJackSuits.add(s),
            );
          });
          const safeJacksNoBidOpponent = nonTrumpJacks.filter(
            (c) => !opponentJackSuits.has(this.getCardSuit(c)),
          );

          const jacksToConsider =
            safeJacks.length > 0
              ? safeJacks
              : safeJacksNoBidOpponent.length > 0
                ? safeJacksNoBidOpponent
                : null;

          if (jacksToConsider && jacksToConsider.length > 0) {
            const selectedCard = jacksToConsider[0];
            const selectedSuit = this.getCardSuit(selectedCard);
            const isBossCard = safeJacks.includes(selectedCard);

            reasoning.strategy = "LEAD_SAFE_JACK";
            reasoning.reasoning =
              `TRUMP GAME: Leading with safe non-trump Jack [${selectedCard}] in suit ${selectedSuit}. ` +
              (isBossCard
                ? `This Jack is the HIGHEST remaining card in ${selectedSuit} (other Jack already played) — guaranteed win. `
                : `Opponents have NOT bid Jacks in ${selectedSuit} — lower risk of being beaten or trumped. `) +
              `Strategy: after exhausting trump Jacks, cash safe side-suit Jacks to collect points. ` +
              `Opponent Jack suits from bidding: [${Array.from(opponentJackSuits).join(", ") || "none revealed"}].`;
            reasoning.selectedCard = selectedCard;
            this.logReasoning(reasoning);
            return selectedCard;
          }
        }
      }

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

      // STRATEGY TRUMP OPPORTUNITY: Bot is void in the led suit, has trump cards,
      // and opponent is currently winning trump to take control of the round.
      // Three exceptions where discarding is smarter than wasting a trump:
      // 1. First time this suit is led AND teammate has signaled via bidding a 3 of
      //    that suit. On a fresh suit most players still hold suit cards and must follow,
      //    so the J is dominant and will likely win without any help from trump.
      // 2. Teammate has already trumped and is currently winning the trick this is 17
      //    already handled by the earlier teammateWinning guard above.
      // 3. All J and 9 cards of the led suit have already been won in previous rounds -
      //    no point-bearing cards remain in that suit, so the round has low intrinsic
      //    value and trump is better saved for a more valuable opportunity.
      {
        const trumpWinMoves = winningMoves.filter(
          (card) => trumpSuit && this.getCardSuit(card) === trumpSuit,
        );
        const leadSuitForTrump = this.getLeadSuit(currentRoundCards);

        const voidInLeadSuit =
          currentRoundCards.length > 0 &&
          leadSuitForTrump !== null &&
          leadSuitForTrump !== trumpSuit &&
          !legalMoves.some((c) => this.getCardSuit(c) === leadSuitForTrump);

        if (
          voidInLeadSuit &&
          trumpSuit &&
          !teammateWinning &&
          trumpWinMoves.length > 0
        ) {
          const wonInPreviousRounds = new Set<string>();
          if (Array.isArray(gameState.teamACards)) {
            gameState.teamACards.forEach((c: string) =>
              wonInPreviousRounds.add(c),
            );
          }
          if (Array.isArray(gameState.teamBCards)) {
            gameState.teamBCards.forEach((c: string) =>
              wonInPreviousRounds.add(c),
            );
          }

          let suitAppearedInPreviousRounds = false;
          wonInPreviousRounds.forEach((c) => {
            if (this.getCardSuit(c) === leadSuitForTrump) {
              suitAppearedInPreviousRounds = true;
            }
          });

          const teammatesSignaledJForSuit = Object.keys(
            jackKnowledge.teammateJacks,
          ).filter((pid) =>
            jackKnowledge.teammateJacks[pid].includes(leadSuitForTrump!),
          );

          const jacksAlreadyPlayed = [
            `1${leadSuitForTrump}J`,
            `2${leadSuitForTrump}J`,
          ].filter((jack) => wonInPreviousRounds.has(jack)).length;

          const teamHoldsBothJacks =
            teammatesSignaledJForSuit.length + jacksAlreadyPlayed >= 2;

          let allOpponentJsAfterTeammate = false;
          if (!teamHoldsBothJacks && teammatesSignaledJForSuit.length >= 1) {
            const opponentsWithJ = Object.keys(
              jackKnowledge.opponentJacks,
            ).filter((pid) =>
              jackKnowledge.opponentJacks[pid].includes(leadSuitForTrump!),
            );

            if (opponentsWithJ.length > 0) {
              const alreadyPlayedPlayers = new Set(
                currentRoundCards.map((cd: string) =>
                  this.extractPlayerFromCardDrop(cd),
                ),
              );
              const allPlayers: any[] = gameState.players || [];
              const leadPlayerId = this.extractPlayerFromCardDrop(
                currentRoundCards[0],
              );
              const leadIdx = allPlayers.findIndex(
                (p: any) => p.playerId === leadPlayerId,
              );

              if (leadIdx !== -1) {
                const remainingInOrder: string[] = [];
                for (let i = 1; i < allPlayers.length; i++) {
                  const idx = (leadIdx + i) % allPlayers.length;
                  const pid: string = allPlayers[idx]?.playerId;
                  if (pid && !alreadyPlayedPlayers.has(pid)) {
                    remainingInOrder.push(pid);
                  }
                }

                allOpponentJsAfterTeammate = opponentsWithJ.every((oppId) => {
                  const oppPos = remainingInOrder.indexOf(oppId);
                  if (oppPos === -1) {
                    return true;
                  }
                  return teammatesSignaledJForSuit.some((tmId) => {
                    const tmPos = remainingInOrder.indexOf(tmId);
                    return tmPos !== -1 && tmPos < oppPos;
                  });
                });
              }
            }
          }

          const skipFreshSuitTeammateJ =
            !suitAppearedInPreviousRounds &&
            (teamHoldsBothJacks || allOpponentJsAfterTeammate);

          const allPointCardsGone =
            wonInPreviousRounds.has(`1${leadSuitForTrump}J`) &&
            wonInPreviousRounds.has(`2${leadSuitForTrump}J`) &&
            wonInPreviousRounds.has(`1${leadSuitForTrump}9`) &&
            wonInPreviousRounds.has(`2${leadSuitForTrump}9`);

          if (skipFreshSuitTeammateJ && !allPointCardsGone) {
            const trumpAlreadyInRound = currentRoundCards.some((cardDrop) => {
              const card = cardDrop.split("-")[0];
              return this.getCardSuit(card) === trumpSuit;
            });

            const selectedCard = this.selectSmartTrumpCard(
              trumpWinMoves,
              currentRoundCards,
              trumpSuit,
              !trumpAlreadyInRound,
            );

            reasoning.strategy = "TRUMP_OPPORTUNITY";
            reasoning.reasoning =
              `Void in led suit (${leadSuitForTrump}), opponent winning with [${winningCard?.split("-")[0]}]. ` +
              `TRUMP RULE: When void and opponent winning, trump unless an exception applies. ` +
              `Exception 1: (Fresh suit, both Js safe): ${skipFreshSuitTeammateJ} ` +
              `[fresh: ${!suitAppearedInPreviousRounds}, teammates hold both Js: ${teamHoldsBothJacks}, opponents Js after teammate: ${allOpponentJsAfterTeammate}]. ` +
              `Exception 3: (all J/9 of suit gone): ${allPointCardsGone} [J and 9 of ${leadSuitForTrump} in won piles]. ` +
              `No exceptions apply, so trumping is the best play to take control of the round. ` +
              `Selected trump card: ${selectedCard}. ` +
              `Smart selection considers: ${!trumpAlreadyInRound ? "initial trumping (no trumps played yet)" : "trump already played in round"}. ` +
              `This optimizes for winning the current round while preserving higher trumps for future rounds.`;

            reasoning.selectedCard = selectedCard;
            this.logReasoning(reasoning);
            return selectedCard;
          }
        }
      }

      // We can win, but we don't hold the Boss card.
      const isLastPlayer = this.isLastPlayerInRound(
        currentRoundCards.length,
        gameState,
      );

      if (isLastPlayer) {
        // IMPROVEMENT #1: Smart trump card selection when trumping
        const leadSuit = this.getLeadSuit(currentRoundCards);
        const trumpMoves = winningMoves.filter(
          (card) => trumpSuit && this.getCardSuit(card) === trumpSuit,
        );
        const isUsingTrump = trumpMoves.length > 0 && leadSuit !== trumpSuit;

        if (isUsingTrump && trumpSuit) {
          // Determine if this is initial trumping (no trumps played yet in round)
          const trumpAlreadyPlayed = currentRoundCards.some((cardDrop) => {
            const card = cardDrop.split("-")[0];
            return this.getCardSuit(card) === trumpSuit;
          });

          const selectedCard = this.selectSmartTrumpCard(
            trumpMoves,
            currentRoundCards,
            trumpSuit,
            !trumpAlreadyPlayed,
          );

          reasoning.strategy = "LAST_PLAYER_SMART_TRUMP";
          reasoning.reasoning =
            `Last player in round and can win by trumping. ` +
            `Lead suit is ${leadSuit}, trump suit is ${trumpSuit}. ` +
            `Trump moves available: [${trumpMoves.join(", ")}]. ` +
            `Selected trump card: ${selectedCard}. ` +
            `Smart selection considers: ${!trumpAlreadyPlayed ? "initial trumping (no trumps played yet)" : "trump already played in round"}. ` +
            `This optimizes for winning the current round while preserving higher trumps for future rounds.`;
          reasoning.selectedCard = selectedCard;
          this.logReasoning(reasoning);
          return selectedCard;
        }

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

    // STRATEGY 2.75: IMPROVEMENT #3 - Play teammate's discarded suits
    // Track suits that teammates have discarded (played different suits)
    // Play those suits to give teammate opportunity to trump
    if (trumpSuit && currentRoundCards.length === 0 && !isNoesGame) {
      const teammateDiscards = this.extractTeammateDiscardedSuits(
        gameState,
        botAgentId,
      );

      // Collect all suits that at least one teammate is missing
      const discardedSuits: Set<string> = new Set();
      teammateDiscards.forEach((suits, teammateId) => {
        suits.forEach((suit) => discardedSuits.add(suit));
      });

      if (discardedSuits.size > 0) {
        // Find cards in suits that teammates have discarded
        const discardSuitMoves = legalMoves.filter((card) => {
          const suit = this.getCardSuit(card);
          return discardedSuits.has(suit);
        });

        if (discardSuitMoves.length > 0) {
          // Play highest card in discarded suit (not J to preserve it)
          const nonJackMoves = discardSuitMoves.filter(
            (c) => c.slice(2) !== "J",
          );
          const movesToConsider =
            nonJackMoves.length > 0 ? nonJackMoves : discardSuitMoves;
          const selectedCard = this.highestCard(movesToConsider);
          const selectedSuit = this.getCardSuit(selectedCard);

          // Find which teammates are missing this suit
          const teammatesCanTrump: string[] = [];
          teammateDiscards.forEach((suits, teammateId) => {
            if (suits.has(selectedSuit)) {
              teammatesCanTrump.push(teammateId);
            }
          });

          reasoning.strategy = "TEAMMATE_DISCARD_TRUMP_OPPORTUNITY";
          reasoning.reasoning =
            `Analyzing teammate discarded suits for trumping opportunities. ` +
            `Teammates have discarded suits: [${Array.from(discardedSuits).join(", ")}]. ` +
            `Playing ${selectedCard} in suit ${selectedSuit} that teammates have discarded to give them opportunity to trump. ` +
            `This can help teammates win the round while we conserve other cards. ` +
            `Teammates who can potentially trump this: [${teammatesCanTrump.join(", ")}].`;
          reasoning.selectedCard = selectedCard;
          this.logReasoning(reasoning);
          return selectedCard;
        }
      }
    }

    // STRATEGY 3: Cannot win or chose not to win - Duck strategy
    // BIDDING-AWARE: Prefer playing safe suits (where teammate has Jack or opponent doesn't)

    // STRATEGY 3-A: CONNECTION PASS (No-Trump games only, leading the round)
    // If this is a No-Trump game and we are leading (no cards in round yet),
    // and we have no winning moves, play a "connection card" in a suit where
    // a teammate has revealed Jacks — passing control so they can win.
    if (isNoesGame && currentRoundCards.length === 0) {
      const connectionSuit = this.getBestConnectionSuit(
        gameState,
        botAgentId,
        myCards,
        playedCards,
      );

      if (connectionSuit) {
        const connectionCards = myCards.filter(
          (c) => this.getCardSuit(c) === connectionSuit,
        );
        // Prefer a non-Jack card so we keep Jacks for our own winning rounds
        const nonJackConnections = connectionCards.filter(
          (c) => c.slice(2) !== "J",
        );
        const candidatePool =
          nonJackConnections.length > 0 ? nonJackConnections : connectionCards;
        const selectedCard = this.lowestCard(candidatePool);

        // Double-check we really have no boss cards in our hand before passing
        const myBossCards = legalMoves.filter((c) =>
          this.isHighestCard(c, playedCards, undefined),
        );

        if (myBossCards.length === 0) {
          reasoning.strategy = "CONNECTION_PASS";
          reasoning.reasoning =
            `NO-TRUMP GAME: No boss cards remaining in hand — all my winning rounds are done. ` +
            `Identified connection suit [${connectionSuit}] where a teammate has Jacks. ` +
            `Playing [${selectedCard}] as connection card to PASS CONTROL to that teammate. ` +
            `Teammate can then win the remaining rounds with their Jack(s) in ${connectionSuit}. ` +
            `This is the key 56 No-Trump chain: win your rounds → play connection → teammate wins theirs.`;
          reasoning.selectedCard = selectedCard;
          this.logReasoning(reasoning);
          return selectedCard;
        }
      }
    }

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
    // Capture for GameCore to emit to clients
    this.lastReasoning = {
      botId: reasoning.botId,
      type: reasoning.selectedCard !== undefined ? "card" : "bid",
      strategy: reasoning.strategy || "",
      reasoning: reasoning.reasoning || "",
      decision: reasoning.selectedCard ?? reasoning.decision ?? "",
      gameMode: reasoning.gameMode || "",
    };

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
   * NEW BOT LOGIC IMPROVEMENTS
   * =============================================================================
   * Extract information from bidding phase to inform card play decisions
   */

  /**
   * Select a smart trump card when trumping a suit initially
   * PRESERVE HIGH TRUMP CARDS (J and 9) for later round with bigger points.
   * Use medium-level trump cards (A, 10, K, Q) when first trumping a suit.
   * Only use J or 9 when absolutely necessary (e.g., opponent already played a trump)
   * @param trumpCards Array of trump cards in hand
   * @param currentRoundCards Cards already played in the current round
   * @param trumpSuit The trump suit for the game
   * @param isInitialTrump Whether this is the initial trumping of a suit (first time playing a trump in this round)
   * @returns Selected trump card to play
   */
  private selectSmartTrumpCard(
    trumpCards: string[],
    currentRoundCards: string[],
    trumpSuit: string,
    isInitialTrump: boolean,
  ): string {
    if (trumpCards.length === 0) return "";

    // Check if any trump has already been played in this round
    const trumpAlreadyPlayed = currentRoundCards.some((cardDrop) => {
      const card = cardDrop.split("-")[0];
      return this.getCardSuit(card) === trumpSuit;
    });

    // If opponent already played trump, we might need to use J or 9 to win
    if (trumpAlreadyPlayed) {
      // Find the highest trump card played so far
      const trumpsPlayed = currentRoundCards
        .filter((cardDrop) => {
          const card = cardDrop.split("-")[0];
          return this.getCardSuit(card) === trumpSuit;
        })
        .map((cardDrop) => cardDrop.split("-")[0]);

      const highestTrumpPlayed = this.highestCard(trumpsPlayed);
      const highestTrumpValue = this.getCardValue(highestTrumpPlayed);

      // Find trump cards that can beat the highest trump played
      const winningTrumps = trumpCards.filter(
        (card) => this.getCardValue(card) > highestTrumpValue,
      );

      if (winningTrumps.length > 0) {
        // Use the lowest trump that can still win (preserve higher ones)
        return this.lowestCard(winningTrumps);
      }
    }

    // If trumping initially (first time, no trump player yet)
    // PRESERVE J and 9 - use a medium-level trump (A, 10, K, Q) if possible
    if (isInitialTrump) {
      const mediumTrumps = trumpCards.filter((card) => {
        const rank = card.slice(2);
        return rank !== "J" && rank !== "9";
      });

      if (mediumTrumps.length > 0) {
        // Use the highest medium trump to ensure win (A >10 > K > Q)
        return this.highestCard(mediumTrumps);
      }
    }

    // If we have no choice but to use J or 9, use the lowest trump card available
    return this.lowestCard(trumpCards);
  }

  /**
   * Find single-card non-trump suits in hand
   * These are ideal candidates for discarding to create future trumping opportunities
   * @param myCards Bot's current hand
   * @param trumpSuit The trump suit for the game
   * @returns Array of single-card non-trump suits in hand
   */
  private findSingleCardNonTrumpSuits(
    myCards: string[],
    trumpSuit: string,
  ): string[] {
    if (!trumpSuit || trumpSuit === "N") return [];

    const suitCounts: Map<string, string[]> = new Map();

    // Group cards by suit (excluding trump suit)
    myCards.forEach((card) => {
      const suit = this.getCardSuit(card);
      if (suit !== trumpSuit) {
        if (!suitCounts.has(suit)) {
          suitCounts.set(suit, []);
        }
        suitCounts.get(suit)!.push(card);
      }
    });

    // Find suits with exactly one card
    const singleCards: string[] = [];
    suitCounts.forEach((cards, suit) => {
      if (cards.length === 1) {
        singleCards.push(cards[0]);
      }
    });

    return singleCards;
  }

  /**
   * Extract suits that teammates have discarded (played different suit when leading).
   * This indicates they don't have that suit and can trump it.
   * Tracks from the game's round history
   * @param gameState Current game state
   * @param botAgentId Bot's player ID
   * @returns Map of teammate ID to array of suits they're missing
   */
  private extractTeammateDiscardedSuits(
    gameState: ICardGame,
    botAgentId: string,
  ): Map<string, Set<string>> {
    const teammateDiscards: Map<string, Set<string>> = new Map();
    const teammates = this.getTeammates(botAgentId, gameState);

    // Initialize for each teammate
    teammates.forEach((teammateId) => {
      teammateDiscards.set(teammateId, new Set<string>());
    });

    // Analyze completed rounds from team piles
    // If a teammate played a different suit than the lead suit, they likely don't have that suit
    const allRounds = gameState.roundHistory || [];

    allRounds.forEach((round) => {
      if (!round.cards || round.cards.length === 0) return;

      const leadCard = round.cards[0];
      const leadSuit = this.getCardSuit(leadCard.split("-")[0]);

      round.forEach((cardDrop: string) => {
        const [card, playerId] = cardDrop.split("-");
        const cardSuit = this.getCardSuit(card);

        // If teammate played a different suit than the lead suit, they likely don't have that suit
        if (
          teammates.includes(playerId) &&
          cardSuit !== leadSuit &&
          cardDrop !== leadCard
        ) {
          if (!teammateDiscards.has(playerId)) {
            teammateDiscards.set(playerId, new Set<string>());
          }
          teammateDiscards.get(playerId)!.add(leadSuit);
        }
      });
    });

    // Also check current round
    const currentRoundCards =
      gameState.dropCardPlayer || gameState.dropDetails || [];
    if (currentRoundCards.length > 0) {
      const leadCard = currentRoundCards[0];
      const leadSuit = this.getCardSuit(leadCard.split("-")[0]);

      currentRoundCards.forEach((cardDrop) => {
        const [card, playerId] = cardDrop.split("-");
        const cardSuit = this.getCardSuit(card);

        if (
          teammates.includes(playerId) &&
          cardSuit !== leadSuit &&
          cardDrop !== leadCard
        ) {
          if (!teammateDiscards.has(playerId)) {
            teammateDiscards.set(playerId, new Set<string>());
          }
          teammateDiscards.get(playerId)!.add(leadSuit);
        }
      });
    }

    return teammateDiscards;
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
    // Capture for GameCore to emit to clients
    this.lastReasoning = {
      botId: reasoning.botId,
      type: "bid",
      strategy: reasoning.strategy || "",
      reasoning: reasoning.reasoning || "",
      decision: reasoning.decision || "",
      gameMode: reasoning.teamId === 0 ? "Team A" : "Team B",
    };

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

    // First, evaluate if we have a strong suit to reveal
    const hasNewStrongSuit = this.hasUnrevealedStrongSuit(
      botPlayerId,
      gameState,
      handProfile,
    );

    // PROGRESSIVE REVELATION: Only reveal additional cards in same suit if:
    // 1. No new strong suit to reveal, AND
    // 2. We have 5-6 cards in the previously bid suit (indicating a strong hand)
    const revealAdditional = this.shouldRevealAdditionalCards(
      botPlayerId,
      gameState,
      handProfile,
    );

    // -- HARD STOP: If the bid is already at 56, there is nothing left to bid.
    // 56 is the highest possible bid. After 56 is bid, the only legal actions
    // are Double and Re-Double. Any further suit/value bid would be invalid. We must pass.
    if (currentHighBid && currentHighBid.bidValue >= 56) {
      reasoning.strategy = "PASS_BID_ALREADY_56";
      reasoning.reasoning =
        `Current high bid is already 56 (${currentHighBid.suit} by ${currentHighBid.playerId}). ` +
        `56 is the maximum bid — no further bids are valid. ` +
        `Only Double/Re-Double can follow. Passing.`;
      reasoning.decision = "PASS (bid already at 56)";
      this.logBiddingReasoning(reasoning);
      return { action: "pass" };
    }

    if (
      !hasNewStrongSuit.hasStrong &&
      revealAdditional.shouldReveal &&
      currentHighBid
    ) {
      // Calculate new bid value with correct increment (+! for each additional card)
      const suitProfile = handProfile.suitProfiles[revealAdditional.suit!];
      let bidValue = currentHighBid.bidValue + revealAdditional.bidModifier;
      bidValue = Math.min(56, bidValue);

      reasoning.strategy = "PROGRESSIVE_REVELATION";
      reasoning.reasoning = `Previously bid ${revealAdditional.suit}. Have ${suitProfile.length} cards total in this suit. No new strong suit to reveal. Using progressive revelation to show ${revealAdditional.additionalCards} additional card(s) with +${revealAdditional.bidModifier} modifier. Bidding ${bidValue} ${revealAdditional.suit}.`;
      reasoning.decision = `BID ${bidValue} ${revealAdditional.suit} (+${revealAdditional.bidModifier})`;
      this.logBiddingReasoning(reasoning);
      return {
        action: "bid",
        bidValue: bidValue,
        suit: revealAdditional.suit!,
        bidSelectionType: "modifier",
        clickOrder: "suitFirst",
        bidModifier: revealAdditional.bidModifier,
        noTrumpType: null,
      };
    }

    // ── NEW STRATEGIES ──────────────────────────────────────────────────────────

    // STRATEGY: FINAL 56 NO-TRUMP CALL
    // When team has claimed all 8 rounds and No-Trump is established, caller wins.
    const final56 = this.checkFinal56Call(botPlayerId, gameState);
    if (final56) {
      const teamRoundsFor56 = this.estimateTeamRoundsFromBids(
        botPlayerId,
        gameState,
      );
      reasoning.strategy = "FINAL_56_NO_TRUMP";
      reasoning.reasoning = `I made the original strong bid for the team. Team has collectively claimed ${teamRoundsFor56} rounds through bidding (≥8). No-Trump has been proposed by the team. This is the moment to call 56 No-Trump — the team has revealed enough strength across suits + connection to win all 8 rounds without trump!`;
      reasoning.decision = "BID 56 No-Trump (FINAL CALL!)";
      this.logBiddingReasoning(reasoning);
      return final56;
    }

    // STRATEGY: CONNECTION BID
    // After revealing own suit, if I have a card in a teammate's revealed suit,
    // bid "+1 [that suit]" to signal I can pass control to that teammate.
    const connectionBid = this.checkConnectionBid(
      botPlayerId,
      gameState,
      handProfile,
      myCards,
      currentHighBid,
    );
    if (connectionBid) {
      const teammateBidSuitsForLog = this.getTeammateBidSuits(
        botPlayerId,
        gameState,
      );
      const connectionSuit = connectionBid.suit!;
      const myCardsInConnectionSuit = myCards.filter(
        (c) => this.getCardSuit(c) === connectionSuit,
      );
      reasoning.strategy = "CONNECTION_BID";
      reasoning.reasoning =
        `Already revealed my main suit(s). Teammate revealed strong hand (Jacks) in ${connectionSuit}. ` +
        `I have ${myCardsInConnectionSuit.length} card(s) in ${connectionSuit} — this is my CONNECTION CARD. ` +
        `Bidding +1 ${connectionSuit} signals: "Once I finish winning my rounds I can play ${connectionSuit} to pass control to teammate who will win remaining rounds." ` +
        `This is critical for 56 No-Trump: without a connection, we cannot chain the 8-round win.`;
      reasoning.decision = `BID +1 ${connectionSuit} (CONNECTION)`;
      this.logBiddingReasoning(reasoning);
      return connectionBid;
    }

    // STRATEGY: NO-TRUMP PROPOSAL
    // When team has revealed ≥7 rounds (or teammate already proposed No-Trump),
    // push towards No-Trump game mode instead of a trump suit.
    const noTrumpProposal = this.checkNoTrumpProposal(
      botPlayerId,
      gameState,
      handProfile,
      currentHighBid,
    );
    if (noTrumpProposal) {
      const teamRoundsForNT = this.estimateTeamRoundsFromBids(
        botPlayerId,
        gameState,
      );
      const teammateBidSuitsForNT = this.getTeammateBidSuits(
        botPlayerId,
        gameState,
      );
      const allTeammateSuits = ([] as { suit: string; hasJack: boolean }[])
        .concat(...Object.values(teammateBidSuitsForNT))
        .map((s) => s.suit)
        .join(", ");
      reasoning.strategy = "NO_TRUMP_PROPOSAL";
      reasoning.reasoning =
        `Team has collectively claimed ${teamRoundsForNT} rounds through bidding. ` +
        `Teammate suits revealed: [${allTeammateSuits || "none yet"}]. ` +
        `Proposing No-Trump game: in a No-Trump game the team can win 56 points by chaining Jacks across suits + connection cards. ` +
        `Bidding No-Trump gives the main bidder the opportunity to reveal connection OR call 56 No-Trump. ` +
        `Playing No-Trump avoids giving opponents trump-advantage; the team wins with pure card strength.`;
      reasoning.decision = `BID ${noTrumpProposal.bidValue} No-Trump (PROPOSE)`;
      this.logBiddingReasoning(reasoning);
      return noTrumpProposal;
    }

    // ── END NEW STRATEGIES ───────────────────────────────────────────────────────

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
   * Decide whether to raise the bid after winning the bidding round
   * @param gameState Current game state
   * @param botToken Bot's token for card access
   * @param botPlayerId Bot's player ID
   * @returns Bid raise decision
   */
  decideBidRaise(
    gameState: ICardGame,
    botToken: string,
    botPlayerId: string,
  ): BotBidRaiseDecision {
    const myCards = gameState[botToken] || [];
    const currentBidValue = parseInt(gameState.currentBet || "28");
    const currentSuit = gameState.currentSuit || "N";

    console.log(
      "\n┌──────────────────────────────────────────────────────────────────────┐",
    );
    console.log(
      `│ Bot BID RAISE DECISION - Player: ${botPlayerId.padEnd(38)} │`,
    );
    console.log(
      "├──────────────────────────────────────────────────────────────────────┤",
    );
    console.log(`│ Current Bid: ${currentBidValue.toString().padEnd(54)} │`);
    console.log(`│ Current Suit: ${currentSuit.padEnd(53)} │`);

    // CAn't raise if already at 56
    if (currentBidValue >= 56) {
      console.log(
        "│ Decision: SKIP (already at maximum bid)                              │",
      );
      console.log(
        "└──────────────────────────────────────────────────────────────────────┘\n",
      );
      return { raise: false };
    }

    // Analyze hand to see if we have unrevealed strength
    const handProfile = this.analyzeHandForBidding(myCards);
    const suitProfile = handProfile.suitProfiles[currentSuit];

    // Check if we have unrevealed cards in the trump suit
    const bidHistory = gameState.bidHistory || [];
    const myBids = bidHistory.filter(
      (entry) => entry.playerId === botPlayerId && entry.action === "bid",
    );

    // Calculate how many cards we've revealed through bidding
    let revealedCards = 0;
    for (const bid of myBids) {
      if (bid.suit === currentSuit) {
        // Look at bid selection type to determine revealed cards
        if (bid.bidSelectionType === "direct") {
          revealedCards = Math.max(revealedCards, 2); // Direct bid reveals 2 cards minimum
        } else if (bid.bidSelectionType === "modifier" && bid.bidModifier) {
          revealedCards = Math.max(revealedCards, 2 + bid.bidModifier);
        }
      }
    }

    const unrevealedCards = Math.max(
      0,
      (suitProfile?.length || 0) - revealedCards,
    );

    console.log(
      `│ Trump Suit Cards: ${(suitProfile?.length || 0).toString().padEnd(51)} │`,
    );
    console.log(`│ Revealed Cards: ${revealedCards.toString().padEnd(53)} │`);
    console.log(
      `│ Unrevealed Cards: ${unrevealedCards.toString().padEnd(51)} │`,
    );
    console.log(
      `│ Hand Points: ${handProfile.totalPoints.toString().padEnd(54)} │`,
    );
    console.log(
      `│ Trump Suit Jacks: ${(suitProfile?.jacks || 0).toString().padEnd(51)} │`,
    );

    // Determine if we should raise
    let shouldRaise = false;
    let targetBidLevel = currentBidValue;
    let reasoning = "";

    // Decision criteria:
    // 1. Have unrevealed cards that could win more points
    // 2. Have strong hand (5+ cards with or 6+ cards)
    // 3. Have overall hand strength

    if (suitProfile && suitProfile.length >= 5 && suitProfile.jacks >= 1) {
      // Strong hand with Jack - can likely win higher bid
      const estimatedTricks = this.estimateTricksForSuit(suitProfile);

      if (estimatedTricks >= 4 && currentBidValue < 40) {
        shouldRaise = true;
        targetBidLevel = 40; // Aim for 40 if we have strong hand with Jack
        reasoning = `Strong hand ${suitProfile.length} cards, ${suitProfile.jacks} J) with ${estimatedTricks} estimated tricks. Raising to 40.`;
      } else if (estimatedTricks >= 5 && currentBidValue < 48) {
        shouldRaise = true;
        targetBidLevel = 48;
        reasoning = `Very strong hand ${suitProfile.length} cards, ${suitProfile.jacks} J) with ${estimatedTricks} estimated tricks. Raising to 48.`;
      } else if (estimatedTricks >= 6 && currentBidValue < 56) {
        shouldRaise = true;
        targetBidLevel = 56;
        reasoning = `Exceptional hand ${suitProfile.length} cards, ${suitProfile.jacks} J) with ${estimatedTricks} estimated tricks. Raising to 56.`;
      }
    } else if (unrevealedCards >= 2 && handProfile.totalPoints >= 35) {
      // Have unrevealed strength that could justify higher bid
      if (currentBidValue < 40 && handProfile.totalPoints >= 35) {
        shouldRaise = true;
        targetBidLevel = 40;
        reasoning = `Have ${unrevealedCards} unrevealed cards and ${handProfile.totalPoints} points. Raising to 40.`;
      } else if (currentBidValue < 48 && handProfile.totalPoints >= 40) {
        shouldRaise = true;
        targetBidLevel = 48;
        reasoning = `Have ${unrevealedCards} unrevealed cards and ${handProfile.totalPoints} points. Raising to 48.`;
      }
    }

    console.log(`│ Reasoning: ${reasoning.substring(0, 57).padEnd(57)} │`);
    if (reasoning.length > 57) {
      console.log(`│            ${reasoning.substring(57, 114).padEnd(57)} │`);
    }
    console.log(
      `│ Decision: ${(shouldRaise ? `RAISE to ${targetBidLevel}` : "SKIP").padEnd(60)} │`,
    );
    console.log(
      "└──────────────────────────────────────────────────────────────────────┘",
    );

    return {
      raise: shouldRaise,
      newBidValue: shouldRaise ? targetBidLevel : undefined,
    };
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
   * Check if bot has an unrevealed strong suit (4+ cards that haven't been bid yet)
   * Returns true if bot has a new suit worth revealing instead of rebidding same suit
   */
  private hasUnrevealedStrongSuit(
    botPlayerId: string,
    gameState: ICardGame,
    handProfile: any,
  ): {
    hasStrong: boolean;
    suit: string | null;
  } {
    const botPreviousBids = this.getBotPreviousBids(botPlayerId, gameState);
    const previouslyBidSuits = new Set(
      botPreviousBids.map((bid) => bid.suit).filter((s) => s),
    );

    // Check each suit for unrevealed strength
    const suits = ["H", "E", "D", "C"];
    for (const suit of suits) {
      // Skip suits we've already bid (already revealed information about)
      if (previouslyBidSuits.has(suit)) continue;

      const suitProfile = handProfile.suitProfiles[suit];
      if (!suitProfile) continue;

      // Consider it strong if:
      // - 4+ cards with at least 1 Jack, OR
      // - 5+ cards even without Jack (long suit potential)
      const isStrong =
        (suitProfile.length >= 4 && suitProfile.jacks >= 1) ||
        suitProfile.length >= 5;

      if (isStrong) {
        return {
          hasStrong: true,
          suit: suit,
        };
      }
    }

    return {
      hasStrong: false,
      suit: null,
    };
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

    // ── SPECIAL CASE: Partner bid NOES (suit="N", noTrumpType="Noes") ────────
    // A "Noes" bid means: "I don't have the current suit; I can trump if opponents
    // play it."  This is NOT a No-Trump game proposal — it is a conventional signal.
    // The correct response for a bot that holds the previously-established team suit
    // is to BID BACK to that suit (e.g. 31 Diamond), so that:
    //   1. The game stays in the strong trump suit instead of defaulting to No-Trump.
    //   2. Other teammates / player get another opportunity to change or confirm the suit.
    if (partnerBid.suit === "N" && partnerBid.noTrumpType === "Noes") {
      // Find the team's established strong suit (last real suit bid by ANY teammate)
      const bidHistory = gameState.bidHistory || [];
      const teamId = this.getTeamId(botPlayerId, gameState);
      let teamEstablishedSuit: string | null = null;

      // Walk history backwards to find the most recent real suit bid from the team
      for (let i = bidHistory.length - 1; i >= 0; i--) {
        const entry = bidHistory[i];
        if (
          entry.action === "bid" &&
          entry.suit &&
          entry.suit !== "N" &&
          this.getTeamId(entry.playerId, gameState) === teamId
        ) {
          teamEstablishedSuit = entry.suit;
          break;
        }
      }

      if (teamEstablishedSuit && currentHighBid) {
        const suitProfile = handProfile.suitProfiles[teamEstablishedSuit];
        const myCardsInSuit = suitProfile ? suitProfile.length : 0;

        // Only bid back if we have cards in the team's suit
        if (myCardsInSuit >= 1) {
          const bidValue = Math.min(56, currentHighBid.bidValue + 1);
          const hasJack = suitProfile ? suitProfile.jacks >= 1 : false;
          const signal = this.determineBiddingSignal(
            myCardsInSuit,
            hasJack,
            true, // isSupporting
          );

          reasoning.strategy = "NOES_RECLAIM_TEAM_SUIT";
          reasoning.reasoning =
            `Teammate bid Noes (suit=N, noTrumpType=Noes), signalling they do NOT have ` +
            `${teamEstablishedSuit} and can trump it if opponents play it. ` +
            `This is a conventional signal — NOT a proposal to play No-Trump. ` +
            `Bidding back to ${teamEstablishedSuit} (${bidValue}) to: ` +
            `(1) keep the game in the team's established strong trump suit, ` +
            `(2) give other teammates and the main player another round to change or confirm the suit, ` +
            `(3) prevent the auction from defaulting to a No-Trump game the team didn't intend. ` +
            `I have ${myCardsInSuit} card(s) in ${teamEstablishedSuit}${hasJack ? " including a Jack" : ""}.`;
          reasoning.decision = `BID ${bidValue} ${teamEstablishedSuit} (reclaim team suit after Noes)`;
          this.logBiddingReasoning(reasoning);
          return {
            action: "bid",
            bidValue,
            suit: teamEstablishedSuit,
            bidSelectionType: signal.bidSelectionType,
            clickOrder: signal.clickOrder,
            bidModifier: signal.bidModifier,
            noTrumpType: null,
          };
        }
      }
      // If we have no cards in the team suit, fall through to normal logic
    }
    // ── END Noes response handling ────────────────────────────────────────────

    // ── SPECIAL CASE: Partner's latest bid is a No-Trump PROPOSAL ────────────
    // When a teammate bids No-Trump (suit="N", noTrumpType="No-Trump") they are
    // proposing to play the game without trump.  We should:
    //   A) Confirm with our own No-Trump bid if the team already has enough rounds, or
    //   B) Pass to give the main bidder room to reveal their connection card / call 56.
    // We must NOT change back to a regular suit here (old NOES_RESPONSE logic).
    if (partnerBid.suit === "N" && partnerBid.noTrumpType === "No-Trump") {
      const teamRounds = this.estimateTeamRoundsFromBids(
        botPlayerId,
        gameState,
      );

      // Check if I already proposed No-Trump
      const bidHistory = gameState.bidHistory || [];
      const iAlreadyProposed = bidHistory.some(
        (bid) =>
          bid.action === "bid" &&
          bid.suit === "N" &&
          bid.noTrumpType === "No-Trump" &&
          bid.playerId === botPlayerId,
      );

      if (!iAlreadyProposed && teamRounds >= 6 && currentHighBid) {
        // Confirm No-Trump to help push the team towards the 56 call
        const bidValue = Math.min(56, currentHighBid.bidValue + 1);
        reasoning.strategy = "CONFIRM_NO_TRUMP_PROPOSAL";
        reasoning.reasoning =
          `Teammate proposed No-Trump (suit=N, noTrumpType=No-Trump). ` +
          `Team has claimed ${teamRounds} rounds so far. ` +
          `Confirming No-Trump to reinforce the game-mode preference and ` +
          `give the main bidder a chance to reveal connection or call 56 No-Trump. ` +
          `In No-Trump the team wins by chaining Jack-rounds across suits with connection cards.`;
        reasoning.decision = `BID ${bidValue} No-Trump (CONFIRM)`;
        this.logBiddingReasoning(reasoning);
        return {
          action: "bid",
          bidValue,
          suit: "N",
          bidSelectionType: "direct",
          clickOrder: null,
          noTrumpType: "No-Trump",
          bidModifier: 0,
        };
      }

      // Not enough rounds or already confirmed — pass to let main bidder move
      reasoning.strategy = "NO_TRUMP_PASS_TO_MAIN_BIDDER";
      reasoning.reasoning =
        `Teammate proposed No-Trump. ` +
        (iAlreadyProposed
          ? `I already confirmed No-Trump. `
          : `Team has ${teamRounds} rounds claimed (need ≥6 to confirm). `) +
        `Passing to give the main bidder room to reveal connection card or call 56 No-Trump.`;
      reasoning.decision = "PASS (let main bidder call 56)";
      this.logBiddingReasoning(reasoning);
      return { action: "pass" };
    }
    // ── END No-Trump proposal handling ──────────────────────────────────────────

    // SPECIAL CASE: Teammate opened the auction
    // Standard practice: reveal hand if 3+ cards of same suit with at least one Jack (support convention)
    if (teammateOpened) {
      // IMPORTANT: Check partner's bid signal before supporting
      // 1. If partner bid with "+" (modifier, bidFirst) = weak hand with only J + 1-2 cards
      //   - Only support if we have the second J to make it visible, otherwise skip to find better options
      // 2. If partner bid suitFirst (no modifier) = weak hand with no J
      //   - Only support if we have at least one J to provide some control, otherwise skip to find better options

      const partnerBidModifier = partnerBid.bidSelectionType == "modifier";
      const partnerHasJack = partnerBid.clickOrder === "bidFirst";
      const partnerSuit = partnerBid.suit;

      // If partner used modifier (+ bid), apply special logic
      if (partnerBidModifier && partnerSuit && partnerSuit !== "N") {
        const ourSuitProfile = handProfile.suitProfiles[partnerSuit];

        if (partnerHasJack) {
          // Partner bid "+ <symbol>" = has J, weak hand (2-3 cards)
          // Only support if we have the second J
          if (!ourSuitProfile || ourSuitProfile.jacks < 1) {
            reasoning.strategy = "SKIP_WEAK_PARTNER_BID";
            reasoning.reasoning = `Partner bid modifier + ${partnerSuit} (weak hand, has J, 2-3 cards). We don't have second J in ${partnerSuit} (our J: ${ourSuitProfile ? ourSuitProfile.jacks : 0}). Not supporting to avoid increasing bid. Partner doesn't have a strong alternate suits or they would have bit them first. Looking for better options.`;
            reasoning.decision = "EVALUATE_OTHER_OPTIONS";
            // Don't support - fall through to check other options
          } else {
            // We have J too! Safe to support
            const supportHand = this.hasGoodSupportHand(
              handProfile.suitProfiles,
              true,
            );

            if (
              supportHand.hasGoodSupport &&
              supportHand.suit === partnerSuit
            ) {
              const supportSuitProfile =
                handProfile.suitProfiles[supportHand.suit!];
              const supportTricks =
                this.estimateTricksForSuit(supportSuitProfile);
              let bidValue = 28 + Math.floor((supportTricks - 3) * 2);
              bidValue = Math.max(28, Math.min(56, bidValue));

              if (!currentHighBid || bidValue > currentHighBid.bidValue) {
                const signal = this.determineBiddingSignal(
                  supportHand.cardCount,
                  supportHand.hasJack,
                  true,
                );

                reasoning.strategy = "SUPPORT_WEAK_PARTNER_WITH_SECOND_J";
                reasoning.reasoning = `Partner bid modifier + ${partnerSuit} (weak, has J). We have the second J! Combined J strength makes this visible. Have ${supportHand.cardCount} cards with support. Supporting with +${supportHand.cardCount} cards in ${supportHand.suit}. Bidding ${supportHand.suit} ${bidValue}.`;
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
        } else {
          // Partner bid "<symbol> + " or "<symbol> number" (suitFirst) = NO J, weak hand
          // Only support if we have at least one J to provide some control
          if (!ourSuitProfile || ourSuitProfile.jacks < 1) {
            reasoning.strategy = "SKIP_NO_JACK_PARTNER_BID";
            reasoning.reasoning = `Partner bid modifier ${partnerSuit} (weak hand, no J). We don't have any J in ${partnerSuit} to provide control. Not supporting to avoid increasing bid. Partner doesn't have a strong alternate suits or they would have bit them first. Looking for better options.`;
            reasoning.decision = "EVALUATE_OTHER_OPTIONS";
            // Don't support - fall through to check other options
          } else {
            // We have J! Can rescue the suit
            const supportHand = this.hasGoodSupportHand(
              handProfile.suitProfiles,
              true,
            );

            if (
              supportHand.hasGoodSupport &&
              supportHand.suit === partnerSuit
            ) {
              const supportSuitProfile =
                handProfile.suitProfiles[supportHand.suit!];
              const supportTricks =
                this.estimateTricksForSuit(supportSuitProfile);
              let bidValue = 28 + Math.floor((supportTricks - 3) * 2);
              bidValue = Math.max(28, Math.min(56, bidValue));

              if (!currentHighBid || bidValue > currentHighBid.bidValue) {
                const signal = this.determineBiddingSignal(
                  supportHand.cardCount,
                  supportHand.hasJack,
                  true,
                );

                reasoning.strategy = "RESCUE_NO_JACK_PARTNER_WITH_J";
                reasoning.reasoning = `Partner bid modifier ${partnerSuit} (weak hand, no J). We have a J in ${partnerSuit} to provide some control. Have ${supportHand.cardCount} cards with support. Supporting with +${supportHand.cardCount} cards in ${supportHand.suit}. Bidding ${supportHand.suit} ${bidValue}.`;
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
        }
      }

      // Original logic for non-modifier bids (regular strong bids)
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
        // IMPORTANT: Check partner's bid signal before supporting
        const partnerBidModifier = partnerBid.bidSelectionType == "modifier";
        const partnerHasJack = partnerBid.clickOrder === "bidFirst";

        // If partner used modifier (+ bid), apply special logic
        if (partnerBidModifier) {
          if (partnerHasJack) {
            // Partner bid "+ <symbol>" weak hand with only J 1-2 cards
            // Only support if we have the second J

            if (partnerSuitProfile.jacks < 1) {
              reasoning.strategy = "SKIP_SUPPORTING_WEAK_PARTNER";
              reasoning.reasoning = `Partner bid modifier + ${partnerSuit} (weak hand, has J, 2-3 cards). We don't have second J in ${partnerSuit} (our J: ${partnerSuitProfile.jacks}). Not supporting to avoid increasing bid. Partner doesn't have a strong alternate suits or they would have bit them first. Looking for better options.`;
              reasoning.decision = "PASS or find alternative";
              // Skip supporting this suit fall through to check alternatives
            } else {
              // We have J! Can support
              const highCardCount =
                partnerSuitProfile.jacks + partnerSuitProfile.nines;
              const bidValue = partnerBidValue + highCardCount;
              const signal = this.determineBiddingSignal(
                partnerSuitProfile.length,
                partnerSuitProfile.jacks >= 1,
                true,
              );

              reasoning.strategy = "SUPPORT_WEAK_PARTNER_WITH_SECOND_J";
              reasoning.reasoning = `Partner bid modifier ${partnerSuit} (weak, has J). We have the second J! Combined J strength makes this visible. Have ${partnerSuitProfile.length} cards with ${highCardCount} high card(s). Supporting with +${highCardCount}.`;
              const bidDisplay =
                signal.clickOrder === "bidFirst"
                  ? `BID ${bidValue} ${partnerSuit}`
                  : `BID ${partnerSuit} ${bidValue}`;
              reasoning.decision = `${bidDisplay} (support)`;
              return {
                action: "bid",
                bidValue: bidValue,
                suit: partnerSuit,
                bidSelectionType: signal.bidSelectionType,
                clickOrder: signal.clickOrder,
                bidModifier: signal.bidModifier,
                noTrumpType: null,
              };
            }
          } else {
            // Partner bid "<symbol>" or "<symbol number" (suitFirst) = NO J, weak hand
            // Only support if we have at least ONE J
            if (partnerSuitProfile.jacks < 1) {
              reasoning.strategy = "SKIP_NO_JACK_PARTNER_SUPPORT";
              reasoning.reasoning = `Partner bid suitFirst ${partnerSuit} (no J - weak hand). We don't have any J in ${partnerSuit} (our J: ${partnerSuitProfile.jacks}). Without J, this suit is vulnerable to opponent control. Not supporting - opponents with J could double and dominate. Looking for alternative options.`;
              reasoning.decision = "PASS or find alternative";
              // Skip supporting this suit fall through to check alternatives
            } else {
              // We have J! Can support
              const highCardCount =
                partnerSuitProfile.jacks + partnerSuitProfile.nines;
              const bidValue = partnerBidValue + highCardCount;
              const signal = this.determineBiddingSignal(
                partnerSuitProfile.length,
                partnerSuitProfile.jacks >= 1,
                true,
              );

              reasoning.strategy = "RESCUE_NO_JACK_PARTNER";
              reasoning.reasoning = `Partner bid suitFirst ${partnerSuit} (no J - weak hand). We have a J in ${partnerSuit}! This gives us some control and makes supporting viable. Have ${partnerSuitProfile.length} cards with ${highCardCount} high card(s). Supporting with +${highCardCount} to strengthen partner's weak suit.`;
              const bidDisplay2 =
                signal.clickOrder === "bidFirst"
                  ? `BID ${bidValue} ${partnerSuit}`
                  : `BID ${partnerSuit} ${bidValue}`;
              reasoning.decision = `${bidDisplay2} (rescue)`;
              return {
                action: "bid",
                bidValue: bidValue,
                suit: partnerSuit,
                bidSelectionType: signal.bidSelectionType,
                clickOrder: signal.clickOrder,
                bidModifier: signal.bidModifier,
                noTrumpType: null,
              };
            }
          }
        } else {
          // Partner used direct bid (not modifier) - regular strong bid
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
      reasoning.reasoning = `Team starts but no opening hand (need 3+ cards with J). Best suit ${handProfile.bestSuit}: ${handProfile.suitProfiles[handProfile.bestSuit]?.length || 0} cards, ${handProfile.suitProfiles[handProfile.bestSuit]?.jacks || 0} J. Passing - will default to 28 Noes.`;
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

  // =============================================================================
  // NO-TRUMP STRATEGY HELPERS
  // =============================================================================

  /**
   * Estimate total winning rounds the team has claimed via bidding.
   * Rule: each bid increment (+N above previous bid) from a team member = N rounds claimed.
   * No-Trump bids (suit="N") update the running bid value but don't claim new rounds.
   */
  private estimateTeamRoundsFromBids(
    botPlayerId: string,
    gameState: ICardGame,
  ): number {
    const bidHistory = gameState.bidHistory || [];
    const teamId = this.getTeamId(botPlayerId, gameState);
    let totalRounds = 0;
    let previousBidValue = 28;

    for (const bid of bidHistory) {
      if (bid.action !== "bid" || !bid.bidValue) continue;

      if (bid.suit === "N") {
        // No-Trump bids don't claim new rounds but move the running value
        previousBidValue = bid.bidValue;
        continue;
      }

      const bidderTeam = this.getTeamId(bid.playerId, gameState);
      if (bidderTeam === teamId) {
        const increment = bid.bidValue - previousBidValue;
        if (increment > 0) {
          totalRounds += increment;
        }
      }
      previousBidValue = bid.bidValue;
    }

    return totalRounds;
  }

  /**
   * Return a map of teammate → suits they have explicitly revealed via bidding
   * (including whether they indicated a Jack via bidFirst clickOrder).
   */
  private getTeammateBidSuits(
    botPlayerId: string,
    gameState: ICardGame,
  ): { [playerId: string]: { suit: string; hasJack: boolean }[] } {
    const bidHistory = gameState.bidHistory || [];
    const teamId = this.getTeamId(botPlayerId, gameState);
    const result: { [playerId: string]: { suit: string; hasJack: boolean }[] } =
      {};

    for (const bid of bidHistory) {
      if (bid.action !== "bid" || !bid.suit || bid.suit === "N") continue;
      const bidderTeam = this.getTeamId(bid.playerId, gameState);
      if (bidderTeam !== teamId || bid.playerId === botPlayerId) continue;

      if (!result[bid.playerId]) result[bid.playerId] = [];

      const existing = result[bid.playerId].find((s) => s.suit === bid.suit);
      if (!existing) {
        result[bid.playerId].push({
          suit: bid.suit,
          hasJack: bid.clickOrder === "bidFirst",
        });
      } else if (bid.clickOrder === "bidFirst") {
        // Upgrade to hasJack=true if later bid reveals it
        existing.hasJack = true;
      }
    }

    return result;
  }

  /**
   * Check whether the bot should reveal a "connection" card —
   * i.e., it has at least one card in a suit where a teammate announced Jacks,
   * signalling that the bot can pass control to that teammate.
   *
   * Returns the BotBidDecision to make, or null if no connection to reveal.
   */
  private checkConnectionBid(
    botPlayerId: string,
    gameState: ICardGame,
    handProfile: any,
    myCards: string[],
    currentHighBid: any,
  ): BotBidDecision | null {
    // Only applicable after bot has already revealed its own main suit
    const botPreviousBids = this.getBotPreviousBids(botPlayerId, gameState);
    if (botPreviousBids.length === 0) return null;

    const botBidSuits = new Set(
      botPreviousBids.map((b) => b.suit).filter((s) => s && s !== "N"),
    );

    const teammateBidSuits = this.getTeammateBidSuits(botPlayerId, gameState);

    for (const suits of Object.values(teammateBidSuits)) {
      for (const { suit, hasJack } of suits) {
        if (!hasJack) continue; // Only connect to teammate's Jack suits
        if (botBidSuits.has(suit)) continue; // Already bid this suit

        const myCardsInSuit = myCards.filter(
          (c) => this.getCardSuit(c) === suit,
        );
        if (myCardsInSuit.length === 0) continue;

        // We have a connection card!
        if (!currentHighBid) return null;
        const bidValue = Math.min(56, currentHighBid.bidValue + 1);

        return {
          action: "bid",
          bidValue,
          suit,
          bidSelectionType: "modifier",
          clickOrder: "suitFirst", // No Jack — just signalling connection
          bidModifier: 1,
          noTrumpType: null,
        };
      }
    }

    return null;
  }

  /**
   * Check whether the bot should propose "No-Trump" game mode.
   * Conditions:
   *  - Team has ≥7 bid-round claims (need one more for full 8 via connection or confirmation)
   *  - OR a teammate has already proposed No-Trump (bot should confirm)
   *  - Bot has no unrevealed strong suit left to show
   *  - Bot hasn't already proposed No-Trump
   */
  private checkNoTrumpProposal(
    botPlayerId: string,
    gameState: ICardGame,
    handProfile: any,
    currentHighBid: any,
  ): BotBidDecision | null {
    if (!currentHighBid) return null;

    const bidHistory = gameState.bidHistory || [];
    const teamId = this.getTeamId(botPlayerId, gameState);

    // Has the bot already proposed No-Trump?
    const iAlreadyProposed = bidHistory.some(
      (bid) =>
        bid.action === "bid" &&
        bid.suit === "N" &&
        bid.noTrumpType === "No-Trump" &&
        bid.playerId === botPlayerId,
    );
    if (iAlreadyProposed) return null;

    const teamRounds = this.estimateTeamRoundsFromBids(botPlayerId, gameState);

    // Did a teammate already propose No-Trump?
    const teammateProposedNoTrump = bidHistory.some(
      (bid) =>
        bid.action === "bid" &&
        bid.suit === "N" &&
        bid.noTrumpType === "No-Trump" &&
        this.getTeamId(bid.playerId, gameState) === teamId &&
        bid.playerId !== botPlayerId,
    );

    const shouldPropose = teamRounds >= 7 || teammateProposedNoTrump;
    if (!shouldPropose) return null;

    // Don't propose if we still have an unrevealed strong suit to show
    const hasUnrevealed = this.hasUnrevealedStrongSuit(
      botPlayerId,
      gameState,
      handProfile,
    );
    if (hasUnrevealed.hasStrong && !teammateProposedNoTrump) return null;

    // Also make sure there's a connection bid opportunity or the connection is already shown
    // i.e., the team will have its 8th round covered
    const bidValue = Math.min(56, currentHighBid.bidValue + 1);

    return {
      action: "bid",
      bidValue,
      suit: "N",
      bidSelectionType: "direct",
      clickOrder: null,
      noTrumpType: "No-Trump",
      bidModifier: 0,
    };
  }

  /**
   * Check whether the bot — as the original strong bidder — should make the
   * final "56 No-Trump" call.
   * Conditions:
   *  - Bot was the FIRST team member to make a real (non-28-Noes) bid
   *  - Team has ≥8 bid-round claims
   *  - No-Trump has been proposed at least once by the team
   *  - Current high bid is NOT already 56
   */
  private checkFinal56Call(
    botPlayerId: string,
    gameState: ICardGame,
  ): BotBidDecision | null {
    const bidHistory = gameState.bidHistory || [];
    const teamId = this.getTeamId(botPlayerId, gameState);

    // Find the first real bid by our team (excluding 28-Noes auto-pass)
    const firstRealTeamBid = bidHistory.find(
      (bid) =>
        bid.action === "bid" &&
        this.getTeamId(bid.playerId, gameState) === teamId &&
        !(bid.bidValue === 28 && bid.suit === "N"),
    );

    if (!firstRealTeamBid || firstRealTeamBid.playerId !== botPlayerId)
      return null;

    const teamRounds = this.estimateTeamRoundsFromBids(botPlayerId, gameState);
    if (teamRounds < 8) return null;

    // No-Trump must have been proposed by the team at least once
    const noTrumpProposed = bidHistory.some(
      (bid) =>
        bid.action === "bid" &&
        bid.suit === "N" &&
        bid.noTrumpType === "No-Trump" &&
        this.getTeamId(bid.playerId, gameState) === teamId,
    );
    if (!noTrumpProposed) return null;

    // Already at 56?
    const currentHighBid = this.getCurrentHighBid(gameState);
    if (currentHighBid && currentHighBid.bidValue >= 56) return null;

    return {
      action: "bid",
      bidValue: 56,
      suit: "N",
      bidSelectionType: "direct",
      clickOrder: null,
      noTrumpType: "No-Trump",
      bidModifier: 0,
    };
  }

  // =============================================================================
  // CONNECTION-AWARE CARD PLAY HELPERS
  // =============================================================================

  /**
   * Find the best suit to lead as a "connection pass" in a No-Trump game.
   * A connection suit is one where a teammate announced Jacks (via bidFirst)
   * and the bot still has a card in that suit to play as the pass card.
   *
   * Prefer suits where the teammate has MORE high cards (more winning potential).
   */
  private getBestConnectionSuit(
    gameState: ICardGame,
    botAgentId: string,
    myCards: string[],
    playedCards: Set<string>,
  ): string | null {
    const jackKnowledge = this.extractJackKnowledge(gameState, botAgentId);
    const suits = ["H", "E", "D", "C"];
    let bestSuit: string | null = null;
    let bestScore = 0;

    for (const [, jacksArr] of Object.entries(jackKnowledge.teammateJacks)) {
      for (const suit of jacksArr as string[]) {
        const myCardsInSuit = myCards.filter(
          (c) => this.getCardSuit(c) === suit,
        );
        if (myCardsInSuit.length === 0) continue;

        // Prefer a non-Jack card as the connection pass (preserve Jacks for winning)
        const nonJackCount = myCardsInSuit.filter(
          (c) => c.slice(2) !== "J",
        ).length;
        if (nonJackCount === 0 && myCardsInSuit.length === 0) continue;

        // Score = how many high cards remain in that suit for the team
        const remainingInSuit = this.getRemainingCardsInSuit(suit, playedCards);
        const score = remainingInSuit.length;

        if (score > bestScore) {
          bestScore = score;
          bestSuit = suit;
        }
      }
    }

    return bestSuit;
  }

  /**
   * In a No-Trump game, check whether the candidate discard is the LAST
   * connection card (the only card the bot has in a suit where a teammate
   * has Jacks). If so, it must be protected.
   */
  private isLastConnectionCard(
    card: string,
    myCards: string[],
    gameState: ICardGame,
    botAgentId: string,
  ): boolean {
    const suit = this.getCardSuit(card);
    const jackKnowledge = this.extractJackKnowledge(gameState, botAgentId);

    // Check if a teammate has Jacks in this suit
    const teammateHasJackInSuit = Object.values(
      jackKnowledge.teammateJacks,
    ).some((jacks: any) => jacks.includes(suit));

    if (!teammateHasJackInSuit) return false;

    // Only the last card in this suit matters
    const myCardsInSuit = myCards.filter((c) => this.getCardSuit(c) === suit);
    return myCardsInSuit.length === 1;
  }

  // =============================================================================
  // POINT STATUS HELPERS
  // =============================================================================

  /**
   * Compute the current point totals for both teams and determine targets.
   *
   * Returns:
   *  - myTeamPoints:       points the bot's team has captured so far (won trick piles)
   *  - opponentPoints:     points the opponent team has captured so far
   *  - myTeamIsTarget:     true if the bot's team placed the winning bid
   *  - bidTarget:          points the bidding team must reach to win (finalBid or currentBet)
   *  - pointsNeededByUs:   points the bot's team still needs to reach target (0 if not target team)
   *  - pointsNeededByOpp:  points the opponent team still needs to reach target (0 if not target team)
   *  - currentRoundPoints: total points in the current (in-progress) trick
   */
  private computePointStatus(
    gameState: ICardGame,
    botAgentId: string,
  ): {
    myTeamPoints: number;
    opponentPoints: number;
    myTeamIsTarget: boolean;
    bidTarget: number;
    pointsNeededByUs: number;
    pointsNeededByOpp: number;
    currentRoundPoints: number;
  } {
    const teamId = this.getTeamId(botAgentId, gameState);
    const isTeamA = teamId === 0;

    // Points captured in completed tricks
    const teamAPoints = this.sumCardPoints(gameState.teamACards || []);
    const teamBPoints = this.sumCardPoints(gameState.teamBCards || []);
    const myTeamPoints = isTeamA ? teamAPoints : teamBPoints;
    const opponentPoints = isTeamA ? teamBPoints : teamAPoints;

    // Points currently on the table in this trick
    const currentRoundCards =
      gameState.dropCardPlayer || gameState.dropDetails || [];
    const currentRoundPoints = currentRoundCards.reduce(
      (sum: number, drop: string) => {
        const card = drop.split("-")[0];
        return sum + this.getCardPoints(card);
      },
      0,
    );

    // Determine bidding team and target
    const bidTarget = parseInt(
      gameState.finalBid || gameState.currentBet || "28",
      10,
    );
    const biddingTeam =
      gameState.biddingTeam || gameState.lastBiddingTeam || null;
    // biddingTeam is "A" or "B"
    const biddingTeamId =
      biddingTeam === "A" ? 0 : biddingTeam === "B" ? 1 : -1;
    const myTeamIsTarget = biddingTeamId === teamId;

    const pointsNeededByUs = myTeamIsTarget
      ? Math.max(0, bidTarget - myTeamPoints)
      : 0;
    const pointsNeededByOpp = !myTeamIsTarget
      ? Math.max(0, bidTarget - opponentPoints)
      : 0;

    return {
      myTeamPoints,
      opponentPoints,
      myTeamIsTarget,
      bidTarget,
      pointsNeededByUs,
      pointsNeededByOpp,
      currentRoundPoints,
    };
  }

  /** Sum point values of a list of cards (from a team's won-trick pile). */
  private sumCardPoints(cards: string[]): number {
    return cards.reduce((sum, c) => sum + this.getCardPoints(c), 0);
  }
}
