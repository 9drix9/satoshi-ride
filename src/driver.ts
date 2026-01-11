import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools";
import { Relay } from "nostr-tools/relay";

const RELAY = "wss://relay.damus.io";

const SK_HEX = process.env.NOSTR_SK_HEX!;
if (!SK_HEX) throw new Error("Set NOSTR_SK_HEX");
const sk = Uint8Array.from(Buffer.from(SK_HEX, "hex"));
const driverPubkey = getPublicKey(sk);
const bids = new Map<
  string,
  { request_id: string; event_id: string; rider_pubkey: string }
>();
const acceptedBids = new Set<string>();

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

  const sub = relay.subscribe(
    [{ kinds: [30078], "#d": ["ride_request"] }],
    {
      onevent: async (ev) => {
        try {
          const req = JSON.parse(ev.content);

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
            kind: 30078,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ["d", "ride_bid"],
              ["v", "1"],
              ["e", ev.id],     // reference request event id
              ["p", ev.pubkey]  // target rider pubkey
            ],
            content: JSON.stringify(bid)
          };

          const bidEvent = finalizeEvent(bidTemplate, sk);
          if (!verifyEvent(bidEvent)) throw new Error("Bad bid event");

          await relay.publish(bidEvent);
          bids.set(bid.bid_id, {
            request_id: req.id,
            event_id: bidEvent.id,
            rider_pubkey: ev.pubkey
          });
          console.log("✅ Sent bid:", bid);
        } catch (err) {
          console.log("⚠️ Couldn’t parse request:", String(err));
        }
      }
    }
  );
  
  relay.subscribe(
  [{ kinds: [30078], "#d": ["invoice_request"] }],
  {
    onevent: async (ev) => {
      const req = JSON.parse(ev.content);

      console.log("⚡ Invoice requested:", req);

      // NEXT: generate LN invoice here
    }
  }
);

  relay.subscribe(
    [{ kinds: [30078], "#d": ["ride_accept"] }],
    {
      onevent: async (ev) => {
        if (!verifyEvent(ev)) {
          console.log("🚫 Invalid ride_accept signature:", ev.id);
          return;
        }

        let accept: {
          bid_id: string;
          driver_pubkey: string;
          rider_pubkey?: string;
        };

        try {
          accept = JSON.parse(ev.content);
        } catch (err) {
          console.log("🚫 Invalid ride_accept payload:", String(err));
          return;
        }

        const bidRecord = bids.get(accept.bid_id);

        if (!bidRecord) {
          console.log("🚫 Acceptance for unknown bid:", accept.bid_id);
          return;
        }

        if (accept.rider_pubkey && accept.rider_pubkey !== bidRecord.rider_pubkey) {
          console.log("🚫 Acceptance rider mismatch:", accept.rider_pubkey);
          return;
        }

        if (ev.pubkey !== bidRecord.rider_pubkey) {
          console.log("🚫 Acceptance not signed by rider:", ev.pubkey);
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
      }
    }
  );


  console.log("Listening for ride requests… Ctrl+C to stop");
  process.on("SIGINT", () => {
    sub.close();
    relay.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
