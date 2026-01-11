import assert from "node:assert/strict";
import {
  hasVersionTag,
  isInvoiceRequestPayload,
  isInvoiceResponsePayload,
  isNonEmptyString,
  isPositiveNumber,
  isRideAcceptPayload,
  isRideBidPayload,
  isRideReceiptPayload,
  isRideRequestPayload,
  isRideStatusPayload
} from "../src/validation";

const hex64 = "a".repeat(64);

assert.equal(isNonEmptyString("hello"), true, "non-empty string should pass");
assert.equal(isNonEmptyString("   "), false, "whitespace-only string should fail");
assert.equal(isPositiveNumber(42), true, "positive number should pass");
assert.equal(isPositiveNumber(-1), false, "negative number should fail");

const rideRequest = {
  id: "req-1",
  pickup_geohash: "dp3w",
  dropoff_geohash: "dp3x",
  time_window_mins: 15,
  max_total_sats: 5000,
  max_eta_mins: 12,
  payment_modes: ["LN", "ONCHAIN"],
  note: "quiet ride"
};

assert.equal(isRideRequestPayload(rideRequest), true, "valid ride request should pass");
assert.equal(
  isRideRequestPayload({ ...rideRequest, pickup_geohash: "bad!" }),
  false,
  "invalid geohash should fail"
);

const invoiceRequest = {
  request_id: "req-1",
  bid_id: "bid-1",
  amount_sats: 1200,
  payment_mode: "LN" as const
};

assert.equal(
  isInvoiceRequestPayload(invoiceRequest),
  true,
  "valid invoice request should pass"
);
assert.equal(
  isInvoiceRequestPayload({ ...invoiceRequest, amount_sats: 0 }),
  false,
  "invoice request with zero sats should fail"
);

const invoiceResponse = {
  request_id: "req-1",
  bid_id: "bid-1",
  amount_sats: 1200,
  payment_mode: "LN" as const,
  invoice: "lnbc1invoice"
};

assert.equal(
  isInvoiceResponsePayload(invoiceResponse),
  true,
  "valid invoice response should pass"
);
assert.equal(
  isInvoiceResponsePayload({ ...invoiceResponse, invoice: "" }),
  false,
  "invoice response without invoice should fail"
);

const rideBid = {
  request_id: "req-1",
  bid_id: "bid-1",
  total_sats: 5000,
  deposit_sats: 1500,
  eta_mins: 8,
  payment_modes_supported: ["LN"]
};

assert.equal(isRideBidPayload(rideBid), true, "valid ride bid should pass");
assert.equal(
  isRideBidPayload({ ...rideBid, eta_mins: 0 }),
  false,
  "ride bid with zero eta should fail"
);

const rideStatus = {
  request_id: "req-1",
  bid_id: "bid-1",
  status: "en_route" as const,
  rider_pubkey: hex64,
  driver_pubkey: hex64
};

assert.equal(
  isRideStatusPayload(rideStatus),
  true,
  "valid ride status should pass"
);
assert.equal(
  isRideStatusPayload({ ...rideStatus, status: "lost" }),
  false,
  "invalid ride status should fail"
);

const rideAccept = {
  request_id: "req-1",
  bid_id: "bid-1",
  rider_pubkey: hex64,
  driver_pubkey: hex64
};

assert.equal(
  isRideAcceptPayload(rideAccept),
  true,
  "valid ride accept should pass"
);
assert.equal(
  isRideAcceptPayload({ ...rideAccept, rider_pubkey: "bad" }),
  false,
  "invalid ride accept pubkey should fail"
);

const rideReceipt = {
  request_id: "req-1",
  bid_id: "bid-1",
  total_sats: 5000,
  timestamp: 1700000000,
  signature: "sig",
  rider_pubkey: hex64,
  driver_pubkey: hex64
};

assert.equal(
  isRideReceiptPayload(rideReceipt),
  true,
  "valid ride receipt should pass"
);
assert.equal(
  isRideReceiptPayload({ ...rideReceipt, timestamp: 0 }),
  false,
  "invalid ride receipt timestamp should fail"
);

assert.equal(
  hasVersionTag([
    ["d", "ride_request"],
    ["v", "1"]
  ]),
  true,
  "version tag should be detected"
);
assert.equal(
  hasVersionTag([
    ["d", "ride_request"],
    ["v", "2"]
  ]),
  false,
  "version tag mismatch should fail"
);

console.log("✅ validation tests passed");
