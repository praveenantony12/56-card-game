import { BasePayload } from "./BasePayload";

export interface ReconnectRequestPayload extends BasePayload {
  playerId: string;
  token?: string;
  gameId?: string;
}
