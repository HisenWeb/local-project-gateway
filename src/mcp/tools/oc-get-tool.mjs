import * as z from "zod/v4";
import { getOpenCodeJob } from "../../oc-jobs.mjs";
import { mcpJsonResult, mcpErrorResult } from "../result.mjs";

export function registerOcGetTool(server) {
  server.registerTool(
    "oc_get",
    {
      title: "Get OpenCode Job Status",
      description: "Retrieve the status and result of a previously submitted OpenCode job.",
      inputSchema: {
        jobId: z.string().min(1)
      }
    },
    async (args) => {
      try {
        return mcpJsonResult(await getOpenCodeJob(args.jobId));
      } catch (error) {
        return mcpErrorResult(error);
      }
    }
  );
}
