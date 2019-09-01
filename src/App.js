import React, { useState, useEffect } from "react";

import PeerManager, { roles } from "./peer.js";
import "./App.css";

window.channels = {}

function OfferArea(props) {
  const [offerDetails, setOfferDetails] = useState({});
  useEffect(() => {
    console.log("New effect on OFerArea", props)
    const offer = PeerManager.generateOffer();
    offer.then(({ url, svg }) => {
      console.log("Setting od for", props)
      setOfferDetails({ url, svg, completed: false })
    });

    PeerManager.channelFrom(offer).then(c => {
      setOfferDetails({completed: true});
      props.onChannel(props.offerId, c)
    });

    return () => {
      //PeerManager.cancel(offer)
      console.log("TODO: logic to cancel offer / polling if any");
    };
  }, [props.offerId]);

  let ret;
  console.log("Renderin OA", offerDetails)

  if (!offerDetails.completed) {
    ret = <a target="_blank" rel="noopener noreferrer" href={offerDetails.url}>
        {offerDetails.url && <img src={offerDetails.svg} alt="" className={props.className} />}
      </a>
  } else {
   ret = <img className={props.className + " done"} src={props.offerImage} />
  }


  return ret;
}
function OfferApp() {
  const [channelMessage, setChannelMessage] = useState("");
  const [otherPlayersCount, setOtherPlayersCount] = useState(0);
  const gotChannel = (offerId, c) => {
    window.channels[offerId] = c
    console.log("Got channel", c)
    if (offerId > 1) {
      setOtherPlayersCount(otherPlayersCount+1)
    }
  }

  return (
    <div className="App">
      <div className="player-card">
        <OfferArea offerId={0} className="player-icon red" offerImage="assets/player.001.svg" onChannel={gotChannel} />
        Red Captain
      </div>
      <div className="player-card">
        <OfferArea offerId={1} className="player-icon blue" offerImage="assets/player.002.svg" onChannel={gotChannel} />
        Blue Captain
      </div>
      <div className="player-card">
        <OfferArea offerId={(2+otherPlayersCount)} className="player-icon" offerImage="assets/player.003.svg" onChannel={gotChannel} />
        Other Players {otherPlayersCount > 0 && ` (${otherPlayersCount})`}
      </div>
      <div>

      Response: <pre>{channelMessage}</pre>
      </div>
    </div>
  );
}

function AnswerApp() {
  const [channelMessage, setChannelMessage] = useState("");
  useEffect(() => {
    const answer = PeerManager.generateAnswer();
    PeerManager.channelFrom(answer).then(c => {
      window.channel = c;
      c.onmessage = e => setChannelMessage(e.data);
    });
  }, []);

  return (
    <div className="App">
      <pre>{channelMessage}</pre>
    </div>
  );
}

const App = PeerManager.getRole() === roles.OFFER ? OfferApp : AnswerApp;

export default App;
