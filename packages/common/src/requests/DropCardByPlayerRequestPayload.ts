import { BasePayload } from "./BasePayload";

export interface DropCardByPlayerRequestPayload extends BasePayload {
  dropCardPlayer: string[];
}
