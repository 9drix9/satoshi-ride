import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools";
import { Relay } from "nostr-tools/relay";
import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { EVENT_KIND, PRIMARY_RELAY, tagD, tagE, tagP, tagV } from "./config";
import {
  hasVersionTag,
  isInvoiceRequestPayload,
  isRideAcceptPayload,
  isRideReceiptPayload,
  isRideRequestPayload
} from "./validation";

const RELAY = PRIMARY_RELAY;

const SK_HEX = process.env.NOSTR_SK_HEX!;
if (!SK_HEX) throw new Error("Set NOSTR_SK_HEX");
const sk = Uint8Array.from(Buffer.from(SK_HEX, "hex"));
const driverPubkey = getPublicKey(sk);
const bids = new Map<
  string,
  { request_id: string; event_id: string; rider_pubkey: string; total_sats: number }
>();
const acceptedBids = new Set<string>();
const settledBids = new Map<string, { settled_at: number; receipt: unknown }>();
const activeStatusTimers = new Map<string, NodeJS.Timeout[]>();

function generateTestInvoice(params: {
  amount_sats: number;
  request_id: string;
  bid_id: string;
}) {
  return `lnbc${params.amount_sats}n1p${params.request_id.slice(0, 8)}${params.bid_id.slice(
    0,
    8
  )}`;
}

function generateTestOnchainAddress(params: { request_id: string; bid_id: string }) {
  return `bc1q${params.request_id.slice(0, 6)}${params.bid_id.slice(0, 6)}`.toLowerCase();
}

function computeBidSats(params: {
  miles: number;
  minutes: number;
  base_fee: number;
  per_mile: number;
  per_minute: number;
  surge_pct: number;
  risk_buffer: number;
}) {
  const raw =
    params.base_fee +
    params.miles * params.per_mile +
    params.minutes * params.per_minute +
    params.risk_buffer;

  return Math.round(raw * (1 + params.surge_pct / 100));
}

async function main() {
  const relay = await Relay.connect(RELAY);
  console.log("🚕 Driver connected:", RELAY);

  async function publishRideStatus(params: {
    status: "en_route" | "arrived" | "completed";
    request_id: string;
    bid_id: string;
    rider_pubkey: string;
    bid_event_id: string;
  }) {
    const payload = {
      status: params.status,
      request_id: params.request_id,
      bid_id: params.bid_id,
      rider_pubkey: params.rider_pubkey,
      driver_pubkey: driverPubkey
    };

    const statusTemplate = {
      kind: EVENT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        tagD("ride_status"),
        tagV(),
        tagE(params.bid_event_id),
        tagP(params.rider_pubkey),
        tagP(driverPubkey)
      ],
      content: JSON.stringify(payload)
    };

    const statusEvent = finalizeEvent(statusTemplate, sk);
    if (!verifyEvent(statusEvent)) throw new Error("Bad ride status event");

    await relay.publish(statusEvent);
    console.log("📍 Status update:", payload);
  }

  const sub = relay.subscribe(
    [{ kinds: [EVENT_KIND], "#d": ["ride_request"] }],
    {
      onevent: async (ev) => {
        try {
          if (!verifyEvent(ev)) {
            console.log("⚠️ Invalid ride request event signature:", ev.id);
            return;
          }
          if (!hasVersionTag(ev.tags)) {
            console.log("⚠️ Unsupported ride request version:", ev.id);
            return;
          }
          const req = JSON.parse(ev.content);
          if (!isRideRequestPayload(req)) {
            console.log("⚠️ Invalid ride request payload:", req);
            return;
          }

          // MVP: pretend we estimated distance/time locally
          const miles = 4.2;
          const minutes = 13;

          const total_sats = computeBidSats({
            miles,
            minutes,
            base_fee: 1500,
            per_mile: 1200,
            per_minute: 80,
            surge_pct: 10,
            risk_buffer: 500
          });

          const deposit_sats = Math.min(2000, Math.round(total_sats * 0.15));

          const bid = {
            request_id: req.id,
            bid_id: crypto.randomUUID(),
            total_sats,
            deposit_sats,
            eta_mins: 6,
            payment_modes_supported: ["LN", "ONCHAIN"]
          };

          const bidTemplate = {
            kind: EVENT_KIND,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              tagD("ride_bid"),
              tagV(),
              tagE(ev.id), // reference request event id
              tagP(ev.pubkey) // target rider pubkey
            ],
            content: JSON.stringify(bid)
          };

          const bidEvent = finalizeEvent(bidTemplate, sk);
          if (!verifyEvent(bidEvent)) throw new Error("Bad bid event");

          await relay.publish(bidEvent);
          bids.set(bid.bid_id, {
            request_id: req.id,
            event_id: bidEvent.id,
            rider_pubkey: ev.pubkey,
            total_sats
          });
          console.log("✅ Sent bid:", bid);
        } catch (err) {
          console.log("⚠️ Couldn’t parse request:", String(err));
        }
      }
    }
  );
  
  relay.subscribe(
    [{ kinds: [EVENT_KIND], "#d": ["invoice_request"] }],
    {
      onevent: async (ev) => {
        try {
          if (!verifyEvent(ev)) {
            console.log("⚠️ Invalid invoice request event signature:", ev.id);
            return;
          }
          if (!hasVersionTag(ev.tags)) {
            console.log("⚠️ Unsupported invoice request version:", ev.id);
            return;
          }
          const req = JSON.parse(ev.content);
          if (!isInvoiceRequestPayload(req)) {
            console.log("⚠️ Invalid invoice request payload:", req);
            return;
          }

          console.log("⚡ Invoice requested:", req);

          const invoice =
            req.payment_mode === "LN"
              ? generateTestInvoice({
                  amount_sats: req.amount_sats,
                  request_id: req.request_id,
                  bid_id: req.bid_id
                })
              : undefined;
          const onchain_address =
            req.payment_mode === "ONCHAIN"
              ? generateTestOnchainAddress({
                  request_id: req.request_id,
                  bid_id: req.bid_id
                })
              : undefined;

          const invoiceResponse = {
            request_id: req.request_id,
            bid_id: req.bid_id,
            amount_sats: req.amount_sats,
            payment_mode: req.payment_mode,
            invoice,
            onchain_address
          };

          const invoiceTemplate = {
            kind: EVENT_KIND,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              tagD("invoice_response"),
              tagV(),
              tagE(ev.id),
              tagP(ev.pubkey)
            ],
            content: JSON.stringify(invoiceResponse)
          };

          const invoiceEvent = finalizeEvent(invoiceTemplate, sk);
          if (!verifyEvent(invoiceEvent)) throw new Error("Bad invoice event");

          await relay.publish(invoiceEvent);
          console.log("🧾 Sent invoice:", invoiceResponse);
        } catch (err) {
          console.log("⚠️ Couldn’t parse invoice request:", String(err));
        }
      }
    }
  );

  relay.subscribe(
    [{ kinds: [EVENT_KIND], "#d": ["ride_accept"] }],
    {
      onevent: async (ev) => {
        if (!verifyEvent(ev)) {
          console.log("⚠️ Invalid ride accept event signature:", ev.id);
          return;
        }
        if (!hasVersionTag(ev.tags)) {
          console.log("⚠️ Unsupported ride accept version:", ev.id);
          return;
        }

        const accept = JSON.parse(ev.content);
        if (!isRideAcceptPayload(accept)) {
          console.log("⚠️ Invalid ride accept payload:", accept);
          return;
        }
        const bidRecord = bids.get(accept.bid_id);

        if (!bidRecord) {
          console.log("🚫 Acceptance for unknown bid:", accept.bid_id);
          return;
        }

        if (accept.driver_pubkey !== driverPubkey) {
          console.log("🚫 Acceptance not intended for this driver:", accept.driver_pubkey);
          return;
        }

        const bidEventTag = ev.tags.find((tag) => tag[0] === "e")?.[1];
        if (bidEventTag && bidEventTag !== bidRecord.event_id) {
          console.log("🚫 Acceptance references different bid event:", bidEventTag);
          return;
        }

        acceptedBids.add(accept.bid_id);
        console.log("✅ Bid accepted, driver state: accepted", {
          bid_id: accept.bid_id,
          request_id: bidRecord.request_id
        });

        if (!activeStatusTimers.has(accept.bid_id)) {
          void publishRideStatus({
            status: "en_route",
            request_id: bidRecord.request_id,
            bid_id: accept.bid_id,
            rider_pubkey: bidRecord.rider_pubkey,
            bid_event_id: bidRecord.event_id
          });

          const timers = [
            setTimeout(() => {
              void publishRideStatus({
                status: "arrived",
                request_id: bidRecord.request_id,
                bid_id: accept.bid_id,
                rider_pubkey: bidRecord.rider_pubkey,
                bid_event_id: bidRecord.event_id
              });
            }, 10_000),
            setTimeout(() => {
              void publishRideStatus({
                status: "completed",
                request_id: bidRecord.request_id,
                bid_id: accept.bid_id,
                rider_pubkey: bidRecord.rider_pubkey,
                bid_event_id: bidRecord.event_id
              });
              activeStatusTimers.delete(accept.bid_id);
            }, 20_000)
          ];

          activeStatusTimers.set(accept.bid_id, timers);
        }
      }
    }
  );

  relay.subscribe(
    [
      {
        kinds: [EVENT_KIND],
        "#d": ["ride_receipt"],
        "#p": [driverPubkey]
      }
    ],
    {
      onevent: (ev) => {
        try {
          if (!verifyEvent(ev)) {
            console.log("⚠️ Invalid ride receipt event signature:", ev.id);
            return;
          }
          if (!hasVersionTag(ev.tags)) {
            console.log("⚠️ Unsupported ride receipt version:", ev.id);
            return;
          }

          const receipt = JSON.parse(ev.content);
          if (!isRideReceiptPayload(receipt)) {
            console.log("⚠️ Invalid ride receipt payload:", receipt);
            return;
          }

          if (receipt.driver_pubkey !== driverPubkey) {
            console.log("🚫 Receipt not intended for this driver:", receipt.driver_pubkey);
            return;
          }

          const bidRecord = bids.get(receipt.bid_id);
          if (!bidRecord) {
            console.log("🚫 Receipt for unknown bid:", receipt.bid_id);
            return;
          }

          if (bidRecord.total_sats !== receipt.total_sats) {
            console.log("🚫 Receipt total mismatch:", {
              bid_id: receipt.bid_id,
              expected: bidRecord.total_sats,
              received: receipt.total_sats
            });
            return;
          }

          const receiptBase = {
            request_id: receipt.request_id,
            bid_id: receipt.bid_id,
            total_sats: receipt.total_sats,
            timestamp: receipt.timestamp,
            rider_pubkey: receipt.rider_pubkey,
            driver_pubkey: receipt.driver_pubkey
          };
          const receiptPayloadHash = sha256(
            new TextEncoder().encode(JSON.stringify(receiptBase))
          );
          const isValidSignature = schnorr.verify(
            receipt.signature,
            receiptPayloadHash,
            receipt.rider_pubkey
          );

          if (!isValidSignature) {
            console.log("⚠️ Invalid receipt signature:", receipt.bid_id);
            return;
          }

          settledBids.set(receipt.bid_id, {
            settled_at: Math.floor(Date.now() / 1000),
            receipt
          });
          console.log("✅ Ride settled:", {
            bid_id: receipt.bid_id,
            request_id: receipt.request_id
          });
        } catch (error) {
          console.log("⚠️ Bad ride receipt event:", String(error));
        }
      }
    }
  );

  console.log("Listening for ride requests… Ctrl+C to stop");
  process.on("SIGINT", () => {
    sub.close();
    for (const timers of activeStatusTimers.values()) {
      timers.forEach((timer) => clearTimeout(timer));
    }
    relay.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
