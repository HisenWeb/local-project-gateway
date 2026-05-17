import * as z from "zod/v4";
import { startOpenCodeJob } from "../../oc-jobs.mjs";
import { mcpJsonResult, mcpErrorResult } from "../result.mjs";

export function registerOcRunTool(server) {
  server.registerTool(
    "oc_run",
    {
      title: "Run OpenCode Job",
      description:
        "Start a controlled non-interactive OpenCode job in a whitelisted project. This is not arbitrary shell; callers provide only projectId, prompt, optional timeoutSeconds, and optional model (e.g. deepseek/deepseek-v4-pro or anthropic/claude-sonnet-4-5).",
      inputSchema: {
        projectId: z.string().min(1),
        prompt: z.string().min(1).max(12000),
        timeoutSeconds: z.number().int().positive().max(3600).optional(),
        model: z.string().trim().min(1).max(200).regex(/^[a-zA-Z][a-zA-Z0-9._-]*\/[a-zA-Z][a-zA-Z0-9._-]+$/).optional()
      }
    },
    async (args) => {
      try {
        return mcpJsonResult(await startOpenCodeJob(args));
      } catch (error) {
        return mcpErrorResult(error);
      }
    }
  );
}
