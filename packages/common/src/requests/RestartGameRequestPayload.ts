import { BasePayload } from "./BasePayload";

export interface RestartGameRequestPayload extends BasePayload {
  gameId: string;
}
