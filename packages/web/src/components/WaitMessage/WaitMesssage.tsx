import { inject, observer } from "mobx-react";
import * as React from "react";
import { IStore } from "../../stores/IStore";
import { IGame } from "../../stores/models/IGameInfo";
import { IUser } from "../../stores/models/IUserInfo";
import "./wait-message.css";

interface IProps {
  store?: IStore;
  onBack?: () => void;
}

interface IState {
  gameIdCopied: boolean;
  linkCopied: boolean;
}

@inject("store")
@observer
class WaitMesssage extends React.Component<IProps, IState> {
  public state: IState = { gameIdCopied: false, linkCopied: false };

  private get store(): IStore {
    return this.props.store as IStore;
  }

  private get gameInfo(): IGame {
    return this.store.game;
  }

  private get userInfo(): IUser {
    return this.store.user;
  }

  public render() {
    if (this.store.isPendingReconnectionApproval) {
      return (
        <div className="wait-info">
          <div className="wait-info-spinner" />
          <div>
            <div className="wait-info-title">Waiting for approval</div>
            <div className="wait-info-body">
              Your reconnection request has been sent to other players for
              approval.
            </div>
          </div>
        </div>
      );
    }

    if (this.canShowWaitMessage) {
      if (this.gameInfo.isGameCreator) {
        const gameId = this.gameInfo.sharedGameId || "";
        const shareUrl = this.store.getShareableGameUrl(gameId);
        const hasNativeShare =
          typeof navigator !== "undefined" && !!navigator.share;

        const waText = encodeURIComponent(
          `Join my 56 Card Game! Use Game ID: ${gameId} or click: ${shareUrl}`,
        );
        const mailSubject = encodeURIComponent("Join my 56 Card Game!");
        const mailBody = encodeURIComponent(
          `Hey! Join my 56 Card Game.\n\nGame ID: ${gameId}\nOr click this link to join directly: ${shareUrl}`,
        );

        return (
          <div className="wait-card">
            {this.props.onBack && (
              <button className="wait-back-btn" onClick={this.props.onBack}>
                ← Back
              </button>
            )}

            <div className="wait-header">
              <div className="wait-spinner" />
              <div>
                <div className="wait-title">Waiting for players to join</div>
                <div className="wait-subtitle">
                  Share the invite below — game starts when 6 players are in
                </div>
              </div>
            </div>

            <div className="wait-section">
              <div className="wait-label">Game ID</div>
              <div className="wait-copy-row">
                <input className="wait-copy-text" readOnly value={gameId} />
                <button
                  className={`wait-copy-btn${this.state.gameIdCopied ? " copied" : ""}`}
                  onClick={this.copyGameId}
                >
                  {this.state.gameIdCopied ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>

            <hr className="wait-divider" />

            <div className="wait-section">
              <div className="wait-label">Invite Link</div>
              <div className="wait-copy-row">
                <input className="wait-copy-text" readOnly value={shareUrl} />
                <button
                  className={`wait-copy-btn${this.state.linkCopied ? " copied" : ""}`}
                  onClick={this.copyShareableUrl}
                >
                  {this.state.linkCopied ? "✓ Copied" : "Copy Link"}
                </button>
              </div>

              <div className="wait-share-row">
                <a
                  className="wait-share-btn whatsapp"
                  href={`https://api.whatsapp.com/send?text=${waText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="wait-share-icon">📱</span> WhatsApp
                </a>
                <a
                  className="wait-share-btn gmail"
                  href={`mailto:?subject=${mailSubject}&body=${mailBody}`}
                >
                  <span className="wait-share-icon">✉️</span> Email
                </a>
                {hasNativeShare && (
                  <button
                    className="wait-share-btn native"
                    onClick={this.nativeShare}
                  >
                    <span className="wait-share-icon">⬆️</span> More
                  </button>
                )}
              </div>
            </div>

            <p className="wait-note">
              The game will start automatically once <strong>6 players</strong>{" "}
              have joined.
            </p>
          </div>
        );
      } else {
        return (
          <div className="wait-info">
            <div className="wait-info-spinner" />
            <div>
              <div className="wait-info-title">Please wait</div>
              <div className="wait-info-body">
                The game creator is setting up the game. You'll be connected
                once the game starts.
              </div>
            </div>
          </div>
        );
      }
    }
    return null;
  }

  private get canShowWaitMessage() {
    return (
      this.userInfo.isSignedIn &&
      !this.gameInfo.canStartGame &&
      !this.gameInfo.showBotSelection &&
      !this.gameInfo.isInLobby
    );
  }

  private copyGameId = () => {
    if (!this.gameInfo.sharedGameId) {
      return;
    }
    const value = this.gameInfo.sharedGameId;
    const onSuccess = () => {
      this.setState({ gameIdCopied: true });
      setTimeout(() => this.setState({ gameIdCopied: false }), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(value)
        .then(onSuccess)
        .catch(() => {
          this.fallbackCopyToClipboard(value, onSuccess);
        });
    } else {
      this.fallbackCopyToClipboard(value, onSuccess);
    }
  };

  private copyShareableUrl = () => {
    if (!this.gameInfo.sharedGameId) {
      return;
    }
    const url = this.store.getShareableGameUrl(this.gameInfo.sharedGameId);
    const onSuccess = () => {
      this.setState({ linkCopied: true });
      setTimeout(() => this.setState({ linkCopied: false }), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(onSuccess)
        .catch(() => {
          this.fallbackCopyToClipboard(url, onSuccess);
        });
    } else {
      this.fallbackCopyToClipboard(url, onSuccess);
    }
  };

  private nativeShare = () => {
    if (!this.gameInfo.sharedGameId) {
      return;
    }
    const url = this.store.getShareableGameUrl(this.gameInfo.sharedGameId);
    navigator
      .share({
        title: "Join my 56 Card Game!",
        text: `Join using Game ID: ${this.gameInfo.sharedGameId}`,
        url,
      })
      .catch(() => {
        /* user dismissed or unsupported */
      });
  };

  private fallbackCopyToClipboard = (text: string, onSuccess?: () => void) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    } finally {
      document.body.removeChild(textArea);
    }
  };
}

export default WaitMesssage;
