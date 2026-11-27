const existing = require("./aboutLocales.json");
const regional = require("../../edge/escap-locales.json");

module.exports = [...existing, ...regional.map(({id, lang, og}) => ({
  lang, og, url: `/${id}/about/`
}))].map((locale) => ({
  ...locale,
  label: locale.label || new Intl.DisplayNames([locale.lang, "en"], {type: "language"}).of(locale.lang),
  choice: locale.url === "/about/" ? "/?lang=en" : `${locale.url}?lang=${locale.url.split("/")[1]}`
}));
