import { config } from "../../config.mjs";

const CLOUDFLARED_EXE = process.env.CLOUDFLARED_EXE || "D:\\cloudflared\\cloudflared.exe";
const CLOUDFLARED_LOG = process.env.CLOUDFLARED_LOG || "D:\\cloudflared\\cloudflared.log";
const CLOUDFLARED_TUNNEL = process.env.CLOUDFLARED_TUNNEL || "";
const PUBLIC_HOST = new URL(config.publicBaseUrl).hostname;

function psSingleQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function diagnosticScriptHeader() {
  const root = process.cwd();

  return `
$ErrorActionPreference = 'Continue'
$Root = ${psSingleQuote(root)}
$PublicBaseUrl = ${psSingleQuote(config.publicBaseUrl)}
$PublicHost = ${psSingleQuote(PUBLIC_HOST)}
$McpPath = ${psSingleQuote(config.mcpPath)}
$LogDir = Join-Path $Root 'logs'
$CloudflaredExe = ${psSingleQuote(CLOUDFLARED_EXE)}
$CloudflaredLog = ${psSingleQuote(CLOUDFLARED_LOG)}
$CloudflaredTunnel = ${psSingleQuote(CLOUDFLARED_TUNNEL)}
Write-Output "Root=$Root"
Write-Output "PublicBaseUrl=$PublicBaseUrl"
`;
}

export function section(title, script) {
  return `
Write-Output ''
Write-Output '=== ${title} ==='
${script}
`;
}
