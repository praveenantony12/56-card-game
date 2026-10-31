import { TeamBotAgent } from "../agents/TeamBotAgent";
import { toBotInput } from "./botAdapter";
import { ShadowVisibleState } from "./types";

/** What the shadow bot chose, with its self-reported rationale. */
export interface ShadowDecision {
  card: string;
  strategy: string | null;
  reasoning: string | null;
}

/** Anything that can turn a visible state into a decision (injectable for tests). */
export interface ShadowEvaluatorLike {
  evaluate(state: ShadowVisibleState): ShadowDecision;
}

/**
 * Asks the production bot what it would play from a player-visible state.
 *
 * Isolation:
 *  - it receives only the frozen, pseudonymized ShadowVisibleState, never the
 *    live game, the store, the socket server or any other object that could
 *    reach them;
 *  - it uses a fresh TeamBotAgent per call, and its reasoning snapshot is
 *    returned to the caller instead of being broadcast;
 *  - TeamBotAgent itself is unmodified, so it still prints its usual
 *    console banners. They show seat aliases and are tolerated in v1.
 */
export class ShadowEvaluator implements ShadowEvaluatorLike {
  public evaluate(state: ShadowVisibleState): ShadowDecision {
    const { gameState, botToken, botAgentId } = toBotInput(state);
    const agent = new TeamBotAgent();
    const card = agent.decide(gameState, botToken, botAgentId);

    // decide() returns "" when it finds no legal move.
    if (!card) {
      throw new Error("BOT_NO_DECISION");
    }

    const reasoning = agent.lastReasoning;
    return {
      card,
      strategy: reasoning ? reasoning.strategy || null : null,
      reasoning: reasoning ? reasoning.reasoning || null : null,
    };
  }
}
