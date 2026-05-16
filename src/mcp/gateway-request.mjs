export async function gatewayRequest(url) {
  let response;
  let text;
  let data;

  try {
    response = await fetch(url);
    text = await response.text();

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        ok: false,
        error: "INVALID_GATEWAY_RESPONSE",
        message: "Gateway returned non-JSON response"
      };
    }
  } catch {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: false,
              error: "GATEWAY_UNREACHABLE",
              message: "local-project-gateway HTTP service is not reachable"
            },
            null,
            2
          )
        }
      ]
    };
  }

  const result = {
    status: response.status,
    ...data
  };

  return {
    isError: !response.ok || data.ok === false,
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}
