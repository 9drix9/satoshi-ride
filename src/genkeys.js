import { generateSecretKey, getPublicKey } from "nostr-tools";

const sk = generateSecretKey();
const pk = getPublicKey(sk);

console.log("SECRET_KEY_HEX:", Buffer.from(sk).toString("hex"));
console.log("PUBLIC_KEY_HEX:", pk);