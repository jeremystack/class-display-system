// 注册限流（api.md §4.1 V2.2.20）：按设备 3 次/分钟；按 IP 60 次/分钟·突发 20。
// 硬约束（文档明写）：**不得用 D1 计数**——每次注册一次写，冷启动风暴正好把它打满。
// 故只允许两种存储：① Cloudflare 边缘速率规则（不占 Worker 配额，首选，运维配）
//                    ② KV / Durable Object 计数器（本文件实现 KV 版）
// 都没配时退回「每 isolate 内存计数」：**只用于本地与 staging**，上线前必须二选一（README B-3）。

const WINDOW_MS = 60_000;

function nowOf(nowMs) {
  return nowMs === undefined ? Date.now() : nowMs;
}

/** 内存实现（isolate 级；多 isolate 会各算一份，故不能当生产防线）。
 *  必须是**模块级**单例：createLimiter 每次请求新建，计数器跟着归零就等于没有限流。 */
const MEM = new Map();
function memoryStore() {
  const m = MEM;
  return {
    async get(k) {
      return m.get(k) || null;
    },
    async put(k, v) {
      m.set(k, v);
    },
  };
}

function kvStore(env) {
  return {
    async get(k) {
      const raw = await env.RATE_KV.get(k);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async put(k, v, ttlSec) {
      await env.RATE_KV.put(k, JSON.stringify(v), { expirationTtl: Math.max(60, ttlSec) });
    },
  };
}

export function createLimiter(env, nowMs) {
  const store = env && env.RATE_KV ? kvStore(env) : memoryStore();
  const mode = env && env.RATE_KV ? "kv" : "memory";

  return {
    mode,

    /** 固定窗口。返回 {allowed, count, limit, retryAfter} */
    async fixedWindow(bucket, key, limit, windowSec) {
      const now = nowOf(nowMs);
      const win = (windowSec || 60) * 1000;
      const slot = Math.floor(now / win);
      const k = `rl:${bucket}:${key}:${slot}`;
      const cur = await store.get(k);
      const count = (cur && cur.n) || 0;
      const retryAfter = Math.max(1, Math.ceil((slot * win + win - now) / 1000));
      if (count + 1 > limit) return { allowed: false, count, limit, retryAfter };
      await store.put(k, { n: count + 1 }, (windowSec || 60) + 5);
      return { allowed: true, count: count + 1, limit, retryAfter };
    },

    /** 令牌桶。ratePerSec 均速补充，capacity 为突发上限。返回 {allowed, retryAfter} */
    async tokenBucket(bucket, key, ratePerSec, capacity, windowSec) {
      const now = nowOf(nowMs);
      const k = `tb:${bucket}:${key}`;
      const cur = (await store.get(k)) || { t: capacity, ts: now };
      const elapsed = Math.max(0, now - cur.ts) / 1000;
      let tokens = Math.min(capacity, cur.t + elapsed * ratePerSec);
      if (tokens >= 1) {
        tokens -= 1;
        await store.put(k, { t: tokens, ts: now }, (windowSec || 60) + 5);
        return { allowed: true, retryAfter: 0 };
      }
      await store.put(k, { t: tokens, ts: now }, (windowSec || 60) + 5);
      const need = (1 - tokens) / ratePerSec;
      return { allowed: false, retryAfter: Math.max(1, Math.ceil(need)) };
    },
  };
}

export { WINDOW_MS };
