import { ICardGame } from "./models/ICardGame";
import { isCardAvail } from "../utils/misc";
import { IPlayer } from "./models/IPlayer";
import { IDropCardPlayer } from "./models/IDropCardPlayer";
import { Deck } from "../utils/deck";
import { MAX_PLAYERS } from "../constants/misc";
import { InMemoryStore } from "../persistence/InMemoryStore";

/**
 * The class which helps to handle each game session.
 */
export class Game {
  gameObj: ICardGame;
  roundOver: boolean;
  sameSuitDropped: boolean;

  /**
   * Initializes a new instance of the class GameApi.
   * @param gameObj The game object.
   * @param currentGameId The game id.
   * @param currentPlayerPlayed The current player played in realtime.
   */
  constructor(
    private inMemoryStore: InMemoryStore,
    private currentGameId: string,
    private droppedCard: string,
    public currentPlayerToken: string
  ) {
    this.initialize();
  }

  /**
   *
   * Sets the dropped cards.
   */
  public set droppedCards(cards: Array<string>) {
    this.gameObj.droppedCards = cards;
  }

  /**
   *
   * Sets the team A cards.
   */
  public set teamACards(cards: Array<string>) {
    this.gameObj.teamACards = cards;
  }

  /**
   *
   * Sets the team B cards.
   */
  public set teamBCards(cards: Array<string>) {
    this.gameObj.teamBCards = cards;
  }

  /**
   *
   * Sets the current bet.
   */
  public set currentBet(bet: string) {
    this.gameObj.currentBet = bet;
  }

  /**
   *
   * Sets the current player with bet
   */
  public set playerWithCurrentBet(player: string) {
    this.gameObj.playerWithCurrentBet = player;
  }

  /**
   *
   * Sets table cards.
   */
  public set tableCards(cards: Array<string>) {
    this.gameObj.tableCards = cards;
  }

  /**
   * Sets the current turn.
   */
  public set currentTurn(turn: number) {
    this.gameObj.currentTurn = turn;
  }

  /**
   * Get the current turn.
   */
  public get currentTurn(): number {
    return this.gameObj.currentTurn;
  }

  /**
   *
   * Get the current bet.
   */
  public get currentBet() {
    return this.gameObj.currentBet;
  }

  /**
   *
   * Get the current player with bet
   */
  public get playerWithCurrentBet() {
    return this.gameObj.playerWithCurrentBet;
  }

  /**
   * Get the dropped cards.
   */
  public get droppedCards() {
    return this.gameObj.droppedCards;
  }

  /**
   * Get the Team A cards.
   */
  public get teamACards() {
    return this.gameObj.teamACards;
  }

  /**
   * Sets the Team B cards.
   */
  public get teamBCards() {
    return this.gameObj.teamBCards;
  }

  /**
   * Sets the Table cards.
   */
  public get tableCards() {
    return this.gameObj.tableCards;
  }

  /**
   * Gets the current dropper card
   */
  public get currentDroppedCard(): string {
    return this.droppedCard;
  }

  /**
   * Gets the current gameId.
   */
  public get gameId(): string {
    return this.currentGameId;
  }

  /**
   * Identifies whether player actually has the card he dropped.
   */
  public get isCardAvailable(): string {
    return (this.gameObj[this.currentPlayerToken] as any).includes(
      this.droppedCard
    );
  }

  /**
   * Identifies whether the user dropped the same suit or not.
   */
  public get isValidCard(): boolean {
    return this.firstDroppedCard[1] === this.droppedCard[1];
  }

  /**
   * Identifies whether the user is cheating or not.
   */
  public get isCheating(): boolean {
    const cards = this.gameObj[this.currentPlayer.token];
    // Checking whether he has the same suit card which is been dropped earlier.
    const doesHeHasTheCorrectCard = isCardAvail(this.firstDroppedCard, cards);

    if (this.isSameSuitDropped) {
      return false;
    }

    if (!doesHeHasTheCorrectCard && !this.isSameSuitDropped) {
      return false;
    }

    return true;
  }

  /**
   * Gets the first dropped card.
   */
  public get firstDroppedCard(): string {
    if (this.gameObj.droppedCards.length > 0) {
      return this.gameObj.droppedCards[0];
    } else {
      return null;
    }
  }

  /**
   * Gets the last dropped card.
   */
  public get lastDroppedCard(): string {
    if (this.gameObj?.droppedCards.length > 0) {
      const lastIndex = this.gameObj?.droppedCards.length - 1;
      return this.gameObj?.droppedCards[lastIndex];
    } else {
      return null;
    }
  }

  /**
   * Gets the current player.
   */
  public get currentPlayer(): IPlayer {
    return this.gameObj?.players[this.gameObj.currentTurn];
  }

  /**
   * Identifies the player who played is the right player in the current turn.
   */
  public get isHisTurn(): boolean {
    const currentPlayerToken = this.currentPlayer?.token;
    const result = currentPlayerToken === this.currentPlayerToken;

    // console.log("[BOT AGENT] isHisTurn check:", {
    //   currentTurn: this.gameObj.currentTurn,
    //   currentPlayerInGame: this.currentPlayer?.playerId,
    //   currentPlayerInGameToken: currentPlayerToken,
    //   requestPlayerToken: this.currentPlayerToken,
    //   result
    // });

    return result;
  }

  /**
   * Identifies that the dropped card is the last card for the current player.
   */
  public get isLastCard(): boolean {
    return this.gameObj[this.currentPlayerToken].length === 1;
  }

  /**
   * Identifies that the current turn is the first turn of the round.
   */
  public get isCurrentTurnIsFirstTurn(): boolean {
    return this.gameObj?.droppedCards.length === 0;
  }

  /**
   * Identifies whether the current dropped suit is same or different from the previous suit.
   */
  public get isSameSuitDropped(): boolean {
    return this.sameSuitDropped;
  }

  /**
   * Identifies whether the round is over.
   */
  public get isRoundOver(): boolean {
    return this.roundOver;
  }

  /**
   * Gets the index of the player token who dropped the highest number card in the current round.
   */
  // public get playerIndexWhoDroppedHighNumberCard(): number {
  //   let cardsToSort = [...this.gameObj.droppedCards];
  //   cardsToSort = cardsToSort.slice(0, -1);

  //   const sorted = Deck.sortCards(cardsToSort);
  //   const key = sorted[sorted.length - 1];
  //   const token = this.gameObj.dropDetails[key];
  //   return this.gameObj.players.findIndex(x => x.token === token);
  // }

  /**
   * Finds index of the player who was selected to start next round.
   */
  public selectedPlayerIndex(token): number {
    return this.gameObj.players.findIndex((x) => x.token === token);
  }

  /**
   * Gets the player token who dropped the highest number card in the current round.
   */
  // public get playerDroppedHighNumberCard(): IPlayer {
  //   return this.gameObj.players[this.playerIndexWhoDroppedHighNumberCard];
  // }

  /**
   * Incerements the current turn by 1.
   */
  public incrementTurn() {
    const previousTurn = this.gameObj.currentTurn;
    const updatedTurn = this.gameObj.currentTurn + 1;
    if (updatedTurn === MAX_PLAYERS) {
      this.gameObj.currentTurn = 0;
      this.roundOver = true;
    } else {
      this.gameObj.currentTurn = updatedTurn;
      this.roundOver = false;
    }

    // console.log("[BOT AGENT] Turn incremented:", {
    //   previousTurn,
    //   newTurn: this.gameObj.currentTurn,
    //   maxPlayers: MAX_PLAYERS,
    //   roundOver: this.roundOver,
    // });
  }

  /**
   * Updates the strike by updating the turn, adding the drop details.
   */
  public updateStrike() {
    this.saveDropDetails();
    this.incrementTurn();
    // if (this.isSameSuitDropped) {
    //   this.incrementTurn();
    // } else {
    //   this.currentTurn = this.playerIndexWhoDroppedHighNumberCard;
    //   this.roundOver = false;
    // }
  }

  /**
   * Saves the game details to the redis store.
   */
  public saveGame() {
    this.inMemoryStore.saveGame(this.gameId, this.gameObj);
  }

  /**
   * Initializes the game object.
   */
  private initialize() {
    this.gameObj = this.inMemoryStore.fetchGame(this.gameId);
    this.roundOver = false;

    if (this.droppedCards.length === 0) {
      this.sameSuitDropped = true;
    } else {
      this.sameSuitDropped = this.droppedCard[1] === this.firstDroppedCard[1];
    }
  }

  /**
   * Saves the current dropped to the game object.
   */
  private saveDropDetails() {
    this.gameObj.dropDetails.push(this.droppedCard);
    this.gameObj.droppedCards.push(this.droppedCard);
    this.gameObj[this.currentPlayerToken] = this.gameObj[
      this.currentPlayerToken
    ].filter((x) => x !== this.droppedCard);
  }
}
