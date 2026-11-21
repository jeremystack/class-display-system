// 路由级单测：直接打 worker 的 fetch（含包络、CORS、错误码→HTTP 映射），D1 用 _stub 替身。
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import test from "node:test";
import assert from "node:assert/strict";

import worker from "../../src/api/index.js";
import { makeDb, makeEnv } from "./_stub.mjs";
import { signJwtHS256 } from "../../src/api/lib/jwt.js";
import { ERR } from "../../src/api/lib/errors.js";

async function call(env, path, opts) {
  const o = opts || {};
  const headers = { ...(o.headers || {}) };
  let body;
  if (o.body !== undefined) {
    headers["content-type"] = "application/json";
    body = typeof o.body === "string" ? o.body : JSON.stringify(o.body);
  }
  const res = await worker.fetch(new Request("https://api.test" + path, { method: o.method || "GET", headers, body }), env);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json, headers: res.headers };
}

const cf = { "cf-connecting-ip": "203.0.113.7" };

test("register：新设备 → 200 + 长期凭据；库写哨兵 device_code、哈希而非明文", async () => {
  const db = makeDb((sql) => {
    if (sql.includes("WHERE fingerprint")) return null;
    if (sql.startsWith("INSERT")) return { success: true };
    return undefined;
  });
  const env = makeEnv({ DB: db });
  const r = await call(env, "/api/v1/devices/register", {
    method: "POST",
    body: { deviceName: "教室屏-01", clientType: "tv", fingerprint: "SN-abc" },
    headers: cf,
  });

  assert.equal(r.status, 200);
  assert.equal(r.body.code, 0);
  assert.match(r.body.data.deviceId, /^dev_[0-9a-f]{20}$/);
  assert.match(r.body.data.deviceToken, /^cds_[0-9a-f]{40}$/);
  assert.equal(r.body.data.tokenExpiresIn, 0); // 不自动过期
  assert.equal(r.body.data.tokenReissued, true);
  assert.equal(typeof r.body.ts, "number");

  const ins = db.find("INSERT INTO devices")[0];
  assert.ok(ins, "必须写 devices 行");
  assert.equal(ins.args[1], "x" + r.body.data.deviceId.replace(/^dev_/, ""), "device_code 哨兵");
  assert.equal(ins.args[2], "教室屏-01");
  assert.equal(ins.args[5].length, 64, "库内存 token 哈希");
  assert.notEqual(ins.args[5], r.body.data.deviceToken, "库内不得存明文");
  assert.match(ins.args[4], /^f_[0-9a-f]{40}$/, "指纹先哈希再入库");
  // 建行同时建一条两列皆空的绑定行（unbound）
  assert.equal(db.find("INSERT INTO device_bindings").length, 1);
});

test("register：指纹命中 → 同一 deviceId，但不重发凭据（不得新建行）", async () => {
  const db = makeDb((sql) => {
    if (sql.includes("WHERE fingerprint"))
      return { device_id: "dev_0123456789abcdef0123", device_name: "老屏", client_type: "browser", token_issued_at: 1, created_at: 1 };
    return undefined;
  });
  const env = makeEnv({ DB: db });
  const r = await call(env, "/api/v1/devices/register", { method: "POST", body: { deviceName: "老屏" }, headers: cf });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.deviceId, "dev_0123456789abcdef0123");
  assert.equal(r.body.data.deviceToken, null);
  assert.equal(r.body.data.tokenReissued, false);
  assert.equal(db.find("INSERT INTO devices").length, 0);
});

test("register：非法 JSON / 缺 deviceName → 400 + 2001，并给字段名", async () => {
  const env = makeEnv({ DB: makeDb(() => null) });
  const bad = await call(env, "/api/v1/devices/register", { method: "POST", body: "{not json", headers: cf });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, ERR.BAD_PARAM);

  const noName = await call(env, "/api/v1/devices/register", { method: "POST", body: { clientType: "tv" }, headers: cf });
  assert.equal(noName.status, 400);
  assert.equal(noName.body.code, ERR.BAD_PARAM);
  assert.deepEqual(noName.body.data.fields, ["deviceName"]);
});

test("register：同一出口第 4 台新设备 → 429 + 4097 + Retry-After", async () => {
  const db = makeDb((sql) => {
    if (sql.includes("WHERE fingerprint")) return null;
    if (sql.startsWith("INSERT")) return { success: true };
    return undefined;
  });
  const env = makeEnv({ DB: db });
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const r = await call(env, "/api/v1/devices/register", {
      method: "POST",
      body: { deviceName: "屏-同一台" },
      headers: { "cf-connecting-ip": "198.51.100.9" },
    });
    seen.push(r.body.code);
    if (r.body.code === ERR.REGISTER_RATE_LIMITED) {
      assert.equal(r.status, 429);
      assert.ok(Number(r.headers.get("retry-after")) > 0);
      assert.equal(r.body.data.scope, "device");
    }
  }
  assert.deepEqual(seen, [0, 0, 0, ERR.REGISTER_RATE_LIMITED]);
});

test("me：bound 且码在 → state=bound、userId 回填、boundAt 转毫秒", async () => {
  const db = makeDb((sql) => {
    if (sql.includes("FROM devices WHERE token_hash")) return { device_id: "dev_1", token_hash: "h", last_seen_at: null };
    if (sql.includes("FROM device_bindings")) return { user_id: "user_001", bound_at: 1763350000, revoked_at: null };
    if (sql.includes("FROM control_codes")) return { ok: 1 };
    return undefined;
  });
  const env = makeEnv({ DB: db });
  const r = await call(env, "/api/v1/devices/me", { headers: { authorization: "Device cds_" + "a".repeat(40) } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, { deviceId: "dev_1", state: "bound", userId: "user_001", boundAt: 1763350000000, reason: null });
});

test("me：绑还在、码没了 → revoked + code_rotated（V2.2.15），标 selfHeal 待补副作用", async () => {
  const db = makeDb((sql) => {
    if (sql.includes("FROM devices WHERE token_hash")) return { device_id: "dev_1", token_hash: "h", last_seen_at: null };
    if (sql.includes("FROM device_bindings")) return { user_id: "user_001", bound_at: 1, revoked_at: null };
    if (sql.includes("FROM control_codes")) return null;
    return undefined;
  });
  const env = makeEnv({ DB: db });
  const r = await call(env, "/api/v1/devices/me", { headers: { authorization: "Device cds_" + "b".repeat(40) } });
  assert.equal(r.body.data.state, "revoked");
  assert.equal(r.body.data.reason, "code_rotated");
  assert.equal(r.body.data.userId, null);
  assert.equal(r.headers.get("x-cds-selfheal"), "pending");
});

test("me：revoked 的 reason 从审计最近一条反推（kick → kicked）", async () => {
  const db = makeDb((sql) => {
    if (sql.includes("FROM devices WHERE token_hash")) return { device_id: "dev_1", token_hash: "h", last_seen_at: null };
    if (sql.includes("FROM device_bindings")) return { user_id: null, bound_at: 5, revoked_at: 9 };
    if (sql.includes("FROM device_bind_events")) return { action: "kick", created_at: 9 };
    return undefined;
  });
  const env = makeEnv({ DB: db });
  const r = await call(env, "/api/v1/devices/me", { headers: { authorization: "Device cds_" + "c".repeat(40) } });
  assert.equal(r.body.data.state, "revoked");
  assert.equal(r.body.data.reason, "kicked");
});

test("me：凭据不认识 / 空头 / 错 scheme / 缺头 → 401 + 1001 + WWW-Authenticate: Device", async () => {
  const env = makeEnv({ DB: makeDb(() => null) });
  for (const auth of ["Device cds_" + "d".repeat(40), "Device ", "Bearer " + "e".repeat(40), null]) {
    const r = await call(env, "/api/v1/devices/me", { headers: auth ? { authorization: auth } : {} });
    assert.equal(r.status, 401, "auth=" + auth);
    assert.equal(r.body.code, ERR.UNAUTHORIZED);
    assert.equal(r.headers.get("www-authenticate"), "Device");
  }
});

test("list：形状照 §4.4（五字段）；无 broker 桥时 online 恒 false 并标 online-source", async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const db = makeDb((sql) => {
    if (sql.includes("FROM device_bindings b")) {
      return [
        { device_id: "dev_1", device_name: "屏1", last_seen_at: nowSec - 5 },
        { device_id: "dev_2", device_name: "屏2", last_seen_at: null },
      ];
    }
    return undefined;
  });
  const env = makeEnv({ DB: db });
  const jwt = await signJwtHS256({ sub: "user_001", exp: nowSec + 3600 }, env.JWT_SECRET);
  const r = await call(env, "/api/v1/devices/list", { headers: { authorization: "Bearer " + jwt } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 2);
  assert.deepEqual(Object.keys(r.body.data[0]).sort(), ["deviceId", "deviceName", "lastSeenAt", "nowPlaying", "online"]);
  assert.equal(r.body.data[0].online, false, "缺 broker 存活判据时不得判在线");
  assert.equal(r.body.data[0].nowPlaying, null);
  assert.equal(r.headers.get("x-cds-online-source"), "lastSeenOnly");
  assert.equal(db.find("WHERE b.user_id")[0].args[0], "user_001");
});

test("list：配了 PRESENCE_KV 且心跳新鲜 → online=true", async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const db = makeDb((sql) => {
    if (sql.includes("FROM device_bindings b")) return [{ device_id: "dev_1", device_name: "屏1", last_seen_at: nowSec - 3 }];
    return undefined;
  });
  const env = makeEnv({
    DB: db,
    PRESENCE_KV: {
      async get(k) {
        return k === "presence:dev_1" ? "1" : null;
      },
    },
  });
  const jwt = await signJwtHS256({ sub: "user_001", exp: nowSec + 3600 }, env.JWT_SECRET);
  const r = await call(env, "/api/v1/devices/list", { headers: { authorization: "Bearer " + jwt } });
  assert.equal(r.body.data[0].online, true);
  assert.equal(r.headers.get("x-cds-online-source"), "kv+lastSeen");
});

test("list：JWT 无效 / 过期 / 缺头 → 401", async () => {
  const env = makeEnv({ DB: makeDb(() => []) });
  const nowSec = Math.floor(Date.now() / 1000);
  const expired = await signJwtHS256({ sub: "u", exp: nowSec - 1 }, env.JWT_SECRET);
  for (const auth of ["Bearer " + expired, "Bearer junk", null]) {
    const r = await call(env, "/api/v1/devices/list", { headers: auth ? { authorization: auth } : {} });
    assert.equal(r.status, 401, "auth=" + auth);
    assert.equal(r.body.code, ERR.UNAUTHORIZED);
  }
});

test("未知路径 → 404 + 1002；CORS 只回给白名单 origin", async () => {
  const env = makeEnv({ DB: makeDb(() => null) });
  const r = await call(env, "/api/v1/nope");
  assert.equal(r.status, 404);
  assert.equal(r.body.code, ERR.NOT_FOUND);

  const ok = await call(env, "/api/v1/nope", { headers: { origin: "https://cds.242500.xyz" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://cds.242500.xyz");

  const deny = await call(env, "/api/v1/nope", { headers: { origin: "https://evil.example" } });
  assert.equal(deny.headers.get("access-control-allow-origin"), null);
});

test("/health 响应体与运维骨架同形（探针按它判 200）", async () => {
  const env = makeEnv({
    DB: makeDb(() => ({ ok: 1 })),
    CAST_BUCKET: {
      async list() {
        return { objects: [] };
      },
    },
    EMQX_URL: "wss://x",
    EMQX_WSS_PORT: "8084",
    EMQX_PASSWORD: "p",
  });
  const r = await call(env, "/api/v1/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.code, 0);
  assert.deepEqual(Object.keys(r.body.data).sort(), [
    "apiPrefix",
    "db",
    "env",
    "mqtt",
    "r2",
    "secrets",
    "ts",
    "version",
  ]);
  assert.equal(r.body.data.db, "ok");
  assert.equal(r.body.data.r2, "ok");
  assert.equal(r.body.data.secrets.DEVICE_TOKEN_HMAC_KEY, "set");
});
