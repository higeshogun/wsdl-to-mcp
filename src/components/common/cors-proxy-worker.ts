export const WORKER_SCRIPT = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response("Missing url param", { status: 400 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        }
      });
    }

    const fwdHeaders = new Headers();
    const ct = request.headers.get("Content-Type");
    if (ct) fwdHeaders.set("Content-Type", ct);
    const auth = request.headers.get("Authorization");
    if (auth) fwdHeaders.set("Authorization", auth);
    const accept = request.headers.get("Accept");
    if (accept) fwdHeaders.set("Accept", accept);
    const soapAction = request.headers.get("SOAPAction");
    if (soapAction) fwdHeaders.set("SOAPAction", soapAction);

    const response = await fetch(
      new Request(targetUrl, {
        method: request.method,
        headers: fwdHeaders,
        body: request.body
      })
    );

    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }
}`;
