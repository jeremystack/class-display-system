// 纯逻辑单测：不碰 D1、不碰网络。`npm test` 直接跑。
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import test from "node:test";
import assert from "node:assert/strict";

import {
  sha256Hex,
  deviceTokenHash,
  newDeviceId,
  newDeviceToken,
  randomHex,
  timingSafeEqualStr,
} from "../../src/api/lib/crypto.js";
import { signJwtHS256, verifyJwtHS256, parseBearer } from "../../src/api/lib/jwt.js";
import { validateRegisterBody, deriveFingerprintKey, CLIENT_TYPES } from "../../src/api/lib/validate.js";
import { deriveState, reasonFromAction, isOnline } from "../../src/api/lib/state.js";
import { parseDeviceAuth } from "../../src/api/lib/deviceauth.js";
import { createLimiter } from "../../src/api/lib/ratelimit.js";
import { httpForCode, ERR, CdsError } from "../../src/api/lib/errors.js";

const env = { DEVICE_TOKEN_HMAC_KEY: "k-test", JWT_SECRET: "jwt-test" };

test("crypto：哈希确定、凭据有前缀与足够长度", async () => {
  assert.equal(await sha256Hex("a"), await sha256Hex("a"));
  assert.equal((await sha256Hex("a")).length, 64);
  assert.notEqual(await deviceTokenHash(env, "t1"), await deviceTokenHash(env, "t2"));
  // 无 key 时退回 sha256（staging 兼容），有 key 时必须是 HMAC
  assert.equal(await deviceTokenHash({}, "t1"), await sha256Hex("t1"));
  assert.notEqual(await deviceTokenHash(env, "t1"), await sha256Hex("t1"));
  assert.match(newDeviceId(), /^dev_[0-9a-f]{20}$/);
  assert.match(newDeviceToken(), /^cds_[0-9a-f]{40}$/);
  assert.equal(randomHex(8).length, 16);
  assert.ok(timingSafeEqualStr("abc", "abc"));
  assert.ok(!timingSafeEqualStr("abc", "abd"));
});

test("jwt：签发可验、篡改必拒、过期必拒", async () => {
  const now = 1_700_000_000_000;
  const tok = await signJwtHS256({ sub: "user_001", exp: Math.floor(now / 1000) + 60 }, env.JWT_SECRET);
  const v = await verifyJwtHS256(tok, env.JWT_SECRET, now);
  assert.equal(v.ok, true);
  assert.equal(v.payload.sub, "user_001");

  const [h, p, s] = tok.split(".");
  const tampered = h + "." + p + "." + (s[0] === "a" ? "b" : "a") + s.slice(1);
  assert.equal((await verifyJwtHS256(tampered, env.JWT_SECRET, now)).ok, false);
  assert.equal((await verifyJwtHS256(tok, "other-secret", now)).reason, "sig");

  const expired = await signJwtHS256({ sub: "u", exp: Math.floor(now / 1000) - 1 }, env.JWT_SECRET);
  assert.equal((await verifyJwtHS256(expired, env.JWT_SECRET, now)).reason, "expired");

  const noSub = await signJwtHS256({ exp: Math.floor(now / 1000) + 60 }, env.JWT_SECRET);
  assert.equal((await verifyJwtHS256(noSub, env.JWT_SECRET, now)).reason, "no_sub");
  assert.equal((await verifyJwtHS256("a.b", env.JWT_SECRET, now)).reason, "shape");
  assert.equal((await verifyJwtHS256(tok, "", now)).reason, "no_secret");
});

test("jwt：`Bearer ` 后为空不得当成 token（验收 #72 的空头陷阱）", () => {
  assert.equal(parseBearer("Bearer ").ok, false);
  assert.equal(parseBearer("Bearer ").reason, "empty");
  assert.equal(parseBearer("Bearer    ").reason, "empty");
  assert.equal(parseBearer("").reason, "missing");
  assert.equal(parseBearer("bearer abc").token, "abc");
});

test("register 入参校验：逐字段报错，不吞错误", () => {
  const good = validateRegisterBody({ deviceName: " 教室屏-01 ", clientType: "tv" });
  assert.equal(good.deviceName, "教室屏-01");
  assert.equal(good.clientType, "tv");
  assert.equal(good.fingerprint, null);
  assert.deepEqual(CLIENT_TYPES, ["browser", "tv", "pad"]);

  for (const [body, field] of [
    [{}, "deviceName"],
    [{ deviceName: "   " }, "deviceName"],
    [{ deviceName: "a".repeat(65) }, "deviceName:len>64"],
    [{ deviceName: "x", clientType: "phone" }, "clientType"],
    [{ deviceName: "x", fingerprint: "f".repeat(129) }, "fingerprint:len>128"],
    [{ deviceName: "x", fingerprint: "" }, "fingerprint"],
  ]) {
    assert.throws(
      () => validateRegisterBody(body),
      (e) => e instanceof CdsError && e.code === ERR.BAD_PARAM && (e.extra.data.fields || []).includes(field),
      JSON.stringify(body)
    );
  }
  assert.throws(() => validateRegisterBody(null), (e) => e.code === ERR.BAD_PARAM);
  assert.throws(() => validateRegisterBody([]), (e) => e.code === ERR.BAD_PARAM);
});

test("指纹键：同屏稳定、异屏分开；明文指纹不入库", async () => {
  const a = await deriveFingerprintKey({ deviceName: "屏1", clientType: "browser" });
  const b = await deriveFingerprintKey({ deviceName: "屏1", clientType: "browser" });
  const c = await deriveFingerprintKey({ deviceName: "屏2", clientType: "browser" });
  const d = await deriveFingerprintKey({ deviceName: "屏1", clientType: "tv" });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.match(a, /^f_[0-9a-f]{40}$/);
  const withFp = await deriveFingerprintKey({ deviceName: "屏1", clientType: "browser", fingerprint: "SN-123" });
  assert.ok(!withFp.includes("SN-123"));
});

test("绑定三态：bound / revoked / unbound，「绑还在、码没了」⇒ revoked+code_rotated", () => {
  assert.deepEqual(deriveState({ userId: "u1", boundAt: 1, revokedAt: null }, { codeExists: true }), {
    state: "bound",
    reason: null,
    selfHeal: false,
  });
  assert.deepEqual(deriveState({ userId: "u1", boundAt: 1, revokedAt: null }, { codeExists: false }), {
    state: "revoked",
    reason: "code_rotated",
    selfHeal: true,
  });
  assert.deepEqual(deriveState({ userId: null, boundAt: null, revokedAt: 99 }, {}), {
    state: "revoked",
    reason: null,
    selfHeal: false,
  });
  assert.deepEqual(deriveState({ userId: null, boundAt: null, revokedAt: null }, {}), {
    state: "unbound",
    reason: null,
    selfHeal: false,
  });
  assert.deepEqual(deriveState(null, {}), { state: "unbound", reason: null, selfHeal: false });
});

test("reason 映射：三值互不相同，未知 action 不猜", () => {
  assert.equal(reasonFromAction("kick"), "kicked");
  assert.equal(reasonFromAction("code_rotate"), "code_rotated");
  assert.equal(reasonFromAction("unbind"), "unbind");
  assert.equal(reasonFromAction("auto_unbind"), "unbind");
  assert.equal(reasonFromAction("bind"), null);
  assert.equal(reasonFromAction("whatever"), null);
});

test("online：两条件合取，未知一律判离线", () => {
  const now = 1_700_000_000_000;
  assert.equal(isOnline({ lastSeenAt: now - 1000, hasLiveConnection: true }, now), true);
  assert.equal(isOnline({ lastSeenAt: now - 1000, hasLiveConnection: false }, now), false);
  assert.equal(isOnline({ lastSeenAt: now - 1000, hasLiveConnection: undefined }, now), false);
  assert.equal(isOnline({ lastSeenAt: now - 76_000, hasLiveConnection: true }, now), false);
  assert.equal(isOnline({ lastSeenAt: now - 75_000, hasLiveConnection: true }, now), true);
  assert.equal(isOnline({ lastSeenAt: null, hasLiveConnection: true }, now), false);
});

test("设备凭据解析：空 token 与错 scheme 都不放行", () => {
  assert.equal(parseDeviceAuth("Device cds_" + "a".repeat(40)).ok, true);
  assert.equal(parseDeviceAuth("Device ").reason, "empty");
  assert.equal(parseDeviceAuth("device    ").reason, "empty");
  assert.equal(parseDeviceAuth("Bearer xyzabcxyzabcxyzab").reason, "scheme");
  assert.equal(parseDeviceAuth(null).reason, "missing");
  assert.equal(parseDeviceAuth("Device short").reason, "len");
});

test("限流：设备闸 3 次/分钟后拒绝并给 Retry-After；IP 桶突发 20", async () => {
  const now = 1_700_000_000_000;
  const rl = createLimiter({}, now);
  assert.equal(rl.mode, "memory");
  for (let i = 0; i < 3; i++) {
    const r = await rl.fixedWindow("reg_dev", "fp1", 3, 60);
    assert.equal(r.allowed, true, "第 " + (i + 1) + " 次应放行");
  }
  const denied = await rl.fixedWindow("reg_dev", "fp1", 3, 60);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfter > 0 && denied.retryAfter <= 60);
  assert.equal((await rl.fixedWindow("reg_dev", "fp2", 3, 60)).allowed, true);

  const rl2 = createLimiter({}, now);
  let okCount = 0;
  for (let i = 0; i < 21; i++) if ((await rl2.tokenBucket("reg_ip", "1.2.3.4", 1, 20, 60)).allowed) okCount++;
  assert.equal(okCount, 20);
});

test("限流：KV 绑定时走 KV（mode=kv），计数不落 D1", async () => {
  const kv = new Map();
  const envKv = {
    RATE_KV: {
      async get(k) {
        return kv.get(k) || null;
      },
      async put(k, v) {
        kv.set(k, v);
      },
    },
  };
  const rl = createLimiter(envKv, 1_700_000_000_000);
  assert.equal(rl.mode, "kv");
  const r1 = await rl.fixedWindow("reg_dev", "fp9", 3, 60);
  assert.equal(r1.allowed, true);
  assert.equal(kv.size, 1);
});

test("错误码表与 api.md §9 一致（HTTP 状态）", () => {
  const want = {
    [ERR.OK]: 200,
    [ERR.UNAUTHORIZED]: 401,
    [ERR.NOT_FOUND]: 404,
    [ERR.FORBIDDEN]: 403,
    [ERR.BAD_PARAM]: 400,
    [ERR.INTERNAL]: 500,
    [ERR.DEVICE_OCCUPIED]: 409,
    [ERR.CODE_INVALID]: 400,
    [ERR.CAST_URL_INVALID]: 410,
    [ERR.TOO_MANY_ATTEMPTS]: 429,
    [ERR.AUDIO_LEASED]: 409,
    [ERR.AUDIO_BLOCKED]: 409,
    [ERR.REGISTER_RATE_LIMITED]: 429,
  };
  for (const [code, status] of Object.entries(want)) assert.equal(httpForCode(Number(code)), status, "code " + code);
  assert.equal(httpForCode(ERR.CODE_INVALID), 400); // 不是 410，也不是 401
});
