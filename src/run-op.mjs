import { spawn } from "node:child_process";
import { config } from "./config.mjs";

const CLOUDFLARED_EXE = process.env.CLOUDFLARED_EXE || "D:\\cloudflared\\cloudflared.exe";
const CLOUDFLARED_LOG = process.env.CLOUDFLARED_LOG || "D:\\cloudflared\\cloudflared.log";
const CLOUDFLARED_TUNNEL = process.env.CLOUDFLARED_TUNNEL || "";
const PUBLIC_HOST = new URL(config.publicBaseUrl).hostname;

function psSingleQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function diagnosticScriptHeader() {
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

function section(title, script) {
  return `
Write-Output ''
Write-Output '=== ${title} ==='
${script}
`;
}

function checkEnvScript() {
  return section(
    "Node / npm / files",
    `node --version
npm --version
Test-Path (Join-Path $Root 'server.js')
Test-Path (Join-Path $Root 'mcp-http-server.mjs')
Test-Path (Join-Path $Root 'projects.example.json')
Test-Path (Join-Path $Root 'projects.local.json')
Test-Path (Join-Path $Root '.env.local')`
  );
}

function checkPortsScript() {
  return section(
    "Ports 3333 / 3334",
    `Get-NetTCPConnection -LocalPort 3333,3334 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess |
  Format-Table -AutoSize`
  );
}

function processNodeScript() {
  return section(
    "Node processes",
    `Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,CreationDate |
  Format-List`
  );
}

function statusServicesScript() {
  return section(
    "Windows services",
    `Get-Service mcp-demo-gateway,mcp-http-server,cloudflared -ErrorAction SilentlyContinue |
  Select-Object Name,Status,StartType |
  Format-Table -AutoSize`
  );
}

function healthCheckScript() {
  return section(
    "Local and public health",
    `Write-Output '--- local gateway /health ---'
curl.exe -i http://127.0.0.1:3333/health
Write-Output '--- local MCP /health ---'
curl.exe -i http://127.0.0.1:3334/health
Write-Output '--- public /health ---'
curl.exe -i "$PublicBaseUrl/health"
Write-Output '--- public MCP without token, expected 401 authorization_required ---'
curl.exe -i "$PublicBaseUrl$McpPath"`
  );
}

function gatewaySmokeScript() {
  return section(
    "Readonly gateway smoke",
    `Write-Output '--- gateway /health ---'
curl.exe -i http://127.0.0.1:3333/health
Write-Output '--- gateway /projects ---'
curl.exe -i http://127.0.0.1:3333/projects`
  );
}

function mcpPublicSmokeScript() {
  return section(
    "Public MCP smoke",
    `Write-Output '--- public /health ---'
curl.exe -i "$PublicBaseUrl/health"
Write-Output '--- public /mcp without token, expected 401 authorization_required ---'
curl.exe -i "$PublicBaseUrl$McpPath"`
  );
}

function oauthMetadataScript() {
  return section(
    "OAuth metadata",
    `Write-Output '--- protected resource metadata ---'
curl.exe -i "$PublicBaseUrl/.well-known/oauth-protected-resource$McpPath"
Write-Output '--- authorization server metadata ---'
curl.exe -i "$PublicBaseUrl/.well-known/oauth-authorization-server"
Write-Output '--- openid configuration ---'
curl.exe -i "$PublicBaseUrl/.well-known/openid-configuration"
Write-Output '--- MCP without token, expected 401 authorization_required ---'
curl.exe -i "$PublicBaseUrl$McpPath"`
  );
}

function dnsCheckScript() {
  return section(
    "DNS check",
    `Resolve-DnsName $PublicHost -Type CNAME -Server 1.1.1.1 -ErrorAction SilentlyContinue
Resolve-DnsName $PublicHost -Type A -Server 1.1.1.1 -ErrorAction SilentlyContinue
Resolve-DnsName $PublicHost -Type AAAA -Server 1.1.1.1 -ErrorAction SilentlyContinue`
  );
}

function tailLogsScript() {
  return section(
    "Log tails",
    `Write-Output '--- gateway.err.log ---'
Get-Content (Join-Path $LogDir 'gateway.err.log') -Tail 120 -ErrorAction SilentlyContinue
Write-Output '--- mcp-http.err.log ---'
Get-Content (Join-Path $LogDir 'mcp-http.err.log') -Tail 120 -ErrorAction SilentlyContinue
Write-Output '--- cloudflared.log ---'
Get-Content $CloudflaredLog -Tail 200 -ErrorAction SilentlyContinue`
  );
}

function cloudflaredDiagnoseScript() {
  return section(
    "cloudflared diagnose",
    `Write-Output '--- cloudflared process ---'
Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" |
  Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,CreationDate |
  Format-List
Write-Output '--- cloudflared service ---'
Get-Service cloudflared -ErrorAction SilentlyContinue |
  Select-Object Name,Status,StartType |
  Format-Table -AutoSize
Write-Output '--- cloudflared version ---'
if (Test-Path $CloudflaredExe) { & $CloudflaredExe --version } else { Write-Output "cloudflared exe not found: $CloudflaredExe" }
Write-Output '--- tunnel list ---'
if (Test-Path $CloudflaredExe) { & $CloudflaredExe tunnel list }
Write-Output '--- tunnel info ---'
if (Test-Path $CloudflaredExe) { & $CloudflaredExe tunnel info $CloudflaredTunnel }
Write-Output '--- public health ---'
curl.exe -i "$PublicBaseUrl/health"
Write-Output '--- DNS ---'
Resolve-DnsName $PublicHost -Type CNAME -Server 1.1.1.1 -ErrorAction SilentlyContinue
Resolve-DnsName $PublicHost -Type A -Server 1.1.1.1 -ErrorAction SilentlyContinue
Resolve-DnsName $PublicHost -Type AAAA -Server 1.1.1.1 -ErrorAction SilentlyContinue
Write-Output '--- cloudflared log tail ---'
Get-Content $CloudflaredLog -Tail 200 -ErrorAction SilentlyContinue`
  );
}

function gitRemoteScript() {
  return section(
    "Git remote",
    `git --version
git -C $Root rev-parse --show-toplevel
git -C $Root remote -v
git -C $Root branch --show-current`
  );
}

function gitStatusScript() {
  return section(
    "Git status",
    `if (!(Get-Command git.exe -ErrorAction SilentlyContinue)) { throw "git.exe not found" }
if (!(Test-Path (Join-Path $Root '.git'))) { throw "Not a git repository: $Root" }
git -C $Root status --short --branch`
  );
}

function gitLogLatestScript() {
  return section(
    "Latest git commits",
    `if (!(Get-Command git.exe -ErrorAction SilentlyContinue)) { throw "git.exe not found" }
if (!(Test-Path (Join-Path $Root '.git'))) { throw "Not a git repository: $Root" }
git -C $Root --no-pager log --oneline -n 8`
  );
}

function gitDiffSummaryScript() {
  return section(
    "Git diff summary",
    `if (!(Get-Command git.exe -ErrorAction SilentlyContinue)) { throw "git.exe not found" }
if (!(Test-Path (Join-Path $Root '.git'))) { throw "Not a git repository: $Root" }
Write-Output '--- status ---'
git -C $Root status --short --branch
Write-Output '--- diff name only ---'
git -C $Root diff --name-only
Write-Output '--- diff stat ---'
git -C $Root diff --stat`
  );
}

function npmProjectCheckScript() {
  return section(
    "npm project check",
    `Write-Output '--- npm version ---'
npm --version
Write-Output '--- npm run check ---'
npm run check`
  );
}

function diagnoseAllScript() {
  return [
    checkEnvScript(),
    checkPortsScript(),
    processNodeScript(),
    statusServicesScript(),
    gatewaySmokeScript(),
    mcpPublicSmokeScript(),
    oauthMetadataScript(),
    dnsCheckScript(),
    cloudflaredDiagnoseScript(),
    gitStatusScript(),
    gitLogLatestScript()
  ].join("\n");
}

function getRunOpScript(op) {
  switch (op) {
    case "diagnose_all":
      return `${diagnosticScriptHeader()}${diagnoseAllScript()}`;
    case "check_env":
      return `${diagnosticScriptHeader()}${checkEnvScript()}`;
    case "check_ports":
      return `${diagnosticScriptHeader()}${checkPortsScript()}`;
    case "process_node":
      return `${diagnosticScriptHeader()}${processNodeScript()}`;
    case "status_services":
      return `${diagnosticScriptHeader()}${statusServicesScript()}`;
    case "health_check":
      return `${diagnosticScriptHeader()}${healthCheckScript()}`;
    case "gateway_smoke":
      return `${diagnosticScriptHeader()}${gatewaySmokeScript()}`;
    case "mcp_public_smoke":
      return `${diagnosticScriptHeader()}${mcpPublicSmokeScript()}`;
    case "oauth_metadata_check":
      return `${diagnosticScriptHeader()}${oauthMetadataScript()}`;
    case "dns_check":
      return `${diagnosticScriptHeader()}${dnsCheckScript()}`;
    case "cloudflared_diagnose":
      return `${diagnosticScriptHeader()}${cloudflaredDiagnoseScript()}`;
    case "tail_logs":
      return `${diagnosticScriptHeader()}${tailLogsScript()}`;
    case "git_remote":
      return `${diagnosticScriptHeader()}${gitRemoteScript()}`;
    case "git_status":
      return `${diagnosticScriptHeader()}${gitStatusScript()}`;
    case "git_log_latest":
      return `${diagnosticScriptHeader()}${gitLogLatestScript()}`;
    case "git_diff_summary":
      return `${diagnosticScriptHeader()}${gitDiffSummaryScript()}`;
    case "npm_project_check":
      return `${diagnosticScriptHeader()}${npmProjectCheckScript()}`;
    default:
      return "";
  }
}

function redactSensitiveOutput(value) {
  return String(value || "")
    .replace(/(Authorization:\s*Bearer\s+)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/((?:OAUTH_APPROVE_KEY|MCP_BEARER_TOKEN|MCP_STATIC_BEARER_TOKEN|MCP_OAUTH_APPROVE_KEY|CF_API_TOKEN|CLOUDFLARE_API_TOKEN|TUNNEL_TOKEN|TOKEN|SECRET|PASSWORD)\s*=\s*)[^\s\r\n]+/gi, "$1[REDACTED]")
    .replace(/("(?:client_secret|access_token|refresh_token|token|secret|password)"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2")
    .replace(/(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g, "$1[REDACTED]$2")
    .replace(/([A-Za-z]:\\[^\r\n]*credentials[^\r\n]*\.json)/gi, "[REDACTED_CREDENTIALS_PATH]");
}

function appendBoundedOutput(current, chunk, child, state) {
  let next = current + chunk.toString("utf8");

  if (Buffer.byteLength(next, "utf8") > config.runOpMaxOutputBytes) {
    state.truncated = true;
    next = next.slice(0, config.runOpMaxOutputBytes) + "\n[OUTPUT_TRUNCATED]";
    child.kill("SIGKILL");
  }

  return next;
}

export async function runOp({ op }) {
  if (!config.runOpIds.includes(op)) {
    return { ok: false, error: "OP_NOT_ALLOWED", allowed: config.runOpIds };
  }

  const script = getRunOpScript(op);
  if (!script) {
    return { ok: false, error: "OP_NOT_IMPLEMENTED", op };
  }

  return await new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      cwd: process.cwd(),
      windowsHide: true,
      shell: false,
      env: { ...process.env }
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const state = { truncated: false };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, config.runOpTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = appendBoundedOutput(stdout, chunk, child, state);
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendBoundedOutput(stderr, chunk, child, state);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, op, error: "SPAWN_FAILED", message: error.message });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        op,
        exitCode: code,
        timedOut,
        truncated: state.truncated,
        stdout: redactSensitiveOutput(stdout),
        stderr: redactSensitiveOutput(stderr)
      });
    });
  });
}
