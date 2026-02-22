import "dotenv/config";
import { readGogProxyConfig } from "./config.js";
import { startGogProxyServer } from "./proxy.js";

async function main(): Promise<void> {
  const config = readGogProxyConfig();
  const server = await startGogProxyServer(config);
  process.stdout.write(`gog-proxy listening at ${server.url}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("/main.js")) {
  void main();
}
