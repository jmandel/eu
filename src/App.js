import React, { useState, useEffect, useReducer, useRef } from "react";
import { shuffle } from "shuffle-seed";

import PeerManager, { roles } from "./peer.js";
import "./App.css";
import { EventEmitter } from "events";
import Words from "./words.json";

const debug = false;

if (window.location.href.match("http://joshuamandel.com")) {
  window.location.href = window.location.href.replace("http://", "https://");
}

window.channels = {};
const myPlayerId = parseInt(Math.random() * 1000000000);

const color = { BLUE: "BLUE", RED: "RED", NEUTRAL: "NEUTRAL", BLACK: "BLACK" };
const ColorLabels = [
  color.BLACK,
  ...Array(7)
    .fill()
    .map(x => color.BLUE),
  ...Array(7)
    .fill()
    .map(x => color.RED),
  ...Array(9)
    .fill()
    .map(x => color.NEUTRAL)
];

const pickColors = seed =>
  shuffle(
    ColorLabels.concat(shuffle([color.RED, color.BLUE], seed).slice(0, 1)),
    seed
  );
const pickBoard = seed => shuffle(Words, seed);

function OfferArea(props) {
  const [offerDetails, setOfferDetails] = useState({});

  useEffect(() => {
    const offer = PeerManager.generateOffer(props.role);
    offer.then(({ url, svg }) => {
      setOfferDetails({ url, svg, completed: false });
    });

    PeerManager.channelFrom(offer).then(c => {
      setOfferDetails({ completed: true });
      props.onChannel(props.offerId, c);
    });

    return () => {
      console.log("Cleanup", props);
      PeerManager.cancelOffer(offer);
    };
  }, [props.offerId, props.role]);

  if (!offerDetails.completed) {
    return (
      <a target="_blank" rel="noopener noreferrer" href={offerDetails.url}>
        {offerDetails.url && (
          <img src={offerDetails.svg} alt="" className={props.className} />
        )}
      </a>
    );
  } else {
    return <img className={props.className + " done"} src={props.offerImage} />;
  }
}

function OfferApp() {
  const [channels, setChannels] = useState({});
  const externalEvents = useRef(new EventEmitter());
  const [channelMessage, setChannelMessage] = useState("");
  const [otherPlayersCount, setOtherPlayersCount] = useState(0);
  const [started, setStarted] = useState(false);
  const seed = useRef(Math.random());

  const broadcastAction = action => {
    Object.values(channels).forEach(c => {
      try {
        c.send(JSON.stringify(action));
      } catch {
        console.log("Failed to send", action, c);
      }
    });
    if (action.playerId !== myPlayerId) {
      externalEvents.current.emit("received", action);
    }
  };

  useEffect(() => {
    Object.values(channels).forEach(
      c =>
        (c.onmessage = message => {
          const action = JSON.parse(message.data);
          broadcastAction(action);
        })
    );
  }, [channels]);

  const gotChannel = (offerId, c) => {
    //TODO reuse broadcast mechanism
    c.onopen = () =>
      c.send(
        JSON.stringify({
          type: actions.PICK_SEED,
          seed: seed.current
        })
      );

    setChannels(channels => ({ ...channels, [offerId]: c }));
    if (offerId > 1) {
      setOtherPlayersCount(count => count + 1);
    }
  };

  return (
    <div className="App">
      {!started && (
        <div className="offer-lkk">
          <div className="player-card">
            <OfferArea
              offerId={0}
              role="red-team"
              className="player-icon red"
              offerImage="assets/player.004.svg"
              onChannel={gotChannel}
            />
            Red Captain
          </div>
          <div className="player-card">
            <OfferArea
              offerId={1}
              role="blue-team"
              className="player-icon blue"
              offerImage="assets/player.005.svg"
              onChannel={gotChannel}
            />
            Blue Captain
          </div>
          <div className="player-card">
            <OfferArea
              offerId={2 + otherPlayersCount}
              role="other-player"
              className="player-icon"
              offerImage="assets/player.003.svg"
              onChannel={gotChannel}
            />
            Other Players {otherPlayersCount > 0 && ` (${otherPlayersCount})`}
          </div>
          <div>
            <button onClick={e => setStarted(true)}>Start Game</button>
          </div>
        </div>
      )}
      {started && (
        <GameBoard
          initialSeed={seed.current}
          role={"other-player"}
          broadcastAction={broadcastAction}
          externalEvents={externalEvents.current}></GameBoard>
      )}
    </div>
  );
}

const actions = {
  REVEAL_CARD: "REVEAL_CARD",
  INITIALIZE: "INITIALIZE",
  PICK_SEED: "PICK_SEED"
};
const initialGameState = {
  turns: []
};

const answerRole = decodeURIComponent(window.location.hash.slice(1)).split(
  ":"
)[2];

function AnswerApp() {
  const [channelMessage, setChannelMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const externalEvents = useRef(new EventEmitter());

  const [broadcastAction, setBroadcastAction] = useState({
    current: action => true
  });

  useEffect(() => {
    const answer = PeerManager.generateAnswer();
    const store = {};
    let channel = null;

    PeerManager.channelFrom(answer).then(c => {
      setConnected(true);
      channel = c;

      c.onmessage = message => {
        const action = JSON.parse(message.data);
        setChannelMessage(JSON.stringify(action));
        if (action.playerId !== myPlayerId) {
          externalEvents.current.emit("received", action);
        }
      };

      setBroadcastAction({
        current: action => {
          channel.send(JSON.stringify(action));
        }
      });
      window.channel = c;
    });
  }, []);

  return (
    <div className="App">
      {connected && (
        <GameBoard
          role={answerRole}
          externalEvents={externalEvents.current}
          broadcastAction={broadcastAction.current}></GameBoard>
      )}
    </div>
  );
}

const GameBoard = props => {
  const [gameState, innerDispatch] = useReducer((state, action) => {
    if (action.type === actions.INITIALIZE) {
      return initialGameState;
    } else if (action.type === actions.REVEAL_CARD) {
      return {
        ...state,
        turns: state.turns.concat([action])
      };
    } else if (action.type === actions.PICK_SEED) {
      console.log("Picked seed", action)
      return {
        ...state,
        seed: action.seed,
        turns: []
      };
    }
  }, initialGameState);

  const [spymaster, setSpymaster] = useState(false);

  const seed = gameState.seed || props.initialSeed;
  const colors = pickColors(seed);
  const words = pickBoard(seed)
    .slice(0, 25)
    .map((w, i) => ({
      word: w,
      revealed: gameState.turns.some(
        t => t.type === actions.REVEAL_CARD && t.word == w
      ),
      color: colors[i]
    }));

  const colorOfWord = word =>
    words.filter(w => w.word === word).map(w => w.color)[0];

  const wordStreaks = gameState.turns
    .filter(t => t.type === actions.REVEAL_CARD)
    .map(t => ({ ...t, color: colorOfWord(t.word) }))
    .reduce((streaks, { word, color }) => {
      const currentStreak =
        streaks.length > 0 ? streaks[streaks.length - 1][0].color : "START";
      if (color === currentStreak) {
        streaks[streaks.length - 1].push({ word, color });
      } else {
        streaks.push([{ word, color }]);
      }
      return streaks;
    }, []);

  const minus1 = (wordStreaks.length > 0
    ? wordStreaks[wordStreaks.length - 1]
    : []
  ).map(w => w.word);
  const minus2 = (wordStreaks.length > 1
    ? wordStreaks[wordStreaks.length - 2]
    : []
  ).map(w => w.word);

  console.log(colors);

  useEffect(() => {
    if (!props.externalEvents) return;

    let listener = props.externalEvents.on("received", innerDispatch);
    return () => props.externalEvents.off("received", innerDispatch);
  }, [props.externalEvents]);

  const dispatch = action => {
    console.log("Gameboard sipatch", action, props);
    props.broadcastAction && props.broadcastAction(action);
    innerDispatch(action);
  };

  return (
    <div className="grid-container">
      <div className="header">
        <button onClick={e => dispatch({
          type: actions.PICK_SEED,
          seed: Math.random()
        })}>
        Deal New Cards
        </button>
        <button onClick={e => setSpymaster(!spymaster)}>
          {spymaster ? "Player View" : "Spymaster View"}
        </button>
      </div>
      {seed &&
        words.map(({ word, revealed, color }, i) => (
          <p
            className={`card ${color} c${i} ${revealed ? "revealed" : "hidden"}
            ${spymaster ? "spymaster" : "non-spymaster"}
            ${minus1.includes(word) ? "minus1" : ""}
            ${minus2.includes(word) ? "minus2" : ""}
            `}
            onClick={e =>
              dispatch({
                type: actions.REVEAL_CARD,
                playerRole: props.role,
                playerId: myPlayerId,
                word: word
              })
            }
            key={word}>
            <span className="word">{word}</span>
          </p>
        ))}
      <p></p>
      {debug && gameState.turns.map(t => <p>{JSON.stringify(t)}</p>)}
    </div>
  );
};

const App = PeerManager.getRole() === roles.OFFER ? OfferApp : AnswerApp;
export default App;
