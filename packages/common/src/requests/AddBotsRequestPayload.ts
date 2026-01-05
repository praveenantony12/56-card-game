export interface AddBotsRequestPayload {
  botCount: number;
  gameId: string;
  startImmediately?: boolean; // If true, start game immediately; if false, just add bots add wait for players(human)
}
