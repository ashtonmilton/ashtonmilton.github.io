"""Public uptime, TLS and reference checks; no credentials or request logs."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from runpy import run_path
from urllib.error import HTTPError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen
import socket
import ssl
import time
import xml.etree.ElementTree as ET

checker = run_path(str(Path(__file__).with_name("verify-site.py")))
origin, Page = checker["ORIGIN"], checker["Page"]
host = urlsplit(origin).hostname
failures, warnings = [], []


def get(url, method="GET"):
    return urlopen(Request(url, method=method, headers={"User-Agent": "AshtonMilton-SiteMonitor/1.0"}), timeout=8)


for name in (host, "www." + host):
    try:
        with socket.create_connection((name, 443), timeout=8) as raw:
            with ssl.create_default_context().wrap_socket(raw, server_hostname=name) as conn:
                expires = ssl.cert_time_to_seconds(conn.getpeercert()["notAfter"])
        days = int((expires - datetime.now(timezone.utc).timestamp()) / 86400)
        print(f"{name}: TLS verified, certificate expires in {days} days")
        if days < 7:
            failures.append(f"{name}: certificate expires in fewer than seven days")
    except OSError as error:
        failures.append(f"{name}: TLS error: {error}")

with get(origin + "/sitemap.xml") as response:
    entries = ET.parse(response).findall("./{*}url/{*}loc")
    urls = {entry.text for entry in entries}
if not urls or len(urls) != len(entries):
    failures.append("Sitemap is empty or contains duplicate locations")


def inspect(url):
    if not url.startswith(origin + "/"):
        raise ValueError(f"Unexpected origin in sitemap: {url}")
    request_url = url + "?source=site-audit" if url == origin + "/" else url
    with get(request_url) as response:
        if response.status != 200 or response.url != request_url:
            raise ValueError(f"Unexpected HTTP response: {url}")
        page = Page(response.read().decode("utf-8"))
    return {urlunsplit((*parsed[:4], "")) for link in page.anchors if
            (parsed := urlsplit(link)).scheme == "https" and parsed.hostname != host}


external = set()
with ThreadPoolExecutor(max_workers=5) as pool:
    futures = {url: pool.submit(inspect, url) for url in urls}
    for url, future in futures.items():
        try:
            external.update(future.result())
        except (OSError, ValueError) as error:
            failures.append(f"{url}: {error}")


def reference(url):
    for attempt in range(2):
        try:
            with get(url, "HEAD"):
                return
        except HTTPError as error:
            if error.code in {404, 405, 410}:
                try:
                    with get(url):
                        return
                except OSError as fallback:
                    error = fallback
            if attempt == 1:
                return ("failed" if getattr(error, "code", 0) in {404, 410} else "warn", url, str(error))
        except (OSError, ValueError) as error:
            if attempt == 1:
                return ("warn", url, str(error))
        time.sleep(1)


with ThreadPoolExecutor(max_workers=5) as pool:
    for result in pool.map(reference, sorted(external)):
        if result:
            level, url, error = result
            (failures if level == "failed" else warnings).append(f"{url}: {error}")

print(f"Checked {len(urls)} public pages and {len(external)} external references.")
for message in warnings:
    print(f"RETRY OR CHECK MANUALLY: {message}")
for message in failures:
    print(f"FAIL: {message}")
raise SystemExit(bool(failures))
