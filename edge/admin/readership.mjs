const reports = [
  ["Daily Page Views", "toDate(timestamp)", "blob1 = 'page'", true],
  ["Most Viewed Work", "blob2", "blob1 = 'page' AND startsWith(blob2, '/writing/') AND blob2 != '/writing/'"],
  ["Referral Sources", "blob3", "blob1 = 'page' AND blob3 != 'Internal navigation'"],
  ["Reader Countries", "blob4", "blob1 = 'page'"],
  ["Work Link Clicks", "blob2", "blob1 = 'work-click'"],
  ["Download Link Clicks", "blob2", "blob1 = 'download'"],
  ["Work Search Topics", "blob3", "blob1 = 'search'"],
];

export async function readership(env) {
  if (!/^[a-f0-9]{32}$/i.test(env.CF_ACCOUNT_ID || "") || !env.READERSHIP_READ_TOKEN) return undefined;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
  return Promise.all(reports.map(async ([title, dimension, where, daily]) => {
    try {
      const query = `SELECT ${dimension} AS label, sum(_sample_interval) AS total FROM ashton_readership WHERE timestamp >= NOW() - INTERVAL '30' DAY AND ${where} GROUP BY label ${title === "Work Search Topics" ? "HAVING total >= 3" : ""} ORDER BY ${daily ? "label ASC" : "total DESC"} LIMIT ${daily ? 31 : 15} FORMAT JSON`;
      const response = await fetch(endpoint, {method: "POST", headers: {Authorization: `Bearer ${env.READERSHIP_READ_TOKEN}`, "Content-Type": "text/plain"},
        body: query, redirect: "error", signal: AbortSignal.timeout(5000)});
      if (!response.ok) return {title};
      const {data} = await response.json();
      return {title, rows: Array.isArray(data) ? data : undefined};
    } catch { return {title}; }
  }));
}
