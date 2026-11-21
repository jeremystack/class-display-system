// POST /api/v1/devices/register —— api.md §4.1（V2.2.20）
// 只做四件事：校验 → 幂等查指纹 → 双闸限流（只对新注册）→ 建行/复用行并签发凭据。
import { ERR, CdsError } from "../lib/errors.js";
import { ok, fail } from "../lib/respond.js";
import { validateRegisterBody, deriveFingerprintKey } from "../lib/validate.js";
import { deviceTokenHash, newDeviceId, newDeviceToken } from "../lib/crypto.js";
import { createLimiter } from "../lib/ratelimit.js";

const SQL_FIND_BY_FP =
  "SELECT device_id, device_name, client_type, fingerprint, token_issued_at, created_at FROM devices WHERE fingerprint = ?1 LIMIT 1";
const SQL_INSERT =
  "INSERT INTO devices (device_id, device_code, code_expires_at, device_name, client_type, fingerprint, user_id, bound_at, last_seen_at, token_hash, token_issued_at, created_at) VALUES (?1, ?2, NULL, ?3, ?4, ?5, NULL, NULL, NULL, ?6, ?7, ?8)";
const SQL_ENSURE_BINDING =
  "INSERT INTO device_bindings (device_id, user_id, bound_at, revoked_at, updated_at) VALUES (?1, NULL, NULL, NULL, ?2) ON CONFLICT(device_id) DO NOTHING";

export async function handleRegister(request, env, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const epochSec = Math.floor(now / 1000);

  let body;
  try {
    body = await request.json();
  } catch {
    throw new CdsError(ERR.BAD_PARAM, "请求体不是合法 JSON");
  }
  const input = validateRegisterBody(body); // 失败抛 2001
  const fpKey = await deriveFingerprintKey(input);

  // 幂等：指纹命中即同一台物理屏，返回同一行、同一 deviceId（api.md §4.1「不计失败」）
  const existing = await env.DB.prepare(SQL_FIND_BY_FP).bind(fpKey).first();
  const limiter = createLimiter(env, now);
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "0.0.0.0";
  const limitedHeaders = { "x-cds-ratelimit": limiter.mode };

  if (!existing) {
    // 闸①：按设备 3 次/分钟（只可能「每次都在造新设备行」时触闸）
    const d = await limiter.fixedWindow("reg_dev", fpKey, 3, 60);
    if (!d.allowed) {
      return fail(ERR.REGISTER_RATE_LIMITED, {
        msg: "注册过于频繁，请稍后重试",
        data: { retryAfter: d.retryAfter, scope: "device" },
        headers: { "retry-after": String(d.retryAfter), ...limitedHeaders },
      });
    }
    // 闸②：按 IP 60 次/分钟、突发 20（不挡教室：30 台屏同一 NAT 也要装得上）
    const g = await limiter.tokenBucket("reg_ip", ip, 1, 20, 60);
    if (!g.allowed) {
      return fail(ERR.REGISTER_RATE_LIMITED, {
        msg: "注册过于频繁，请稍后重试",
        data: { retryAfter: g.retryAfter, scope: "ip" },
        headers: { "retry-after": String(g.retryAfter), ...limitedHeaders },
      });
    }
  }

  if (existing) {
    // 幂等命中：**不重发凭据**（重发＝知道指纹即可劫持屏，见 README D-1）。
    // 屏丢了 token 的恢复路径是「注册为新设备」，文档 §4.1 明写会换 deviceId。
    return ok(
      {
        deviceId: existing.device_id,
        deviceToken: null,
        tokenExpiresIn: 0,
        tokenReissued: false,
        deviceName: existing.device_name,
        clientType: existing.client_type,
      },
      limitedHeaders
    );
  }

  const deviceId = newDeviceId();
  const deviceToken = newDeviceToken();
  const tokenHash = await deviceTokenHash(env, deviceToken);

  const stmt = env.DB.prepare(SQL_INSERT).bind(
    deviceId,
    // device_code 是 0001 留下的 NOT NULL+UNIQUE 历史列：写不可解出的哨兵（0005 附录 1）
    "x" + deviceId.replace(/^dev_/, ""),
    input.deviceName,
    input.clientType,
    fpKey,
    tokenHash,
    epochSec,
    epochSec
  );

  // 建行 + 建绑定空行（两列皆空＝unbound）走 batch：同一事务，避免「有设备没绑定行」
  const batch = [stmt];
  if (typeof env.DB.batch === "function") {
    batch.push(env.DB.prepare(SQL_ENSURE_BINDING).bind(deviceId, epochSec));
    await env.DB.batch(batch);
  } else {
    await stmt.run();
  }

  return ok(
    {
      deviceId,
      deviceToken, // 明文只此一次；库内存哈希
      tokenExpiresIn: 0, // 长期有效，不自动过期
      tokenReissued: true,
      deviceName: input.deviceName,
      clientType: input.clientType,
    },
    limitedHeaders
  );
}
