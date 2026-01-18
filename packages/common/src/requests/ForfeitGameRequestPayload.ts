import { BasePayload } from "./BasePayload";

export interface ForfeitGameRequestPayload extends BasePayload {
  gameId: string;
  playerId: string;
}
