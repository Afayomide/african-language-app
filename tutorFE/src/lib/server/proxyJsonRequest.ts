import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

type ProxyJsonRequestInput = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

type ProxyJsonResponse = {
  status: number;
  data: unknown;
};

const DEFAULT_TIMEOUT_MS = (() => {
  const raw = process.env.AI_PROXY_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return process.env.NODE_ENV === "production" ? 10 * 60 * 1000 : 30 * 60 * 1000;
})();

export async function proxyJsonRequest(input: ProxyJsonRequestInput): Promise<ProxyJsonResponse> {
  const url = new URL(input.url);
  const requestImpl = url.protocol === "https:" ? httpsRequest : httpRequest;
  const rawBody = input.body === undefined ? undefined : JSON.stringify(input.body);

  return await new Promise<ProxyJsonResponse>((resolve) => {
    let settled = false;
    const finish = (response: ProxyJsonResponse) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };

    const req = requestImpl(
      url,
      {
        method: input.method || "POST",
        headers: {
          Accept: "application/json",
          ...(rawBody ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(rawBody).toString() } : {}),
          ...(input.headers || {})
        }
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8").trim();
          let data: unknown = raw.length ? { message: raw } : {};

          if (raw.length) {
            try {
              data = JSON.parse(raw);
            } catch {
              data = { message: raw };
            }
          }

          finish({
            status: res.statusCode || 500,
            data
          });
        });
      }
    );

    req.setTimeout(input.timeoutMs || DEFAULT_TIMEOUT_MS, () => {
      req.destroy(new Error("proxy_request_timeout"));
    });

    req.on("error", (error) => {
      finish({
        status: error.message === "proxy_request_timeout" ? 504 : 502,
        data: {
          message:
            error.message === "proxy_request_timeout"
              ? "Upstream AI generation timed out before the backend responded."
              : error.message || "Upstream request failed."
        }
      });
    });

    if (rawBody) {
      req.write(rawBody);
    }

    req.end();
  });
}
