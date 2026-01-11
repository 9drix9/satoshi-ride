type UnknownRecord = Record<string, unknown>;
type UnknownArray = unknown[];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isPositiveNumber(value) && Number.isInteger(value);
}

function isPaymentMode(value: unknown): value is "LN" | "ONCHAIN" {
  return value === "LN" || value === "ONCHAIN";
}

function isPaymentModeArray(value: unknown): value is ("LN" | "ONCHAIN")[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPaymentMode);
}

function isGeohash(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    value.length >= 4 &&
    value.length <= 12 &&
    /^[0-9b-hjkmnp-z]+$/i.test(value)
  );
}

function isHexString(value: unknown, length: number): value is string {
  return isNonEmptyString(value) && value.length === length && /^[0-9a-f]+$/i.test(value);
}

export function hasVersionTag(tags: unknown, version = "1"): boolean {
  return (
    Array.isArray(tags) &&
    tags.some(
      (tag): tag is UnknownArray =>
        Array.isArray(tag) &&
        tag.length >= 2 &&
        tag[0] === "v" &&
        tag[1] === version
    )
  );
}

export function isRideRequestPayload(value: unknown): value is {
  id: string;
  pickup_geohash: string;
  dropoff_geohash: string;
  time_window_mins: number;
  max_total_sats: number;
  max_eta_mins: number;
  payment_modes: ("LN" | "ONCHAIN")[];
  note?: string;
} {
  if (!isRecord(value)) {
    return false;
  }

  if (
    !isNonEmptyString(value.id) ||
    !isGeohash(value.pickup_geohash) ||
    !isGeohash(value.dropoff_geohash) ||
    !isPositiveInteger(value.time_window_mins) ||
    !isPositiveInteger(value.max_total_sats) ||
    !isPositiveInteger(value.max_eta_mins) ||
    !isPaymentModeArray(value.payment_modes)
  ) {
    return false;
  }

  if (value.note !== undefined && !isNonEmptyString(value.note)) {
    return false;
  }

  return true;
}

export function isInvoiceRequestPayload(value: unknown): value is {
  request_id: string;
  bid_id: string;
  amount_sats: number;
  payment_mode: "LN" | "ONCHAIN";
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.request_id) &&
    isNonEmptyString(value.bid_id) &&
    isPositiveNumber(value.amount_sats) &&
    isPaymentMode(value.payment_mode)
  );
}

export function isInvoiceResponsePayload(value: unknown): value is {
  request_id: string;
  bid_id: string;
  amount_sats: number;
  payment_mode: "LN" | "ONCHAIN";
  invoice: string;
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.request_id) &&
    isNonEmptyString(value.bid_id) &&
    isPositiveNumber(value.amount_sats) &&
    isPaymentMode(value.payment_mode) &&
    isNonEmptyString(value.invoice)
  );
}

export function isRideBidPayload(value: unknown): value is {
  request_id: string;
  bid_id: string;
  total_sats: number;
  deposit_sats: number;
  eta_mins: number;
  payment_modes_supported: ("LN" | "ONCHAIN")[];
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.request_id) &&
    isNonEmptyString(value.bid_id) &&
    isPositiveNumber(value.total_sats) &&
    isPositiveNumber(value.deposit_sats) &&
    isPositiveInteger(value.eta_mins) &&
    isPaymentModeArray(value.payment_modes_supported)
  );
}

const rideStatusValues = ["en_route", "arrived", "completed"] as const;

export function isRideStatusPayload(value: unknown): value is {
  request_id: string;
  bid_id: string;
  status: (typeof rideStatusValues)[number];
  rider_pubkey: string;
  driver_pubkey: string;
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.request_id) &&
    isNonEmptyString(value.bid_id) &&
    isNonEmptyString(value.status) &&
    rideStatusValues.includes(value.status as (typeof rideStatusValues)[number]) &&
    isHexString(value.rider_pubkey, 64) &&
    isHexString(value.driver_pubkey, 64)
  );
}

export function isRideAcceptPayload(value: unknown): value is {
  request_id: string;
  bid_id: string;
  rider_pubkey: string;
  driver_pubkey: string;
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.request_id) &&
    isNonEmptyString(value.bid_id) &&
    isHexString(value.rider_pubkey, 64) &&
    isHexString(value.driver_pubkey, 64)
  );
}

export function isRideReceiptPayload(value: unknown): value is {
  request_id: string;
  bid_id: string;
  total_sats: number;
  timestamp: number;
  signature: string;
  rider_pubkey: string;
  driver_pubkey: string;
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.request_id) &&
    isNonEmptyString(value.bid_id) &&
    isPositiveNumber(value.total_sats) &&
    isPositiveInteger(value.timestamp) &&
    isNonEmptyString(value.signature) &&
    isHexString(value.rider_pubkey, 64) &&
    isHexString(value.driver_pubkey, 64)
  );
}
