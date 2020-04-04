import { BasePayload } from "./BasePayload";

export interface TableCardsRequestPayload extends BasePayload {
  cards: string[];
}
