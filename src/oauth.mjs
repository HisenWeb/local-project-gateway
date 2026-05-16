import fs from "node:fs/promises";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { config, parseSpaceList, stripTrailingSlash } from "./config.mjs";

export const oauthClients = new Map();
export const authCodes = new Map();
export const accessTokens = new Map();

export function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function randomToken(bytes = 32) {
  return base64Url(randomBytes(bytes));
}

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));

  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function parseRedirectUris(raw) {
  return String(raw || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getRequiredScopes(scope) {
  const requested = parseSpaceList(scope);
  return requested.length ? requested : [config.defaultScope];
}

export function isScopeAllowed(scope) {
  const allowed = new Set([config.defaultScope]);
  return getRequiredScopes(scope).every((item) => allowed.has(item));
}

export function getAllowedRedirectOrigins() {
  const defaults = [
    "https://chatgpt.com",
    "https://chat.openai.com",
    "http://localhost",
    "http://127.0.0.1"
  ];

  const extra = parseRedirectUris(process.env.OAUTH_ALLOWED_REDIRECT_ORIGINS || "");
  return new Set([...defaults, ...extra].map(stripTrailingSlash));
}

export function isAllowedRedirectUri(redirectUri) {
  try {
    const url = new URL(redirectUri);
    const origin = stripTrailingSlash(url.origin);

    if (url.protocol !== "https:" && origin !== "http://localhost" && origin !== "http://127.0.0.1") {
      return false;
    }

    return getAllowedRedirectOrigins().has(origin);
  } catch {
    return false;
  }
}

export function validateRedirectUriForClient(client, redirectUri) {
  if (!isAllowedRedirectUri(redirectUri)) {
    return false;
  }

  if (!client.redirect_uris || client.redirect_uris.length === 0) {
    return true;
  }

  return client.redirect_uris.includes(redirectUri);
}

export async function loadOAuthClients() {
  oauthClients.clear();

  const staticClientId = process.env.OAUTH_CLIENT_ID || "";
  if (staticClientId) {
    oauthClients.set(staticClientId, {
      client_id: staticClientId,
      client_secret: process.env.OAUTH_CLIENT_SECRET || "",
      redirect_uris: parseRedirectUris(process.env.OAUTH_REDIRECT_URIS || process.env.OAUTH_REDIRECT_URI || ""),
      token_endpoint_auth_method: process.env.OAUTH_CLIENT_SECRET
        ? "client_secret_post"
        : "none",
      source: "env"
    });
  }

  try {
    const raw = await fs.readFile(config.oauthClientsFile, "utf8");
    const parsed = JSON.parse(raw);
    const clients = Array.isArray(parsed?.clients) ? parsed.clients : [];

    for (const client of clients) {
      if (client?.client_id && Array.isArray(client.redirect_uris)) {
        oauthClients.set(String(client.client_id), client);
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to load OAuth clients:", error);
    }
  }
}

export async function saveOAuthClients() {
  const clients = Array.from(oauthClients.values()).filter((client) => client.source !== "env");
  await fs.writeFile(
    config.oauthClientsFile,
    JSON.stringify({ clients }, null, 2),
    "utf8"
  );
}

export function getClientAuth(req) {
  const auth = req.headers.authorization || "";
  const basic = String(auth).match(/^Basic\s+(.+)$/i);

  if (basic) {
    try {
      const decoded = Buffer.from(basic[1], "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      if (sep !== -1) {
        return {
          client_id: decodeURIComponent(decoded.slice(0, sep)),
          client_secret: decodeURIComponent(decoded.slice(sep + 1))
        };
      }
    } catch {
      // Ignore malformed basic auth and fall through to body credentials.
    }
  }

  return {
    client_id: req.body?.client_id || "",
    client_secret: req.body?.client_secret || ""
  };
}

export function verifyPkce(codeVerifier, codeChallenge) {
  if (!codeVerifier || !codeChallenge) return false;
  const digest = createHash("sha256").update(String(codeVerifier)).digest();
  return safeEqual(base64Url(digest), String(codeChallenge));
}

export function validateAuthRequest(query) {
  const responseType = String(query.response_type || "");
  const clientId = String(query.client_id || "");
  const redirectUri = String(query.redirect_uri || "");
  const codeChallenge = String(query.code_challenge || "");
  const codeChallengeMethod = String(query.code_challenge_method || "");
  const resource = String(query.resource || config.mcpResourceUrl);
  const scope = String(query.scope || config.defaultScope);

  if (responseType !== "code") return "unsupported_response_type";
  if (!clientId) return "missing_client_id";
  if (!redirectUri) return "missing_redirect_uri";
  if (!codeChallenge || codeChallengeMethod !== "S256") return "pkce_s256_required";
  if (!isScopeAllowed(scope)) return "invalid_scope";

  const client = oauthClients.get(clientId);
  if (!client) return "unknown_client";
  if (!validateRedirectUriForClient(client, redirectUri)) return "invalid_redirect_uri";

  const acceptedResources = new Set([
    config.mcpResourceUrl,
    config.publicBaseUrl,
    `${config.publicBaseUrl}/`,
    stripTrailingSlash(config.mcpResourceUrl)
  ]);

  if (resource && !acceptedResources.has(stripTrailingSlash(resource))) {
    return "invalid_resource";
  }

  return "";
}

export function redirectWithError(redirectUri, state, error, description = "") {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function issueAuthorizationCode(query) {
  const code = randomToken(32);
  const record = {
    code,
    client_id: String(query.client_id),
    redirect_uri: String(query.redirect_uri),
    scope: getRequiredScopes(query.scope || config.defaultScope),
    resource: stripTrailingSlash(query.resource || config.mcpResourceUrl),
    code_challenge: String(query.code_challenge),
    code_challenge_method: "S256",
    expiresAt: Date.now() + config.authCodeTtlMs,
    used: false
  };

  authCodes.set(code, record);
  return code;
}

export function isTokenExpired(record) {
  return !record || Date.now() >= record.expiresAt;
}

export function validateAccessToken(token) {
  if (!token) return null;

  if (config.staticBearerTokens.has(token)) {
    return {
      clientId: "static-bearer-token",
      scope: [config.defaultScope],
      resource: config.mcpResourceUrl,
      static: true
    };
  }

  const record = accessTokens.get(token);
  if (isTokenExpired(record)) {
    accessTokens.delete(token);
    return null;
  }

  return record;
}

export function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function getProtectedResourceMetadataUrl() {
  return `${config.publicBaseUrl}/.well-known/oauth-protected-resource${config.mcpPath}`;
}

export function getWwwAuthenticateHeader(error = undefined) {
  const params = [
    `resource_metadata="${getProtectedResourceMetadataUrl()}"`,
    `scope="${config.defaultScope}"`
  ];

  if (error) {
    params.unshift(`error="${error}"`);
  }

  return `Bearer ${params.join(", ")}`;
}

export function sendUnauthorized(res, error = undefined) {
  res.set("WWW-Authenticate", getWwwAuthenticateHeader(error));
  res.status(401).json({
    error: error || "authorization_required"
  });
}

export function requireOAuth(req, res, next) {
  if (!config.oauthEnabled) {
    next();
    return;
  }

  const token = getBearerToken(req);
  const tokenRecord = validateAccessToken(token);

  if (!tokenRecord) {
    sendUnauthorized(res, token ? "invalid_token" : undefined);
    return;
  }

  req.oauth = tokenRecord;
  next();
}

export function protectedResourceMetadata() {
  return {
    resource: config.mcpResourceUrl,
    authorization_servers: [config.oauthIssuer],
    scopes_supported: [config.defaultScope],
    bearer_methods_supported: ["header"],
    resource_documentation: `${config.publicBaseUrl}/health`
  };
}

export function authorizationServerMetadata() {
  return {
    issuer: config.oauthIssuer,
    authorization_endpoint: `${config.oauthIssuer}/oauth/authorize`,
    token_endpoint: `${config.oauthIssuer}/oauth/token`,
    registration_endpoint: `${config.oauthIssuer}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [config.defaultScope],
    resource_indicators_supported: true
  };
}

export function registerDynamicClient(metadata = {}) {
  const redirectUris = Array.isArray(metadata.redirect_uris)
    ? metadata.redirect_uris.map(String)
    : [];

  if (redirectUris.length === 0 || !redirectUris.every(isAllowedRedirectUri)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_client_metadata",
        error_description: "redirect_uris must contain allowed ChatGPT or localhost HTTPS/loopback callback URLs"
      }
    };
  }

  const clientId = `dcr_${randomUUID()}`;
  const client = {
    client_id: clientId,
    client_name: String(metadata.client_name || "ChatGPT MCP Client"),
    client_uri: metadata.client_uri ? String(metadata.client_uri) : undefined,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(Date.now() / 1000),
    source: "dynamic"
  };

  oauthClients.set(clientId, client);

  return {
    ok: true,
    client,
    body: {
      client_id: client.client_id,
      client_name: client.client_name,
      client_uri: client.client_uri,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: client.response_types,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      client_id_issued_at: client.client_id_issued_at
    }
  };
}
