// GET /api/v1/devices/me —— api.md §4.6（V2.2.11 / V2.2.15）
// 屏端只凭设备凭据问「我这条绑定还有效吗」；判「未绑定」的唯一合法载体是本接口的 state。
// 响应体严格照文档五行：{deviceId, state, userId, boundAt, reason}——不加字段（前端有按 code 路由的旧行为）
import { ERR, CdsError } from "../lib/errors.js";
import { ok } from "../lib/respond.js";
import { parseDeviceAuth, DEVICE_CHALLENGE } from "../lib/deviceauth.js";
import { deviceTokenHash } from "../lib/crypto.js";
import { deriveState, reasonFromAction } from "../lib/state.js";

const SQL_DEVICE = "SELECT device_id, token_hash, last_seen_at FROM devices WHERE token_hash = ?1 LIMIT 1";
const SQL_BINDING = "SELECT user_id, bound_at, revoked_at FROM device_bindings WHERE device_id = ?1 LIMIT 1";
const SQL_CODE_EXISTS = "SELECT 1 AS ok FROM control_codes WHERE user_id = ?1 LIMIT 1";
const SQL_LAST_EVENT =
  "SELECT action, created_at FROM device_bind_events WHERE device_id = ?1 AND action IN ('kick','code_rotate','unbind','auto_unbind') ORDER BY created_at DESC LIMIT 1";

export async function handleMe(request, env) {
  const auth = parseDeviceAuth(request.headers.get("authorization"));
  if (!auth.ok) throw new CdsError(ERR.UNAUTHORIZED, "设备凭据无效", { headers: DEVICE_CHALLENGE });

  const hash = await deviceTokenHash(env, auth.token);
  const dev = await env.DB.prepare(SQL_DEVICE).bind(hash).first();
  // 401 只表示「凭据不认识」（绑定被撤一律 200+revoked，api.md §4.1 硬约束）
  if (!dev) throw new CdsError(ERR.UNAUTHORIZED, "设备凭据无效", { headers: DEVICE_CHALLENGE });

  const bindingRow = await env.DB.prepare(SQL_BINDING).bind(dev.device_id).first();
  const binding = {
    userId: bindingRow ? bindingRow.user_id : null,
    boundAt: bindingRow ? bindingRow.bound_at : null,
    revokedAt: bindingRow ? bindingRow.revoked_at : null,
  };

  // 只有 bound 才需要查码（V2.2.15「绑还在、码没了 ⇒ revoked/code_rotated」）
  let codeExists = true;
  if (binding.userId && !binding.revokedAt) {
    const hit = await env.DB.prepare(SQL_CODE_EXISTS).bind(binding.userId).first();
    codeExists = Boolean(hit);
  }

  const d = deriveState(binding, { codeExists });

  let reason = d.reason;
  if (d.state === "revoked" && !reason) {
    // reason 不落表（0005 注释）：从最近一条审计反推；无审计时才兜底 kicked
    const ev = await env.DB.prepare(SQL_LAST_EVENT).bind(dev.device_id).first();
    reason = (ev && reasonFromAction(ev.action)) || "kicked";
  }

  const headers = d.selfHeal ? { "x-cds-selfheal": "pending" } : undefined;

  return ok(
    {
      deviceId: dev.device_id,
      state: d.state,
      userId: d.state === "bound" ? binding.userId : null,
      boundAt: binding.boundAt === null || binding.boundAt === undefined ? null : binding.boundAt * 1000,
      reason: d.state === "revoked" ? reason : null,
    },
    headers
  );
}
