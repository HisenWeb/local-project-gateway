import path from "node:path";
import { loadDotEnvLocal } from "./dotenv-local.mjs";

loadDotEnvLocal();

export function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function parseSpaceList(value) {
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const host = process.env.MCP_HTTP_HOST || "127.0.0.1";
const port = Number(process.env.MCP_HTTP_PORT || 3334);
const mcpPath = process.env.MCP_PATH || "/mcp";
const gatewayBaseUrl = process.env.LOCAL_PROJECT_GATEWAY_URL || "http://127.0.0.1:3333";
const publicBaseUrl = stripTrailingSlash(
  process.env.MCP_PUBLIC_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    "https://mcp.example.com"
);
const mcpResourceUrl = stripTrailingSlash(
  process.env.MCP_RESOURCE_URL || `${publicBaseUrl}${mcpPath}`
);
const oauthIssuer = stripTrailingSlash(process.env.OAUTH_ISSUER || publicBaseUrl);
const defaultScope = process.env.OAUTH_DEFAULT_SCOPE || "projects:read";
const oauthEnabled = process.env.OAUTH_ENABLED !== "0";
const oauthApproveKey =
  process.env.OAUTH_APPROVE_KEY ||
  process.env.MCP_OAUTH_APPROVE_KEY ||
  process.env.MCP_BEARER_TOKEN ||
  "";

const staticBearerTokens = new Set(
  [process.env.MCP_BEARER_TOKEN, process.env.MCP_STATIC_BEARER_TOKEN]
    .filter(Boolean)
    .map(String)
);

const oauthClientsFile = path.resolve(
  process.cwd(),
  process.env.OAUTH_CLIENTS_FILE || "oauth-clients.local.json"
);

export const runOpIds = [
  "diagnose_all",
  "check_env",
  "check_ports",
  "process_node",
  "health_check",
  "gateway_smoke",
  "mcp_public_smoke",
  "oauth_metadata_check",
  "oauth_client_check",
  "dns_check",
  "dns_local_check",
  "cloudflared_diagnose",
  "cloudflared_service_detail",
  "cloudflared_config_check",
  "cloudflared_ingress_check",
  "network_proxy_check",
  "tail_logs",
  "git_remote",
  "git_status",
  "git_log_latest",
  "git_diff_summary",
  "npm_project_check",
  "npm_dependency_check",
  "gateway_config_check",
  "status_services"
];

export const config = {
  host,
  port,
  mcpPath,
  gatewayBaseUrl,
  publicBaseUrl,
  mcpResourceUrl,
  oauthIssuer,
  defaultScope,
  oauthEnabled,
  oauthApproveKey,
  staticBearerTokens,
  oauthClientsFile,
  authCodeTtlMs: Number(process.env.OAUTH_AUTH_CODE_TTL_MS || 5 * 60 * 1000),
  accessTokenTtlSeconds: Number(process.env.OAUTH_ACCESS_TOKEN_TTL_SECONDS || 60 * 60),
  allowedOrigins: new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`
  ]),
  runOpIds,
  runOpTimeoutMs: Number(process.env.RUN_OP_TIMEOUT_MS || 60_000),
  runOpMaxOutputBytes: Number(process.env.RUN_OP_MAX_OUTPUT_BYTES || 256 * 1024)
};
