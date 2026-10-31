/**
 * Version of the bot's decision policy (TeamBotAgent).
 *
 * Bump this by hand whenever a change to TeamBotAgent can alter which card or
 * bid it chooses. Training records are stamped with it so data produced by
 * different policies is never mixed up. bot-golden.spec.ts will pin the bot's
 * behavior so a forgotten bump is caught.
 */
export const BOT_POLICY_VERSION = "team-bot-agent@1";
