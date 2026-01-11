type RpcConfig = {
  url: string;
  username?: string;
  password?: string;
};

type BlockchainInfo = {
  chain: string;
};

type TransactionInfo = {
  confirmations?: number;
};

function getRpcConfig(): RpcConfig {
  const url = process.env.BTC_RPC_URL;
  if (!url) {
    throw new Error("Set BTC_RPC_URL to your Bitcoin Core RPC endpoint");
  }

  return {
    url,
    username: process.env.BTC_RPC_USERNAME,
    password: process.env.BTC_RPC_PASSWORD
  };
}

type RpcResponse<T> = {
  result: T;
  error: { code: number; message: string } | null;
  id: string;
};

let mainnetCheckPromise: Promise<void> | null = null;

export async function callBitcoinRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const config = getRpcConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (config.username && config.password) {
    const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    headers.Authorization = `Basic ${auth}`;
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "1.0",
      id: "satoshi-ride",
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`Bitcoin RPC error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as RpcResponse<T>;
  if (data.error) {
    throw new Error(`Bitcoin RPC error: ${data.error.message}`);
  }

  return data.result;
}

async function requireMainnet(): Promise<void> {
  if (!mainnetCheckPromise) {
    mainnetCheckPromise = (async () => {
      const info = await callBitcoinRpc<BlockchainInfo>("getblockchaininfo");
      if (info.chain !== "main" && process.env.BTC_ALLOW_NON_MAINNET !== "true") {
        throw new Error(
          `Bitcoin RPC is not on mainnet (chain=${info.chain}). Set BTC_ALLOW_NON_MAINNET=true to override.`
        );
      }
    })();
  }

  await mainnetCheckPromise;
}

function satsToBtc(amountSats: number): number {
  return Math.round(amountSats) / 100_000_000;
}

export async function getOnchainAddress(): Promise<string> {
  await requireMainnet();
  const addressType = process.env.BTC_ADDRESS_TYPE;
  const params = addressType ? ["", addressType] : [];
  return callBitcoinRpc<string>("getnewaddress", params);
}

type ValidateAddressResult = {
  isvalid: boolean;
};

export async function validateOnchainAddress(address: string): Promise<void> {
  await requireMainnet();
  const result = await callBitcoinRpc<ValidateAddressResult>("validateaddress", [address]);
  if (!result.isvalid) {
    throw new Error(`Invalid on-chain address: ${address}`);
  }
}

export async function sendOnchainPayment(params: {
  address: string;
  amount_sats: number;
}): Promise<string> {
  await requireMainnet();
  await validateOnchainAddress(params.address);
  const amountBtc = satsToBtc(params.amount_sats);
  return callBitcoinRpc<string>("sendtoaddress", [params.address, amountBtc]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForConfirmations(params: {
  txid: string;
  minConfirmations: number;
  timeoutMs: number;
  pollIntervalMs: number;
}): Promise<number> {
  await requireMainnet();
  const deadline = Date.now() + params.timeoutMs;

  while (Date.now() < deadline) {
    const info = await callBitcoinRpc<TransactionInfo>("gettransaction", [params.txid]);
    const confirmations = info.confirmations ?? 0;
    if (confirmations >= params.minConfirmations) {
      return confirmations;
    }
    await delay(params.pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for ${params.minConfirmations} confirmations for tx ${params.txid}.`
  );
}
