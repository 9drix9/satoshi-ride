import { finalizeEvent } from "nostr-tools";
import { Relay } from "nostr-tools/relay";
import { EVENT_KIND, PRIMARY_RELAY, tagD, tagE, tagP, tagV } from "./config";

const RELAY = PRIMARY_RELAY;

const SK_HEX = process.env.NOSTR_SK_HEX!;
if (!SK_HEX) throw new Error("Set NOSTR_SK_HEX");
const sk = Buffer.from(SK_HEX.trim(), "hex");

const BID_EVENT_ID = process.env.BID_EVENT_ID!;
if (!BID_EVENT_ID) throw new Error("Set BID_EVENT_ID");

const DRIVER_PUBKEY = process.env.DRIVER_PUBKEY!;
if (!DRIVER_PUBKEY) throw new Error("Set DRIVER_PUBKEY");

const invoiceRequest = {
  request_id: process.env.REQUEST_ID!,
  bid_id: process.env.BID_ID!,
  amount_sats: Number(process.env.AMOUNT_SATS),
  payment_mode: "LN"
};

const event = finalizeEvent(
  {
    kind: EVENT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      tagD("invoice_request"),
      tagV(),
      tagE(BID_EVENT_ID),
      tagP(DRIVER_PUBKEY)
    ],
    content: JSON.stringify(invoiceRequest)
  },
  sk
);

const relay = await Relay.connect(RELAY);
await relay.publish(event);
console.log("⚡ Invoice requested");
relay.close();
