const stop = new Set("a an and are as at about by for from how in is it of on or the to was what when where which who why with".split(" "));
const topics = [
  ["Asia", "asia|asian|east asia|southeast asia|china|chinese|japan|japanese|thailand|thai|vietnam|vietnamese|philippines|filipino|indonesia|indonesian|malaysia|malaysian|singapore|korea|korean|taiwan|cambodia|laos|myanmar|india|indian|pakistan|bangladesh|nepal|sri lanka|tokyo|beijing|shanghai|bangkok|phuket|hanoi|seoul|el nido|manila|jakarta"],
  ["Cities and Infrastructure", "city|cities|urban|public space|urbanisation|municipal|infrastructure|transit|railway|metro|street|neighbourhood|housing"],
  ["Education", "education|school|schooling|enrolment|student|university|classroom"],
  ["Migration and Residency", "migration|migrant|immigration|hukou|household registration|residency|residence permit|citizenship"],
  ["Welfare and Social Protection", "welfare|social protection|social insurance|redistribution|income security|benefits|pension"],
  ["Work and Labour", "labour|labor|employment|informality|worker|workforce|wage|domestic labour|unpaid work"],
  ["Gender and Care", "gender|sexism|feminism|patriarchy|childcare|care work|domestic labour"],
  ["Inequality", "inequality|inequalities|unequal|exclusion|segregation|deprivation|poverty|disparity"],
  ["Public Policy and Governance", "public policy|governance|public administration|state capacity|public institutions|regulation|legislation"],
  ["Photography", "photography|photograph|photo essay|visual essay|photographic"],
  ["Public Health", "public health|pandemic|covid|covid 19|lockdown|quarantine"]
].map(([label, aliases]) => ({label, aliases: aliases.split("|")}));

export function normalise(text) {
  return String(text || "").normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "")
    .replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function root(word) {
  if (/ies$/.test(word) && word.length > 4) return word.slice(0, -3) + "y";
  if (/s$/.test(word) && !/(ss|us|is)$/.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}

const words = (text) => new Set(text.split(" ").map(root));
const contains = (text, term) => (` ${text} `).includes(` ${term} `);

export function queryWork(query) {
  const phrase = normalise(query);
  const parts = phrase.split(" ").filter(Boolean);
  const meaningful = parts.filter((word) => !stop.has(word));
  const terms = (meaningful.length ? meaningful : parts).filter((word) => word.length > 1 || /^\p{Script=Han}$/u.test(word));
  return {phrase, terms: [...new Set(terms)]};
}

export function workDocument(row) {
  const fields = [row.title, [row.description, ...(row.tags || []), row.kind].join(" "), row.text].map(normalise);
  return {fields, words: fields.map(words), corpus: fields.join(" ")};
}

function termScore(doc, term) {
  const stem = root(term);
  for (const [i, weight] of [20, 12, 5].entries()) {
    if (doc.words[i].has(stem) || (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Thai}/u.test(term) && doc.fields[i].includes(term))) return weight;
  }
  if (term.length >= 4 && doc.words.slice(0, 2).some((set) => [...set].some((word) => word.startsWith(term)))) return 3;
  return 0;
}

export function rankWork(doc, {phrase, terms}) {
  if (!terms.length) return 0;
  const exact = terms.map((term) => termScore(doc, term));
  const topicHits = topics.filter(({label, aliases}) => (label === "Asia" ? /^(?:(?:east|southeast|south east) )?asia(?:n)?$/.test(phrase) : aliases.some((alias) => contains(phrase, alias))) &&
    aliases.some((alias) => contains(doc.corpus, alias)));
  const related = terms.map((term) => topicHits.some(({aliases}) => aliases.some((alias) => contains(alias, term))) ? 2 : 0);
  if (!terms.every((_, i) => exact[i] || related[i])) return 0;
  const phraseBoost = doc.fields.reduce((score, field, i) => score + (contains(field, phrase) ? [24, 16, 8][i] : 0), 0);
  return exact.reduce((score, value, i) => score + (value || related[i]), phraseBoost);
}

export function searchTopic(query) {
  const {phrase} = queryWork(query);
  return topics.find(({aliases}) => aliases.some((alias) => contains(phrase, alias)))?.label || "Other";
}
