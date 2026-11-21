// 绑定状态机（纯函数，便于单测）。口径来源：api.md §4.6 + migrations 0005 的 device_bindings 注释
//
// device_bindings 两列表达三态：
//   user_id 非空 & revoked_at 空 ⇒ bound
//   user_id 空   & revoked_at 非空 ⇒ revoked
//   两列皆空                        ⇒ unbound（从未绑定）
// reason 不落表（0005 注释明写），只能从 device_bind_events 最近一条 action 反推。

const REASON_BY_ACTION = {
  kick: "kicked",
  code_rotate: "code_rotated",
  unbind: "unbind",
  auto_unbind: "unbind",
};

export function reasonFromAction(action) {
  return REASON_BY_ACTION[action] || null;
}

/**
 * @param {{userId:string|null, revokedAt:number|null, boundAt:number|null}} binding
 * @param {{codeExists:boolean}} ctx  control_codes 里该 user_id 是否还有行（V2.2.15）
 * @returns {{state:'bound'|'revoked'|'unbound', reason:string|null, selfHeal:boolean}}
 * selfHeal=true 表示「绑还在、码没了」——按 V2.2.15 应判 revoked/code_rotated，
 * 且**同事务**覆盖快照 + 清 retained。本路由只做判定；副作用见 README 的 B-1（需 MQTT 出口）。
 */
export function deriveState(binding, ctx) {
  const userId = binding && binding.userId ? binding.userId : null;
  const revokedAt = binding && binding.revokedAt ? binding.revokedAt : null;
  const codeExists = !ctx || ctx.codeExists !== false;

  if (userId && !revokedAt) {
    if (!codeExists) return { state: "revoked", reason: "code_rotated", selfHeal: true };
    return { state: "bound", reason: null, selfHeal: false };
  }
  if (!userId && revokedAt) return { state: "revoked", reason: null, selfHeal: false };
  return { state: "unbound", reason: null, selfHeal: false };
}

/**
 * online 口径（api.md §4.4 / §4.5）：`now − lastSeenAt ≤ 75s` **且** broker 侧无存活连接的对偶判据
 * ——两个条件缺一即 false（原文：「两者缺一即 false」）。
 * 未知一律记 false：宁可把真在线判成离线（老师看到离线点，会去查线），
 * 不可把断线判成在线（老师以为屏好着，实际投不上去）。
 */
export function isOnline({ lastSeenAt, hasLiveConnection }, nowMs) {
  if (hasLiveConnection !== true) return false;
  if (typeof lastSeenAt !== "number") return false;
  return nowMs - lastSeenAt <= 75_000;
}
