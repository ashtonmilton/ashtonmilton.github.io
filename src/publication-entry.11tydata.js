module.exports = {
  eleventyComputed: {
    title: ({ publication }) => publication?.title,
    description: ({ publication }) => publication?.description,
    lastmod: ({ publication }) => publication?.date,
    category: ({ publication }) => publication?.type,
    tags: ({ publication }) => publication?.keywords,
    ogType: "article"
  }
};
