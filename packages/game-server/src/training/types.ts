import { Team } from "../core/teams";

/** Training schema and ruleset identifiers stamped on every record. */
export const TRAINING_SCHEMA_VERSION = 2;
export const RULESET_VERSION = "56-6p-v1";

export type DecisionPhase = "CARD_PLAY";
export type DecisionKind = "LEAD" | "FOLLOW";
export type EvaluationStatus = "COMPLETED" | "FAILED" | "SKIPPED";
export type ExactActionAgreement = "MATCH" | "MISMATCH";

/**
 * How far the acting player's identity can be trusted. onDropCard verifies the
 * request token belongs to the player whose turn it is; the claimed playerId is
 * then cross-checked against that seat.
 */
export type ActorTrust = "SERVER_DERIVED_TOKEN_VERIFIED";

export type SkipReason =
  | "EVALUATOR_NOT_ENABLED"
  | "FIRST_CARD_DEFAULTS_APPLIED"
  | "ACTOR_MISMATCH"
  | "INCONSISTENT_TRICK"
  | "CARD_NOT_IN_LEGAL_ACTIONS";

/** A seat, identified only by its game-scoped alias (never a real name). */
export interface ShadowSeat {
  ref: string;
  seat: number;
  team: Team;
  isBot: boolean;
}

export interface ShadowTrickEntry {
  card: string;
  /** Alias of the player who played the card. */
  by: string;
}

export interface ShadowBid {
  /** Alias of the bidder. */
  by: string;
  action: string;
  bidValue?: number;
  suit?: string;
  bidSelectionType?: string | null;
  bidModifier?: number;
  clickOrder?: string | null;
  noTrumpType?: string | null;
}

/**
 * What the acting human legitimately knows at decision time: their own hand
 * plus public information, with every player replaced by an alias.
 *
 * This is deliberately NOT an ICardGame. It is built from an allowlist, so a
 * field added to the live game later is excluded until it is classified. Other
 * players' hands, tokens, socket ids and real names never appear here.
 */
export interface ShadowVisibleState {
  actorRef: string;
  seats: ShadowSeat[];
  /** The acting player's own hand (ACTOR_ONLY). */
  hand: string[];
  /** Cards already on the table this trick, in play order (PUBLIC_ALWAYS). */
  currentTrick: ShadowTrickEntry[];
  /** Completed-trick piles (PUBLIC_ALWAYS). */
  teamACards: string[];
  teamBCards: string[];
  trumpSuit?: string;
  finalBid?: number;
  currentBet?: string;
  biddingTeam?: string;
  /** Alias of the bidding player. */
  biddingPlayer?: string;
  lastBiddingTeam?: string;
  bidDouble: boolean;
  bidReDouble: boolean;
  bidHistory: ShadowBid[];
  /** Public scores, kept for analysis only (the bot does not read them). */
  teamAScore?: number;
  teamBScore?: number;
}

/** One final record per human decision. */
export interface DecisionRecord {
  schemaVersion: number;
  decisionId: string;
  gameId: string;
  handId: string;
  seq: number;
  timestamp: string;
  phase: DecisionPhase;
  decisionKind: DecisionKind | null;
  positionInTrick: number | null;
  trickNumber: number | null;
  actor: { ref: string; seat: number; team: Team } | null;
  actorTrust: ActorTrust;
  visibleState: ShadowVisibleState | null;
  legalActions: string[] | null;
  humanAction: { card: string };
  botAction: { card: string } | null;
  botActionLegal: boolean | null;
  botStrategy: string | null;
  botReasoning: string | null;
  exactActionAgreement: ExactActionAgreement | null;
  evaluationStatus: EvaluationStatus;
  skipReason: SkipReason | null;
  evaluationError: string | null;
  evaluationMs: number | null;
  botPolicyVersion: string;
  rulesetVersion: string;
  appVersion: string;
  gitCommit: string;
}
