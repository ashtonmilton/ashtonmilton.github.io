const token = process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN || "";
if (token && !/^[a-f0-9]{32}$/i.test(token)) throw new Error("Invalid Cloudflare Web Analytics site token");
module.exports = {token};
