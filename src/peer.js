const { qrcode, svg2url } = require("pure-svg-code");

export const roles = {
  OFFER: "OFFER",
  ANSWER: "ANSWER"
};

const connectionConfig = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
};

const iceGenerationTime = 200,
  answerPollInterval = 1000;

const offerSide = !window.location.hash;

const accumulateUntilPause = (pauseDuration, fn) => {
  let timerId;
  let accumulate;
  let accumulated = [];
  let done = false;

  const promise = new Promise((resolve, reject) => {
    accumulate = function() {
      if (done) {
        console.error("Called accumulate after done accumulating");
        return;
      }
      const extracted = fn.apply(null, arguments);
      extracted && accumulated.push(extracted);
      timerId && clearTimeout(timerId);
      timerId = setTimeout(() => {
        resolve(accumulated);
        done = true;
      }, pauseDuration);
    };
  });

  return { accumulate, promise };
};

const summarizeCandidates = (sdpPromise, icePromise) =>
  Promise.all([sdpPromise, icePromise]).then(([sdp, ice]) => ({
    sdp,
    ice
  }));

const outstandingChannels = new Map();

export default {
  getRole() {
    return offerSide ? roles.OFFER : roles.ANSWER;
  },

  channelFrom(req) {
    return outstandingChannels.get(req);
  },

  generateOffer() {
    let generatePromise = new Promise(function(resolve, reject) {
      const offerConnection = new RTCPeerConnection(connectionConfig);
      const offerDataChannel = offerConnection.createDataChannel("c");
      const offerPromise = offerConnection.createOffer();

      const {
        accumulate: addIce,
        promise: addIceComplete
      } = accumulateUntilPause(iceGenerationTime, ice => ice.candidate);

      offerPromise.then(o => {
        offerConnection.setLocalDescription(o);
        offerConnection.onicecandidate = addIce;
      });

      summarizeCandidates(offerPromise, addIceComplete).then(summary => {
        const offerId = parseInt(Math.random() * 1000000000000).toString();
        const answerId = parseInt(Math.random() * 1000000000000).toString();
        fetch("http://sipcup.azurewebsites.net/api/Answer/" + offerId, {
          method: "POST",
          mode: "cors",
          body: JSON.stringify(summary)
        }).then(posted => {
          const peerUrl = `${window.location.href}#${offerId}:${answerId}`;
          console.log("Resolving offer", peerUrl)
          resolve({
            url: peerUrl,
            svg: svg2url(qrcode(peerUrl))
          });
        });

        const interval = setInterval(() => {
          fetch("http://sipcup.azurewebsites.net/api/Answer/" + answerId, {
            method: "GET",
            mode: "cors"
          })
            .then(response => response.json())
            .then(response => {
              if (response.length > 0) {
                const answerSummary = JSON.parse(response[0])
                offerConnection.setRemoteDescription(answerSummary.sdp);
                answerSummary.ice.forEach(candidate => {
                  offerConnection.addIceCandidate(
                    new RTCIceCandidate(candidate)
                  );
                });
                clearInterval(interval);
                outstandingChannelResolve(offerDataChannel);
              }
            });
        }, answerPollInterval);
      });
    });

    let outstandingChannelResolve;
    const outstandingChannelPromise = new Promise(function(resolve, reject) {
      outstandingChannelResolve = resolve;
    });
    outstandingChannels.set(generatePromise, outstandingChannelPromise);

    return generatePromise;
  },

  generateAnswer() {
    const generatePromise = new Promise(function(resolve, reject) {

      const [offerId, answerId] = decodeURIComponent(
        window.location.hash.slice(1)
      ).split(":");

      fetch("http://sipcup.azurewebsites.net/api/Answer/" + offerId, {
        method: "GET",
        mode: "cors"
      })
        .then(offer => offer.json())
        .then(offer => JSON.parse(offer[0]))
        .then(receivedOffer => {
          const answerConnection = new RTCPeerConnection(connectionConfig);
          answerConnection.ondatachannel = e => {
            console.log("On data channel", e);
            outstandingChannelResolve(e.channel);
          };
          answerConnection.setRemoteDescription(receivedOffer.sdp).then(() => {
            receivedOffer.ice.forEach(candidate => {
              answerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            });
          });

          const answerPromise = answerConnection.createAnswer();
          answerPromise.then(answer => {
            answerConnection.setLocalDescription(answer);
          });

          const {
            accumulate: addIce,
            promise: addIceComplete
          } = accumulateUntilPause(iceGenerationTime, ice => ice.candidate);
          answerConnection.onicecandidate = addIce;

          summarizeCandidates(answerPromise, addIceComplete).then(summary => {
            fetch("http://sipcup.azurewebsites.net/api/Answer/" + answerId, {
              method: "POST",
              mode: "cors",
              body: JSON.stringify(summary)
            });
          });
        });
    });
    let outstandingChannelResolve;
    const outstandingChannelPromise = new Promise(function(resolve, reject) {
      outstandingChannelResolve = resolve;
    });
    outstandingChannels.set(generatePromise, outstandingChannelPromise);
    return generatePromise;
  }
};
