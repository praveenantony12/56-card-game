import { inject, observer } from "mobx-react";
import * as React from "react";
import { Icon, Message, Input } from "semantic-ui-react";
import { IStore } from "../../stores/IStore";
import { IGame } from "../../stores/models/IGameInfo";
import { IUser } from "../../stores/models/IUserInfo";

interface IProps {
  store?: IStore;
}

@inject("store")
@observer
class WaitMesssage extends React.Component<IProps, {}> {
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
        <Message icon={true} info>
          <Icon name="clock outline" />
          <Message.Content>
            <Message.Header>Waiting for approval</Message.Header>
            Your reconnection request has been sent to other players for
            approval.
          </Message.Content>
        </Message>
      );
    }

    if (this.canShowWaitMessage) {
      if (this.gameInfo.isGameCreator) {
        // Game creator waiting for players after selecting fewer than 5 bots
        return (
          <Message icon={true} info>
            <Icon name="circle notched" loading={true} />
            <Message.Content>
              <Message.Header>Waiting for other players to join</Message.Header>
              <div style={{ marginTop: "15px" }}>
                <p>
                  <strong>Game ID:</strong> {this.gameInfo.sharedGameId}
                </p>
                <Input
                  fluid
                  value={this.gameInfo.sharedGameId || ""}
                  readonly
                  action={{
                    color: "teal",
                    labelPosition: "right",
                    icon: "copy",
                    content: "Copy",
                    onClick: () => this.copyGameId(),
                    "data-testid": "wait-copy-button",
                  }}
                />
                <p style={{ marginTop: "10px" }}>
                  {" "}
                  Share this Game ID with friends so they can join your game!
                </p>
                <p>
                  The game will start automatically once 6 total players have
                  joined.
                </p>
              </div>
            </Message.Content>
          </Message>
        );
      } else {
        // Regular player waiting for the game to start
        return (
          <Message icon={true} hidden={!this.canShowWaitMessage}>
            <Icon name="circle notched" loading={true} />
            <Message.Content>
              <Message.Header>Please wait.</Message.Header>
              The game creator is setting up the game. You'll be connected once
              the game starts.
            </Message.Content>
          </Message>
        );
      }
    }
    return null;
  }

  private get canShowWaitMessage() {
    return (
      this.userInfo.isSignedIn &&
      !this.gameInfo.canStartGame &&
      !this.gameInfo.showBotSelection
    );
  }

  private copyGameId = () => {
    if (this.gameInfo.sharedGameId) {
      // Check if navigator.clipboard is available (HTTPS or localhost)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(this.gameInfo.sharedGameId)
          .then(() => {
            // Temporarily change button text to show success
            const button = document.querySelector(
              '[data - testid="wait-copy-button"]'
            ) as HTMLElement;
            if (button) {
              const originalText = button.textContent;
              button.textContent = "Copied!";
              setTimeout(() => {
                button.textContent = originalText;
              }, 2000);
            }
          })
          .catch(() => {
            this.fallbackCopyToClipboard();
          });
      } else {
        // Fallback for browsers without clipboard API support
        this.fallbackCopyToClipboard();
      }
    }
  };

  private fallbackCopyToClipboard = () => {
    const textArea = document.createElement("textarea");
    textArea.value = this.gameInfo.sharedGameId || "";
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      // Show success feedback
      const button = document.querySelector(
        '[data - testid="wait-copy-button"]'
      ) as HTMLElement;
      if (button) {
        const originalText = button.textContent;
        button.textContent = "Copied!";
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    } finally {
      document.body.removeChild(textArea);
    }
  };
}

export default WaitMesssage;
