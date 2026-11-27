module.exports = {
  eleventyComputed: { permalink: ({ publications }) => publications.length ? "/publications/" : false }
};
