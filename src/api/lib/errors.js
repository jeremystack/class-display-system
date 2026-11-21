// 错误码 → HTTP 状态。表逐字照 api.md §9（改动先改文档，再改这张表）
export const ERR = {
  OK: 0,
  UNAUTHORIZED: 1001, // 401 未授权 / 凭据不认识（设备侧必须带 WWW-Authenticate: Device）
  NOT_FOUND: 1002, // 404 资源不存在
  FORBIDDEN: 1003, // 403 无权限（非设备所有者）
  BAD_PARAM: 2001, // 400 参数错误
  PAGE_OOR: 2002, // 400 分页参数越界
  INTERNAL: 3001, // 500
  UPSTREAM: 3002, // 502
  DEVICE_OCCUPIED: 4091, // 409 同一 deviceId 已被其他用户绑定（同户多台不触发）
  CODE_INVALID: 4092, // 400 控制码无效（不存在/已轮换不区分）
  CAST_URL_INVALID: 4093, // 410
  TOO_MANY_ATTEMPTS: 4094, // 429 控制码尝试过于频繁（只对失败计数）
  AUDIO_LEASED: 4095, // 409
  AUDIO_BLOCKED: 4096, // 409
  REGISTER_RATE_LIMITED: 4097, // 429 注册过于频繁（只限新注册，带 Retry-After）
};

const HTTP = {
  [ERR.OK]: 200,
  [ERR.UNAUTHORIZED]: 401,
  [ERR.NOT_FOUND]: 404,
  [ERR.FORBIDDEN]: 403,
  [ERR.BAD_PARAM]: 400,
  [ERR.PAGE_OOR]: 400,
  [ERR.INTERNAL]: 500,
  [ERR.UPSTREAM]: 502,
  [ERR.DEVICE_OCCUPIED]: 409,
  [ERR.CODE_INVALID]: 400,
  [ERR.CAST_URL_INVALID]: 410,
  [ERR.TOO_MANY_ATTEMPTS]: 429,
  [ERR.AUDIO_LEASED]: 409,
  [ERR.AUDIO_BLOCKED]: 409,
  [ERR.REGISTER_RATE_LIMITED]: 429,
};

export function httpForCode(code) {
  return HTTP[code] || 500;
}

// 默认文案。产品可改文字，改的是这里，不要在路由里散写。
export const MSG = {
  [ERR.OK]: "ok",
  [ERR.UNAUTHORIZED]: "设备凭据无效",
  [ERR.NOT_FOUND]: "设备不存在",
  [ERR.FORBIDDEN]: "无权操作该设备",
  [ERR.BAD_PARAM]: "参数错误",
  [ERR.INTERNAL]: "服务器内部错误",
  [ERR.REGISTER_RATE_LIMITED]: "注册过于频繁，请稍后重试",
};

export class CdsError extends Error {
  constructor(code, msg, extra) {
    super(msg || MSG[code] || "error");
    this.code = code;
    this.extra = extra || {};
  }
}
