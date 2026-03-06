import { BasePayload } from "./BasePayload";

export interface BiddingActionRequestPayload extends BasePayload {
  action: "bid" | "pass" | "double" | "re-double";
  bidValue?: number;
  suit?: string;
  bidSelectionType?: "direct" | "modifier" | null;
  bidModifier?: number;
  clickOrder?: "bidFirst" | "suitFirst" | null;
  noTrumpType?: "Noes" | "Pass" | "No-Trump" | null;
}
