import { suits, names, cardToWeightageDict } from "../constants/deck";

export class Deck {
  private cards: Array<string> = [];

  constructor() {
    for (let s = 0; s < suits.length; s++) {
      for (let n = 0; n < names.length; n++) {
        this.cards.push(`${suits[s]}${names[n]}`);
      }
    }
  }

  public get cardsShuffled(): Array<string> {
    return this.shuffle(this.cards);
  }

  public sortCards(cards: Array<string>) {
    const mapped = cards.map((card) => {
      return { card: card, weight: cardToWeightageDict[card.slice(2)] };
    });

    const mappedByWeight = this.sortByWeight(mapped);
    const mappedByName = this.sortByName(mappedByWeight);
    return mappedByName.map((m) => m.card);
  }

  public sortByWeight(cards) {
    return cards.sort((a, b) => b.weight - a.weight);
  }

  public sortByName(cards) {
    return cards.sort(function (a, b) {
      if (a.card[1] < b.card[1]) {
        return -1;
      }
      if (a.card[1] > b.card[1]) {
        return 1;
      }

      // names must be equal
      return 0;
    });
  }

  public getCardsForGame(): Array<Array<string>> {
    let cards = [];
    let shuffled: Array<string> = this.shuffle(this.cards);

    let start,
      end = 0;

    for (var i = 0; i < 6; i++) {
      start = end;
      end = start + 8;
      cards.push(shuffled.slice(start, end));
    }
    return cards;
  }

  // Reference (Credits goes to the author in that blog)
  // https://bost.ocks.org/mike/shuffle/
  private shuffle(array) {
    let m = array.length,
      t,
      i;

    // While there remain elements to shuffle…
    while (m) {
      // Pick a remaining element…
      i = Math.floor(Math.random() * m--);

      // And swap it with the current element.
      t = array[m];
      array[m] = array[i];
      array[i] = t;
    }
    return array;
  }
}
