// CDS API —— 路由入口（dev 分支：devices/register · devices/me · devices/list）
//
// 本文件是「业务端点」的接线层：只做 CORS、路由、异常兜底。
// 业务在 ./routes/*，纯逻辑在 ./lib/*（lib 里的文件不碰 env.DB，可单测）。
//
// ⚠️ /health 的响应体与运维 2026-11-18 部署的骨架**逐字一致**（env/version/db/r2/mqtt/secrets/ts），
//    替换 src/index.js 时不得改动它——运维的探针按这个形状判 200。
import { ok, fail, jsonResponse, corsHeaders } from "./lib/respond.js";
import { CdsError, ERR } from "./lib/errors.js";
import { handleRegister } from "./routes/devices-register.js";
import { handleMe } from "./routes/devices-me.js";
import { handleList } from "./routes/devices-list.js";

function apiPrefix(env) {
  const p = (env && env.API_PREFIX) || "/api/v1";
  return p.replace(/\/+$/, "");
}

async function health(env, headers) {
  let db = "fail";
  try {
    const r = await env.DB.prepare("SELECT 1 AS ok").first();
    db = r && r.ok === 1 ? "ok" : "fail";
  } catch (e) {
    db = "error: " + String((e && e.message) || e).slice(0, 80);
  }

  let r2 = "fail";
  try {
    await env.CAST_BUCKET.list({ limit: 1 });
    r2 = "ok";
  } catch (e) {
    r2 = "error: " + String((e && e.message) || e).slice(0, 80);
  }

  return jsonResponse(
    {
      code: 0,
      data: {
        env: env.ENV,
        version: env.APP_VERSION,
        apiPrefix: env.API_PREFIX,
        db,
        r2,
        mqtt: env.EMQX_URL && env.EMQX_WSS_PORT ? "ok" : "unset",
        secrets: {
          JWT_SECRET: env.JWT_SECRET ? "set" : "missing",
          DEVICE_TOKEN_HMAC_KEY: env.DEVICE_TOKEN_HMAC_KEY ? "set" : "missing",
          EMQX_PASSWORD: env.EMQX_PASSWORD ? "set" : "missing",
        },
        ts: Math.floor(Date.now() / 1000),
      },
    },
    200,
    headers
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(env, origin);

    if (request.method === "OPTIONS") {
      const h = { ...cors, "access-control-max-age": "3600" };
      if (h["access-control-allow-origin"]) {
        h["access-control-allow-methods"] = "GET,POST,PUT,DELETE,OPTIONS";
        h["access-control-allow-headers"] = "Authorization,Content-Type";
      }
      return new Response(null, { status: 204, headers: h });
    }

    const p = url.pathname;
    const prefix = apiPrefix(env);

    try {
      if (p === "/api/v1/health") return await health(env, cors);

      // —— 业务端点（api.md §4）——
      const route = p.startsWith(prefix) ? p.slice(prefix.length) : p;
      if (request.method === "POST" && route === "/devices/register") {
        const res = await handleRegister(request, env);
        return withCors(res, cors);
      }
      if (request.method === "GET" && route === "/devices/me") {
        const res = await handleMe(request, env);
        return withCors(res, cors);
      }
      if (request.method === "GET" && route === "/devices/list") {
        const res = await handleList(request, env);
        return withCors(res, cors);
      }

      return withCors(fail(ERR.NOT_FOUND, { msg: "not found" }), cors);
    } catch (e) {
      if (e instanceof CdsError) {
        const headers = { ...cors, ...(e.extra && e.extra.headers) };
        return fail(e.code, { msg: e.message, data: e.extra && e.extra.data, headers });
      }
      return withCors(fail(ERR.INTERNAL, { msg: "服务器内部错误" }), cors);
    }
  },
};

function withCors(res, cors) {
  const h = new Headers(res.headers);
  for (const k of Object.keys(cors)) h.set(k, cors[k]);
  return new Response(res.body, { status: res.status, headers: h });
}

export { ok };
