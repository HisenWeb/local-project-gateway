import { spawn } from "node:child_process";
import { config } from "../config.mjs";
import { redactSensitiveOutput } from "./redact.mjs";

function appendBoundedOutput(current, chunk, child, state) {
  let next = current + chunk.toString("utf8");

  if (Buffer.byteLength(next, "utf8") > config.runOpMaxOutputBytes) {
    state.truncated = true;
    next = next.slice(0, config.runOpMaxOutputBytes) + "\n[OUTPUT_TRUNCATED]";
    child.kill("SIGKILL");
  }

  return next;
}

export async function runPowerShellScript({ op, script }) {
  return await new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      cwd: process.cwd(),
      windowsHide: true,
      shell: false,
      env: { ...process.env }
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const state = { truncated: false };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, config.runOpTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = appendBoundedOutput(stdout, chunk, child, state);
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendBoundedOutput(stderr, chunk, child, state);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, op, error: "SPAWN_FAILED", message: error.message });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        op,
        exitCode: code,
        timedOut,
        truncated: state.truncated,
        stdout: redactSensitiveOutput(stdout),
        stderr: redactSensitiveOutput(stderr)
      });
    });
  });
}
