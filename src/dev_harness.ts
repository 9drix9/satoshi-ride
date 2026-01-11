import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

function generateSecretHex() {
  return randomBytes(32).toString("hex");
}

function spawnTsx(entry: string, secret: string) {
  return spawn("node_modules/.bin/tsx", [entry], {
    stdio: "inherit",
    env: {
      ...process.env,
      NOSTR_SK_HEX: secret
    }
  });
}

const driver = spawnTsx("src/driver.ts", generateSecretHex());
const rider = spawnTsx("src/rider.ts", generateSecretHex());

const shutdown = () => {
  driver.kill("SIGINT");
  rider.kill("SIGINT");
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const exitIfDone = () => {
  if (driver.exitCode !== null && rider.exitCode !== null) {
    process.exit(driver.exitCode || rider.exitCode || 0);
  }
};

driver.on("exit", exitIfDone);
rider.on("exit", exitIfDone);

console.log("🧪 Dev harness running driver + rider with ephemeral keys");
