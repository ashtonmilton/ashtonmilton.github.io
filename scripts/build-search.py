"""Create a compact index from public site output; never index repository files."""
from html.parser import HTMLParser
from pathlib import Path
import json
import os
import re
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlsplit

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
        self.references = set()
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.references.update(attrs[key] for key in ("href", "src", "poster") if attrs.get(key) and "data-auto-related" not in attrs)
        self.references.update(part.split()[0] for part in attrs.get("srcset", "").split(",") if part.strip())
        if tag == "html":
            self.lang = attrs.get("lang", self.lang)
        elif tag == "meta":
            key = attrs.get("name") or attrs.get("property")
            if key in {"og:image", "twitter:image"} and attrs.get("content"):
                self.references.add(attrs["content"])
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
references = {}
for url in urls:
    path = OUTPUT / url.lstrip("/") / "index.html"
    if not path.is_file():
        continue
    page = Entry(path.read_text(encoding="utf-8"))
    for href in page.references:
        target = urlsplit(urljoin("https://ashtonmilton.net" + url, href))
        if target.scheme in {"https", "http"} and target.hostname == "ashtonmilton.net" and target.path != url:
            references.setdefault(target.path, set()).add(url)
    if not url.startswith("/writing/") or url == "/writing/":
        continue
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
revision = os.environ.get("GITHUB_SHA", "")
(OUTPUT / "assets/editorial-references.json").write_text(json.dumps({
    "revision": revision if re.fullmatch(r"[a-f0-9]{40}", revision) else None,
    "references": {path: sorted(pages) for path, pages in sorted(references.items())
                   if path.startswith(("/writing/", "/assets/uploads/"))}
}, separators=(",", ":")), encoding="utf-8")
print(f"Indexed {len(index)} public pages ({target.stat().st_size:,} bytes before compression).")
