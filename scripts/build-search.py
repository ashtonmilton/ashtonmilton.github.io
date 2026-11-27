"""Create a compact index from public site output; never index repository files."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET
from urllib.parse import urlsplit

OUTPUT = Path(__file__).resolve().parents[1] / "_site"


class Entry(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.lang = "en-GB"
        self.meta = {}
        self.tags = []
        self.main = self.heading = False
        self.omit = 0
        self.body = []
        self.title = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html":
            self.lang = attrs.get("lang", self.lang)
        elif tag == "meta":
            key = attrs.get("name") or attrs.get("property")
            if key == "article:tag":
                self.tags.append(attrs.get("content", ""))
            elif key:
                self.meta[key] = attrs.get("content", "")
        elif tag == "main":
            self.main = True
        elif tag == "h1":
            self.heading = True
        elif tag in {"script", "style", "nav"}:
            self.omit += 1
        elif tag == "img" and self.main and attrs.get("alt"):
            self.body.append(attrs["alt"])

    def handle_endtag(self, tag):
        if tag == "main":
            self.main = False
        elif tag == "h1":
            self.heading = False
        elif tag in {"script", "style", "nav"}:
            self.omit -= 1

    def handle_data(self, data):
        if self.heading:
            self.title.append(data)
        if self.main and not self.omit:
            self.body.append(data)


def clean(parts):
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


urls = [urlsplit(loc.text).path for loc in ET.parse(OUTPUT / "sitemap.xml").findall("./{*}url/{*}loc")]
index = []
for url in urls:
    if url in {"/", "/writing/", "/search/", "/privacy/"}:
        continue
    path = OUTPUT / url.lstrip("/") / "index.html"
    page = Entry(path.read_text(encoding="utf-8"))
    if "noindex" in page.meta.get("robots", "").lower():
        continue
    photo = "photo essays" == page.meta.get("article:section", "").lower()
    kind = ("Photo Essay" if photo else "Note" if page.meta.get("article:section") == "Notes"
            else page.meta.get("publication:type") or ("Essay" if url.startswith("/writing/") else "Page"))
    index.append(dict(url=url, lang=page.lang, title=clean(page.title), description=page.meta.get("description", ""),
                      tags=page.tags, kind=kind, date=page.meta.get("article:published_time", ""),
                      text=clean(page.body)))

target = OUTPUT / "assets" / "search-index.json"
target.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Indexed {len(index)} public pages ({target.stat().st_size:,} bytes before compression).")
