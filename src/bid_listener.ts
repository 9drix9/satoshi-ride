import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools";
import { Relay } from "nostr-tools/relay";
import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { isRideBidPayload, isRideStatusPayload } from "./validation";

const RELAY = "wss://relay.damus.io";

const SK_HEX = process.env.NOSTR_SK_HEX!;
if (!SK_HEX) throw new Error("Set NOSTR_SK_HEX");
const sk = Uint8Array.from(Buffer.from(SK_HEX, "hex"));
const RIDER_PUBKEY = process.env.NOSTR_PUBKEY || getPublicKey(sk);
const rideStates = new Map<string, { status: string; updated_at: number }>();
const bidTotals = new Map<string, { total_sats: number; driver_pubkey: string }>();

async function main() {
  const relay = await Relay.connect(RELAY);
  console.log("👀 Listening for bids on", RELAY);

  relay.subscribe(
    [
      {
        kinds: [30078],
        "#d": ["ride_bid"],
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
          const bid = JSON.parse(ev.content);
          if (!isRideBidPayload(bid)) {
            console.log("⚠️ Invalid bid payload:", bid);
            return;
          }
          bidTotals.set(bid.bid_id, { total_sats: bid.total_sats, driver_pubkey: ev.pubkey });
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
          const invoice = JSON.parse(ev.content);
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
          const status = JSON.parse(ev.content);
          if (!isRideStatusPayload(status)) {
            console.log("⚠️ Invalid ride status payload:", status);
            return;
          }

          rideStates.set(status.bid_id, {
            status: status.status,
            updated_at: Math.floor(Date.now() / 1000)
          });
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
            await relay.publish(receiptEvent);
            console.log("🧾 Ride receipt sent:", receipt);
          }
        } catch (error) {
          console.log("⚠️ Bad ride status event:", String(error));
        }
      }
    }
  );
}

main();
