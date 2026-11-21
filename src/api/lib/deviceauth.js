// 设备凭据解析（Authorization: Device <deviceToken>）
// 红线（api.md §0.1 / 验收 #72）：`Device ` 后面为空必须判无值——
// 原型 README 里「注册前先拼好 `Authorization: Device ` + 空 token」的写法会被 Fetch 规范化成无值头，
// 服务端必须当「没有凭据」处理（1001），不能当「token 为空串」去查库。

export function parseDeviceAuth(headerValue) {
  const v = String(headerValue || "").trim();
  if (!v) return { ok: false, reason: "missing" };
  if (/^device$/i.test(v)) return { ok: false, reason: "empty" }; // 头被规范化成无值
  const m = /^Device\s+(.+)$/i.exec(v);
  if (!m) return { ok: false, reason: "scheme" }; // Bearer 头不得用于设备接口
  const token = m[1].trim();
  if (!token) return { ok: false, reason: "empty" };
  if (token.length < 16 || token.length > 256) return { ok: false, reason: "len" };
  return { ok: true, token };
}

/** 401 必须带 WWW-Authenticate: Device（api.md §4.1 硬约束；屏只在此条件下清凭据） */
export const DEVICE_CHALLENGE = { "www-authenticate": "Device" };
