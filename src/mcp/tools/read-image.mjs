import * as z from "zod/v4";
import { config } from "../../config.mjs";

function textResult({ isError, payload }) {
  return {
    isError,
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

export function registerReadImageTool(server) {
  server.registerTool(
    "read_image",
    {
      title: "Read Image",
      description:
        "Read an image from a whitelisted project through the readonly gateway. Returns metadata plus MCP image content.",
      inputSchema: {
        projectId: z.string().min(1),
        path: z.string().min(1)
      }
    },
    async ({ projectId, path }) => {
      const url = new URL(`/projects/${encodeURIComponent(projectId)}/image`, config.gatewayBaseUrl);
      url.searchParams.set("path", path);

      let response;
      let text;
      let data;

      try {
        response = await fetch(url);
        text = await response.text();

        try {
          data = JSON.parse(text);
        } catch {
          return textResult({
            isError: true,
            payload: {
              ok: false,
              status: response.status,
              error: "INVALID_GATEWAY_RESPONSE",
              message: "Gateway returned non-JSON response"
            }
          });
        }
      } catch {
        return textResult({
          isError: true,
          payload: {
            ok: false,
            error: "GATEWAY_UNREACHABLE",
            message: "local-project-gateway HTTP service is not reachable"
          }
        });
      }

      const result = {
        status: response.status,
        ...data
      };

      if (!response.ok || data.ok === false) {
        return textResult({
          isError: true,
          payload: result
        });
      }

      if (!data.base64 || !data.contentType) {
        return textResult({
          isError: true,
          payload: {
            ok: false,
            status: response.status,
            error: "INVALID_GATEWAY_IMAGE_RESPONSE",
            message: "Gateway image response must include base64 and contentType"
          }
        });
      }

      const metadata = {
        ok: true,
        status: response.status,
        project: data.project,
        path: data.path,
        size: data.size,
        contentType: data.contentType,
        encoding: data.encoding || "base64"
      };

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: JSON.stringify(metadata, null, 2)
          },
          {
            type: "image",
            data: data.base64,
            mimeType: data.contentType
          }
        ]
      };
    }
  );
}
