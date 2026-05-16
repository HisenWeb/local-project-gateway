import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { findProject } from "./projects.mjs";
import { redactSensitiveOutput } from "./run-op/redact.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jobsRoot = path.join(repoRoot, "_agent_jobs");

const JOB_ID_RE = /^oc-\d{8}-\d{6}-[a-f0-9]{6}$/;
const DEFAULT_TIMEOUT_SECONDS = 1800;
const MAX_TIMEOUT_SECONDS = 3600;
const STDOUT_TAIL_CHARS = 8000;
const STDERR_TAIL_CHARS = 8000;
const RESULT_TEXT_CHARS = 12000;
const MAX_PROMPT_CHARS = 12_000;
const SAFETY_PREFIX = `Safety boundary for this local OpenCode job:
- Do not read, print, copy, or summarize environment variables, tokens, secrets, SSH keys, private keys, OAuth credentials, Cloudflare credentials, or local credential files.
- Do not run git commit, git push, npm install, service install, or destructive commands unless the user explicitly requested that outside this bridge.
- Keep the result focused on the requested work and validation evidence.`;

function isoCompact(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function createJobId() {
  return `oc-${isoCompact(new Date())}-${randomBytes(3).toString("hex")}`;
}

function assertSafeJobId(jobId) {
  if (!JOB_ID_RE.test(String(jobId || ""))) {
    throw new Error("INVALID_JOB_ID");
  }
}

function clampTimeoutSeconds(value) {
  const parsed = Number(value || DEFAULT_TIMEOUT_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_SECONDS;
  return Math.min(Math.floor(parsed), MAX_TIMEOUT_SECONDS);
}

function nowIso() {
  return new Date().toISOString();
}

async function writeJsonAtomic(filePath, value) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readStatusFile(jobDir) {
  try {
    return await readJsonFile(path.join(jobDir, "status.json"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error("JOB_NOT_FOUND");
    }
    throw error;
  }
}

async function appendRedactedLog(filePath, chunk) {
  const text = redactSensitiveOutput(chunk.toString("utf8"));
  await fs.appendFile(filePath, text, "utf8");
}

async function readTail(filePath, maxChars) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return redactSensitiveOutput(raw.slice(-maxChars));
  } catch (error) {
    if (error && error.code === "ENOENT") return "";
    throw error;
  }
}

async function readResultText(jobDir, stdoutTail) {
  try {
    const raw = await fs.readFile(path.join(jobDir, "result.txt"), "utf8");
    return redactSensitiveOutput(raw.slice(-RESULT_TEXT_CHARS));
  } catch (error) {
    if (error && error.code === "ENOENT") return stdoutTail.slice(-RESULT_TEXT_CHARS);
    throw error;
  }
}

async function updateStatus(jobDir, patch) {
  const statusPath = path.join(jobDir, "status.json");
  const current = await readJsonFile(statusPath);
  const next = { ...current, ...patch };
  await writeJsonAtomic(statusPath, next);
  return next;
}

function opencodeCommand() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  return process.platform === "win32" ? "opencode.cmd" : "opencode";
}

function buildEffectivePrompt(prompt) {
  return `${SAFETY_PREFIX}\n\nUser task:\n${prompt}`;
}

export async function startOpenCodeJob({ projectId, prompt, timeoutSeconds }) {
  const normalizedProjectId = String(projectId || "").trim();
  const normalizedPrompt = String(prompt || "").trim();

  if (!normalizedProjectId) {
    throw new Error("PROJECT_ID_REQUIRED");
  }

  if (!normalizedPrompt) {
    throw new Error("PROMPT_REQUIRED");
  }

  if (normalizedPrompt.length > MAX_PROMPT_CHARS) {
    throw new Error("PROMPT_TOO_LARGE");
  }

  const project = await findProject(normalizedProjectId);
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const effectivePrompt = buildEffectivePrompt(normalizedPrompt);
  const timeout = clampTimeoutSeconds(timeoutSeconds);
  const jobId = createJobId();
  const jobDir = path.join(jobsRoot, jobId);
  const createdAt = nowIso();

  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, "prompt.txt"), normalizedPrompt, "utf8");
  await fs.writeFile(path.join(jobDir, "effective-prompt.txt"), effectivePrompt, "utf8");

  const baseStatus = {
    jobId,
    projectId: project.id,
    status: "queued",
    pid: null,
    createdAt,
    startedAt: null,
    lastOutputAt: null,
    finishedAt: null,
    exitCode: null,
    errorMessage: null
  };

  await writeJsonAtomic(path.join(jobDir, "job.json"), {
    jobId,
    projectId: project.id,
    command: "opencode run --dir <projectRoot> <prompt>",
    timeoutSeconds: timeout,
    createdAt
  });
  await writeJsonAtomic(path.join(jobDir, "status.json"), baseStatus);
  await fs.writeFile(path.join(jobDir, "stdout.log"), "", "utf8");
  await fs.writeFile(path.join(jobDir, "stderr.log"), "", "utf8");
  await fs.writeFile(path.join(jobDir, "result.txt"), "", "utf8");

  const child = spawn(opencodeCommand(), ["run", "--dir", project.root, effectivePrompt], {
    cwd: project.root,
    shell: false,
    windowsHide: true,
    env: { ...process.env }
  });

  let finished = false;
  let timedOut = false;

  await updateStatus(jobDir, {
    status: "running",
    pid: child.pid || null,
    startedAt: nowIso()
  });

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    if (!finished) {
      child.kill("SIGKILL");
    }
  }, timeout * 1000);

  child.stdout.on("data", (chunk) => {
    const at = nowIso();
    appendRedactedLog(path.join(jobDir, "stdout.log"), chunk).catch(() => {});
    appendRedactedLog(path.join(jobDir, "result.txt"), chunk).catch(() => {});
    updateStatus(jobDir, { lastOutputAt: at }).catch(() => {});
  });

  child.stderr.on("data", (chunk) => {
    const at = nowIso();
    appendRedactedLog(path.join(jobDir, "stderr.log"), chunk).catch(() => {});
    updateStatus(jobDir, { lastOutputAt: at }).catch(() => {});
  });

  child.on("error", (error) => {
    clearTimeout(timeoutTimer);
    finished = true;
    updateStatus(jobDir, {
      status: "failed",
      finishedAt: nowIso(),
      exitCode: null,
      errorMessage: error?.message || "SPAWN_FAILED"
    }).catch(() => {});
  });

  child.on("close", (code) => {
    if (finished && !timedOut) return;
    clearTimeout(timeoutTimer);
    finished = true;
    updateStatus(jobDir, {
      status: timedOut ? "timeout" : code === 0 ? "done" : "failed",
      finishedAt: nowIso(),
      exitCode: code,
      errorMessage: timedOut ? "OpenCode job timed out" : code === 0 ? null : `OpenCode exited with code ${code}`
    }).catch(() => {});
  });

  return {
    jobId,
    status: "running",
    message: "OpenCode job started"
  };
}

export async function getOpenCodeJob(jobId) {
  assertSafeJobId(jobId);

  const jobDir = path.join(jobsRoot, jobId);
  const relative = path.relative(jobsRoot, jobDir);

  if (relative === ".." || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("INVALID_JOB_ID");
  }

  const status = await readStatusFile(jobDir);
  const stdoutTail = await readTail(path.join(jobDir, "stdout.log"), STDOUT_TAIL_CHARS);
  const stderrTail = await readTail(path.join(jobDir, "stderr.log"), STDERR_TAIL_CHARS);
  const resultText = await readResultText(jobDir, stdoutTail);

  return {
    jobId: status.jobId,
    status: status.status,
    projectId: status.projectId,
    createdAt: status.createdAt,
    startedAt: status.startedAt,
    lastOutputAt: status.lastOutputAt,
    finishedAt: status.finishedAt,
    exitCode: status.exitCode,
    errorMessage: status.errorMessage,
    stdoutTail,
    stderrTail,
    resultText
  };
}
