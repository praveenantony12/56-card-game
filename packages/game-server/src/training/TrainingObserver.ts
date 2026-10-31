import { BOT_POLICY_VERSION } from "../agents/botPolicyVersion";
import { ICardGame } from "../core/models/ICardGame";
import { resolvePlayerTeam } from "../core/teams";
import { TrainingConfig } from "../core/trainingConfig";
import { LoggerService } from "../services/LoggerService";
import { getUniqueId } from "../utils/misc";
import { getLegalCards } from "./legalActions";
import { seatAlias } from "./pseudonyms";
import { ShadowEvaluator, ShadowEvaluatorLike } from "./ShadowEvaluator";
import {
  FinalizeReason,
  TrainingHandSummary,
  formatHandSummary,
} from "./summary";
import {
  DecisionRecord,
  RULESET_VERSION,
  ShadowVisibleState,
  SkipReason,
  TRAINING_SCHEMA_VERSION,
} from "./types";
import { buildVisibleState } from "./visibleState";
import { TrainingErrorHandler, TrainingWriter } from "./TrainingWriter";

/** An evaluation slower than this is reported, because it ran on the game's event loop. */
export const SLOW_EVALUATION_MS = 250;

const MAX_ERROR_CHARS = 300;
const MAX_STRATEGY_CHARS = 200;
const MAX_REASONING_CHARS = 2000;

export interface TrainingObserverDeps {
  writer?: TrainingWriter;
  onError?: TrainingErrorHandler;
  /** Reports non-error conditions such as a slow evaluation. */
  onWarn?: (message: string) => void;
  now?: () => Date;
  newId?: () => string;
  /**
   * Produces the shadow bot's decision. Defaults to the production bot. Pass
   * null to disable comparison, in which case records are SKIPPED with
   * EVALUATOR_NOT_ENABLED.
   */
  evaluator?: ShadowEvaluatorLike | null;
  /** Runs a scheduled evaluation later. Defaults to setImmediate; tests hold jobs with it. */
  defer?: (job: () => void) => void;
  /** Prints a finished hand summary. Defaults to console.log. */
  printSummary?: (text: string, summary: TrainingHandSummary) => void;
  /** Overrides config.finalizeTimeoutMs (tests). */
  finalizeTimeoutMs?: number;
}

/** Running totals for one hand, kept until its summary is complete. */
interface HandState {
  gameId: string;
  handId: string;
  captured: number;
  skipped: number;
  completed: number;
  failed: number;
  matches: number;
  mismatches: number;
  byPhase: { [phase: string]: { matches: number; completed: number } };
  /** Set once the hand's summary has been requested; makes finalization idempotent. */
  finalizing?: Promise<TrainingHandSummary | null>;
  summaryPrinted: boolean;
  /** Records that finished after the summary was printed. */
  lateRecords: number;
}

export interface TrainingCounters {
  captured: number;
  skipped: number;
  completed: number;
  failed: number;
  /** Evaluations scheduled but not yet written. */
  pending: number;
  captureFailures: number;
  recordsWritten: number;
  writeFailures: number;
}

const truncate = (text: string | null, max: number): string | null =>
  text === null || text === undefined ? null : String(text).slice(0, max);

const describeError = (error: any): string =>
  truncate(
    `${(error && error.name) || "Error"}: ${(error && error.message) || String(error)}`,
    MAX_ERROR_CHARS,
  ) as string;

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
 * caller. For each human decision it captures the pseudonymized pre-action
 * state synchronously, then (on a later turn of the event loop) asks the
 * shadow bot what it would have played from that frozen snapshot and appends
 * ONE final record containing both actions. Nothing it does is visible to
 * players: no socket events, no hints, no change to the live game.
 *
 * Records are written when their evaluation finishes, so a slow evaluation
 * can land after a later decision; `seq` preserves capture order.
 */
export class TrainingObserver {
  private writer: TrainingWriter;
  private onError: TrainingErrorHandler;
  private onWarn: (message: string) => void;
  private now: () => Date;
  private newId: () => string;
  private evaluator: ShadowEvaluatorLike | null;
  private defer: (job: () => void) => void;
  private printSummary: (text: string, summary: TrainingHandSummary) => void;
  private finalizeTimeoutMs: number;
  private seqByHand: { [handKey: string]: number } = {};
  private pendingJobs: { [decisionId: string]: Promise<void> } = {};
  private pendingByHand: { [handKey: string]: number } = {};
  private hands: { [handKey: string]: HandState } = {};
  private currentHandByGame: { [gameId: string]: string } = {};
  private waiters: { [handKey: string]: Array<() => void> } = {};
  private counters = {
    captured: 0,
    skipped: 0,
    completed: 0,
    failed: 0,
    captureFailures: 0,
  };

  constructor(
    private config: TrainingConfig,
    deps: TrainingObserverDeps = {},
  ) {
    this.onError =
      deps.onError ||
      ((context, error) => LoggerService.logError(`[TRAINING] ${context}`, error));
    this.onWarn =
      deps.onWarn || ((message) => LoggerService.log("[TRAINING]", message));
    this.writer = deps.writer || new TrainingWriter(config.outputDir, this.onError);
    this.now = deps.now || (() => new Date());
    this.newId = deps.newId || getUniqueId;
    this.evaluator =
      deps.evaluator === undefined ? new ShadowEvaluator() : deps.evaluator;
    this.defer = deps.defer || ((job) => setImmediate(job));
    this.printSummary = deps.printSummary || ((text) => console.log(text));
    this.finalizeTimeoutMs =
      deps.finalizeTimeoutMs !== undefined
        ? deps.finalizeTimeoutMs
        : config.finalizeTimeoutMs;
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
      completed: this.counters.completed,
      failed: this.counters.failed,
      pending: this.getPendingCount(),
      captureFailures: this.counters.captureFailures,
      recordsWritten: this.writer.recordsWritten,
      writeFailures: this.writer.writeFailures,
    };
  }

  /**
   * Evaluations scheduled but not yet written, overall or for one hand.
   * Explicit tracking lets callers report unfinished work instead of assuming
   * it is done.
   */
  public getPendingCount(gameId?: string, handId?: string): number {
    if (gameId !== undefined && handId !== undefined) {
      return this.pendingByHand[`${gameId}|${handId}`] || 0;
    }
    return Object.keys(this.pendingJobs).length;
  }

  /** Resolves when every scheduled evaluation has finished and been written (or has failed). */
  public flush(): Promise<void> {
    const ids = Object.keys(this.pendingJobs);
    if (ids.length === 0) {
      return this.writer.flush();
    }
    return Promise.all(ids.map((id) => this.pendingJobs[id])).then(() =>
      this.flush(),
    );
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

    let skipReason: SkipReason | null = null;
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

    if (!skipReason && !this.evaluator) {
      skipReason = "EVALUATOR_NOT_ENABLED";
    }

    const handKey = `${gameId}|${handId}`;
    const hand = this.registerHand(gameId, handId);
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
    hand.captured++;
    if (skipReason || !this.evaluator || !visibleState || !legalActions) {
      this.counters.skipped++;
      hand.skipped++;
      this.writer.append(gameId, handId, record);
      return;
    }

    this.schedule(record, handKey, visibleState, legalActions);
  }

  /**
   * Finds or creates the running totals for a hand. A new hand for a game
   * means the previous one ended without a completion summary (for example a
   * forfeit or restart), so it is finalized now, asynchronously.
   */
  private registerHand(gameId: string, handId: string): HandState {
    const handKey = `${gameId}|${handId}`;
    const previous = this.currentHandByGame[gameId];
    if (previous !== undefined && previous !== handId) {
      this.finalizeKey(gameId, previous, "SUPERSEDED");
    }
    this.currentHandByGame[gameId] = handId;

    if (!this.hands[handKey]) {
      this.hands[handKey] = {
        gameId,
        handId,
        captured: 0,
        skipped: 0,
        completed: 0,
        failed: 0,
        matches: 0,
        mismatches: 0,
        byPhase: {},
        summaryPrinted: false,
        lateRecords: 0,
      };
    }
    return this.hands[handKey];
  }

  /**
   * Produces and prints the summary for a game's current hand.
   *
   * Never blocks the game: callers do not await it, it never rejects, and it
   * waits at most finalizeTimeoutMs for unfinished evaluations. Anything still
   * pending then is reported as pending and appended to the file when it
   * finishes. Calls made while a summary is already being produced share it;
   * once it is complete the hand's state is released, so a later call returns
   * null and prints nothing. Resolves to null when the game has no captured
   * human decisions.
   */
  public finalizeHand(gameId: string): Promise<TrainingHandSummary | null> {
    try {
      const handId = this.currentHandByGame[gameId];
      if (handId === undefined) {
        return Promise.resolve(null);
      }
      return this.finalizeKey(gameId, handId, "GAME_COMPLETE");
    } catch (error) {
      this.report("Failed to finalize a hand", error);
      return Promise.resolve(null);
    }
  }

  private finalizeKey(
    gameId: string,
    handId: string,
    reason: FinalizeReason,
  ): Promise<TrainingHandSummary | null> {
    const handKey = `${gameId}|${handId}`;
    const hand = this.hands[handKey];
    if (!hand) {
      return Promise.resolve(null);
    }
    if (!hand.finalizing) {
      hand.finalizing = this.runFinalize(hand, handKey, reason).catch((error) => {
        this.report("Failed to produce a hand summary", error);
        return null;
      });
    }
    return hand.finalizing;
  }

  private async runFinalize(
    hand: HandState,
    handKey: string,
    reason: FinalizeReason,
  ): Promise<TrainingHandSummary> {
    let timer: any;
    const deadline = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), this.finalizeTimeoutMs);
      if (timer && typeof timer.unref === "function") {
        timer.unref(); // never keep the process alive for a summary
      }
    });
    const ready = this.waitForHand(handKey)
      .then(() => this.writer.flush())
      .then(() => "ready" as "ready");

    const outcome = await Promise.race([ready, deadline]);
    clearTimeout(timer);

    const summary = this.buildSummary(hand, reason, outcome === "timeout");
    hand.summaryPrinted = true;
    if (this.currentHandByGame[hand.gameId] === hand.handId) {
      delete this.currentHandByGame[hand.gameId];
    }

    try {
      this.printSummary(formatHandSummary(summary), summary);
    } catch (error) {
      this.report("Failed to print a hand summary", error);
    }

    this.cleanupHandIfDone(handKey);
    return summary;
  }

  private buildSummary(
    hand: HandState,
    reason: FinalizeReason,
    timedOut: boolean,
  ): TrainingHandSummary {
    const written = this.writer.statsFor(hand.gameId, hand.handId);
    return {
      gameId: hand.gameId,
      handId: hand.handId,
      reason,
      decisionsCaptured: hand.captured,
      evaluationsCompleted: hand.completed,
      evaluationsFailed: hand.failed,
      decisionsSkipped: hand.skipped,
      pendingEvaluations: this.getPendingCount(hand.gameId, hand.handId),
      exactActionMatches: hand.matches,
      exactActionMismatches: hand.mismatches,
      exactActionMatchByPhase: JSON.parse(JSON.stringify(hand.byPhase)),
      recordsWritten: written.recordsWritten,
      writeFailures: written.writeFailures,
      timedOut,
      filePath: this.writer.filePathFor(hand.gameId, hand.handId),
    };
  }

  /** Resolves once a hand has no pending evaluations. */
  private waitForHand(handKey: string): Promise<void> {
    if (!this.pendingByHand[handKey]) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      (this.waiters[handKey] = this.waiters[handKey] || []).push(resolve);
    });
  }

  /**
   * Once a hand's summary is out and nothing is pending, tells the user about
   * any records that arrived after it, then releases the hand's bookkeeping.
   */
  private cleanupHandIfDone(handKey: string): void {
    const hand = this.hands[handKey];
    if (!hand || !hand.summaryPrinted || this.pendingByHand[handKey]) {
      return;
    }

    this.writer
      .flush()
      .then(() => {
        const current = this.hands[handKey];
        if (!current || this.pendingByHand[handKey]) {
          return;
        }
        if (current.lateRecords > 0) {
          try {
            this.printSummary(
              `[TRAINING] ${current.lateRecords} record(s) finished after the summary for ` +
                `game=${current.gameId} hand=${current.handId} and were appended to ` +
                this.writer.filePathFor(current.gameId, current.handId),
              this.buildSummary(current, "GAME_COMPLETE", false),
            );
          } catch (error) {
            this.report("Failed to print a late-record notice", error);
          }
        }
        this.writer.forgetHand(current.gameId, current.handId);
        delete this.hands[handKey];
        delete this.seqByHand[handKey];
      })
      .catch((error) => this.report("Failed to release hand state", error));
  }

  /**
   * Runs the shadow evaluation on a later turn of the event loop, so the live
   * move (and its response to the player) is never held up by it. Only the
   * frozen snapshot is handed over.
   */
  private schedule(
    record: DecisionRecord,
    handKey: string,
    state: ShadowVisibleState,
    legalActions: string[],
  ): void {
    const id = record.decisionId;
    this.pendingByHand[handKey] = (this.pendingByHand[handKey] || 0) + 1;

    const job = new Promise<void>((resolve) => {
      this.defer(() => {
        try {
          this.evaluateAndWrite(record, state, legalActions);
        } catch (error) {
          // evaluateAndWrite handles its own failures; this is a last resort.
          this.report("Training job failed unexpectedly", error);
        } finally {
          resolve();
        }
      });
    });
    this.pendingJobs[id] = job;

    // Cleanup hangs off the job's promise (registered before any flush() can
    // wait on it), so a settled job can never remain in the registry.
    job.then(() => {
      delete this.pendingJobs[id];
      this.pendingByHand[handKey]--;
      if (this.pendingByHand[handKey] <= 0) {
        delete this.pendingByHand[handKey];
        const waiting = this.waiters[handKey] || [];
        delete this.waiters[handKey];
        waiting.forEach((wake) => wake());
        this.cleanupHandIfDone(handKey);
      }
    });
  }

  private evaluateAndWrite(
    record: DecisionRecord,
    state: ShadowVisibleState,
    legalActions: string[],
  ): void {
    const started = Date.now();
    try {
      const decision = this.evaluator!.evaluate(state);
      if (!decision || typeof decision.card !== "string" || !decision.card) {
        throw new Error("INVALID_DECISION");
      }

      record.evaluationMs = Date.now() - started;
      record.botAction = { card: decision.card };
      record.botActionLegal = legalActions.indexOf(decision.card) !== -1;
      record.botStrategy = truncate(decision.strategy, MAX_STRATEGY_CHARS);
      record.botReasoning = truncate(decision.reasoning, MAX_REASONING_CHARS);
      record.exactActionAgreement =
        decision.card === record.humanAction.card ? "MATCH" : "MISMATCH";
      record.evaluationStatus = "COMPLETED";
      this.counters.completed++;
    } catch (error) {
      record.evaluationMs = Date.now() - started;
      record.evaluationStatus = "FAILED";
      record.evaluationError = describeError(error);
      this.counters.failed++;
      this.report("Shadow evaluation failed", error);
    }

    if (record.evaluationMs !== null && record.evaluationMs > SLOW_EVALUATION_MS) {
      try {
        this.onWarn(
          `Slow shadow evaluation: ${record.evaluationMs}ms (decision ${record.decisionId})`,
        );
      } catch (_) {
        // Reporting must never break the game.
      }
    }

    this.recordOutcome(record);
    this.writer.append(record.gameId, record.handId, record);
  }

  /** Adds a finished evaluation to its hand's totals. */
  private recordOutcome(record: DecisionRecord): void {
    const hand = this.hands[`${record.gameId}|${record.handId}`];
    if (!hand) {
      return;
    }

    if (record.evaluationStatus === "COMPLETED") {
      hand.completed++;
      const phase = (hand.byPhase[record.phase] = hand.byPhase[record.phase] || {
        matches: 0,
        completed: 0,
      });
      phase.completed++;
      if (record.exactActionAgreement === "MATCH") {
        hand.matches++;
        phase.matches++;
      } else {
        hand.mismatches++;
      }
    } else {
      hand.failed++;
    }

    if (hand.summaryPrinted) {
      hand.lateRecords++;
    }
  }

  private report(context: string, error: any): void {
    try {
      this.onError(context, error);
    } catch (_) {
      // Reporting must never break the game.
    }
  }
}
