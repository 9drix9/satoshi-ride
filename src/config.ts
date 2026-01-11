export const RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol"
];

export const PRIMARY_RELAY = RELAYS[0];
export const EVENT_KIND = 30078;
export const VERSION_TAG = "1";

export type Tag = [string, string];

export const tagD = (value: string): Tag => ["d", value];
export const tagV = (): Tag => ["v", VERSION_TAG];
export const tagE = (value: string): Tag => ["e", value];
export const tagP = (value: string): Tag => ["p", value];
