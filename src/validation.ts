type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isRideRequestPayload(value: unknown): value is { id: string } {
  return isRecord(value) && isNonEmptyString(value.id);
}

export function isInvoiceRequestPayload(value: unknown): value is {
  request_id: string;
  bid_id: string;
  amount_sats: number;
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.request_id) &&
    isNonEmptyString(value.bid_id) &&
    isPositiveNumber(value.amount_sats)
  );
}

export function isRideBidPayload(value: unknown): value is {
  request_id: string;
  bid_id: string;
  total_sats: number;
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.request_id) &&
    isNonEmptyString(value.bid_id) &&
    isPositiveNumber(value.total_sats)
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
    isNonEmptyString(value.rider_pubkey) &&
    isNonEmptyString(value.driver_pubkey)
  );
}

export function isRideReceiptPayload(value: unknown): value is {
  request_id: string;
  bid_id: string;
  total_sats: number;
  timestamp: number;
  signature: string;
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.request_id) &&
    isNonEmptyString(value.bid_id) &&
    isPositiveNumber(value.total_sats) &&
    isPositiveNumber(value.timestamp) &&
    isNonEmptyString(value.signature)
  );
}
