module.exports = class {
  data() {
    return {permalink: "/_readership-switch.css", eleventyExcludeFromCollections: true};
  }

  async render() {
    const {switchCss} = await import("../edge/readership-consent.mjs");
    return switchCss;
  }
};
