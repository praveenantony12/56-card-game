import { DecisionPhase } from "./types";

export type FinalizeReason = "GAME_COMPLETE" | "SUPERSEDED";

/** Totals for one hand's decisions. */
export interface TrainingHandSummary {
  gameId: string;
  handId: string;
  reason: FinalizeReason;
  /** Decisions recorded for this hand, whatever their outcome. */
  decisionsCaptured: number;
  evaluationsCompleted: number;
  evaluationsFailed: number;
  /** Decisions deliberately not compared (see each record's skipReason). */
  decisionsSkipped: number;
  /** Evaluations scheduled but not yet written when the summary was produced. */
  pendingEvaluations: number;
  /** Completed comparisons where the bot chose exactly the human's card. */
  exactActionMatches: number;
  exactActionMismatches: number;
  /** Exact-action matches out of completed comparisons, per game phase. */
  exactActionMatchByPhase: { [phase: string]: { matches: number; completed: number } };
  recordsWritten: number;
  writeFailures: number;
  /** True when pending evaluations were still running at the timeout. */
  timedOut: boolean;
  filePath: string;
}

const percent = (part: number, whole: number): string =>
  whole === 0 ? "n/a" : `${Math.round((part / whole) * 100)}%`;

/**
 * Formats a summary for the console. The two exact-action figures are only
 * counts of identical cards: they do not say which side was right.
 */
export function formatHandSummary(summary: TrainingHandSummary): string {
  const phases = Object.keys(summary.exactActionMatchByPhase) as DecisionPhase[];
  const byPhase =
    phases.length === 0
      ? "none"
      : phases
          .map((phase) => {
            const { matches, completed } = summary.exactActionMatchByPhase[phase];
            return `${phase} ${matches}/${completed} (${percent(matches, completed)})`;
          })
          .join(", ");

  const lines = [
    `[TRAINING] Hand summary game=${summary.gameId} hand=${summary.handId} (${summary.reason})`,
    `  Decisions captured: ${summary.decisionsCaptured}` +
      `   Evaluations completed: ${summary.evaluationsCompleted}` +
      `   Evaluations failed: ${summary.evaluationsFailed}` +
      `   Skipped: ${summary.decisionsSkipped}`,
    `  Exact-action matches: ${summary.exactActionMatches}` +
      `   Exact-action mismatches: ${summary.exactActionMismatches}`,
    `  Exact-action match by phase: ${byPhase}`,
    `  Pending evaluations: ${summary.pendingEvaluations}` +
      (summary.timedOut && summary.pendingEvaluations > 0
        ? " (timed out waiting; they will still be appended)"
        : "") +
      `   Records written: ${summary.recordsWritten}` +
      `   Write failures: ${summary.writeFailures}`,
    `  File: ${summary.filePath}`,
  ];
  return lines.join("\n");
}
