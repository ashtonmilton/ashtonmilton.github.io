const reports = [
  ["Daily Page Views", "toDate(timestamp)", "blob1 = 'page'", true],
  ["Most Viewed Work", "blob2", "blob1 = 'page' AND blob2 LIKE '/writing/%' AND blob2 != '/writing/'"],
  ["Referral Sources", "blob3", "blob1 = 'page' AND blob3 != 'Internal navigation'"],
  ["Reader Countries", "blob4", "blob1 = 'page'"],
  ["Devices", "blob5", "blob1 = 'page' AND blob5 != ''"],
  ["Browsers", "blob6", "blob1 = 'page' AND blob6 != ''"],
  ["Language Editions", "blob7", "blob1 = 'page' AND blob7 != ''"],
  ["Work Link Clicks", "blob2", "blob1 = 'work-click'"],
  ["Download Link Clicks", "blob2", "blob1 = 'download'"],
  ["Work Search Topics", "blob3", "blob1 = 'search'"],
];

export async function readership(env) {
  const binding = typeof env.ANALYTICS_SQL?.query === "function";
  const legacy = /^[a-f0-9]{32}$/i.test(env.CF_ACCOUNT_ID || "") && env.READERSHIP_READ_TOKEN;
  if (!binding && !legacy) return undefined;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
  return Promise.all(reports.map(async ([title, dimension, where, daily]) => {
    try {
      const clauses = `WHERE timestamp >= NOW() - INTERVAL '30' DAY AND ${where} GROUP BY label ORDER BY ${daily ? "label ASC" : "total DESC"} LIMIT ${daily ? 31 : 15}`;
      const rows = (data) => Array.isArray(data) ? (title === "Work Search Topics" ? data.filter((row) => Number(row.total) >= 3) : data) : undefined;
      if (binding) {
        const {data} = await env.ANALYTICS_SQL.query({query: `SELECT ${dimension} AS label, COUNT(*) AS total FROM events.analyticsEngine.ashton_readership ${clauses}`});
        return {title, rows: rows(data)};
      }
      const query = `SELECT ${dimension} AS label, sum(_sample_interval) AS total FROM ashton_readership ${clauses} FORMAT JSON`;
      const response = await fetch(endpoint, {method: "POST", headers: {Authorization: `Bearer ${env.READERSHIP_READ_TOKEN}`, "Content-Type": "text/plain"},
        body: query, redirect: "manual", signal: AbortSignal.timeout(5000)});
      if (!response.ok) return {title};
      const {data} = await response.json();
      return {title, rows: rows(data)};
    } catch { return {title}; }
  }));
}
