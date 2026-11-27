const existing = require("./aboutLocales.json");
const regional = require("../../edge/escap-locales.json");

module.exports = [...existing, ...regional.map(({id, lang, og}) => ({
  lang, og, url: `/${id}/about/`
}))];
