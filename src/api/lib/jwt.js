// HS256 JWT 校验（控制端凭据；零依赖，WebCrypto）
// 只用于 /devices/list 这类控制端接口；设备端一律走 Authorization: Device（api.md §0.1）

function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

function bytesToB64url(bytes) {
  const b = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 仅测试与本地签发用 */
export async function signJwtHS256(payload, secret) {
  const head = bytesToB64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + bytesToB64url(sig);
}

/**
 * @returns {Promise<{ok:true,payload:object}|{ok:false,reason:string}>}
 * 失败原因只用于日志，对外一律 1001（不泄露是哪一步失效）
 */
export async function verifyJwtHS256(token, secret, nowMs) {
  if (!token || typeof token !== "string") return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "shape" };
  if (!secret) return { ok: false, reason: "no_secret" };

  let head;
  let payload;
  try {
    head = b64urlToJson(parts[0]);
    payload = b64urlToJson(parts[1]);
  } catch {
    return { ok: false, reason: "decode" };
  }
  if (!head || head.alg !== "HS256") return { ok: false, reason: "alg" };

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const okSig = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
  if (!okSig) return { ok: false, reason: "sig" };

  const now = Math.floor((nowMs === undefined ? Date.now() : nowMs) / 1000);
  if (typeof payload.exp === "number" && now > payload.exp) return { ok: false, reason: "expired" };
  if (typeof payload.nbf === "number" && now + 60 < payload.nbf) return { ok: false, reason: "nbf" };
  if (!payload.sub) return { ok: false, reason: "no_sub" };
  return { ok: true, payload };
}

/** 从 Authorization 头取 Bearer token；`Bearer ` 后为空视为无值（api.md 附录 #72 那类空头陷阱） */
export function parseBearer(headerValue) {
  const v = String(headerValue || "");
  if (/^bearer$/i.test(v.trim())) return { ok: false, reason: "empty" };
  const m = /^Bearer\s+(.+)$/i.exec(v.trim());
  if (!m) return { ok: false, reason: "missing" };
  const token = m[1].trim();
  if (!token) return { ok: false, reason: "empty" };
  return { ok: true, token };
}
