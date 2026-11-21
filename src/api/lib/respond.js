// 响应包络与 CORS。包络逐字照 api.md §0.2：{code,msg,data,ts}
import { httpForCode, MSG } from "./errors.js";

export function corsHeaders(env, origin) {
  const allowed = String((env && env.ALLOWED_ORIGINS) || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const h = { vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    h["access-control-allow-origin"] = origin;
    h["access-control-allow-credentials"] = "true";
    h["access-control-expose-headers"] = "Retry-After, WWW-Authenticate, X-CDS-RateLimit";
  }
  return h;
}

export function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(extraHeaders || {}),
    },
  });
}

export function envelope(code, data, msg) {
  return {
    code,
    msg: msg || MSG[code] || (code === 0 ? "ok" : "error"),
    data: data === undefined ? null : data,
    ts: Date.now(),
  };
}

/** 成功响应：data 原样进包络 */
export function ok(data, extraHeaders) {
  return jsonResponse(envelope(0, data), 200, extraHeaders);
}

/** 失败响应：HTTP 状态由错误码表推出，headers 可附 WWW-Authenticate / Retry-After */
export function fail(code, opts) {
  const o = opts || {};
  return jsonResponse(envelope(code, o.data === undefined ? null : o.data, o.msg), httpForCode(code), o.headers);
}
