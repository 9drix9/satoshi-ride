import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools";
import { Relay } from "nostr-tools/relay";
import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  hasVersionTag,
  isInvoiceResponsePayload,
  isRideBidPayload,
  isRideStatusPayload
} from "./validation";

const RELAYS = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"];
const PRIMARY_RELAY = RELAYS[0];
const BID_COLLECTION_MS = Number(process.env.BID_COLLECTION_MS ?? 10_000);

const SK_HEX = process.env.NOSTR_SK_HEX!;
if (!SK_HEX) throw new Error("Set NOSTR_SK_HEX");
const sk = Uint8Array.from(Buffer.from(SK_HEX, "hex"));
const RIDER_PUBKEY = process.env.NOSTR_PUBKEY || getPublicKey(sk);

const rideRequest = {
  id: crypto.randomUUID(),
  pickup_geohash: "dp3w",
  dropoff_geohash: "dp3x",
  time_window_mins: 20,
  max_total_sats: 25000,
  max_eta_mins: 12,
  payment_modes: ["LN", "ONCHAIN"],
  note: "chill ride, no rush"
};

const bidTotals = new Map<string, { total_sats: number; driver_pubkey: string }>();

async function publishToRelays(event: ReturnType<typeof finalizeEvent>) {
  await Promise.all(
    RELAYS.map(async (url) => {
      try {
        const relay = await Relay.connect(url);
        await relay.publish(event);
        relay.close();
        console.log("✅ Published to", url);
      } catch {
        console.log("❌ Failed relay", url);
      }
    })
  );
}

function chooseBestBid(bids: Array<{ payload: ReturnType<typeof JSON.parse>; eventId: string; driverPubkey: string }>) {
  return bids
    .slice()
    .sort((a, b) => {
      if (a.payload.total_sats !== b.payload.total_sats) {
        return a.payload.total_sats - b.payload.total_sats;
      }
      return a.payload.eta_mins - b.payload.eta_mins;
    })[0];
}

async function main() {
  const rideRequestTemplate = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", "ride_request"],
      ["v", "1"]
    ],
    content: JSON.stringify(rideRequest)
  };

  const rideRequestEvent = finalizeEvent(rideRequestTemplate, sk);
  if (!verifyEvent(rideRequestEvent)) throw new Error("Invalid ride request event");

  console.log("📡 Publishing ride request:", rideRequest);
  await publishToRelays(rideRequestEvent);

  const relay = await Relay.connect(PRIMARY_RELAY);
  console.log("👀 Listening for bids on", PRIMARY_RELAY);

  const bids: Array<{ payload: ReturnType<typeof JSON.parse>; eventId: string; driverPubkey: string }> = [];
  let accepted = false;

  const bidTimeout = setTimeout(async () => {
    if (accepted) {
      return;
    }
    if (bids.length === 0) {
      console.log("⚠️ No bids received yet.");
      return;
    }

    const bestBid = chooseBestBid(bids);
    if (!bestBid) {
      console.log("⚠️ Could not select a bid.");
      return;
    }

    accepted = true;

    const rideAccept = {
      request_id: rideRequest.id,
      bid_id: bestBid.payload.bid_id,
      rider_pubkey: RIDER_PUBKEY,
      driver_pubkey: bestBid.driverPubkey
    };

    const acceptTemplate = {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", "ride_accept"],
        ["v", "1"],
        ["e", bestBid.eventId],
        ["p", bestBid.driverPubkey]
      ],
      content: JSON.stringify(rideAccept)
    };

    const acceptEvent = finalizeEvent(acceptTemplate, sk);
    if (!verifyEvent(acceptEvent)) throw new Error("Bad ride accept event");

    await publishToRelays(acceptEvent);
    console.log("✅ Ride acceptance published", rideAccept);

    const paymentMode = bestBid.payload.payment_modes_supported.includes("LN")
      ? "LN"
      : bestBid.payload.payment_modes_supported[0];

    const invoiceRequest = {
      request_id: rideRequest.id,
      bid_id: bestBid.payload.bid_id,
      amount_sats: bestBid.payload.total_sats,
      payment_mode: paymentMode
    };

    const invoiceTemplate = {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["d", "invoice_request"],
        ["v", "1"],
        ["e", bestBid.eventId],
        ["p", bestBid.driverPubkey]
      ],
      content: JSON.stringify(invoiceRequest)
    };

    const invoiceEvent = finalizeEvent(invoiceTemplate, sk);
    if (!verifyEvent(invoiceEvent)) throw new Error("Bad invoice request event");

    await publishToRelays(invoiceEvent);
    console.log("⚡ Invoice requested", invoiceRequest);
  }, BID_COLLECTION_MS);

  relay.subscribe(
    [
      {
        kinds: [30078],
        "#d": ["ride_bid"],
        "#e": [rideRequestEvent.id],
        "#p": [RIDER_PUBKEY]
      }
    ],
    {
      onevent: (ev) => {
        try {
          if (!verifyEvent(ev)) {
            console.log("⚠️ Invalid bid event signature:", ev.id);
            return;
          }
          if (!hasVersionTag(ev.tags)) {
            console.log("⚠️ Unsupported bid version:", ev.id);
            return;
          }
          const bid = JSON.parse(ev.content);
          if (!isRideBidPayload(bid)) {
            console.log("⚠️ Invalid bid payload:", bid);
            return;
          }

          bidTotals.set(bid.bid_id, { total_sats: bid.total_sats, driver_pubkey: ev.pubkey });
          bids.push({ payload: bid, eventId: ev.id, driverPubkey: ev.pubkey });
          console.log("💰 Received bid:", bid);
        } catch {
          console.log("⚠️ Bad bid event");
        }
      }
    }
  );

  relay.subscribe(
    [
      {
        kinds: [30078],
        "#d": ["invoice_response"],
        "#p": [RIDER_PUBKEY]
      }
    ],
    {
      onevent: (ev) => {
        try {
          if (!verifyEvent(ev)) {
            console.log("⚠️ Invalid invoice response event signature:", ev.id);
            return;
          }
          if (!hasVersionTag(ev.tags)) {
            console.log("⚠️ Unsupported invoice response version:", ev.id);
            return;
          }
          const invoice = JSON.parse(ev.content);
          if (!isInvoiceResponsePayload(invoice)) {
            console.log("⚠️ Invalid invoice response payload:", invoice);
            return;
          }
          console.log("🧾 Invoice received:", invoice);
        } catch {
          console.log("⚠️ Bad invoice event");
        }
      }
    }
  );

  relay.subscribe(
    [
      {
        kinds: [30078],
        "#d": ["ride_status"],
        "#p": [RIDER_PUBKEY]
      }
    ],
    {
      onevent: async (ev) => {
        try {
          if (!verifyEvent(ev)) {
            console.log("⚠️ Invalid status event signature:", ev.id);
            return;
          }
          if (!hasVersionTag(ev.tags)) {
            console.log("⚠️ Unsupported ride status version:", ev.id);
            return;
          }
          const status = JSON.parse(ev.content);
          if (!isRideStatusPayload(status)) {
            console.log("⚠️ Invalid ride status payload:", status);
            return;
          }

          console.log("📣 Ride status update:", status);

          if (status.status === "completed") {
            const bidTotalsEntry = bidTotals.get(status.bid_id);
            if (!bidTotalsEntry) {
              console.log("⚠️ Missing bid totals for receipt:", status.bid_id);
              return;
            }

            const timestamp = Math.floor(Date.now() / 1000);
            const receiptBase = {
              request_id: status.request_id,
              bid_id: status.bid_id,
              total_sats: bidTotalsEntry.total_sats,
              timestamp,
              rider_pubkey: RIDER_PUBKEY,
              driver_pubkey: bidTotalsEntry.driver_pubkey
            };
            const receiptPayloadHash = sha256(
              new TextEncoder().encode(JSON.stringify(receiptBase))
            );
            const signature = bytesToHex(schnorr.sign(receiptPayloadHash, sk));
            const receipt = { ...receiptBase, signature };

            const receiptTemplate = {
              kind: 30078,
              created_at: timestamp,
              tags: [
                ["d", "ride_receipt"],
                ["v", "1"],
                ["e", ev.id],
                ["p", bidTotalsEntry.driver_pubkey],
                ["p", RIDER_PUBKEY]
              ],
              content: JSON.stringify(receipt)
            };

            const receiptEvent = finalizeEvent(receiptTemplate, sk);
            if (!verifyEvent(receiptEvent)) throw new Error("Bad receipt event");
            await publishToRelays(receiptEvent);
            console.log("🧾 Ride receipt sent:", receipt);
          }
        } catch (error) {
          console.log("⚠️ Bad ride status event:", String(error));
        }
      }
    }
  );

  process.on("SIGINT", () => {
    clearTimeout(bidTimeout);
    relay.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
