import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config, stripTrailingSlash } from "./config.mjs";
import { createReadonlyMcpServer } from "./mcp/server.mjs";
import {
  accessTokens,
  authCodes,
  authorizationServerMetadata,
  getClientAuth,
  isAllowedRedirectUri,
  issueAuthorizationCode,
  oauthClients,
  protectedResourceMetadata,
  randomToken,
  redirectWithError,
  registerDynamicClient,
  requireOAuth,
  safeEqual,
  saveOAuthClients,
  validateAuthRequest,
  verifyPkce
} from "./oauth.mjs";

function htmlEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderAuthorizePage(query, error = "") {
  const fields = [
    "response_type",
    "client_id",
    "redirect_uri",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    "resource"
  ];

  const hidden = fields
    .map((name) => {
      const value = query[name];
      if (value === undefined) return "";
      return `<input type="hidden" name="${htmlEscape(name)}" value="${htmlEscape(value)}">`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize MCP</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 32px; color: #111; }
    .card { max-width: 560px; border: 1px solid #ddd; border-radius: 12px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
    label { display: block; font-weight: 600; margin-top: 16px; }
    input[type=password] { width: 100%; padding: 10px; font-size: 16px; box-sizing: border-box; }
    button { margin-top: 20px; padding: 10px 16px; border: 0; border-radius: 8px; background: #111; color: #fff; font-size: 15px; cursor: pointer; }
    .error { color: #b00020; margin: 12px 0; }
    code { background: #f6f6f6; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>授权本地 MCP</h1>
    <p>目标资源：<code>${htmlEscape(config.mcpResourceUrl)}</code></p>
    <p>客户端：<code>${htmlEscape(query.client_id || "")}</code></p>
    <p>作用域：<code>${htmlEscape(query.scope || config.defaultScope)}</code></p>
    ${error ? `<div class="error">${htmlEscape(error)}</div>` : ""}
    <form method="get" action="/oauth/authorize">
      ${hidden}
      <label for="approve_key">授权确认口令</label>
      <input id="approve_key" name="approve_key" type="password" autocomplete="current-password" autofocus required>
      <button type="submit">允许 ChatGPT 连接</button>
    </form>
  </div>
</body>
</html>`;
}

function requireAllowedOrigin(req, res, next) {
  const origin = req.headers.origin;

  if (!origin) {
    next();
    return;
  }

  if (!config.allowedOrigins.has(origin)) {
    res.status(403).json({
      ok: false,
      error: "FORBIDDEN_ORIGIN"
    });
    return;
  }

  next();
}

function registerHealthRoutes(app) {
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: "local-project-gateway-http-mcp",
      mode: "readonly",
      auth: config.oauthEnabled ? "oauth" : "none",
      publicBaseUrl: config.publicBaseUrl,
      resource: config.mcpResourceUrl,
      issuer: config.oauthIssuer,
      oauthEnabled: config.oauthEnabled,
      oauthApproveKeyConfigured: Boolean(config.oauthApproveKey),
      staticBearerTokenConfigured: config.staticBearerTokens.size > 0,
      runOpEnabled: true,
      runOpMode: "readonly-diagnostics",
      runOpTimeoutMs: config.runOpTimeoutMs,
      runOpIds: config.runOpIds,
      mcpPath: config.mcpPath,
      time: new Date().toISOString()
    });
  });
}

function registerOAuthRoutes(app) {
  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    res.json(protectedResourceMetadata());
  });

  app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
    res.json(protectedResourceMetadata());
  });

  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    res.json(authorizationServerMetadata());
  });

  app.get("/.well-known/openid-configuration", (req, res) => {
    res.json({
      ...authorizationServerMetadata(),
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["none"]
    });
  });

  app.post("/oauth/register", async (req, res) => {
    try {
      const result = registerDynamicClient(req.body || {});

      if (!result.ok) {
        res.status(result.status).json(result.body);
        return;
      }

      await saveOAuthClients();
      res.status(201).json(result.body);
    } catch (error) {
      console.error("OAuth registration error:", error);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/oauth/authorize", (req, res) => {
    const query = req.query || {};
    const validationError = validateAuthRequest(query);

    if (validationError) {
      const redirectUri = String(query.redirect_uri || "");
      const state = String(query.state || "");

      if (redirectUri && isAllowedRedirectUri(redirectUri)) {
        res.redirect(redirectWithError(redirectUri, state, validationError));
        return;
      }

      res.status(400).send(renderAuthorizePage(query, validationError));
      return;
    }

    if (!config.oauthApproveKey) {
      res.status(500).send(renderAuthorizePage(query, "OAUTH_APPROVE_KEY is not configured"));
      return;
    }

    if (!safeEqual(String(query.approve_key || ""), config.oauthApproveKey)) {
      res.status(query.approve_key ? 401 : 200).send(
        renderAuthorizePage(query, query.approve_key ? "授权确认口令错误" : "")
      );
      return;
    }

    const code = issueAuthorizationCode(query);
    const redirectUrl = new URL(String(query.redirect_uri));
    redirectUrl.searchParams.set("code", code);

    if (query.state) {
      redirectUrl.searchParams.set("state", String(query.state));
    }

    res.redirect(redirectUrl.toString());
  });

  app.post("/oauth/token", (req, res) => {
    try {
      if (String(req.body?.grant_type || "") !== "authorization_code") {
        res.status(400).json({ error: "unsupported_grant_type" });
        return;
      }

      const { client_id: authClientId, client_secret: authClientSecret } = getClientAuth(req);
      const code = String(req.body?.code || "");
      const redirectUri = String(req.body?.redirect_uri || "");
      const codeVerifier = String(req.body?.code_verifier || "");
      const resource = stripTrailingSlash(String(req.body?.resource || config.mcpResourceUrl));
      const codeRecord = authCodes.get(code);

      if (!codeRecord || codeRecord.used || Date.now() >= codeRecord.expiresAt) {
        authCodes.delete(code);
        res.status(400).json({ error: "invalid_grant" });
        return;
      }

      const client = oauthClients.get(codeRecord.client_id);

      if (!client || authClientId !== codeRecord.client_id) {
        res.status(401).json({ error: "invalid_client" });
        return;
      }

      if (client.client_secret && !safeEqual(authClientSecret, client.client_secret)) {
        res.status(401).json({ error: "invalid_client" });
        return;
      }

      if (redirectUri !== codeRecord.redirect_uri) {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }

      if (!verifyPkce(codeVerifier, codeRecord.code_challenge)) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "PKCE verification failed"
        });
        return;
      }

      const acceptedResources = new Set([
        stripTrailingSlash(config.mcpResourceUrl),
        stripTrailingSlash(config.publicBaseUrl)
      ]);

      if (resource && !acceptedResources.has(resource)) {
        res.status(400).json({
          error: "invalid_target",
          error_description: "resource is not accepted by this MCP server"
        });
        return;
      }

      codeRecord.used = true;
      authCodes.delete(code);

      const accessToken = randomToken(48);
      const tokenRecord = {
        clientId: codeRecord.client_id,
        scope: codeRecord.scope,
        resource: stripTrailingSlash(codeRecord.resource || config.mcpResourceUrl),
        expiresAt: Date.now() + config.accessTokenTtlSeconds * 1000
      };

      accessTokens.set(accessToken, tokenRecord);

      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: config.accessTokenTtlSeconds,
        scope: tokenRecord.scope.join(" ")
      });
    } catch (error) {
      console.error("OAuth token error:", error);
      res.status(500).json({ error: "server_error" });
    }
  });
}

function registerMcpRoutes(app) {
  const transports = new Map();

  app.post(config.mcpPath, requireAllowedOrigin, requireOAuth, async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"];
      let transport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (newSessionId) => {
            transports.set(newSessionId, transport);
          }
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };

        const server = createReadonlyMcpServer();
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid MCP session"
          },
          id: null
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP POST error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    }
  });

  app.get(config.mcpPath, requireAllowedOrigin, requireOAuth, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      res.status(400).send("Invalid or missing MCP session");
      return;
    }

    await transport.handleRequest(req, res);
  });

  app.delete(config.mcpPath, requireAllowedOrigin, requireOAuth, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      res.status(400).send("Invalid or missing MCP session");
      return;
    }

    await transport.handleRequest(req, res);
  });
}

export function createHttpMcpApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));

  registerHealthRoutes(app);
  registerOAuthRoutes(app);
  registerMcpRoutes(app);

  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: "NOT_FOUND"
    });
  });

  return app;
}
