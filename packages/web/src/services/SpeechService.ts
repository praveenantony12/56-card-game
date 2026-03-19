/**
 * SpeechService
 *
 * Manages Web Speech API (speechSynthesis) for bot bidding actions.
 *
 * Architecture:
 *  - Singleton: import { speechService } to use everywhere.
 *  - Serial promise queue: utterances never overlap.
 *  - 5 distinct bot personalities (pitch, rate, browser voice).
 *  - 4 voice modes: SILENT / MINIMAL / REGULAR / INSIGHT.
 *  - Only the caller (store) decides when to invoke speakBid —
 *    this service is phase-agnostic; phase gating lives in the store.
 */

// ---------------------------------------------------------------------------
// Voice Mode
// ---------------------------------------------------------------------------

export enum VoiceMode {
  SILENT = "SILENT",
  MINIMAL = "MINIMAL",
  REGULAR = "REGULAR",
  INSIGHT = "INSIGHT",
}

export const VOICE_MODES: { mode: VoiceMode; label: string }[] = [
  { mode: VoiceMode.SILENT, label: "Silent" },
  { mode: VoiceMode.MINIMAL, label: "Minimal" },
  { mode: VoiceMode.REGULAR, label: "Regular" },
  { mode: VoiceMode.INSIGHT, label: "AI Insight" },
];

// ---------------------------------------------------------------------------
// Bot Personality
// ---------------------------------------------------------------------------

export interface BotPersonality {
  /** Display name shown in tooltips / aria-labels */
  label: string;
  /** SpeechSynthesisUtterance.rate  (0.1 – 10, normal = 1) */
  rate: number;
  /** SpeechSynthesisUtterance.pitch (0 – 2,   normal = 1) */
  pitch: number;
}

/**
 * Five distinct personalities, keyed "bot1" … "bot5".
 * Personality is selected by extracting the numeric suffix from the
 * server-assigned botId (e.g. "Bot2", "bot_player3") and mapping 1-mod-5.
 */
const BOT_PERSONALITIES: Record<string, BotPersonality> = {
  bot1: { label: "The Strategist", rate: 0.9, pitch: 0.9 }, // calm, analytical
  bot2: { label: "The Risk Taker", rate: 1.15, pitch: 1.2 }, // fast, confident
  bot3: { label: "The Analyst", rate: 1.0, pitch: 1.0 }, // neutral, precise
  bot4: { label: "The Silent Pro", rate: 0.85, pitch: 0.8 }, // minimal, direct
  bot5: { label: "The Veteran", rate: 1.05, pitch: 1.1 }, // measured, experienced
};

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

class SpeechService {
  private mode: VoiceMode = VoiceMode.REGULAR;
  private voices: SpeechSynthesisVoice[] = [];

  /**
   * Promise chain that serialises all utterances.
   * Every call to speakBid appends to this chain so speech never overlaps.
   */
  private speechQueue: Promise<void> = Promise.resolve();

  private readonly supported: boolean;

  constructor() {
    this.supported =
      typeof window !== "undefined" && "speechSynthesis" in window;

    if (this.supported) {
      const loadVoices = () => {
        this.voices = window.speechSynthesis.getVoices();
      };
      // Voices may load asynchronously (Chrome fires onvoiceschanged)
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Change the active voice mode. Takes effect on the very next bot action. */
  public setVoiceMode(mode: VoiceMode): void {
    this.mode = mode;
  }

  /** Returns the currently active voice mode (used by VoiceControl to initialise UI). */
  public getVoiceMode(): VoiceMode {
    return this.mode;
  }

  /**
   * Queue speech for a bot bidding action.
   *
   * Called from the store after isBiddingPhase is confirmed.
   *
   * @param botId    Server bot identifier (e.g. "Bot1", "bot_player2")
   * @param decision Readable decision text  (e.g. "28 Spades", "pass")
   * @param reasoning Readable reasoning from the AI (optional, used in INSIGHT mode)
   */
  public speakBid(botId: string, decision: string, reasoning?: string): void {
    if (!this.supported || this.mode === VoiceMode.SILENT) return;

    const isPass = /^pass$/i.test((decision ?? "").trim());

    // MINIMAL mode: bots stay silent when passing
    if (isPass && this.mode === VoiceMode.MINIMAL) return;

    const text = this.generateSpeechText(decision, reasoning, isPass);
    if (!text) return;

    const personality = this.getBotPersonality(botId);
    // 600 – 1200 ms simulated thinking delay before speaking
    const thinkingDelay = 600 + Math.random() * 600;

    // Append to the serial queue — speech never overlaps
    this.speechQueue = this.speechQueue
      .then(() => promiseDelay(thinkingDelay))
      .then(() => this.speak(text, botId, personality));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Build the utterance text depending on mode. */
  private generateSpeechText(
    decision: string,
    reasoning: string | undefined,
    isPass: boolean,
  ): string {
    const decisionText = (decision ?? "").trim();

    if (this.mode === VoiceMode.INSIGHT && reasoning) {
      return isPass
        ? `Passing. ${reasoning}`
        : `Bidding ${decisionText}. ${reasoning}`;
    }

    return decisionText;
  }

  /**
   * Map server botId → one of the 5 personalities.
   * Extracts the first numeric run from the id, or falls back to a char hash.
   */
  private getBotPersonality(botId: string): BotPersonality {
    const match = (botId ?? "").match(/(\d+)/);
    const idx = match
      ? (parseInt(match[1], 10) - 1) % 5
      : this.charHash(botId ?? "");
    return BOT_PERSONALITIES[`bot${idx + 1}`] ?? BOT_PERSONALITIES.bot1;
  }

  /** Deterministic 0-4 hash of an arbitrary string. */
  private charHash(s: string): number {
    return s.split("").reduce((acc, ch) => (acc + ch.charCodeAt(0)) % 5, 0);
  }

  /**
   * Speak a single utterance and return a Promise that resolves on completion.
   * Never rejects — the queue must always advance even if speech fails.
   */
  private speak(
    text: string,
    botId: string,
    personality: BotPersonality,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.supported) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = personality.rate;
      utterance.pitch = personality.pitch;

      // Assign a distinct voice per bot when the browser provides multiple
      if (this.voices.length > 1) {
        const match = (botId ?? "").match(/(\d+)/);
        const voiceIdx = match
          ? (parseInt(match[1], 10) - 1) % this.voices.length
          : this.charHash(botId ?? "") % this.voices.length;
        utterance.voice = this.voices[voiceIdx];
      }

      // Always resolve so the queue never stalls
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function promiseDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const speechService = new SpeechService();
