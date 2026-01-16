import { BasePayload } from "./BasePayload";

export interface BiddingActionRequestPayload extends BasePayload {
  action: "bid" | "pass" | "double" | "re-double";
  bidValue?: number;
  suit?: string;
}
