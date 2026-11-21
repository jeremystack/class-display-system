// 请求体校验。字段集逐字照 api.md §4.1：{deviceName, clientType, fingerprint}
// 红线：原型 prototype/console.html 的 A5 发的是 {label, ua}，那是原型口径，服务端不认（见 README D-2）
import { CdsError, ERR } from "./errors.js";
import { sha256Hex } from "./crypto.js";

export const CLIENT_TYPES = ["browser", "tv", "pad"];

/**
 * @returns {{deviceName:string, clientType:string, fingerprint:string|null}}
 * 抛 CdsError(2001) 带逐字段原因（前端据此提示「设备名不能为空」这类具体文案）
 */
export function validateRegisterBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CdsError(ERR.BAD_PARAM, "请求体必须是 JSON 对象", { data: { fields: ["<body>"] } });
  }
  const bad = [];

  let deviceName = body.deviceName;
  if (typeof deviceName !== "string" || deviceName.trim().length === 0) bad.push("deviceName");
  else if (deviceName.trim().length > 64) bad.push("deviceName:len>64");
  else deviceName = deviceName.trim();

  let clientType = body.clientType === undefined ? "browser" : body.clientType;
  if (typeof clientType !== "string" || !CLIENT_TYPES.includes(clientType)) bad.push("clientType");

  let fingerprint = body.fingerprint === undefined || body.fingerprint === null ? null : body.fingerprint;
  if (fingerprint !== null) {
    if (typeof fingerprint !== "string" || fingerprint.trim().length === 0) bad.push("fingerprint");
    else if (fingerprint.length > 128) bad.push("fingerprint:len>128");
    else fingerprint = fingerprint.trim();
  }

  if (bad.length) throw new CdsError(ERR.BAD_PARAM, "参数错误", { data: { fields: bad } });
  return { deviceName, clientType, fingerprint };
}

/**
 * 限流用的设备键（api.md §4.1「同一 fingerprint；缺省时用 deviceName＋clientType 的稳定哈希」）。
 * 注意：这是**限流键**，同时充当 devices.fingerprint 的落库值（幂等命中靠它）。
 * 一律先哈希再落库：屏幕指纹原值可能含设备序列号，不该明文进库。
 */
export async function deriveFingerprintKey({ deviceName, clientType, fingerprint }) {
  const raw = fingerprint ? "fp:" + fingerprint : "nm:" + deviceName + "\u0000" + clientType;
  return "f_" + (await sha256Hex(raw)).slice(0, 40);
}
