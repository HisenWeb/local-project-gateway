const fsSync = require("fs");
const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.GATEWAY_HOST || "127.0.0.1";
const PORT = Number(process.env.GATEWAY_PORT || 3333);

const EXAMPLE_PROJECTS_CONFIG = path.join(__dirname, "projects.example.json");
const LOCAL_PROJECTS_CONFIG = path.join(__dirname, "projects.local.json");

const MAX_TREE_DEPTH = 5;
const MAX_TREE_ENTRIES = 1000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES || 10 * 1024 * 1024);

const IMAGE_CONTENT_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"]
]);

const BLOCKED_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "coverage",
  "logs",
  "_agent_jobs"
]);

const BLOCKED_FILE_NAMES = new Set([
  ".npmrc",
  ".yarnrc",
  "id_rsa",
  "id_ed25519",
  "known_hosts",
  "cloudflare-ddns-config.json",
  "oauth-clients.local.json",
  "projects.local.json"
]);

const BLOCKED_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".pfx",
  ".crt"
]);

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function isNotFoundError(error) {
  return error && error.code === "ENOENT";
}

function isPermissionError(error) {
  return error && (error.code === "EACCES" || error.code === "EPERM");
}

function sendInternalError(res) {
  sendJson(res, 500, {
    ok: false,
    error: "INTERNAL_ERROR",
    message: "Unexpected internal error"
  });
}

function resolveProjectsConfigPath() {
  if (process.env.PROJECTS_CONFIG) {
    return path.resolve(process.env.PROJECTS_CONFIG);
  }

  if (fsSync.existsSync(LOCAL_PROJECTS_CONFIG)) {
    return LOCAL_PROJECTS_CONFIG;
  }

  return EXAMPLE_PROJECTS_CONFIG;
}

async function loadProjects() {
  const configPath = resolveProjectsConfigPath();
  const raw = await fs.readFile(configPath, "utf8");
  const config = JSON.parse(raw);
  const configDir = path.dirname(configPath);

  if (!config || !Array.isArray(config.projects)) {
    throw new Error(`${path.basename(configPath)} must contain projects array`);
  }

  return config.projects.map((project) => {
    const rootInput = String(project.root);
    const root = path.isAbsolute(rootInput)
      ? path.resolve(rootInput)
      : path.resolve(configDir, rootInput);

    return {
      id: String(project.id),
      name: String(project.name || project.id),
      root
    };
  });
}

async function findProject(projectId) {
  const projects = await loadProjects();
  return projects.find((project) => project.id === projectId);
}

function isBlockedName(name) {
  const lower = name.toLowerCase();

  if (BLOCKED_DIR_NAMES.has(lower)) return true;
  if (BLOCKED_FILE_NAMES.has(lower)) return true;
  if (lower === ".env" || lower.startsWith(".env.")) return true;
  if (lower.includes(".bak.")) return true;

  const ext = path.extname(lower);
  if (BLOCKED_EXTENSIONS.has(ext)) return true;

  return false;
}

function safeResolveProjectPath(projectRoot, userPath) {
  const input = userPath || "";

  if (input.includes("\0")) {
    throw new Error("Invalid path");
  }

  if (path.isAbsolute(input)) {
    throw new Error("Absolute path is not allowed");
  }

  const normalized = path.normalize(input);

  if (normalized === ".." || normalized.startsWith("..\\") || normalized.startsWith("../")) {
    throw new Error("Path traversal is not allowed");
  }

  const parts = normalized.split(/[\\/]+/).filter(Boolean);

  for (const part of parts) {
    if (isBlockedName(part)) {
      throw new Error(`Blocked path segment: ${part}`);
    }
  }

  const resolved = path.resolve(projectRoot, normalized);
  const relative = path.relative(projectRoot, resolved);

  if (
    relative === ".." ||
    relative.startsWith("..\\") ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Path escapes project root");
  }

  return resolved;
}

function getImageContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_CONTENT_TYPES.get(ext) || "";
}

async function resolveProjectFile(projectId, filePath) {
  const project = await findProject(projectId);

  if (!project) {
    return {
      status: 404,
      error: "PROJECT_NOT_FOUND"
    };
  }

  if (!filePath) {
    return {
      status: 400,
      error: "MISSING_PATH"
    };
  }

  let resolved;

  try {
    resolved = safeResolveProjectPath(project.root, filePath);
  } catch (error) {
    return {
      status: 403,
      error: "FORBIDDEN_PATH",
      message: error.message
    };
  }

  let stat;

  try {
    stat = await fs.stat(resolved);
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        status: 404,
        error: "FILE_NOT_FOUND"
      };
    }

    if (isPermissionError(error)) {
      return {
        status: 403,
        error: "FORBIDDEN_PATH"
      };
    }

    throw error;
  }

  if (!stat.isFile()) {
    return {
      status: 400,
      error: "NOT_A_FILE"
    };
  }

  return {
    status: 200,
    project,
    resolved,
    stat
  };
}

async function buildTree(projectRoot, currentDir, depth, state) {
  if (depth > MAX_TREE_DEPTH) {
    return [];
  }

  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    if (state.count >= MAX_TREE_ENTRIES) {
      break;
    }

    if (isBlockedName(entry.name)) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(projectRoot, fullPath).replaceAll("\\", "/");

    if (entry.isDirectory()) {
      state.count += 1;
      result.push({
        type: "directory",
        name: entry.name,
        path: relativePath,
        children: await buildTree(projectRoot, fullPath, depth + 1, state)
      });
    } else if (entry.isFile()) {
      state.count += 1;
      result.push({
        type: "file",
        name: entry.name,
        path: relativePath
      });
    }
  }

  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

async function handleHealth(req, res) {
  sendJson(res, 200, {
    ok: true,
    service: "local-project-gateway",
    mode: "readonly",
    projectsConfig: path.basename(resolveProjectsConfigPath()),
    limits: {
      maxFileBytes: MAX_FILE_BYTES,
      maxImageBytes: MAX_IMAGE_BYTES
    },
    time: new Date().toISOString()
  });
}

async function handleProjects(req, res) {
  const projects = await loadProjects();

  sendJson(res, 200, {
    ok: true,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name
    }))
  });
}

async function handleProjectTree(req, res, projectId) {
  const project = await findProject(projectId);

  if (!project) {
    sendJson(res, 404, {
      ok: false,
      error: "PROJECT_NOT_FOUND"
    });
    return;
  }

  const state = { count: 0 };
  const tree = await buildTree(project.root, project.root, 0, state);

  sendJson(res, 200, {
    ok: true,
    project: {
      id: project.id,
      name: project.name
    },
    limits: {
      maxDepth: MAX_TREE_DEPTH,
      maxEntries: MAX_TREE_ENTRIES
    },
    truncated: state.count >= MAX_TREE_ENTRIES,
    tree
  });
}

async function handleReadFile(req, res, projectId, url) {
  const filePath = url.searchParams.get("path");
  const result = await resolveProjectFile(projectId, filePath);

  if (result.status !== 200) {
    sendJson(res, result.status, {
      ok: false,
      error: result.error,
      message: result.message
    });
    return;
  }

  if (result.stat.size > MAX_FILE_BYTES) {
    sendJson(res, 413, {
      ok: false,
      error: "FILE_TOO_LARGE",
      maxBytes: MAX_FILE_BYTES,
      actualBytes: result.stat.size
    });
    return;
  }

  let content;

  try {
    content = await fs.readFile(result.resolved, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      sendJson(res, 404, {
        ok: false,
        error: "FILE_NOT_FOUND"
      });
      return;
    }

    if (isPermissionError(error)) {
      sendJson(res, 403, {
        ok: false,
        error: "FORBIDDEN_PATH"
      });
      return;
    }

    throw error;
  }

  sendJson(res, 200, {
    ok: true,
    project: {
      id: result.project.id,
      name: result.project.name
    },
    path: filePath.replaceAll("\\", "/"),
    size: result.stat.size,
    content
  });
}

async function handleReadImage(req, res, projectId, url) {
  const filePath = url.searchParams.get("path");
  const result = await resolveProjectFile(projectId, filePath);

  if (result.status !== 200) {
    sendJson(res, result.status, {
      ok: false,
      error: result.error,
      message: result.message
    });
    return;
  }

  const contentType = getImageContentType(filePath);

  if (!contentType) {
    sendJson(res, 415, {
      ok: false,
      error: "UNSUPPORTED_IMAGE_TYPE",
      allowedExtensions: Array.from(IMAGE_CONTENT_TYPES.keys())
    });
    return;
  }

  if (result.stat.size > MAX_IMAGE_BYTES) {
    sendJson(res, 413, {
      ok: false,
      error: "IMAGE_TOO_LARGE",
      maxBytes: MAX_IMAGE_BYTES,
      actualBytes: result.stat.size
    });
    return;
  }

  let buffer;

  try {
    buffer = await fs.readFile(result.resolved);
  } catch (error) {
    if (isNotFoundError(error)) {
      sendJson(res, 404, {
        ok: false,
        error: "FILE_NOT_FOUND"
      });
      return;
    }

    if (isPermissionError(error)) {
      sendJson(res, 403, {
        ok: false,
        error: "FORBIDDEN_PATH"
      });
      return;
    }

    throw error;
  }

  const base64 = buffer.toString("base64");

  sendJson(res, 200, {
    ok: true,
    project: {
      id: result.project.id,
      name: result.project.name
    },
    path: filePath.replaceAll("\\", "/"),
    size: result.stat.size,
    contentType,
    encoding: "base64",
    base64,
    dataUrl: `data:${contentType};base64,${base64}`
  });
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method !== "GET") {
    sendJson(res, 405, {
      ok: false,
      error: "METHOD_NOT_ALLOWED"
    });
    return;
  }

  if (url.pathname === "/health") {
    await handleHealth(req, res);
    return;
  }

  if (url.pathname === "/projects") {
    await handleProjects(req, res);
    return;
  }

  const treeMatch = url.pathname.match(/^\/projects\/([^/]+)\/tree$/);
  if (treeMatch) {
    await handleProjectTree(req, res, decodeURIComponent(treeMatch[1]));
    return;
  }

  const fileMatch = url.pathname.match(/^\/projects\/([^/]+)\/file$/);
  if (fileMatch) {
    await handleReadFile(req, res, decodeURIComponent(fileMatch[1]), url);
    return;
  }

  const imageMatch = url.pathname.match(/^\/projects\/([^/]+)\/image$/);
  if (imageMatch) {
    await handleReadImage(req, res, decodeURIComponent(imageMatch[1]), url);
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: "NOT_FOUND"
  });
}

const server = http.createServer(async (req, res) => {
  try {
    await router(req, res);
  } catch (error) {
    sendInternalError(res);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`local-project-gateway listening on http://${HOST}:${PORT}`);
  console.log(`projects config: ${resolveProjectsConfigPath()}`);
});
