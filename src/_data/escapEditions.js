const registry = require("../../edge/escap-locales.json");
const copy = Object.assign({}, ...["east", "south", "central", "west"].map((group) => require(`../../localisation/${group}.json`)));

module.exports = registry.map((entry) => {
  const [labels, intro, background, formats, degree, exchange, research, wage, jobs, skills, languages] = copy[entry.id] || [];
  if (labels?.length !== 11 || jobs?.length !== 5 || jobs.some((job) => job.length !== 2) ||
      [intro, background, formats, degree, exchange, research, wage, skills, languages].some((field) => !field)) {
    throw new Error(`Incomplete translation: ${entry.id}`);
  }
  const [profileLabel, field, education, governance, wageLabel, journalism, operations, skillsLabel, researchLink, workLink, english] = labels;
  return {
    ...entry, url: `/${entry.id}/about/`, intro, background, formats, degree, exchange, research, wage, jobs, skills, languages,
    education, governance, wageLabel, journalism, operations, skillsLabel, researchLink, workLink,
    metaTitle: `Ashton Milton | ${profileLabel} | ${field}`,
    welcome: {eyebrow: field, jump: profileLabel, lede: intro, exitTitle: english, exitLink: english}
  };
});
