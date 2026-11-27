module.exports = {
  eleventyComputed: {
    pageLanguage: ({ edition }) => edition.lang,
    socialLocale: ({ edition }) => edition.og,
    pageDirection: ({ edition }) => edition.dir,
    metaTitle: ({ edition }) => edition.metaTitle,
    description: ({ edition }) => edition.intro,
    welcome: ({ edition }) => edition.welcome
  }
};
