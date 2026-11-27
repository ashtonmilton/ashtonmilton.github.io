const fs = require("fs");

function hasFrontMatterDate(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return false;
  const content = fs.readFileSync(inputPath, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return Boolean(match && /^date:\s*\S+/m.test(match[1]));
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy({ "assets/favicon.ico": "favicon.ico" });
  eleventyConfig.addPassthroughCopy("robots.txt");
  for (const { source, download } of require("./lib/publications.cjs")()) {
    eleventyConfig.addPassthroughCopy({ [source]: download.slice(1) });
  }
  eleventyConfig.addFilter("publicCatalogue", (rows) => rows.map(({ source, ...entry }) => entry));
  eleventyConfig.addFilter("displayDate", (date) => new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long", timeZone: "UTC"
  }).format(new Date(date)));

  eleventyConfig.addCollection("essays", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/writing/essays/*.md")
      .filter((item) => item.data.status !== "forthcoming")
      .sort((a, b) => (a.data.order || 999) - (b.data.order || 999));
  });

  eleventyConfig.addCollection("datedEssays", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/writing/essays/*.md")
      .filter((item) => item.data.status !== "forthcoming")
      .filter((item) => hasFrontMatterDate(item.inputPath) && item.data.date)
      .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
  });

  eleventyConfig.addCollection("sitemap", function (collectionApi) {
    return collectionApi
      .getAll()
      .filter((item) => item.url && item.data.sitemap !== false)
      .sort((a, b) => {
        const orderA = a.data.sitemapOrder || 999;
        const orderB = b.data.sitemapOrder || 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.url.localeCompare(b.url);
      });
  });

  eleventyConfig.addFilter("dateToIso", function (date) {
    if (!date) return "";
    return new Date(date).toISOString().slice(0, 10);
  });

  eleventyConfig.addFilter("dateToRfc3339", function (date) {
    if (!date) return "";
    return new Date(date).toISOString();
  });

  eleventyConfig.addFilter("hasFrontMatterDate", hasFrontMatterDate);

  eleventyConfig.addFilter("json", function (value) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};
