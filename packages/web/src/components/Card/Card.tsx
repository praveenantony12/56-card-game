import * as React from "react";
import CARD_CSS_CLASSES from "../../constants/cards";

import "./card.css";

interface IProps {
  id: string;
  card: string;
  style: any;
  onCardClick: (card: any) => void;
  className: string;
  disabled: boolean;
  flipOver: boolean;
  playerName: string;
}

const Rules: React.SFC<IProps> = ({
  card,
  style,
  onCardClick,
  className,
  disabled,
  flipOver,
  playerName,
}) => {
  if (!card) {
    return (
      <div id={card} className="card" style={style}>
        <div>
          <div className="front" style={{ visibility: "hidden" }}>
            <br />
          </div>
        </div>
      </div>
    );
  }

  const cardNumber = card.substr(2);
  const sign = card[1];
  // Code is repeated to avoid the usage of dangerouslySetInnerHTML
  // TODO can be improved.
  const getSymbols = () => {
    switch (sign) {
      case "E":
        return CARD_CSS_CLASSES[cardNumber].map((o: any) => (
          <div key={o} className={o}>
            &spades;
          </div>
        ));
      case "H":
        return CARD_CSS_CLASSES[cardNumber].map((o: any) => (
          <div key={o} className={o}>
            &hearts;
          </div>
        ));
      case "D":
        return CARD_CSS_CLASSES[cardNumber].map((o: any) => (
          <div key={o} className={o}>
            &diams;
          </div>
        ));
      case "C":
        return CARD_CSS_CLASSES[cardNumber].map((o: any) => (
          <div key={o} className={o}>
            &clubs;
          </div>
        ));
      default:
        throw { message: "Invalid sign" };
    }
  };

  const addIfKQJ = () => {
    let path = "";
    if (cardNumber === "K") {
      path = "images/king.gif";
    } else if (cardNumber === "J") {
      path = "images/jack.gif";
    } else if (cardNumber === "Q") {
      path = "images/queen.gif";
    } else {
      return "";
    }

    return <img className="face" src={path} alt="" width="80" height="120" />;
  };

  const getNumber = () => {
    switch (cardNumber) {
      case "A":
      case "1":
        return "A";
      case "K":
        return "K";
      case "Q":
        return "Q";
      case "J":
        return "J";
      default:
        return cardNumber;
    }
  };

  const cardHolderClassName =
    sign === "D" || sign === "H" || sign === "G" || sign === "L"
      ? "front red"
      : "front";

  const handleCardClick = () => {
    if (disabled) {
      return;
    }

    onCardClick(card);
  };

  const normalCards = () => {
    return (
      <div
        id={card}
        className={className}
        style={style}
        onClick={handleCardClick}
      >
        <div className={cardHolderClassName}>
          <div className="index">
            {getNumber()}
            <br />
          </div>
          {addIfKQJ()}
          {getSymbols()}
        </div>
        {playerName && <div className="playerLabel">{playerName}</div>}
      </div>
    );
  };

  const flipCards = () => {
    const teamCards = document.querySelectorAll(".teamCards .card");
    const teamCardImages = document.querySelectorAll(".teamCards .card img");
    setTimeout(() => {
      teamCardImages.forEach((teamCardImage) => {
        teamCardImage.classList.add("flip_image");
      });
      teamCards.forEach((teamCard) => {
        if (
          teamCard.firstElementChild &&
          teamCard.firstElementChild.classList
        ) {
          teamCard.firstElementChild.classList.add("flip_card");
        }
      });
    }, 10000);
    return normalCards();
  };

  return flipOver ? flipCards() : normalCards();
};

export default Rules;
