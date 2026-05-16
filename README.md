# Local Project Gateway

This repository contains a readonly local project gateway and an OAuth-protected HTTP MCP server for ChatGPT custom MCP integration.

## Architecture Overview

- **ChatGPT**: Total control, code review, and result validation.
- **Local Coding Agent**: Writes files, runs commands, installs services, and performs local execution that MCP should not perform.
- **HTTP MCP Server**: Readonly project observation plus predefined readonly diagnostic `run_op` commands.

The MCP server must not become a remote execution layer. It does not expose remote file write, delete, arbitrary shell, `git pull`, `npm install`, or service-install operations.

## Current File Layout

```text
server.js                 # readonly local project gateway on 127.0.0.1:3333
mcp-http-server.mjs        # small HTTP MCP bootstrap entry
src/dotenv-local.mjs       # .env.local loader
src/config.mjs             # HTTP MCP config and constants
src/oauth.mjs              # OAuth / DCR / token logic
src/run-op.mjs             # readonly diagnostic run_op implementation
src/mcp-tools.mjs          # MCP tool registration
src/http-app.mjs           # Express app and routes
projects.json              # demo project config
projects.local.json        # local-only project config, ignored by git
.env.example               # safe env template
.env.local                 # local-only env config, ignored by git
```

## Projects Configuration

Config priority:

1. `PROJECTS_CONFIG` env var if set
2. `projects.local.json` if present
3. `projects.json` as demo fallback

Use `projects.local.json` for real local absolute paths:

```json
{
  "projects": [
    {
      "id": "demo",
      "name": "Demo Project",
      "root": "D:\\local-project-gateway\\demo-project"
    }
  ]
}
```

Do not commit `projects.local.json`.

## MCP Endpoint

- MCP path: `/mcp`
- Public resource URL: `MCP_PUBLIC_BASE_URL` + `MCP_PATH`
- `GET /mcp` without token returning `401 authorization_required` is expected.

Health and readonly gateway endpoints:

```text
GET /health
GET /projects
GET /projects/:id/tree
GET /projects/:id/file?path=...
```

MCP tools:

```text
list_projects
list_tree
read_file
run_op
```

`run_op` is readonly diagnostics only:

```text
check_env
check_ports
health_check
tail_logs
git_remote
git_status
git_log_latest
status_services
```

## OAuth

- OAuth is enabled by default.
- Disable only for local debugging with `OAUTH_ENABLED=0`.
- Set local approval key in `.env.local` via `OAUTH_APPROVE_KEY`.
- DCR clients are stored in `oauth-clients.local.json`, which is ignored by git.
- Allowed redirect origins include ChatGPT and local loopback origins.

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

Blocked readonly gateway paths include env files, local OAuth clients, local project config, `.git`, `node_modules`, logs, agent jobs, private keys, and certificate/key files.

## Install / Refresh Dependencies

After dependency changes, refresh the lock file locally:

```bash
npm install --package-lock-only
npm install
```

## Local Startup

Start the readonly gateway:

```bash
npm run gateway
```

Start the HTTP MCP server:

```bash
npm run mcp:http
```

Run static syntax checks:

```bash
npm run check
```

Check local health:

```bash
curl -i http://127.0.0.1:3333/health
curl -i http://127.0.0.1:3334/health
```

Check public tunnel health:

```bash
curl -i https://mcp.example.com/health
curl -i https://mcp.example.com/mcp
```

Expected public `/mcp` result without token:

```text
401 authorization_required
```

## ChatGPT + Local Agent Workflow

1. ChatGPT reviews code, architecture, diffs, and evidence.
2. Local coding agent performs file writes, commands, installs, and restarts.
3. MCP `run_op` provides fixed readonly diagnostics only.
4. ChatGPT reviews evidence and requests rework if needed.
5. User accepts only after review passes.
