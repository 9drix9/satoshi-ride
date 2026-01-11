import { finalizeEvent, getPublicKey } from "nostr-tools";
import { Relay } from "nostr-tools/relay";
import { EVENT_KIND, PRIMARY_RELAY, tagD, tagE, tagP, tagV } from "./config";

const RELAY = PRIMARY_RELAY;

const SK_HEX = process.env.NOSTR_SK_HEX!;
if (!SK_HEX) throw new Error("Set NOSTR_SK_HEX");
const sk = Buffer.from(SK_HEX.trim(), "hex");

const BID_EVENT_ID = process.env.BID_EVENT_ID!;
if (!BID_EVENT_ID) throw new Error("Set BID_EVENT_ID");

const rideAccept = {
  request_id: process.env.REQUEST_ID!,
  bid_id: process.env.BID_ID!,
  driver_pubkey: process.env.DRIVER_PUBKEY!,
  rider_pubkey: getPublicKey(sk)
};

const event = finalizeEvent(
  {
    kind: EVENT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      tagD("ride_accept"),
      tagV(),
      tagE(BID_EVENT_ID),
      tagP(rideAccept.driver_pubkey)
    ],
    content: JSON.stringify(rideAccept)
  },
  sk
);

const relay = await Relay.connect(RELAY);
await relay.publish(event);
console.log("✅ Ride acceptance published", rideAccept);
relay.close();
