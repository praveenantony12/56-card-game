import { inject, observer } from "mobx-react";
import * as React from "react";

import { IStore } from "../../stores/IStore";
import "./bot-reasoning-panel.css";

interface IProps {
  store?: IStore;
}

interface IState {
  fresh: boolean;
  lastTs: number;
}

@inject("store")
@observer
class BotReasoningPanel extends React.Component<IProps, IState> {
  private freshTimer: any = null;

  constructor(props: IProps) {
    super(props);
    this.state = { fresh: false, lastTs: 0 };
  }

  private get store(): IStore {
    return this.props.store as IStore;
  }

  componentDidUpdate() {
    const reasoning = this.store.game.botReasoning;
    if (reasoning && reasoning.ts !== this.state.lastTs) {
      this.setState({ fresh: true, lastTs: reasoning.ts });
      if (this.freshTimer) clearTimeout(this.freshTimer);
      this.freshTimer = setTimeout(() => this.setState({ fresh: false }), 800);
    }
  }

  componentWillUnmount() {
    if (this.freshTimer) clearTimeout(this.freshTimer);
  }

  public render() {
    const reasoning = this.store.game.botReasoning;

    if (!reasoning) {
      return null;
    }

    const isCard = reasoning.type === "card";
    const { fresh } = this.state;

    return (
      <div className={`bot-reasoning-panel${fresh ? " fresh" : ""}`}>
        <div className="brp-header">
          <div className="brp-header-left">
            <div className="brp-dot" />
            <span className="brp-title">AI Reasoning</span>
          </div>
          <span className={`brp-type-badge ${reasoning.type}`}>
            {isCard ? "Card Play" : "Bid"}
          </span>
        </div>

        <div className="brp-body">
          {reasoning.strategy && (
            <div className="brp-row">
              <span className="brp-label">Strategy</span>
              <span className="brp-value strategy">
                {reasoning.strategy.replace(/_/g, " ")}
              </span>
            </div>
          )}

          {reasoning.strategy && <div className="brp-divider" />}

          {reasoning.reasoning && (
            <div className="brp-row">
              <span className="brp-label">Reasoning</span>
              <span className="brp-value">{reasoning.reasoning}</span>
            </div>
          )}

          <div className="brp-decision-row">
            <span className="brp-decision-label">
              {isCard ? "Playing" : "Decision"}
            </span>
            <span
              className={`brp-decision-value ${isCard ? "card-decision" : "bid-decision"}`}
            >
              {reasoning.decision}
            </span>
          </div>
        </div>

        <div className="brp-bot-id">
          {reasoning.botId} · {reasoning.gameMode}
        </div>
      </div>
    );
  }
}

export default BotReasoningPanel;
