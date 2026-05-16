import { section } from "./common.mjs";

export function mcpPublicSmokeScript() {
  return section(
    "Public MCP smoke",
    `Write-Output '--- public /health ---'
curl.exe -i "$PublicBaseUrl/health"
Write-Output '--- public /mcp without token, expected 401 authorization_required ---'
curl.exe -i "$PublicBaseUrl$McpPath"`
  );
}

export function oauthMetadataScript() {
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

export function oauthClientCheckScript() {
  return section(
    "OAuth client store",
    `$ClientFile = Join-Path $Root 'oauth-clients.local.json'
Write-Output "ClientStoreExists=$(Test-Path $ClientFile)"
if (Test-Path $ClientFile) {
  $ClientFileItem = Get-Item $ClientFile -ErrorAction SilentlyContinue
  if ($ClientFileItem) {
    Write-Output "ClientStoreBytes=$($ClientFileItem.Length)"
    Write-Output "ClientStoreLastWriteUtc=$($ClientFileItem.LastWriteTimeUtc.ToString('o'))"
  }
  try {
    $ClientJson = Get-Content $ClientFile -Raw | ConvertFrom-Json
    if ($null -ne $ClientJson.clients) {
      if ($ClientJson.clients -is [System.Array]) {
        Write-Output "ClientCount=$(@($ClientJson.clients).Count)"
      } else {
        Write-Output "ClientCount=$(@($ClientJson.clients.PSObject.Properties).Count)"
      }
    } else {
      Write-Output 'ClientCount=unknown_schema'
    }
    Write-Output 'JsonParse=OK'
  } catch {
    Write-Output 'JsonParse=FAILED'
    Write-Output $_.Exception.Message
  }
} else {
  Write-Output 'ClientStoreStatus=missing_expected_before_first_DCR'
}`
  );
}
