import { section } from "./common.mjs";

export function checkEnvScript() {
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

export function checkPortsScript() {
  return section(
    "Ports 3333 / 3334",
    `Get-NetTCPConnection -LocalPort 3333,3334 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess |
  Format-Table -AutoSize`
  );
}

export function processNodeScript() {
  return section(
    "Node processes",
    `Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,CreationDate |
  Format-List`
  );
}

export function statusServicesScript() {
  return section(
    "Windows services",
    `Get-Service mcp-demo-gateway,mcp-http-server,cloudflared -ErrorAction SilentlyContinue |
  Select-Object Name,Status,StartType |
  Format-Table -AutoSize`
  );
}

export function healthCheckScript() {
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
