/**
 * VoiceControl
 *
 * Floating UI widget that lets the player change the bot voice mode at any
 * time during the game without affecting gameplay.
 *
 * Renders a labelled range slider with 4 discrete stops:
 *   Silent ── Minimal ── Regular ── AI Insight
 *
 * Reads / writes the SpeechService singleton — no store interaction needed.
 */

import * as React from "react";
import {
  speechService,
  VoiceMode,
  VOICE_MODES,
} from "../../services/SpeechService";
import "./voice-control.css";

interface IState {
  mode: VoiceMode;
  expanded: boolean;
}

class VoiceControl extends React.Component<{}, IState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      mode: speechService.getVoiceMode(),
      expanded: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  private handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    const mode = VOICE_MODES[idx].mode;
    speechService.setVoiceMode(mode);
    this.setState({ mode });
  };

  private handleLabelClick = (mode: VoiceMode) => {
    speechService.setVoiceMode(mode);
    this.setState({ mode });
  };

  private toggleExpanded = () => {
    this.setState((s) => ({ expanded: !s.expanded }));
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  public render() {
    const { mode, expanded } = this.state;
    const currentIdx = VOICE_MODES.findIndex((m) => m.mode === mode);
    const fillPercent = (currentIdx / (VOICE_MODES.length - 1)) * 100;

    // Gradient fills the track up to the thumb position
    const sliderBackground = `linear-gradient(
      to right,
      #5b8ef0 ${fillPercent}%,
      rgba(255, 255, 255, 0.18) ${fillPercent}%
    )`;

    return (
      <div
        className={`voice-control${expanded ? " voice-control--expanded" : ""}`}
      >
        {/* Collapsed toggle button */}
        <button
          className="vc-toggle"
          title="Bot voice settings"
          aria-label="Toggle bot voice settings"
          onClick={this.toggleExpanded}
        >
          <span className="vc-toggle-icon">
            {mode === VoiceMode.SILENT ? "🔇" : "🔊"}
          </span>
          <span className="vc-toggle-label">
            {VOICE_MODES[currentIdx].label}
          </span>
          <span className="vc-toggle-arrow">{expanded ? "▾" : "◂"}</span>
        </button>

        {/* Expanded panel */}
        {expanded && (
          <div className="vc-panel">
            <div className="vc-heading">Bot Voice Mode</div>

            <div className="vc-slider-wrap">
              <input
                type="range"
                className="vc-slider"
                min={0}
                max={VOICE_MODES.length - 1}
                step={1}
                value={currentIdx}
                aria-label="Voice mode"
                aria-valuetext={VOICE_MODES[currentIdx].label}
                onChange={this.handleSliderChange}
                style={{ background: sliderBackground } as React.CSSProperties}
              />

              {/* Stop labels below the slider */}
              <div className="vc-stops" aria-hidden="true">
                {VOICE_MODES.map((m, i) => (
                  <button
                    key={m.mode}
                    className={`vc-stop${i === currentIdx ? " vc-stop--active" : ""}`}
                    onClick={() => this.handleLabelClick(m.mode)}
                    title={VC_DESCRIPTIONS[m.mode]}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tooltip description for the active mode */}
            <div className="vc-description">{VC_DESCRIPTIONS[mode]}</div>
          </div>
        )}
      </div>
    );
  }
}

// ---------------------------------------------------------------------------
// Mode descriptions shown in the tooltip row
// ---------------------------------------------------------------------------

const VC_DESCRIPTIONS: Record<VoiceMode, string> = {
  [VoiceMode.SILENT]: "Bots are completely silent.",
  [VoiceMode.MINIMAL]: "Bots speak bids only — no pass announcements.",
  [VoiceMode.REGULAR]: "Bots speak every action including pass.",
  [VoiceMode.INSIGHT]: "Bots speak their bid and a short AI reasoning.",
};

export default VoiceControl;
