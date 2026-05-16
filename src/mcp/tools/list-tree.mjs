import * as z from "zod/v4";
import { config } from "../../config.mjs";
import { gatewayRequest } from "../gateway-request.mjs";

export function registerListTreeTool(server) {
  server.registerTool(
    "list_tree",
    {
      title: "List Project Tree",
      description: "List the readonly file tree for a whitelisted project.",
      inputSchema: {
        projectId: z.string().min(1)
      }
    },
    async ({ projectId }) => {
      const url = new URL(`/projects/${encodeURIComponent(projectId)}/tree`, config.gatewayBaseUrl);
      return gatewayRequest(url);
    }
  );
}
