import { runOp } from "../../run-op.mjs";
import { mcpJsonResult, mcpErrorResult } from "../result.mjs";
import * as z from "zod/v4";
import { config } from "../../config.mjs";

export function registerRunOpTool(server) {
  server.registerTool(
    "run_op",
    {
      title: "Run Diagnostic Operation",
      description: "Run one predefined read-only local diagnostic operation by op id. Does not accept arbitrary shell commands and cannot write files.",
      inputSchema: {
        op: z.enum(config.runOpIds)
      }
    },
    async (args) => {
      try {
        return mcpJsonResult(await runOp(args));
      } catch (error) {
        return mcpErrorResult(error);
      }
    }
  );
}
