"""Check the generated static publication site without external dependencies."""

import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"
SITE = json.loads((ROOT / "src/_data/site.json").read_text())
ORIGIN = SITE["url"]
PERSON = ORIGIN + "/#person"


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.links = []
        self.anchors = []
        self.ids = set()
        self.canonicals = []
        self.graphs = []
        self.json_text = None
        self.h1 = 0
        self.lang = None
        self.title = ""
        self.in_title = False
        self.author_link = False
        self.body_classes = set()
        self.in_feature_entry = False
        self.feature_links = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html":
            self.lang = attrs.get("lang")
        if tag == "body":
            self.body_classes = set(attrs.get("class", "").split())
        if tag == "article" and "feature-entry" in attrs.get("class", "").split():
            self.in_feature_entry = True
        if tag == "a" and self.in_feature_entry:
            self.feature_links.append(attrs.get("href"))
        if tag == "a" and attrs.get("href"):
            self.anchors.append(attrs["href"])
        if tag == "h1":
            self.h1 += 1
        if tag == "title":
            self.in_title = True
        if "id" in attrs:
            self.ids.add(attrs["id"])
        if tag == "meta":
            self.meta[attrs.get("name", attrs.get("property"))] = attrs.get("content")
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonicals.append(attrs["href"])
        if tag == "a" and attrs.get("rel") == "author":
            self.author_link = attrs.get("href") == "/about/"
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.json_text = ""
        for key in ("href", "src"):
            if key in attrs:
                self.links.append(attrs[key])

    def handle_endtag(self, tag):
        if tag == "article":
            self.in_feature_entry = False
        if tag == "title":
            self.in_title = False
        if tag == "script" and self.json_text is not None:
            self.graphs.extend(json.loads(self.json_text).get("@graph", []))
            self.json_text = None

    def handle_data(self, text):
        if self.in_title:
            self.title += text
        if self.json_text is not None:
            self.json_text += text


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def public_path(file):
    relative = file.relative_to(OUTPUT).as_posix()
    return "/" + relative.removesuffix("index.html")


def main():
    files = sorted(OUTPUT.rglob("*.html"))
    require(bool(files), "Build the site before verification.")
    pages = {public_path(file): Page(file.read_text()) for file in files}
    titles = set()
    descriptions = set()
    destinations = {url: set() for url in pages}
    article_count = 0
    for file in OUTPUT.rglob("*"):
        require(not file.is_symlink(), f"Symlink in public output: {file.name}")
        require(file.name != ".DS_Store", "Finder metadata in public output.")
        require(file.suffix not in (".md", ".njk", ".docx", ".zip"), "Source or document leaked into output.")
        if file.is_file() and file.suffix in (".html", ".xml", ".txt", ".css", ".js", ".svg"):
            text = file.read_text()
            require(not any(value in text for value in ("/Users/", "localhost", "127.0.0.1", "file://", "showPage(")), f"Local or obsolete content in {file.name}")
    for directory in ("editorial", "output", "tmp", ".site-backups", "node_modules", ".github"):
        require(not (OUTPUT / directory).exists(), f"Private directory published: {directory}")
    require(not (OUTPUT / "writing/romanticise-east-asia").exists(), "Withdrawn essay still published.")
    require(not (OUTPUT / "writing/redistribution-welfare-capacity-policy-analysis").exists(), "Removed placeholder still published.")

    for url, page in pages.items():
        require(page.lang == "en-GB", f"Missing British language declaration: {url}")
        require(page.h1 == 1, f"Expected one main heading: {url}")
        require(page.title and page.title not in titles, f"Missing or duplicate title: {url}")
        titles.add(page.title)
        require(page.canonicals == [ORIGIN + url], f"Wrong canonical: {url}")
        require(page.meta.get("og:url") == ORIGIN + url, f"Wrong social URL: {url}")
        require(page.meta.get("og:site_name") == SITE["name"], f"Wrong site name: {url}")
        require(page.meta.get("og:locale") == "en_GB", f"Wrong social locale: {url}")
        require(page.meta.get("description") == page.meta.get("og:description") == page.meta.get("twitter:description") and page.meta.get("description"), f"Inconsistent descriptions: {url}")
        description = page.meta["description"].strip()
        require(description and description not in descriptions, f"Missing or duplicate description: {url}")
        descriptions.add(description)
        require(page.title == page.meta.get("og:title") == page.meta.get("twitter:title"), f"Inconsistent titles: {url}")
        link_paths = {urlsplit(link).path for link in page.links}
        require("/assets/css/site.css" in link_paths, f"Missing shared CSS: {url}")
        require("/assets/css/publication.css" in link_paths and "publication-dark" in page.body_classes, f"Missing shared publication theme: {url}")
        require(page.meta.get("theme-color") == SITE["themeColor"], f"Wrong browser theme colour: {url}")
        if url == "/404.html":
            require("noindex" in page.meta.get("robots", ""), "404 must not be indexed.")
        else:
            require(all("noindex" not in page.meta.get(name, "").lower() for name in ("robots", "googlebot")), f"Public page blocked: {url}")
            people = [item for item in page.graphs if item["@type"] == "Person"]
            require(len(people) == 1 and people[0]["@id"] == PERSON and people[0]["name"] == SITE["author"], f"Inconsistent identity: {url}")
            require(people[0].get("sameAs", []) == SITE["sameAs"], f"Unexpected profile links: {url}")
        if url == "/":
            require(len(page.feature_links) == 3 and page.feature_links[0] == "/policy-analysis/", "Expected a policy-led homepage with two supporting pieces.")
            require(any(item["@type"] == "WebSite" and item["name"] == SITE["name"] for item in page.graphs), "Missing homepage site-name schema.")
        if url == "/about/":
            require(any(item["@type"] == "ProfilePage" and item["mainEntity"]["@id"] == PERSON for item in page.graphs), "Missing About profile schema.")
        if url == "/contact/":
            linkedin = [link for link in SITE["sameAs"] if urlsplit(link).hostname == "www.linkedin.com"]
            require(all(link in page.anchors for link in linkedin), "Contact does not link to the LinkedIn profile.")
        for item in page.graphs:
            if item["@type"] == "Article":
                article_count += 1
                require(item["author"]["@id"] == PERSON and item["author"]["name"] == SITE["author"], f"Article author mismatch: {url}")
                require(item["url"] == ORIGIN + url and item["mainEntityOfPage"]["@id"] == ORIGIN + url + "#webpage", f"Article URL mismatch: {url}")
                require(page.author_link, f"Missing visible author link: {url}")
                require(item["description"] != pages["/"].meta["description"], f"Generic article metadata: {url}")
        for ref in page.links:
            parsed = urlsplit(ref)
            if parsed.scheme or parsed.netloc:
                continue
            target_url = urlsplit(urljoin(url, ref)).path
            target = OUTPUT / unquote(target_url).lstrip("/")
            if target.is_dir():
                target /= "index.html"
            require(target.exists(), f"Broken internal link from {url}: {ref}")
            if parsed.fragment and target_url in pages:
                require(unquote(parsed.fragment) in pages[target_url].ids, f"Broken fragment from {url}: {ref}")
        for ref in page.anchors:
            destination = urlsplit(urljoin(ORIGIN + url, ref))
            if destination.scheme == "https" and destination.netloc == urlsplit(ORIGIN).netloc:
                path = unquote(destination.path)
                if path in pages:
                    destinations[url].add(path)

    css = OUTPUT / "assets/css/site.css"
    for ref in re.findall(r"url\(([^)]+)\)", css.read_text()):
        ref = ref.strip().strip("\"'")
        if not urlsplit(ref).scheme:
            require((css.parent / ref).exists(), f"Missing CSS asset: {ref}")
    require((OUTPUT / "assets/images/research-hero.jpg").is_file(), "Missing hero image.")
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    sitemap = ET.parse(OUTPUT / "sitemap.xml")
    locations = [node.text for node in sitemap.findall(".//s:loc", ns)]
    expected = {ORIGIN + url for url in pages if url != "/404.html"}
    require(set(locations) == expected and len(locations) == len(expected), "Sitemap does not match public pages.")
    reachable = set()
    remaining = ["/"]
    while remaining:
        path = remaining.pop()
        if path not in reachable:
            reachable.add(path)
            remaining.extend(destinations[path] - reachable)
    orphaned = {urlsplit(url).path for url in locations} - reachable
    require(not orphaned, f"Sitemap pages not reachable through site links: {', '.join(sorted(orphaned))}")
    require("Sitemap: " + ORIGIN + "/sitemap.xml" in (OUTPUT / "robots.txt").read_text(), "Wrong sitemap in robots.txt.")
    feed = ET.parse(OUTPUT / "feed.xml")
    atom = {"a": "http://www.w3.org/2005/Atom"}
    for entry in feed.findall("a:entry", atom):
        require(entry.find("a:updated", atom) is not None, "Undated feed entry.")
        require(entry.find("a:link", atom).attrib["href"] in expected, "Feed points outside public pages.")
    print(f"Verified {len(pages)} HTML pages, {article_count} articles, {len(locations)} sitemap URLs, metadata, identity schema, links, assets, feed and output hygiene.")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, ValueError, ET.ParseError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        sys.exit(1)
