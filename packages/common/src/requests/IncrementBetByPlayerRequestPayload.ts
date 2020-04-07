import { BasePayload } from "./BasePayload";

export interface IncrementBetByPlayerRequestPayload extends BasePayload {
  playerBet: string;
}
