import { finalizeEvent } from "nostr-tools";
import { Relay } from "nostr-tools/relay";

const RELAY = "wss://relay.damus.io";

const SK_HEX = process.env.NOSTR_SK_HEX!;
if (!SK_HEX) throw new Error("Set NOSTR_SK_HEX");
const sk = Buffer.from(SK_HEX.trim(), "hex");

const invoiceRequest = {
  request_id: process.env.REQUEST_ID!,
  bid_id: process.env.BID_ID!,
  amount_sats: Number(process.env.AMOUNT_SATS),
  payment_mode: "LN"
};

const event = finalizeEvent(
  {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", "invoice_request"],
      ["v", "1"]
    ],
    content: JSON.stringify(invoiceRequest)
  },
  sk
);

const relay = await Relay.connect(RELAY);
await relay.publish(event);
console.log("⚡ Invoice requested");
relay.close();
