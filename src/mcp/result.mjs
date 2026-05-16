export function mcpJsonResult(result) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

export function mcpErrorResult(error) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ok: false,
            error: error?.message || "MCP_TOOL_ERROR"
          },
          null,
          2
        )
      }
    ]
  };
}
