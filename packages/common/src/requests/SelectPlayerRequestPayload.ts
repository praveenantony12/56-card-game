import { BasePayload } from "./BasePayload";

export interface SelectPlayerRequestPayload extends BasePayload {
  currentPlayerId: string;
}
