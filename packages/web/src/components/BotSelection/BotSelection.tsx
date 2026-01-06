import { inject, observer } from "mobx-react";
import * as React from "react";
import { Button, Card, Header, Icon, Message, Segment, Input } from "semantic-ui-react";
import { IStore } from "../../stores/IStore";
import { IGame } from "../../stores/models/IGameInfo";
import { IUser } from "../../stores/models/IUserInfo";

interface IProps {
    store?: IStore;
}

interface IState {
    selectedBotCount: number;
    isStartingGame: boolean;
}

@inject("store")
@observer
class BotSelection extends React.Component<IProps, IState> {
    private get store(): IStore {
        return this.props.store as IStore;
    }

    private get gameInfo(): IGame {
        return this.store.game;
    }

    private get userInfo(): IUser {
        return this.store.user;
    }

    constructor(props: IProps) {
        super(props);
        this.state = {
            selectedBotCount: 0, // Default to 0 bots for 6 human game
            isStartingGame: false
        };
    }

    public render() {
        if (!this.canShowBotSelection) {
            return null;
        }

        return (
            <Message icon={true} info>
                <Icon name="users" />
                <Message.Content>
                    <Message.Header>Choose your game setup</Message.Header>

                    {this.gameInfo.sharedGameId && (
                        <Message positive style={{ marginBottom: "20px" }}>
                            <Message.Header>Share Game ID with Friends</Message.Header>
                            <p><strong>Game ID:</strong> {this.gameInfo.sharedGameId}</p>
                            <div style={{ marginTop: "10px" }}>
                                <Input
                                    fluid
                                    value={this.gameInfo.sharedGameId}
                                    readOnly
                                    action={{
                                        color: 'teal',
                                        labelPosition: 'right',
                                        icon: 'copy',
                                        content: 'Copy',
                                        onClick: () => this.copyGameId(),
                                        'data-testid': 'copy-button'
                                    }}
                                />
                            </div>
                            <p style={{ marginTop: "10px", fontSize: "0.9em" }}>
                                Friends can use this Game ID to join your game!
                            </p>
                        </Message>
                    )}

                    <Segment>
                        <Header as="h4">Game Setup: 6 Players Required</Header>
                        <p>Choose how many bot players to add. The game needs exactly 6 total players.</p>
                        <p><strong>0 Bots:</strong> Wait for 5 human players to join (6 humans total)</p>
                        <p><strong>5 Bots:</strong> Start game immediately (1 human + 5 bots)</p>
                        <p><strong>1-4 Bots:</strong> Wait for more human players to join</p>

                        <div style={{ margin: "20px 0" }}>
                            {[0, 1, 2, 3, 4, 5].map(count => (
                                <Button
                                    key={count}
                                    primary={this.state.selectedBotCount === count}
                                    basic={this.state.selectedBotCount !== count}
                                    onClick={() => this.onBotCountSelect(count)}
                                    style={{ margin: "5px" }}
                                >
                                    {count === 0 ? "No Bots" : `${count} Bot${count > 1 ? 's' : ''}`}
                                    {count === 5 && ' (Start Now)'}
                                    {count === 0 && ' (6 Humans)'}
                                </Button>
                            ))}
                        </div>

                        <div style={{ margin: "20px 0" }}>
                            <Button
                                color="green"
                                size="large"
                                onClick={this.onStartWithBots}
                                loading={this.state.isStartingGame}
                                disabled={this.state.isStartingGame || this.state.selectedBotCount !== 5}
                            >
                                Start Game with {this.state.selectedBotCount} Bot{this.state.selectedBotCount > 1 ? 's' : ''} (6 Total)
                            </Button>

                            <Button
                                basic
                                size="large"
                                onClick={this.onWaitForPlayers}
                                disabled={this.state.isStartingGame}
                                style={{ marginLeft: "10px" }}
                            >
                                {this.state.selectedBotCount === 0
                                    ? "Wait for 5 Human Players"
                                    : `Wait for ${6 - 1 - this.state.selectedBotCount} More Human Player${6 - 1 - this.state.selectedBotCount !== 1 ? 's' : ''}`
                                }
                            </Button>
                        </div>

                        {this.gameInfo.error && (
                            <Message error>
                                <Message.Header> Error</Message.Header>
                                {this.gameInfo.error}
                            </Message>
                        )}
                    </Segment>
                </Message.Content>
            </Message>
        );
    }

    private get canShowBotSelection() {
        return this.userInfo.isSignedIn &&
            this.gameInfo.showBotSelection &&
            this.gameInfo.isGameCreator &&
            !this.gameInfo.canStartGame;
    }

    private onBotCountSelect = (count: number) => {
        this.setState({ selectedBotCount: count });
    };

    private copyGameId = () => {
        if (this.gameInfo.sharedGameId) {
            navigator.clipboard.writeText(this.gameInfo.sharedGameId).then(() => {
                // Temporarily change button text to show success
                const button = document.querySelector('[data-testid="copy-button"]') as HTMLElement;
                if (button) {
                    const originalText = button.textContent;
                    button.textContent = 'Copied!';
                    setTimeout(() => {
                        button.textContent = originalText;
                    }, 2000);
                }
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = this.gameInfo.sharedGameId || '';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            });
        }
    };

    private onStartWithBots = async () => {
        this.setState({ isStartingGame: true });
        this.store.clearNotifications();

        try {
            // Only pass startImmediately=true when we have 5 bots (immediate start)
            // For fewer bots, startImmediately will be false by default
            const startImmediately = this.state.selectedBotCount === 5;
            await this.store.addBots(this.state.selectedBotCount, startImmediately);
            // The game will start automatically on the server side
        } catch (error) {
            console.error("Error adding bots:", error);
        } finally {
            this.setState({ isStartingGame: false });
        }
    };

    private onWaitForPlayers = async () => {
        // Add bots but don't start the game - wait for human players
        this.setState({ isStartingGame: true });
        this.store.clearNotifications();

        try {
            await this.store.addBots(this.state.selectedBotCount, false); // startImmediately = false
            // Hide bot selection and show wait message instead
            this.store.hideBotSelection();
        } catch (error) {
            console.error("Error adding bots:", error);
        } finally {
            this.setState({ isStartingGame: false });
        }
    };
}

export default BotSelection;

