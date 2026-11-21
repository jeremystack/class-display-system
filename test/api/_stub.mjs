// 测试替身：只实现路由真正用到的 D1 子集（prepare/bind/first/all/run/batch）。
// 目的不是模拟 SQL 引擎，而是让路由的「取数顺序 + 绑定参数」可断言：
// handler(sql, args) 由用例按 SQL 片段返回结果，未匹配到的查询返回 null 并记一条 miss。
export function makeDb(handler) {
  const calls = [];
  const misses = [];

  function prepare(sql) {
    const st = {
      sql,
      args: [],
      bind(...a) {
        st.args = a;
        return st;
      },
      async first() {
        calls.push({ sql, args: st.args, kind: "first" });
        const v = await handler(sql, st.args, "first");
        if (v === undefined) misses.push(sql);
        return v === undefined ? null : v;
      },
      async all() {
        calls.push({ sql, args: st.args, kind: "all" });
        const v = await handler(sql, st.args, "all");
        if (v === undefined) misses.push(sql);
        return { results: Array.isArray(v) ? v : v && v.results ? v.results : [] };
      },
      async run() {
        calls.push({ sql, args: st.args, kind: "run" });
        const v = await handler(sql, st.args, "run");
        return v === undefined ? { success: true } : v;
      },
    };
    return st;
  }

  return {
    prepare,
    async batch(list) {
      const out = [];
      for (const s of list) out.push(await s.run());
      return out;
    },
    calls,
    misses,
    find(needle) {
      return calls.filter((c) => c.sql.includes(needle));
    },
  };
}

export function makeEnv(over) {
  return {
    ENV: "test",
    API_PREFIX: "/api/v1",
    APP_VERSION: "0.1.0-test",
    ALLOWED_ORIGINS: "https://cds.242500.xyz",
    DEVICE_TOKEN_HMAC_KEY: "test-hmac-key",
    JWT_SECRET: "test-jwt-secret",
    ...(over || {}),
  };
}
