import {parseFragment} from "parse5";
import {parse as parseYaml} from "yaml";

function nodes(node, test) {
  return (node.childNodes || []).flatMap((child) => [ ...(test(child) ? [child] : []), ...nodes(child, test) ]);
}

const attribute = (node, name) => node?.attrs?.find((value) => value.name === name)?.value ?? "";
const hasClass = (node, name) => attribute(node, "class").split(/\s+/).includes(name);
const plain = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(plain).join("");

export function legacyToMarkdown(source) {
  if (!/<\/?(?:p|h[1-6]|em|strong|a\s|ul|ol|li|blockquote|div|br)\b/i.test(source)) return source.trim();
  // Protect Markdown autolinks from the HTML parser on mixed-format pieces.
  const input = source.replace(/<(https?:\/\/[^\s<>]+)>/g, (_, url) => `[${url}](${url})`);
  const walk = (node) => {
    if (node.nodeName === "#text") return node.value;
    const text = (node.childNodes || []).map(walk).join("");
    const value = text.trim();
    if (/^h[1-6]$/.test(node.tagName || "")) return `\n\n${"#".repeat(Number(node.tagName[1]))} ${value}\n\n`;
    if (["p", "div", "section", "article", "ul", "ol"].includes(node.tagName)) return `\n\n${value}\n\n`;
    if (node.tagName === "li") return `${node.parentNode?.tagName === "ol" ? "1." : "-"} ${value}\n`;
    if (node.tagName === "em" || node.tagName === "i") return `*${value}*`;
    if (node.tagName === "strong" || node.tagName === "b") return `**${value}**`;
    if (node.tagName === "blockquote") return "\n\n" + value.split("\n").map((line) => `> ${line}`).join("\n") + "\n\n";
    if (node.tagName === "br") return "  \n";
    if (node.tagName === "a") {
      const href = attribute(node, "href");
      return /^(?:https?:\/\/|mailto:|\/(?!\/)|#)[^\s<>]*$/i.test(href) ? `[${value}](${href.replace(/\(/g, "%28").replace(/\)/g, "%29")})` : value;
    }
    return text;
  };
  return walk(parseFragment(input)).replace(/\n[\t ]*\n(?:[\t ]*\n)+/g, "\n\n").trim();
}

export function extractLegacyPhotos(source) {
  const root = parseFragment(source, {sourceCodeLocationInfo: true});
  const leaves = nodes(root, (node) => hasClass(node, "folio-leaf"));
  const photos = [];
  let previous = 0;
  const intro = [];
  for (const leaf of leaves) {
    const spread = nodes(leaf, (node) => hasClass(node, "spread"))[0];
    if (!spread?.sourceCodeLocation?.endTag || !leaf.sourceCodeLocation?.endTag) throw new Error("Unsupported gallery structure");
    intro.push(source.slice(previous, leaf.sourceCodeLocation.startOffset));
    previous = leaf.sourceCodeLocation.endOffset;
    const notes = legacyToMarkdown(source.slice(spread.sourceCodeLocation.endOffset, leaf.sourceCodeLocation.endTag.startOffset));
    const figures = nodes(spread, (node) => node.tagName === "figure");
    if (!figures.length || figures.length > 2) throw new Error("Unsupported photographic spread");
    for (const [index, figure] of figures.entries()) {
      const image = nodes(figure, (node) => node.tagName === "img")[0];
      const captionNode = nodes(figure, (node) => node.tagName === "figcaption")[0];
      if (!image || !captionNode) throw new Error("Incomplete original photograph");
      const placeNode = captionNode.childNodes.find((node) => node.tagName === "strong");
      photos.push({src: attribute(image, "src"), srcset: attribute(image, "srcset"), sizes: attribute(image, "sizes"),
        width: Number(attribute(image, "width")), height: Number(attribute(image, "height")), alt: attribute(image, "alt"),
        caption: captionNode.childNodes.filter((node) => node !== placeNode).map(plain).join("").trim(), place: placeNode ? plain(placeNode) : "",
        pair: index === 1, notes: index === figures.length - 1 ? notes : ""});
    }
  }
  if (photos.length < 2) throw new Error("Original image list is incomplete");
  intro.push(source.slice(previous));
  return {photos, writing: legacyToMarkdown(intro.join("\n"))};
}

export function parseWriting(source) {
  const match = /^---\r?\n([^]*?)\r?\n---\r?\n([^]*)$/.exec(source);
  if (!match) throw new Error("Missing publication metadata");
  const data = parseYaml(match[1], {maxAliasCount: 0});
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid publication metadata");
  const originalBody = match[2];
  const isPhoto = data.category === "Photo Essays";
  const legacy = isPhoto && !Array.isArray(data.photos) ? extractLegacyPhotos(originalBody) : null;
  return {data, originalBody, photos: isPhoto ? legacy?.photos || data.photos : null,
    writing: legacy?.writing ?? legacyToMarkdown(originalBody), legacyPhotos: !!legacy};
}
