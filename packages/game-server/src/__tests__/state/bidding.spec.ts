/**
 * Bidding: transitions, rejections, raise phase and the hand-over to card play.
 *
 * Hands come from DEAL_ONE and nobody is a bot, so no timers are involved and
 * every action is driven explicitly. The tests assert the bidding mechanics the
 * UI and the bots rely on. Rules the table has not confirmed (for example whether
 * bids must increase) are NOT asserted here; see characterization/.
 */

import { GAME_ID, biddingGame } from "../helpers/builders";
import {
  Harness,
  Reply,
  actionsOf,
  bid,
  drop,
  emitsOf,
  expectRejectedWithoutMutation,
  liveGame,
  makeCore,
  seedGame,
  useQuietConsole,
} from "../helpers/harness";
import { useGameTimers } from "../helpers/timers";

useQuietConsole();
useGameTimers();

function startBidding(starter: number = 0): Harness {
  const harness = makeCore();
  seedGame(harness, biddingGame({ starter }));
  return harness;
}

function expectAccepted(reply: Reply): void {
  expect(reply.called).toBe(1);
  expect(reply.err).toBeNull();
  expect(reply.code).not.toBe("FAILED");
}

/** Seats pass in order, starting at `from`. */
function passes(harness: Harness, seats: number[]): void {
  seats.forEach((seat) => expectAccepted(bid(harness, seat, "pass")));
}

/** Seat 0 bids 28 hearts and everyone else passes: the game is now in the raise phase. */
function toRaisePhase(harness: Harness, value: number = 28, suit: string = "H"): void {
  expectAccepted(bid(harness, 0, "bid", { bidValue: value, suit }));
  passes(harness, [1, 2, 3, 4, 5]);
  expect(liveGame(harness).bidRaisePhase).toBe(true);
}

describe("opening a bid", () => {
  test("a valid bid is recorded with its value and suit and becomes the current bet and trump", () => {
    const harness = startBidding();
    expectAccepted(bid(harness, 0, "bid", { bidValue: 30, suit: "D" }));

    const game = liveGame(harness);
    expect(game.currentBet).toBe("30");
    expect(game.trumpSuit).toBe("D");
    expect(game.bidHistory).toHaveLength(1);
    expect(game.bidHistory[0]).toMatchObject({ playerId: "Ann", action: "bid", bidValue: 30, suit: "D" });
  });

  test("the turn to bid moves to the next seat after each action", () => {
    const harness = startBidding();
    expect(liveGame(harness).currentBiddingPlayerId).toBe("Ann");

    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    expect(liveGame(harness).currentBiddingPlayerId).toBe("Ben");

    bid(harness, 1, "pass");
    expect(liveGame(harness).currentBiddingPlayerId).toBe("Cal");
  });

  test("the bidding turn wraps from the last seat back to seat 0", () => {
    const harness = startBidding(5);
    expect(liveGame(harness).currentBiddingPlayerId).toBe("Fay");
    bid(harness, 5, "bid", { bidValue: 28, suit: "H" });
    expect(liveGame(harness).currentBiddingPlayerId).toBe("Ann");
  });

  test("a bid records the bidding team of the bidder", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    expect(liveGame(harness).lastBiddingTeam).toBe("A");

    bid(harness, 1, "bid", { bidValue: 29, suit: "H" });
    expect(liveGame(harness).lastBiddingTeam).toBe("B");
  });

  test("a new bid resets the pass count and clears any double", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    bid(harness, 1, "double");
    expect(liveGame(harness).bidDouble).toBe(true);
    bid(harness, 2, "pass");
    expect(liveGame(harness).bidPassCount).toBe(1);

    bid(harness, 3, "bid", { bidValue: 29, suit: "S" });
    const game = liveGame(harness);
    expect(game.bidPassCount).toBe(0);
    expect(game.bidDouble).toBe(false);
  });

  test("every accepted action is broadcast to the room as a biddingAction update", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    bid(harness, 1, "pass");

    const updates = emitsOf(harness.emitted, "biddingAction");
    expect(updates).toHaveLength(2);
    expect(updates[1].room).toBe(GAME_ID);
    expect(updates[1].payload.payload.data.bidHistory).toHaveLength(2);
  });
});

describe("rejected bids leave the game untouched", () => {
  test.each([
    ["a bid below 28", { bidValue: 27, suit: "H" }],
    ["a bid above 56", { bidValue: 57, suit: "H" }],
    ["a zero bid", { bidValue: 0, suit: "H" }],
    ["a bid with no value", { suit: "H" }],
    ["a bid with no suit", { bidValue: 30 }],
  ] as Array<[string, any]>)("%s", (_name: string, fields: any) => {
    const harness = startBidding();
    expectRejectedWithoutMutation(harness, () => bid(harness, 0, "bid", fields), { message: "Invalid bid" });
  });

  test("an unknown action", () => {
    const harness = startBidding();
    expectRejectedWithoutMutation(harness, () => bid(harness, 0, "shout"), { message: "Invalid action" });
  });

  test("a token that belongs to nobody in the game", () => {
    const harness = startBidding();
    expectRejectedWithoutMutation(harness, () => {
      let reply: any;
      harness.core.onBiddingAction({ gameId: GAME_ID, token: "stranger", action: "pass" }, (err: any, res: any) => {
        reply = { called: 1, err, res, code: res && res.code, message: res && res.message };
      });
      return reply;
    }, { message: "Player not found" });
  });

  test("a game that does not exist", () => {
    const harness = startBidding();
    let reply: any;
    harness.core.onBiddingAction({ gameId: "nope", token: "tok-0", action: "pass" }, (err: any, res: any) => {
      reply = { err, res };
    });
    expect(reply.res.code).toBe("FAILED");
    expect(reply.res.message).toBe("Game not found");
  });

  test("a bid after the bidding phase has ended", () => {
    const harness = makeCore();
    seedGame(harness, biddingGame({ overrides: { isBiddingPhase: false } }));
    expectRejectedWithoutMutation(harness, () => bid(harness, 0, "bid", { bidValue: 28, suit: "H" }), {
      message: "Not in bidding phase",
    });
  });

  test("a raise outside the raise phase", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    expectRejectedWithoutMutation(harness, () => bid(harness, 0, "raise-bid", { bidValue: 40 }), {
      message: "Not in bid raise phase",
    });
  });

  test("a skip-raise outside the raise phase", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    expectRejectedWithoutMutation(harness, () => bid(harness, 0, "skip-raise"), {
      message: "Not in bid raise phase",
    });
  });
});

describe("pass", () => {
  test("passing after a bid is recorded and counted", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    bid(harness, 1, "pass");
    bid(harness, 2, "pass");

    const game = liveGame(harness);
    expect(game.bidPassCount).toBe(2);
    expect(game.bidHistory.map((entry: any) => entry.action)).toEqual(["bid", "pass", "pass"]);
  });

  test("bidding continues while fewer than five seats have passed after the last bid", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    passes(harness, [1, 2, 3, 4]);

    const game = liveGame(harness);
    expect(game.isBiddingPhase).toBe(true);
    expect(game.bidRaisePhase).toBe(false);
    expect(game.currentBiddingPlayerId).toBe("Fay");
  });
});

describe("double and re-double", () => {
  test("only the opposing team may double", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    expectRejectedWithoutMutation(harness, () => bid(harness, 2, "double"), { message: "Only opposing team can double" });
  });

  test("an opponent's double is recorded, resets the pass count and passes the turn on", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    expectAccepted(bid(harness, 1, "double"));

    const game = liveGame(harness);
    expect(game.bidDouble).toBe(true);
    expect(game.bidPassCount).toBe(0);
    expect(game.bidHistory[1]).toMatchObject({ playerId: "Ben", action: "double" });
    expect(game.currentBiddingPlayerId).toBe("Cal");
  });

  test("a re-double requires an existing double", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    expectRejectedWithoutMutation(harness, () => bid(harness, 2, "re-double"), {
      message: "Cannot re-double without double",
    });
  });

  test("only the bidding team may re-double", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    bid(harness, 1, "double");
    expectRejectedWithoutMutation(harness, () => bid(harness, 3, "re-double"), {
      message: "Only bidding team can re-double",
    });
  });

  test("a re-double ends bidding at once with the re-double flag set and the double cleared", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    bid(harness, 1, "double");
    expectAccepted(bid(harness, 2, "re-double"));

    const game = liveGame(harness);
    expect(game.isBiddingPhase).toBe(false);
    expect(game.bidReDouble).toBe(true);
    expect(game.bidDouble).toBe(false);
    expect(game.finalBid).toBe(28);

    const ends = emitsOf(harness.emitted, "biddingPhaseEnd");
    expect(ends).toHaveLength(1);
    expect(ends[0].payload.payload.data).toMatchObject({ finalBid: 28, bidReDouble: true, bidDouble: false });
  });

  test("after a double five further passes are needed before bidding ends", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    passes(harness, [1, 2]);
    bid(harness, 3, "double");

    passes(harness, [4, 5, 0, 1]);
    expect(liveGame(harness).bidRaisePhase).toBe(false);
    expect(liveGame(harness).isBiddingPhase).toBe(true);

    passes(harness, [2]);
    expect(liveGame(harness).bidRaisePhase).toBe(true);
  });
});

describe("end of bidding", () => {
  test("five passes after the last bid offer the last bidder a raise", () => {
    const harness = startBidding();
    toRaisePhase(harness);

    const game = liveGame(harness);
    expect(game.bidRaisePhase).toBe(true);
    expect(game.bidRaiseOfferedTo).toBe("Ann");
    expect(game.currentBiddingPlayerId).toBe("Ann");
    expect(game.isBiddingPhase).toBe(true);

    const offers = emitsOf(harness.emitted, "bidRaisePhase");
    expect(offers).toHaveLength(1);
    expect(offers[0].payload.payload.data).toMatchObject({
      bidRaiseOfferedTo: "Ann",
      currentBid: 28,
      availableBidLevels: [40, 48, 56],
    });
  });

  test("a bid of 56 cannot be raised, so bidding ends straight away", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 56, suit: "H" });
    passes(harness, [1, 2, 3, 4, 5]);

    const game = liveGame(harness);
    expect(game.bidRaisePhase).toBeFalsy();
    expect(game.isBiddingPhase).toBe(false);
    expect(game.finalBid).toBe(56);
  });

  test("skipping the raise ends bidding with the last bid, its suit as trump, and its bidder and team", () => {
    const harness = startBidding();
    bid(harness, 0, "bid", { bidValue: 28, suit: "H" });
    bid(harness, 1, "bid", { bidValue: 30, suit: "D" });
    passes(harness, [2, 3, 4, 5, 0]);
    expect(liveGame(harness).bidRaiseOfferedTo).toBe("Ben");

    expectAccepted(bid(harness, 1, "skip-raise"));

    const game = liveGame(harness);
    expect(game.isBiddingPhase).toBe(false);
    expect(game.finalBid).toBe(30);
    expect(game.trumpSuit).toBe("D");
    expect(game.biddingPlayer).toBe("Ben");
    expect(game.biddingTeam).toBe("B");
    expect(game.bidRaisePhase).toBe(false);
  });

  test("the end of bidding is announced exactly once with the final contract", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    bid(harness, 0, "skip-raise");

    const ends = emitsOf(harness.emitted, "biddingPhaseEnd");
    expect(ends).toHaveLength(1);
    expect(ends[0].payload.payload.data).toMatchObject({
      finalBid: 28,
      trumpSuit: "H",
      biddingTeam: "A",
      biddingPlayer: "Ann",
    });
  });

  test("no bidding action is accepted once bidding has ended", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    bid(harness, 0, "skip-raise");

    expectRejectedWithoutMutation(harness, () => bid(harness, 1, "bid", { bidValue: 40, suit: "S" }), {
      message: "Not in bidding phase",
    });
    expectRejectedWithoutMutation(harness, () => bid(harness, 1, "pass"), { message: "Not in bidding phase" });
  });

  test("the hand is not disturbed in card terms by bidding", () => {
    const harness = startBidding();
    const before = JSON.stringify(
      liveGame(harness).players.map((p: any) => liveGame(harness)[p.token]),
    );
    toRaisePhase(harness);
    bid(harness, 0, "skip-raise");
    const after = JSON.stringify(
      liveGame(harness).players.map((p: any) => liveGame(harness)[p.token]),
    );
    expect(after).toBe(before);
  });
});

describe("bid raise phase", () => {
  test.each([
    [28, [40, 48, 56]],
    [39, [40, 48, 56]],
    [40, [48, 56]],
    [47, [48, 56]],
    [48, [56]],
    [55, [56]],
  ] as Array<[number, number[]]>)("a bid of %i may be raised to %j", (current: number, levels: number[]) => {
    const harness = startBidding();
    toRaisePhase(harness, current);
    const offered = emitsOf(harness.emitted, "bidRaisePhase")[0].payload.payload.data.availableBidLevels;
    expect(offered).toEqual(levels);
  });

  test("an allowed raise updates the bet, keeps the suit and opens the post-raise double round with the first opponent", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    expectAccepted(bid(harness, 0, "raise-bid", { bidValue: 40 }));

    const game = liveGame(harness);
    expect(game.currentBet).toBe("40");
    expect(game.trumpSuit).toBe("H");
    expect(game.bidRaisePhase).toBe(false);
    expect(game.postRaiseDoubleRound).toBe(true);
    expect(game.currentBiddingPlayerId).toBe("Ben");
    expect(game.bidHistory[game.bidHistory.length - 1]).toMatchObject({ action: "raise-bid", bidValue: 40, suit: "H" });

    const raised = emitsOf(harness.emitted, "bidRaised");
    expect(raised).toHaveLength(1);
    expect(raised[0].payload.payload.data).toMatchObject({ raisedBy: "Ann", newBidValue: 40 });
  });

  test.each([
    ["a level that is not offered", { bidValue: 41 }],
    ["a level at or below the current bid", { bidValue: 28 }],
    ["no level", {}],
  ] as Array<[string, any]>)("raising to %s is rejected", (_name: string, fields: any) => {
    const harness = startBidding();
    toRaisePhase(harness);
    expectRejectedWithoutMutation(harness, () => bid(harness, 0, "raise-bid", fields), {
      message: "Invalid bid raise",
    });
  });

  test("a raise cannot change the suit", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    expectRejectedWithoutMutation(harness, () => bid(harness, 0, "raise-bid", { bidValue: 40, suit: "S" }), {
      message: "Cannot change suit when raising bid",
    });
  });

  test("only the bid winner may raise or skip", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    expectRejectedWithoutMutation(harness, () => bid(harness, 2, "raise-bid", { bidValue: 40 }), {
      message: "Only the bid winner can raise the bid",
    });
    expectRejectedWithoutMutation(harness, () => bid(harness, 2, "skip-raise"), {
      message: "Only the bid winner can skip the raise",
    });
  });

  test("when every opponent passes after a raise the contract is the raised bid", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    bid(harness, 0, "raise-bid", { bidValue: 40 });
    passes(harness, [1, 3, 5]);

    const game = liveGame(harness);
    expect(game.isBiddingPhase).toBe(false);
    expect(game.finalBid).toBe(40);
    expect(game.trumpSuit).toBe("H");
    expect(game.biddingPlayer).toBe("Ann");
    expect(game.bidDouble).toBe(false);
    expect(emitsOf(harness.emitted, "biddingPhaseEnd")).toHaveLength(1);
  });

  test("an opponent's double after a raise hands the turn to the bidding team, who must all answer", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    bid(harness, 0, "raise-bid", { bidValue: 40 });
    expectAccepted(bid(harness, 1, "double"));
    expect(liveGame(harness).bidDouble).toBe(true);
    expect(liveGame(harness).currentBiddingPlayerId).toBe("Cal");

    passes(harness, [2, 4, 0]);

    const game = liveGame(harness);
    expect(game.isBiddingPhase).toBe(false);
    expect(game.finalBid).toBe(40);
    expect(game.bidDouble).toBe(true);
    const ends = emitsOf(harness.emitted, "biddingPhaseEnd");
    expect(ends[0].payload.payload.data.bidDouble).toBe(true);
  });

  test("only one double is allowed in the post-raise round", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    bid(harness, 0, "raise-bid", { bidValue: 40 });
    bid(harness, 1, "double");
    expectRejectedWithoutMutation(harness, () => bid(harness, 3, "double"), {
      message: "Already doubled in post-raise round",
    });
  });

  test("a re-double in the post-raise round ends bidding immediately", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    bid(harness, 0, "raise-bid", { bidValue: 40 });
    bid(harness, 1, "double");
    expectAccepted(bid(harness, 2, "re-double"));

    const game = liveGame(harness);
    expect(game.isBiddingPhase).toBe(false);
    expect(game.bidReDouble).toBe(true);
    expect(game.finalBid).toBe(40);
  });
});

describe("from bidding to card play", () => {
  test("once bidding ends the first card is accepted from the seat on turn and the hand is in play", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    bid(harness, 0, "skip-raise");

    const game = liveGame(harness);
    const turnSeat = game.currentTurn;
    const card = game[game.players[turnSeat].token][0];
    const reply = drop(harness, turnSeat, card);
    expect(reply.called).toBe(1);
    expect(reply.code).toBe("SUCCESS");
    expect(liveGame(harness).droppedCards).toEqual([card]);
  });

  test("a card cannot be played while bidding is still open", () => {
    const harness = startBidding();
    expectRejectedWithoutMutation(harness, () => drop(harness, 0, "1HA"), {
      message: "Bidding phase is still active",
    });
  });

  test("turn announcements follow the end of bidding", () => {
    const harness = startBidding();
    toRaisePhase(harness);
    bid(harness, 0, "skip-raise");
    const actions = actionsOf(harness.emitted);
    expect(actions.indexOf("TURN_INFO")).toBeGreaterThan(actions.indexOf("biddingPhaseEnd"));
  });
});
