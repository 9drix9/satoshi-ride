import { Relay } from "nostr-tools/relay";

const RELAY = "wss://relay.damus.io";

// Rider pubkey (hex)
const RIDER_PUBKEY = process.env.NOSTR_PUBKEY!;
if (!RIDER_PUBKEY) throw new Error("Set NOSTR_PUBKEY");

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
          const bid = JSON.parse(ev.content);
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
}

main();
