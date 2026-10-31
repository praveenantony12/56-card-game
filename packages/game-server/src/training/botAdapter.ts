import { ICardGame } from "../core/models/ICardGame";
import { ShadowVisibleState } from "./types";

/** Key under which the bot finds the acting player's hand. */
export const shadowHandKey = (actorRef: string) => `hand:${actorRef}`;

export interface ShadowBotInput {
  /** The state in the shape TeamBotAgent.decide expects. */
  gameState: ICardGame;
  /** The key holding the acting player's hand in gameState. */
  botToken: string;
  /** The acting player's (alias) id. */
  botAgentId: string;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze((value as any)[key]));
  }
  return value;
}

/**
 * Adapts the narrow ShadowVisibleState to the ICardGame-shaped object that
 * TeamBotAgent.decide requires.
 *
 * The bot's signature is `decide(gameState: ICardGame, ...)`, so a cast is
 * unavoidable here. It is safe because only the properties the bot reads are
 * provided (verified by training-bot-adapter.spec.ts, which records every
 * property the bot touches and compares its choice against the full live
 * state). It is the only ICardGame cast in the training code, and it is
 * deliberately NOT a complete ICardGame: other players' hands and all
 * server-only fields are absent.
 *
 * The result is deeply frozen, so any attempt by the bot to mutate its input
 * throws instead of silently altering shared data.
 */
export function toBotInput(state: ShadowVisibleState): ShadowBotInput {
  const botToken = shadowHandKey(state.actorRef);

  const input: { [key: string]: any } = {
    players: state.seats.map((seat) => ({
      playerId: seat.ref,
      token: `shadow:${seat.ref}`,
      socketId: "",
      gameId: "",
      isBotAgent: seat.isBot,
    })),
    dropCardPlayer: state.currentTrick.map((entry) => `${entry.card}-${entry.by}`),
    teamACards: state.teamACards.slice(),
    teamBCards: state.teamBCards.slice(),
    trumpSuit: state.trumpSuit,
    finalBid: state.finalBid,
    currentBet: state.currentBet,
    biddingTeam: state.biddingTeam,
    lastBiddingTeam: state.lastBiddingTeam,
    bidDouble: state.bidDouble,
    bidReDouble: state.bidReDouble,
    bidHistory: state.bidHistory.map((bid) => {
      const { by, ...rest } = bid;
      return { playerId: by, ...rest };
    }),
    [botToken]: state.hand.slice(),
  };

  return {
    gameState: deepFreeze(input) as unknown as ICardGame,
    botToken,
    botAgentId: state.actorRef,
  };
}
