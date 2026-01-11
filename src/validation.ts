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
