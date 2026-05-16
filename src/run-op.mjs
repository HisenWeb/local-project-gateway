import { config } from "./config.mjs";
import { getMissingRunOpImplementations, getRunOpScript } from "./run-op/registry.mjs";
import { runPowerShellScript } from "./run-op/runner.mjs";

export async function runOp({ op }) {
  if (!config.runOpIds.includes(op)) {
    return { ok: false, error: "OP_NOT_ALLOWED", allowed: config.runOpIds };
  }

  const missing = getMissingRunOpImplementations();
  if (missing.length > 0) {
    return { ok: false, error: "RUN_OP_REGISTRY_INCOMPLETE", missing };
  }

  const script = getRunOpScript(op);
  if (!script) {
    return { ok: false, error: "OP_NOT_IMPLEMENTED", op };
  }

  return await runPowerShellScript({ op, script });
}
