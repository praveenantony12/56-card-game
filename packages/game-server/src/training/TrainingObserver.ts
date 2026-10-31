import { BOT_POLICY_VERSION } from "../agents/botPolicyVersion";
import { ICardGame } from "../core/models/ICardGame";
import { resolvePlayerTeam } from "../core/teams";
import { TrainingConfig } from "../core/trainingConfig";
import { LoggerService } from "../services/LoggerService";
import { getUniqueId } from "../utils/misc";
import { getLegalCards } from "./legalActions";
import { seatAlias } from "./pseudonyms";
import {
  DecisionRecord,
  RULESET_VERSION,
  SkipReason,
  TRAINING_SCHEMA_VERSION,
} from "./types";
import { buildVisibleState } from "./visibleState";
import { TrainingErrorHandler, TrainingWriter } from "./TrainingWriter";

export interface TrainingObserverDeps {
  writer?: TrainingWriter;
  onError?: TrainingErrorHandler;
  now?: () => Date;
  newId?: () => string;
}

export interface TrainingCounters {
  captured: number;
  skipped: number;
  captureFailures: number;
  recordsWritten: number;
  writeFailures: number;
}

/**
 * Identifies one deal. gameId is reused across restarts, so the hand is
 * identified by when it started.
 */
export function toHandId(gameStartTime: any): string {
  const date = new Date(gameStartTime);
  return isNaN(date.getTime())
    ? "unknown-hand"
    : date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Passive observer of human card plays.
 *
 * It only reads the live game, never mutates it, and never throws into the
 * caller. In this version it records the pseudonymized decision context and the
 * human's card; every record is SKIPPED because no bot comparison runs yet.
 */
export class TrainingObserver {
  private writer: TrainingWriter;
  private onError: TrainingErrorHandler;
  private now: () => Date;
  private newId: () => string;
  private seqByHand: { [handKey: string]: number } = {};
  private counters = { captured: 0, skipped: 0, captureFailures: 0 };

  constructor(
    private config: TrainingConfig,
    deps: TrainingObserverDeps = {},
  ) {
    this.onError =
      deps.onError ||
      ((context, error) => LoggerService.logError(`[TRAINING] ${context}`, error));
    this.writer = deps.writer || new TrainingWriter(config.outputDir, this.onError);
    this.now = deps.now || (() => new Date());
    this.newId = deps.newId || getUniqueId;
  }

  /**
   * Called by GameCore.onDropCard after the move passed validation and before
   * it is applied to the live game.
   * @param game The live game (read only).
   * @param gameId The game id.
   * @param claimedPlayerId The playerId the client claimed in the request.
   * @param card The card the human is playing.
   * @param firstCardDefaultsApplied True when onDropCard just inserted default
   *  bid/trump values that the human did not see when choosing the card.
   */
  public observeHumanCardPlay(
    game: ICardGame,
    gameId: string,
    claimedPlayerId: string,
    card: string,
    firstCardDefaultsApplied: boolean,
  ): void {
    try {
      this.capture(game, gameId, claimedPlayerId, card, firstCardDefaultsApplied);
    } catch (error) {
      this.counters.captureFailures++;
      this.report("Failed to capture a human card play", error);
    }
  }

  public getCounters(): TrainingCounters {
    return {
      captured: this.counters.captured,
      skipped: this.counters.skipped,
      captureFailures: this.counters.captureFailures,
      recordsWritten: this.writer.recordsWritten,
      writeFailures: this.writer.writeFailures,
    };
  }

  /** Resolves when all queued records have been written (or have failed). */
  public flush(): Promise<void> {
    return this.writer.flush();
  }

  private capture(
    game: ICardGame,
    gameId: string,
    claimedPlayerId: string,
    card: string,
    firstCardDefaultsApplied: boolean,
  ): void {
    const players = game.players as any[];
    const actorSeat = Number(game.currentTurn);
    // The acting player is the seat whose turn it is, never the request's claim.
    const actor = players[actorSeat];
    if (!actor || actor.isBotAgent) {
      return;
    }

    const handId = toHandId(game.gameStartTime);
    const actorInfo = {
      ref: seatAlias(actorSeat),
      seat: actorSeat,
      team: resolvePlayerTeam(players, actor.playerId),
    };

    let skipReason: SkipReason = "EVALUATOR_NOT_ENABLED";
    let visibleState: DecisionRecord["visibleState"] = null;
    let legalActions: string[] | null = null;

    if (claimedPlayerId !== actor.playerId) {
      skipReason = "ACTOR_MISMATCH";
    } else if (firstCardDefaultsApplied) {
      skipReason = "FIRST_CARD_DEFAULTS_APPLIED";
    } else {
      const built = buildVisibleState(game, actorSeat);
      if (built.skipReason) {
        skipReason = built.skipReason;
      } else {
        visibleState = built.state;
        legalActions = getLegalCards(
          built.state.hand,
          built.state.currentTrick.map((entry) => entry.card),
        );
        if (legalActions.indexOf(card) === -1) {
          skipReason = "CARD_NOT_IN_LEGAL_ACTIONS";
        }
      }
    }

    const handKey = `${gameId}|${handId}`;
    const seq = (this.seqByHand[handKey] || 0) + 1;
    this.seqByHand[handKey] = seq;

    const trickLength = visibleState ? visibleState.currentTrick.length : null;
    const pileSize = visibleState
      ? visibleState.teamACards.length + visibleState.teamBCards.length
      : null;

    const record: DecisionRecord = {
      schemaVersion: TRAINING_SCHEMA_VERSION,
      decisionId: this.newId(),
      gameId,
      handId,
      seq,
      timestamp: this.now().toISOString(),
      phase: "CARD_PLAY",
      decisionKind:
        trickLength === null ? null : trickLength === 0 ? "LEAD" : "FOLLOW",
      positionInTrick: trickLength,
      trickNumber:
        pileSize === null ? null : Math.floor(pileSize / players.length) + 1,
      actor: actorInfo,
      actorTrust: "SERVER_DERIVED_TOKEN_VERIFIED",
      visibleState,
      legalActions,
      humanAction: { card },
      botAction: null,
      botActionLegal: null,
      botStrategy: null,
      botReasoning: null,
      exactActionAgreement: null,
      evaluationStatus: "SKIPPED",
      skipReason,
      evaluationError: null,
      evaluationMs: null,
      botPolicyVersion: BOT_POLICY_VERSION,
      rulesetVersion: RULESET_VERSION,
      appVersion: this.config.appVersion,
      gitCommit: this.config.gitCommit,
    };

    this.counters.captured++;
    this.counters.skipped++;
    this.writer.append(gameId, handId, record);
  }

  private report(context: string, error: any): void {
    try {
      this.onError(context, error);
    } catch (_) {
      // Reporting must never break the game.
    }
  }
}
