# Local Project Gateway

Local project gateway plus OAuth-protected HTTP MCP endpoint for ChatGPT custom MCP integration.

## Architecture

- **ChatGPT**: control, review, and validation.
- **Local coding agent / user shell**: writes files, runs mutating commands, installs dependencies, and manages services.
- **HTTP MCP server**: readonly project observation, predefined readonly diagnostics, and controlled OpenCode execution.

The MCP server is not a remote shell. It must not expose remote file write, delete, arbitrary shell, caller-supplied command / args / cwd, automatic git commit / push, npm install, service install, token, ssh key, or env file access.

## File Layout

```text
server.js                              # readonly local project gateway on 127.0.0.1:3333
mcp-http-server.mjs                     # HTTP MCP bootstrap entry
scripts/start-local.mjs                 # starts gateway + MCP, optionally cloudflared
src/dotenv-local.mjs                    # .env.local loader
src/config.mjs                          # HTTP MCP config and constants
src/projects.mjs                        # shared project whitelist loader
src/oauth.mjs                           # OAuth / DCR / token logic
src/run-op.mjs                          # thin run_op entrypoint
src/run-op/registry.mjs                 # run_op id -> diagnostic script registry
src/run-op/runner.mjs                   # bounded PowerShell diagnostic runner
src/run-op/redact.mjs                   # diagnostic output redaction
src/run-op/scripts/common.mjs           # shared PowerShell script helpers
src/run-op/scripts/system.mjs           # system / process / health diagnostics
src/run-op/scripts/network.mjs          # DNS and proxy diagnostics
src/run-op/scripts/gateway.mjs          # gateway config and smoke diagnostics
src/run-op/scripts/oauth.mjs            # OAuth and public MCP diagnostics
src/run-op/scripts/logs.mjs             # bounded log tail diagnostics
src/run-op/scripts/cloudflared.mjs      # Cloudflare Tunnel diagnostics
src/run-op/scripts/git.mjs              # readonly git diagnostics
src/run-op/scripts/npm.mjs              # readonly npm diagnostics
src/oc-jobs.mjs                         # controlled OpenCode job runner
src/http-app.mjs                        # Express app and routes
src/mcp/result.mjs                      # MCP result helpers
src/mcp/gateway-request.mjs             # gateway request helper
src/mcp/server.mjs                      # MCP server factory
src/mcp/tools/list-projects.mjs         # list_projects tool
src/mcp/tools/list-tree.mjs             # list_tree tool
src/mcp/tools/read-file.mjs             # read_file tool
src/mcp/tools/read-image.mjs            # read_image tool
src/mcp/tools/run-op-tool.mjs           # run_op tool
src/mcp/tools/oc-run-tool.mjs           # oc_run tool
src/mcp/tools/oc-get-tool.mjs           # oc_get tool
projects.example.json                   # safe empty example project config
projects.local.json                     # local-only project config, ignored by git
.env.example                            # safe env template
.env.local                              # local-only env config, ignored by git
```

## Project Configuration

Config priority:

1. `PROJECTS_CONFIG` env var if set
2. `projects.local.json` if present
3. `projects.example.json` as safe empty fallback

Use `projects.local.json` for real local absolute paths:

```json
{
  "projects": [
    {
      "id": "my-project",
      "name": "My Project",
      "root": "D:\\path\\to\\project",
      "model": "deepseek/deepseek-v4-pro"
    }
  ]
}
```

The optional `model` field sets the default OpenCode model for the project (e.g. `deepseek/deepseek-v4-pro` or `anthropic/claude-sonnet-4-5`). The `oc_run` `model` argument overrides this per job. If neither is set, OpenCode runs without a `-m` flag and uses its own defaults.

Do not commit `projects.local.json`.

## Gateway Endpoints

```text
GET /health
GET /projects
GET /projects/:id/tree
GET /projects/:id/file?path=...
GET /projects/:id/image?path=...
```

The gateway is readonly. It blocks sensitive paths such as env files, local OAuth clients, local project config, `.git`, `node_modules`, logs, agent jobs, private keys, and certificate/key files.

## MCP Endpoint

- MCP path: `/mcp`
- Public resource URL: `MCP_PUBLIC_BASE_URL` + `MCP_PATH`
- `GET /mcp` without token returning `401 authorization_required` is expected.

MCP tools:

```text
list_projects
list_tree
read_file
read_image
run_op
oc_run
oc_get
```

`read_image` reads supported image files through the existing readonly gateway image endpoint. It returns a small JSON metadata text block plus MCP image content using base64 data and the detected MIME type.

`read_file` and `read_image` cannot access `_agent_jobs`. `oc_get` is the dedicated bounded channel for reading OpenCode job status and output.

## run_op Diagnostics

`run_op` is readonly diagnostics only. It uses fixed operation IDs, not arbitrary shell input.

The public operation list lives in `src/config.mjs` as `runOpIds`. Runtime implementation is centralized in `src/run-op/registry.mjs`, which maps each allowed operation ID to a diagnostic script builder. `src/run-op.mjs` checks the registry for missing implementations before executing an operation, so a whitelist / implementation mismatch returns `RUN_OP_REGISTRY_INCOMPLETE` instead of silently exposing a broken op.

Current diagnostic groups include:

```text
diagnose_all
check_env
check_ports
process_node
health_check
gateway_smoke
mcp_public_smoke
oauth_metadata_check
oauth_client_check
dns_check
dns_local_check
cloudflared_diagnose
cloudflared_service_detail
cloudflared_config_check
cloudflared_ingress_check
network_proxy_check
tail_logs
git_remote
git_status
git_log_latest
git_diff_summary
npm_project_check
npm_dependency_check
gateway_config_check
status_services
```

Output is bounded and redacted for common token, secret, password, private-key, and credentials-path patterns.

## OpenCode Bridge

`oc_run` is a controlled OpenCode execution bridge. It is not arbitrary shell.

`oc_run` accepts only:

```json
{
  "projectId": "my-project",
  "prompt": "Run a small validation task and report the result.",
  "timeoutSeconds": 1800,
  "model": "deepseek/deepseek-v4-pro"
}
```

The `model` field is optional. If provided it overrides the project default model. If neither is set, OpenCode runs without a `-m` flag.

Execution is fixed to this shape:

```text
opencode run --dir <projectRoot> <prompt>
```

Security boundaries:

- `projectId` must exist in the project whitelist config.
- The caller cannot pass command, args, shell string, or arbitrary cwd.
- `prompt` is capped at 12000 characters for the first Windows-safe implementation.
- `timeoutSeconds` defaults to 1800 and is capped at 3600.
- The bridge does not automatically git commit, git push, npm install, or install services.
- A safety prefix is injected before the user prompt to tell OpenCode not to read or print env variables, tokens, secrets, SSH keys, private keys, OAuth credentials, Cloudflare credentials, or local credential files.
- stdout, stderr, and result text are written under `_agent_jobs/` with redaction applied.
- `oc_get` returns bounded tails only: stdout up to 8000 characters, stderr up to 8000 characters, and result text up to 12000 characters.

`oc_run` returns a `jobId`. `oc_get` accepts that `jobId` and returns status:

```text
queued
running
done
failed
timeout
```

`done` only means the OpenCode process exited with code 0. It does not mean ChatGPT review passed.

## OAuth

- OAuth is enabled by default.
- Disable only for local debugging with `OAUTH_ENABLED=0`.
- Set local approval key in `.env.local` via `OAUTH_APPROVE_KEY`.
- DCR clients are stored in `oauth-clients.local.json`, which is ignored by git.

## Cloudflare Tunnel

Use `.env.local` for real tunnel values:

```env
MCP_PUBLIC_BASE_URL=https://mcp.example.com
CLOUDFLARED_EXE=D:\\cloudflared\\cloudflared.exe
CLOUDFLARED_LOG=D:\\cloudflared\\cloudflared.log
CLOUDFLARED_TUNNEL=replace-with-your-tunnel-uuid-or-name
START_CLOUDFLARED=0
```

`npm start` starts only local gateway + MCP HTTP. `npm run start:public` starts local gateway + MCP HTTP + cloudflared.

## Security Notes

Do not commit:

```text
.env.local
oauth-clients.local.json
projects.local.json
logs/
_agent_jobs/
*.bak.*
```

`.env.example` must use placeholders only. Real domain names, tunnel IDs, tokens, OAuth secrets, and local project paths belong only in ignored local files.

## Install / Refresh Dependencies

```bash
npm install
```

After dependency changes, refresh the lock file locally:

```bash
npm install --package-lock-only
```

## Local Startup

Run static syntax checks:

```bash
npm run check
```

`npm run check` covers the gateway, MCP server, OAuth modules, shared project whitelist loader, OpenCode bridge, all split `run_op` modules under `src/run-op/`, and MCP tool modules.

Start local gateway + MCP HTTP:

```bash
npm start
```

Start local gateway + MCP HTTP + cloudflared:

```bash
npm run start:public
```

Optional low-level single-service commands:

```bash
npm run gateway
npm run mcp:http
```

Check local health:

```bash
curl -i http://127.0.0.1:3333/health
curl -i http://127.0.0.1:3334/health
```

Check public tunnel health with your real public domain from `.env.local`:

```bash
curl -i https://mcp.example.com/health
curl -i https://mcp.example.com/mcp
```

Expected public `/mcp` result without token:

```text
401 authorization_required
```

## Workflow

1. ChatGPT reviews code, architecture, diffs, and evidence.
2. Local coding agent or user shell performs file writes, mutating commands, installs, and restarts.
3. MCP provides readonly observation, fixed readonly diagnostics, and controlled OpenCode execution.
4. ChatGPT reads bounded OpenCode job output through `oc_get` and requests rework if needed.
5. User accepts only after review passes.
