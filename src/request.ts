import { finalizeEvent, verifyEvent } from "nostr-tools";
import { Relay } from "nostr-tools/relay";

const RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol"
];

// Rider secret key (we’ll pass this via env var)
const SK_HEX = process.env.NOSTR_SK_HEX!;
if (!SK_HEX) throw new Error("Set NOSTR_SK_HEX");

const sk = Uint8Array.from(Buffer.from(SK_HEX, "hex"));

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

const eventTemplate = {
  kind: 30078,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ["d", "ride_request"],
    ["v", "1"]
  ],
  content: JSON.stringify(rideRequest)
};

const event = finalizeEvent(eventTemplate, sk);
if (!verifyEvent(event)) throw new Error("Invalid event");

console.log("📡 Publishing ride request:", rideRequest);

for (const url of RELAYS) {
  try {
    const relay = await Relay.connect(url);
    await relay.publish(event);
    console.log("✅ Published to", url);
    relay.close();
  } catch (e) {
    console.log("❌ Failed relay", url);
  }
}
