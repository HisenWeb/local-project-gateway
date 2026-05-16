import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const env = { ...process.env, ...loadDotEnvLocal(path.join(root, ".env.local")) };
const shouldStartCloudflared = args.has("--with-cloudflared") || env.START_CLOUDFLARED === "1";

const services = [
  {
    name: "gateway",
    command: "node",
    args: ["./server.js"],
    host: env.GATEWAY_HOST || "127.0.0.1",
    port: Number(env.GATEWAY_PORT || 3333),
    kind: "port-service"
  },
  {
    name: "mcp-http",
    command: "node",
    args: ["./mcp-http-server.mjs"],
    host: env.MCP_HTTP_HOST || "127.0.0.1",
    port: Number(env.MCP_HTTP_PORT || 3334),
    kind: "port-service"
  }
];

if (shouldStartCloudflared) {
  const cloudflaredTunnel = String(env.CLOUDFLARED_TUNNEL || "").trim();

  if (!cloudflaredTunnel) {
    console.error("[start-local] START_CLOUDFLARED is enabled, but CLOUDFLARED_TUNNEL is not configured.");
    console.error("[start-local] Set CLOUDFLARED_TUNNEL in .env.local to the real tunnel name or tunnel UUID.");
    process.exit(1);
  }

  services.push({
    name: "cloudflared",
    command: env.CLOUDFLARED_EXE || "D:\\cloudflared\\cloudflared.exe",
    args: ["tunnel", "run", cloudflaredTunnel],
    kind: "long-running-process"
  });
}

const children = new Map();
let shuttingDown = false;

for (const service of services) {
  if (service.kind !== "port-service") continue;

  const available = await isPortAvailable(service.host, service.port);

  if (!available) {
    console.error(`[start-local] ${service.name} port is already in use: ${service.host}:${service.port}`);
    console.error("[start-local] Stop the old process first, or change the port in .env.local.");
    process.exit(1);
  }
}

for (const service of services) {
  startService(service);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function loadDotEnvLocal(envPath) {
  if (!fs.existsSync(envPath)) return {};

  const result = {};
  const raw = fs.readFileSync(envPath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function isPortAvailable(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

function startService(service) {
  const child = spawn(service.command, service.args, {
    cwd: root,
    env,
    stdio: ["inherit", "pipe", "pipe"],
    windowsHide: true
  });

  children.set(service.name, child);

  child.stdout.on("data", (chunk) => writePrefixed(service.name, chunk, process.stdout));
  child.stderr.on("data", (chunk) => writePrefixed(service.name, chunk, process.stderr));

  child.on("error", (error) => {
    children.delete(service.name);

    if (shuttingDown) return;

    console.error(`[start-local] failed to start ${service.name}: ${error.message}`);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    children.delete(service.name);

    if (shuttingDown) return;

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[start-local] ${service.name} exited with ${reason}. Stopping remaining services.`);
    shutdown(code || 1);
  });
}

function writePrefixed(name, chunk, stream) {
  const lines = chunk.toString("utf8").split(/(\r?\n)/);
  let buffer = "";

  for (const part of lines) {
    if (part === "\n" || part === "\r\n") {
      stream.write(`[${name}] ${buffer}${part}`);
      buffer = "";
    } else {
      buffer += part;
    }
  }

  if (buffer) {
    stream.write(`[${name}] ${buffer}`);
  }
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const [name, child] of children) {
    console.log(`[start-local] stopping ${name}`);
    child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(exitCode), 500);
}
