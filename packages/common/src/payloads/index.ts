import { MESSAGES } from "../messages";

export const loginPayload = (userId: string, gameId?: string) => {
  return { operation: MESSAGES.login, payload: { userId, gameId } };
};

export const reconnectPayload = (
  playerId: string,
  token?: string,
  gameId?: string
) => {
  return {
    operation: MESSAGES.reconnect,
    payload: { playerId, token, gameId }
  };
};

export const reconnectApprovePayload = (
  gameId: string,
  playerId: string,
  approvingPlayerId: string,
) => {
  return {
    operation: MESSAGES.reconnectApprove,
    payload: { gameId, playerId, approvingPlayerId },
  };
};

export const reconnectDenyPayload = (
  gameId: string,
  playerId: string,
  denyingPlayerId: string,
) => {
  return {
    operation: MESSAGES.reconnectDeny,
    payload: { gameId, playerId, denyingPlayerId },
  };
};

export const pingPayload = () => {
  return { operation: MESSAGES.ping, payload: { ping: "ping" } };
};

export const dropCardPayload = (
  card: string,
  gameId: string,
  token: string,
  playerId: string
) => {
  return {
    operation: MESSAGES.dropCard,
    payload: { card, gameId, token, playerId },
  };
};

export const incrementBetByPlayerPayload = (
  playerBet: string,
  gameId: string,
  token: string
) => {
  return {
    operation: MESSAGES.incrementBetByPlayer,
    payload: { playerBet, gameId, token },
  };
};

export const updateGameScorePayload = (
  gameScore: string,
  gameId: string,
  token: string
) => {
  return {
    operation: MESSAGES.updateGameScore,
    payload: { gameScore, gameId, token },
  };
};

export const dropCardByPlayerPayload = (dropCardPlayer: string[]) => {
  return {
    operation: MESSAGES.dropCardPlayer,
    payload: { dropCardPlayer },
  };
};

export const deckWonByTeamAPayload = (gameId: string) => {
  return { operation: MESSAGES.deckWonByTeamA, payload: { gameId } };
};

export const deckWonByTeamBPayload = (gameId: string) => {
  return { operation: MESSAGES.deckWonByTeamB, payload: { gameId } };
};

export const tableCardsPayload = (cards: string[], gameId: string) => {
  return { operation: MESSAGES.tableCards, payload: { cards, gameId } };
};

export const restartGamePayload = (gameId: string) => {
  return { operation: MESSAGES.restartGame, payload: { gameId } };
};

export const selectPlayerPayload = (
  currentPlayerId: string,
  gameId: string,
  token: string
) => {
  return {
    operation: MESSAGES.selectPlayer,
    payload: { currentPlayerId, gameId, token },
  };
};

export const selectTrumpSuitPayload = (
  trumpSuit: string,
  gameId: string,
  token: string,
  playerId: string
) => {
  return {
    operation: MESSAGES.selectTrumpSuit,
    payload: { trumpSuit, gameId, token, playerId },
  };
};

export const addBotsPayload = (
  botCount: number,
  gameId: string,
  startImmediately?: boolean
) => {
  return {
    operation: MESSAGES.addBots,
    payload: { botCount, gameId, startImmediately },
  };
}
