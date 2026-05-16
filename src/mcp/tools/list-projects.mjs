import { config } from "../../config.mjs";
import { gatewayRequest } from "../gateway-request.mjs";

export function registerListProjectsTool(server) {
  server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description: "List readonly whitelisted local projects.",
      inputSchema: {}
    },
    async () => {
      const url = new URL("/projects", config.gatewayBaseUrl);
      return gatewayRequest(url);
    }
  );
}
