import * as z from "zod/v4";
import { startOpenCodeJob } from "../../oc-jobs.mjs";
import { mcpJsonResult, mcpErrorResult } from "../result.mjs";

export function registerOcRunTool(server) {
  server.registerTool(
    "oc_run",
    {
      title: "Run OpenCode Job",
      description:
        "Start a controlled non-interactive OpenCode job in a whitelisted project. This is not arbitrary shell; callers provide only projectId, prompt, and optional timeoutSeconds.",
      inputSchema: {
        projectId: z.string().min(1),
        prompt: z.string().min(1).max(12000),
        timeoutSeconds: z.number().int().positive().max(3600).optional()
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
