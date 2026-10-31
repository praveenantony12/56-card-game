import { ICardGame } from "../../core/models/ICardGame";
import { IPlayer } from "../../core/models/IPlayer";

export const GAME_ID = "training-test-game";
export const GAME_START = new Date("2026-01-01T00:00:00.000Z");
export const HAND_ID = "2026-01-01T00-00-00-000Z";

// Distinctive on purpose (including a hyphen, which the live game uses as a
// separator in "card-playerId") so leak tests can search for them.
export const REAL_NAMES = ["Zephyrine", "Quixote-9", "MxOBrien", "Ulysses", "Wren", "Tamsin"];
export const REAL_TOKENS = REAL_NAMES.map((_, i) => `tok-secret-${i}`);
export const REAL_SOCKETS = REAL_NAMES.map((_, i) => `sock-secret-${i}`);

/** Small, fully distinct hands: seat 3 is void in "H". */
export const HANDS: string[][] = [
  ["1HA", "1D9"],
  ["1HK", "1DA"],
  ["1H9", "1D10"],
  ["1DJ", "1EA"],
  ["1HJ", "1EJ"],
  ["1HQ", "1CA"],
];

export function makePlayers(overrides: { [seat: number]: Partial<IPlayer> } = {}): IPlayer[] {
  return REAL_NAMES.map((name, i) => ({
    playerId: name,
    token: REAL_TOKENS[i],
    socketId: REAL_SOCKETS[i],
    gameId: GAME_ID,
    ...(overrides[i] || {}),
  }));
}

/** A mid-hand game: bidding finished, nothing played yet, seat 0 to lead. */
export function makeTrainingGame(
  overrides: Partial<ICardGame> = {},
  players: IPlayer[] = makePlayers(),
): ICardGame {
  const game: any = {
    players,
    currentTurn: 0,
    maxTurn: 5,
    droppedCards: [],
    dropCardPlayer: [],
    dropDetails: [],
    tableCards: [],
    teamACards: [],
    teamBCards: [],
    currentBet: "28",
    finalBid: 28,
    trumpSuit: "H",
    biddingTeam: "A",
    biddingPlayer: players[0].playerId,
    lastBiddingTeam: "A",
    bidDouble: false,
    bidReDouble: false,
    bidHistory: [
      { playerId: players[0].playerId, action: "bid", bidValue: 28, suit: "H" },
      { playerId: players[1].playerId, action: "pass" },
    ],
    playerTrumpSuit: { [players[0].playerId]: "H" },
    teamAScore: 10,
    teamBScore: 10,
    isBiddingPhase: false,
    isGameStarted: true,
    isGameComplete: false,
    gameStartTime: GAME_START,
    disconnectedPlayers: {},
    ...overrides,
  };
  players.forEach((p, i) => {
    if (!game[p.token]) {
      game[p.token] = HANDS[i].slice();
    }
  });
  return game as ICardGame;
}

/** A socket.io server stand-in: no connected sockets, emits go nowhere. */
export function fakeIoServer(): any {
  return { to: () => ({ emit: () => {} }), sockets: { connected: {} } };
}
