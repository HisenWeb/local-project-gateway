import * as z from "zod/v4";
import { config } from "../../config.mjs";
import { gatewayRequest } from "../gateway-request.mjs";

export function registerReadFileTool(server) {
  server.registerTool(
    "read_file",
    {
      title: "Read File",
      description: "Read a file from a whitelisted project through the readonly gateway.",
      inputSchema: {
        projectId: z.string().min(1),
        path: z.string().min(1)
      }
    },
    async ({ projectId, path }) => {
      const url = new URL(`/projects/${encodeURIComponent(projectId)}/file`, config.gatewayBaseUrl);
      url.searchParams.set("path", path);
      return gatewayRequest(url);
    }
  );
}
