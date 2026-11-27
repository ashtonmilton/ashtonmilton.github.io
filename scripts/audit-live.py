"""Audit public responses from the current network, not from crawler IPs."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from runpy import run_path
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
import re
import gzip
import xml.etree.ElementTree as ET

checker = run_path(str(Path(__file__).with_name("verify-site.py")))
origin, Page, require = (checker[k] for k in ("ORIGIN", "Page", "require"))
agents = ["SiteAudit", "Googlebot", "bingbot", "Baiduspider"]


def get(url, ua="SiteAudit"):
    return urlopen(Request(url, headers={"User-Agent": ua, "Accept-Encoding": "identity, gzip"}), timeout=15)


def body(response):
    payload = response.read()
    encoding = response.headers.get("Content-Encoding", "identity").lower()
    if encoding == "gzip":
        return gzip.decompress(payload)
    require(encoding == "identity", f"Unexpected content encoding {encoding}: {response.url}")
    return payload


with get(origin + "/robots.txt") as response:
    rules = body(response).decode()
robots = RobotFileParser()
robots.parse(rules.splitlines())
require(robots.site_maps() == [origin + "/sitemap.xml"], "Unexpected robots sitemap.")
with get(origin + "/sitemap.xml") as response:
    urls = [el.text for el in ET.fromstring(body(response)).findall(".//{*}loc")]

for url in ("http://ashtonmilton.net/", "https://www.ashtonmilton.net/"):
    with get(url) as response:
        require(response.url == origin + "/", f"Wrong final redirect: {url}")


def audit(task):
    url, ua = task
    require(url.startswith(origin + "/"), f"Unexpected domain in sitemap: {url}")
    require(robots.can_fetch(ua, url), f"robots.txt blocks {ua}: {url}")
    # Query-bearing homepage requests deliberately bypass automatic localisation.
    fetch_url = url + "?source=site-audit" if url == origin + "/" else url
    with get(fetch_url, ua) as response:
        require(response.status == 200 and response.url == fetch_url, f"Not a direct 200: {url} ({ua})")
        page = Page(body(response).decode("utf-8"))
        directives = response.headers.get_all("X-Robots-Tag") or []
        directives.extend((page.meta.get(name) or "") for name in ("robots", *[agent.lower() for agent in agents]))
        require(not re.search(r"\b(noindex|nofollow|none)\b", ",".join(directives), re.I), f"Blocking directive: {url} ({ua})")
        require(page.canonicals == [url], f"Incorrect live canonical: {url} ({ua})")
    return url, ua


with ThreadPoolExecutor(max_workers=6) as pool:
    checked = list(pool.map(audit, ((url, ua) for url in urls for ua in agents)))
with get(origin + "/404.html") as response:
    require("noindex" in Page(body(response).decode("utf-8")).meta.get("robots", ""), "404 is not excluded.")
print(f"Verified {len(checked)} direct HTTPS responses across {len(urls)} sitemap pages and {len(agents)} user agents.")
print("HTTP and www redirects resolve to the apex; the standalone 404 template intentionally contains noindex.")
