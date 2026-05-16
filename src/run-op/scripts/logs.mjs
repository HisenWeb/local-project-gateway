import { section } from "./common.mjs";

export function tailLogsScript() {
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
