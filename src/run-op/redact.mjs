export function redactSensitiveOutput(value) {
  return String(value || "")
    .replace(/(Authorization:\s*Bearer\s+)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/((?:OAUTH_APPROVE_KEY|MCP_BEARER_TOKEN|MCP_STATIC_BEARER_TOKEN|MCP_OAUTH_APPROVE_KEY|CF_API_TOKEN|CLOUDFLARE_API_TOKEN|TUNNEL_TOKEN|TOKEN|SECRET|PASSWORD)\s*=\s*)[^\s\r\n]+/gi, "$1[REDACTED]")
    .replace(/("(?:client_secret|access_token|refresh_token|token|secret|password)"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2")
    .replace(/(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g, "$1[REDACTED]$2")
    .replace(/([A-Za-z]:\\[^\r\n]*credentials[^\r\n]*\.json)/gi, "[REDACTED_CREDENTIALS_PATH]");
}
