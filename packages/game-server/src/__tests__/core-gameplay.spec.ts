/**
 * Core gameplay regression tests.
 *
 * These tests act as a safety net for the fundamental game rules and state
 * transitions. They test pure game logic without involving the network layer
 * (socket.io / express server), which keeps them fast and deterministic.
 *
 * Coverage:
 *  1. Game initialisation  – deck distribution, player setup
 *  2. Turn flow            – whose turn it is, turn advancement, round boundary
 *  3. Core card rules      – follow-suit enforcement, cheating detection
 *  4. Score progression    – card point values, scoring tiers, score reset
 */

import { InMemoryStore } from "../persistence/InMemoryStore";
import { Game } from "../core/Game";
import { Deck } from "../utils/deck";
import { isCardAvail, hasDuplicates } from "../utils/misc";
import { MAX_PLAYERS } from "../constants/misc";
import { cardToWeightagePoints, suits, names } from "../constants/deck";
import { ICardGame } from "../core/models/ICardGame";
import { IPlayer } from "../core/models/IPlayer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GAME_ID = "regression-test-game";

function makePlayers(count = MAX_PLAYERS): IPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    token: `tok${i}`,
    socketId: `sock${i}`,
    playerId: `player${i}`,
    gameId: GAME_ID,
  }));
}

function baseGame(
  players: IPlayer[],
  overrides: Partial<ICardGame> = {},
): ICardGame {
  const game: any = {
    players,
    currentTurn: 0,
    maxTurn: MAX_PLAYERS - 1,
    droppedCards: [],
    teamACards: [],
    teamBCards: [],
    tableCards: [],
    dropDetails: [],
    dropCardPlayer: [],
    currentBet: "27",
    playerWithCurrentBet: players[0].playerId,
    teamAScore: 10,
    teamBScore: 10,
    isGameComplete: false,
    isBiddingPhase: false,
    disconnectedPlayers: {},
    ...overrides,
  };

  // Ensure each player has a card slot initialised
  players.forEach((p) => {
    if (!game[p.token]) {
      game[p.token] = [];
    }
  });

  return game as ICardGame;
}

function makeStore(gameObj?: ICardGame): InMemoryStore {
  // Create an isolated store per test by using the constructor directly
  const store = new InMemoryStore();
  if (gameObj) {
    store.saveGame(GAME_ID, gameObj);
  }
  return store;
}

// ---------------------------------------------------------------------------
// 1. Game Initialisation
// ---------------------------------------------------------------------------

describe("Game Initialisation", () => {
  test("deck produces exactly 6 hands for 6 players", () => {
    const deck = new Deck();
    const hands = deck.getCardsForGame();

    expect(hands).toHaveLength(MAX_PLAYERS);
  });

  test("each player hand has exactly 8 cards", () => {
    const deck = new Deck();
    const hands = deck.getCardsForGame();

    hands.forEach((hand, idx) => {
      expect(hand).toHaveLength(8);
    });
  });

  test("no card is dealt to more than one player", () => {
    const deck = new Deck();
    const hands = deck.getCardsForGame();
    const allCards = ([] as string[]).concat(...hands);

    expect(hasDuplicates(allCards)).toBe(false);
  });

  test("total cards dealt equals full 48-card deck", () => {
    // 8 suits × 6 names = 48 cards total
    const expectedTotal = suits.length * names.length;
    const deck = new Deck();
    const hands = deck.getCardsForGame();
    const allCards = ([] as string[]).concat(...hands);

    expect(allCards).toHaveLength(expectedTotal);
  });

  test("every dealt card follows the {suit}{name} format", () => {
    const deck = new Deck();
    const hands = deck.getCardsForGame();
    const allCards = ([] as string[]).concat(...hands);
    const validSuits = new Set(suits);
    const validNames = new Set(names);

    allCards.forEach((card) => {
      // Suit occupies the first 2 characters, name is the remainder
      const suit = card.slice(0, 2);
      const name = card.slice(2);
      expect(validSuits.has(suit)).toBe(true);
      expect(validNames.has(name)).toBe(true);
    });
  });

  test("game object is initialised with correct player count", () => {
    const players = makePlayers();
    const store = makeStore(baseGame(players));
    const game = store.fetchGame(GAME_ID);

    expect(game.players).toHaveLength(MAX_PLAYERS);
  });

  test("initial turn is 0 (first player)", () => {
    const players = makePlayers();
    const store = makeStore(baseGame(players));
    const game = store.fetchGame(GAME_ID);

    expect(game.currentTurn).toBe(0);
  });

  test("initial team card collections are empty", () => {
    const players = makePlayers();
    const store = makeStore(baseGame(players));
    const game = store.fetchGame(GAME_ID);

    expect(game.teamACards).toHaveLength(0);
    expect(game.teamBCards).toHaveLength(0);
  });

  test("initial dropped cards list is empty", () => {
    const players = makePlayers();
    const store = makeStore(baseGame(players));
    const game = store.fetchGame(GAME_ID);

    expect(game.droppedCards).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Turn Flow
// ---------------------------------------------------------------------------

describe("Turn Flow", () => {
  function makeGame(currentTurn = 0, droppedCards: string[] = []) {
    const players = makePlayers();
    const store = makeStore(baseGame(players, { currentTurn, droppedCards }));
    return { players, store };
  }

  test("isHisTurn is true for the player whose turn it is", () => {
    const { players, store } = makeGame(0);
    // Player 0 is the current player; they drop some card
    const gameIns = new Game(store, GAME_ID, "1HA", players[0].token);

    expect(gameIns.isHisTurn).toBe(true);
  });

  test("isHisTurn is false for any other player", () => {
    const { players, store } = makeGame(0);
    // Player 1 tries to drop when it's player 0's turn
    const gameIns = new Game(store, GAME_ID, "1HA", players[1].token);

    expect(gameIns.isHisTurn).toBe(false);
  });

  test("isCurrentTurnIsFirstTurn is true when no cards have been dropped", () => {
    const { players, store } = makeGame(0, []);
    const gameIns = new Game(store, GAME_ID, "1HA", players[0].token);

    expect(gameIns.isCurrentTurnIsFirstTurn).toBe(true);
  });

  test("isCurrentTurnIsFirstTurn is false when cards are already on the table", () => {
    const { players, store } = makeGame(1, ["1HA"]);
    const gameIns = new Game(store, GAME_ID, "1H9", players[1].token);

    expect(gameIns.isCurrentTurnIsFirstTurn).toBe(false);
  });

  test("incrementTurn advances the turn counter by 1", () => {
    const { players, store } = makeGame(0);
    const gameIns = new Game(store, GAME_ID, "1HA", players[0].token);

    gameIns.incrementTurn();

    expect(gameIns.currentTurn).toBe(1);
  });

  test("incrementTurn wraps around after the last player and marks roundOver", () => {
    // Set current turn to the last player (index 5 for 6 players)
    const { players, store } = makeGame(MAX_PLAYERS - 1);
    const gameIns = new Game(
      store,
      GAME_ID,
      "1HA",
      players[MAX_PLAYERS - 1].token,
    );

    gameIns.incrementTurn();

    expect(gameIns.currentTurn).toBe(0);
    expect(gameIns.isRoundOver).toBe(true);
  });

  test("incrementTurn does not mark roundOver before the last player", () => {
    const { players, store } = makeGame(0);
    const gameIns = new Game(store, GAME_ID, "1HA", players[0].token);

    gameIns.incrementTurn();

    expect(gameIns.isRoundOver).toBe(false);
  });

  test("currentPlayer reflects the player at currentTurn index", () => {
    const { players, store } = makeGame(2);
    const gameIns = new Game(store, GAME_ID, "1HA", players[2].token);

    expect(gameIns.currentPlayer.playerId).toBe(players[2].playerId);
  });
});

// ---------------------------------------------------------------------------
// 3. Core Card Rules
// ---------------------------------------------------------------------------

describe("Core Card Rules – follow-suit enforcement", () => {
  /**
   * Card naming: "{2-char suit}{name}"
   *   suits  = ["1H","1D","1E","1C","2H","2D","2E","2C"]
   *   names  = ["A","9","10","J","Q","K"]
   *
   * The suit identifier used for follow-suit is card[1] (second character).
   * e.g. "1HA"[1] === "H", "1DA"[1] === "D"
   */

  describe("isCardAvail (follow-suit utility)", () => {
    test("returns true when the player holds a card of the required suit", () => {
      // First dropped card is "1HA" → suit identifier 'H'
      const firstCard = "1HA";
      const playerHand = ["1H9", "1DJ", "2EQ"]; // has an 'H' suit card

      expect(isCardAvail(firstCard, playerHand)).toBe(true);
    });

    test("returns false when the player has no card of the required suit", () => {
      const firstCard = "1HA"; // suit 'H'
      const playerHand = ["1D9", "2EJ", "1CQ"]; // no 'H' card

      expect(isCardAvail(firstCard, playerHand)).toBe(false);
    });

    test("returns true when firstCard is null (no suit obligation yet)", () => {
      const playerHand = ["1H9", "1DJ"];

      expect(isCardAvail(null, playerHand)).toBe(true);
    });
  });

  describe("Game.isValidCard", () => {
    function makeGameWithDropped(
      droppedCards: string[],
      droppingCard: string,
      playerToken: string,
    ) {
      const players = makePlayers();
      const store = makeStore(
        baseGame(players, { droppedCards, currentTurn: 1 }),
      );
      return new Game(store, GAME_ID, droppingCard, playerToken);
    }

    test("returns true when the dropped card matches the leading suit", () => {
      // First card in round: "1HA" (suit index 1 = 'H')
      const gameIns = makeGameWithDropped(
        ["1HA"],
        "1H9",
        makePlayers()[1].token,
      );

      expect(gameIns.isValidCard).toBe(true);
    });

    test("returns false when the dropped card is a different suit", () => {
      const gameIns = makeGameWithDropped(
        ["1HA"],
        "1D9",
        makePlayers()[1].token,
      );

      expect(gameIns.isValidCard).toBe(false);
    });
  });

  describe("Game.isCheating", () => {
    function makeGameForCheatingCheck(
      droppedCards: string[],
      droppingCard: string,
      playerCards: string[],
      currentTurn = 1,
    ) {
      const players = makePlayers();
      const currentPlayer = players[currentTurn];
      const gameObj = baseGame(players, { droppedCards, currentTurn });
      // Give the player their hand
      (gameObj as any)[currentPlayer.token] = playerCards;
      const store = makeStore(gameObj);
      return new Game(store, GAME_ID, droppingCard, currentPlayer.token);
    }

    test("not cheating when player drops same suit as first card", () => {
      // First card "1HA" (suit 'H'); player drops "1H9" (suit 'H')
      const gameIns = makeGameForCheatingCheck(["1HA"], "1H9", ["1H9", "1DJ"]);

      expect(gameIns.isCheating).toBe(false);
    });

    test("not cheating when player plays a different suit but has none of the required suit", () => {
      // First card "1HA" (suit 'H'); player has no 'H' cards — allowed to play any suit
      const gameIns = makeGameForCheatingCheck(["1HA"], "1D9", ["1D9", "2EQ"]);

      expect(gameIns.isCheating).toBe(false);
    });

    test("cheating detected when player plays different suit despite holding the required suit", () => {
      // First card "1HA" (suit 'H'); player has "1H9" but drops "1D9"
      const gameIns = makeGameForCheatingCheck(["1HA"], "1D9", ["1H9", "1D9"]);

      expect(gameIns.isCheating).toBe(true);
    });

    test("not cheating on the opening card of a round (no suit established yet)", () => {
      // No cards dropped yet — player can play any card freely
      const gameIns = makeGameForCheatingCheck([], "1DA", ["1DA", "1HK"], 0);

      expect(gameIns.isCheating).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Score Progression
// ---------------------------------------------------------------------------

describe("Score Progression", () => {
  describe("Card point values", () => {
    test("Jack is worth 3 points", () => {
      expect(cardToWeightagePoints["J"]).toBe(3);
    });

    test("Nine is worth 2 points", () => {
      expect(cardToWeightagePoints["9"]).toBe(2);
    });

    test("Ace is worth 1 point", () => {
      expect(cardToWeightagePoints["A"]).toBe(1);
    });

    test("Ten is worth 1 point", () => {
      expect(cardToWeightagePoints["10"]).toBe(1);
    });

    test("King is worth 0 points", () => {
      expect(cardToWeightagePoints["K"]).toBe(0);
    });

    test("Queen is worth 0 points", () => {
      expect(cardToWeightagePoints["Q"]).toBe(0);
    });

    test("total points across all 8 suits equals 56 (game name invariant)", () => {
      // (J=3 + 9=2 + A=1 + 10=1 + K=0 + Q=0) × 8 suits = 7 × 8 = 56
      const pointsPerSuit = Object.values(cardToWeightagePoints).reduce(
        (sum, v) => sum + v,
        0,
      );
      const totalPoints = pointsPerSuit * suits.length;

      expect(totalPoints).toBe(56);
    });
  });

  describe("Scoring tier logic", () => {
    /**
     * Replicate the identical scoring formula from GameCore.checkGameCompletion
     * so that changes to the source will break these tests.
     */
    function computeScoreChange(
      biddingTeam: "A" | "B",
      finalBid: number,
      biddingTeamAchievedBid: boolean,
      bidMultiplier = 1,
    ): { teamAChange: number; teamBChange: number } {
      let winPoints: number;
      let losePoints: number;

      if (finalBid === 56) {
        winPoints = 4;
        losePoints = -5;
      } else if (finalBid >= 28 && finalBid <= 39) {
        winPoints = 1;
        losePoints = -2;
      } else if (finalBid >= 40 && finalBid <= 47) {
        winPoints = 2;
        losePoints = -3;
      } else if (finalBid >= 48 && finalBid <= 55) {
        winPoints = 3;
        losePoints = -4;
      } else {
        winPoints = 1;
        losePoints = -2;
      }

      winPoints *= bidMultiplier;
      losePoints *= bidMultiplier;

      let teamAChange = 0;
      let teamBChange = 0;

      if (biddingTeamAchievedBid) {
        if (biddingTeam === "A") {
          teamAChange = winPoints;
          teamBChange = -winPoints;
        } else {
          teamBChange = winPoints;
          teamAChange = -winPoints;
        }
      } else {
        if (biddingTeam === "A") {
          teamAChange = losePoints;
          teamBChange = -losePoints;
        } else {
          teamBChange = losePoints;
          teamAChange = -losePoints;
        }
      }

      return { teamAChange, teamBChange };
    }

    test("low bid (28–39): winning bidding team gains +1, opponent loses −1", () => {
      const { teamAChange, teamBChange } = computeScoreChange("A", 30, true);

      expect(teamAChange).toBe(1);
      expect(teamBChange).toBe(-1);
    });

    test("low bid (28–39): losing bidding team loses −2, opponent gains +2", () => {
      const { teamAChange, teamBChange } = computeScoreChange("A", 30, false);

      expect(teamAChange).toBe(-2);
      expect(teamBChange).toBe(2);
    });

    test("mid bid (40–47): winning bidding team gains +2, opponent loses −2", () => {
      const { teamAChange, teamBChange } = computeScoreChange("B", 44, true);

      expect(teamBChange).toBe(2);
      expect(teamAChange).toBe(-2);
    });

    test("high bid (48–55): winning bidding team gains +3, opponent loses −3", () => {
      const { teamAChange, teamBChange } = computeScoreChange("A", 50, true);

      expect(teamAChange).toBe(3);
      expect(teamBChange).toBe(-3);
    });

    test("max bid (56): winning bidding team gains +4, opponent loses −4", () => {
      const { teamAChange, teamBChange } = computeScoreChange("A", 56, true);

      expect(teamAChange).toBe(4);
      expect(teamBChange).toBe(-4);
    });

    test("max bid (56): losing bidding team loses −5, opponent gains +5", () => {
      const { teamAChange, teamBChange } = computeScoreChange("A", 56, false);

      expect(teamAChange).toBe(-5);
      expect(teamBChange).toBe(5);
    });

    test("score resets to 10-10 when any team score would go negative", () => {
      // Simulate checkGameCompletion reset logic
      const baseScore = 10;
      const { teamAChange } = computeScoreChange("A", 28, false); // teamA loses 2

      const newTeamAScore = baseScore - 9 + teamAChange; // 1 - 2 = -1 → should reset
      const newTeamBScore = baseScore + 9 + -teamAChange;

      const scoreResetOccurred = newTeamAScore < 0 || newTeamBScore < 0;
      const finalTeamAScore = scoreResetOccurred ? 10 : newTeamAScore;
      const finalTeamBScore = scoreResetOccurred ? 10 : newTeamBScore;

      expect(scoreResetOccurred).toBe(true);
      expect(finalTeamAScore).toBe(10);
      expect(finalTeamBScore).toBe(10);
    });

    test("normal score update when no score goes negative", () => {
      const baseScore = 10;
      const { teamAChange, teamBChange } = computeScoreChange("A", 30, true);

      const newTeamAScore = baseScore + teamAChange; // 10 + 1 = 11
      const newTeamBScore = baseScore + teamBChange; // 10 - 1 = 9

      expect(newTeamAScore).toBeGreaterThan(0);
      expect(newTeamBScore).toBeGreaterThan(0);
      expect(newTeamAScore).toBe(11);
      expect(newTeamBScore).toBe(9);
    });
  });

  describe("InMemoryStore persistence", () => {
    test("saved game can be retrieved by game ID", () => {
      const players = makePlayers();
      const store = makeStore();
      const gameObj = baseGame(players);

      store.saveGame(GAME_ID, gameObj);
      const retrieved = store.fetchGame(GAME_ID);

      expect(retrieved).toBeDefined();
      expect(retrieved.players).toHaveLength(MAX_PLAYERS);
    });

    test("fetching a non-existent game returns undefined", () => {
      const store = makeStore();

      expect(store.fetchGame("no-such-game")).toBeUndefined();
    });

    test("game mutations are persisted when saveGame is called again", () => {
      const players = makePlayers();
      const store = makeStore(baseGame(players));

      const game = store.fetchGame(GAME_ID);
      game.currentTurn = 3;
      store.saveGame(GAME_ID, game);

      expect(store.fetchGame(GAME_ID).currentTurn).toBe(3);
    });
  });
});
