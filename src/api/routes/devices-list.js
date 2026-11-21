// GET /api/v1/devices/list —— api.md §4.4（V2.2.4 / V2.2.8）
// 只返回当前 bound 的台（列表条数＝控制台的「台数」）；不新增 state 字段。
// online 必须两条件合取（lastSeen 新鲜 + broker 无存活连接），不得转抄 retained presence/state。
import { CdsError, ERR } from "../lib/errors.js";
import { ok } from "../lib/respond.js";
import { parseBearer, verifyJwtHS256 } from "../lib/jwt.js";
import { isOnline } from "../lib/state.js";

const SQL_LIST =
  "SELECT b.device_id, d.device_name, d.last_seen_at FROM device_bindings b JOIN devices d ON d.device_id = b.device_id WHERE b.user_id = ?1 AND b.revoked_at IS NULL ORDER BY b.bound_at DESC, b.device_id ASC";

export async function handleList(request, env, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;

  const b = parseBearer(request.headers.get("authorization"));
  if (!b.ok) throw new CdsError(ERR.UNAUTHORIZED, "未授权");
  const v = await verifyJwtHS256(b.token, env.JWT_SECRET, now);
  if (!v.ok) throw new CdsError(ERR.UNAUTHORIZED, "未授权");
  const userId = String(v.payload.sub);

  const res = await env.DB.prepare(SQL_LIST).bind(userId).all();
  const rows = (res && res.results) || [];

  const out = [];
  for (const r of rows) {
    // broker 侧存活连接：由 MQTT 桥写 KV `presence:{deviceId}`（未实现时 undefined ⇒ 判离线，见 README B-2）
    let live;
    if (env.PRESENCE_KV) live = (await env.PRESENCE_KV.get("presence:" + r.device_id)) === "1";
    // devices.last_seen_at 是**秒**（0001 DDL unixepoch），online 口径按**毫秒**比较，必须换算
    const lastSeenMs = typeof r.last_seen_at === "number" ? r.last_seen_at * 1000 : null;
    out.push({
      deviceId: r.device_id,
      deviceName: r.device_name,
      online: isOnline({ lastSeenAt: lastSeenMs, hasLiveConnection: live }, now),
      lastSeenAt: lastSeenMs,
      nowPlaying: null, // L1 来自 state.report，本版未落库 ⇒ null（api.md §4.5「无上报时为 null，不得伪造 {}」）
    });
  }
  return ok(out, { "x-cds-online-source": env.PRESENCE_KV ? "kv+lastSeen" : "lastSeenOnly" });
}
