import { BasePayload } from "./BasePayload";

export interface UpdateGameScoreRequestPayload extends BasePayload {
  gameScore: string;
}
