// 加密原语（零依赖，只用 WebCrypto —— Worker 与 node:20+ 同一套 API）
// 口径来源：api.md §4.1「token 明文只回一次、库内存哈希，不入库明文」

const enc = new TextEncoder();

function toHex(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(String(text)));
  return toHex(d);
}

/** HMAC-SHA256(key, msg) -> hex。key 为空串时退回 sha256(msg)。 */
export async function hmacSha256Hex(key, msg) {
  if (!key) return sha256Hex(msg);
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(key)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(String(msg)));
  return toHex(sig);
}

/** 设备凭据的库内表示。全工程只有这一处定义，运维对账/回填必须调用它。
 *  - 配了 DEVICE_TOKEN_HMAC_KEY ⇒ HMAC-SHA256(token, key)（离线拿到库也无法字典爆破）
 *  - 未配 ⇒ sha256(token)（仅 staging/本地；上线前必须配 key）
 */
export async function deviceTokenHash(env, token) {
  return hmacSha256Hex(env && env.DEVICE_TOKEN_HMAC_KEY, token);
}

/** 随机十六进制串（crypto.getRandomValues） */
export function randomHex(bytes = 16) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return toHex(b);
}

/** deviceId：dev_ + 20 hex。devices.device_id 是 TEXT PK，长度不受限。 */
export function newDeviceId() {
  return "dev_" + randomHex(10);
}

/** 设备凭据明文：cds_ + 40 hex（>=160 bit 熵，不可猜） */
export function newDeviceToken() {
  return "cds_" + randomHex(20);
}

/** 定长比较（避免按字节短路泄露前缀） */
export function timingSafeEqualStr(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
