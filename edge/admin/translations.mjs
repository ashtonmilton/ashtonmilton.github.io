import registry from "../escap-locales.json" with {type:"json"};
import facts from "../../src/_data/profileFacts.json" with {type:"json"};
import {PublishError} from "./publishing.mjs";

const regions = {
  east: "ko id ms km lo my tet",
  south: "prs ps dz dv bn ne fa tr",
  central: "ru hy az ka kk ky mn tg tk uz",
  west: "fr nl"
};
const paths = new Map(Object.entries(regions).flatMap(([region,codes]) => codes.split(" ").map((id) => [id,`localisation/${region}.json`])));
const names = new Intl.DisplayNames(["en-GB"], {type:"language"});
const exceptions = {prs:"Dari", tet:"Tetum"};
const labels = ["Profile Link Label", "Field Label", "Education Heading", "Research Heading", "Living Wage Heading",
  "Journalism Heading", "Operations Heading", "Skills Heading", "Research Link Label", "Work Link Label", "English Site Link Label"];
const body = ["Introduction", "Background", "Writing and Photography", "Degree", "Exchange Year", "Research Summary", "Living Wage Description"];
const descriptors = [
  ...labels.map((label,i) => ({label, indexes:[0,i], group:"Headings and Links", compact:true})),
  ...body.map((label,i) => ({label,indexes:[i+1],group:i<3 ? "Profile" : i<5 ? "Education" : "Research and Governance"})),
  ...facts.roles.flatMap(({name},i) => [{label:"Role",indexes:[8,i,0],group:name,compact:true},{label:"Description",indexes:[8,i,1],group:name}]),
  {label:"Skills",indexes:[9],group:"Skills and Languages"}, {label:"Languages",indexes:[10],group:"Skills and Languages"}
];

export const generatedProfiles = new Map(registry.map(({id,lang,dir}) => [`edition:${id}`,{
  id, path:paths.get(id), lang, dir:dir || "ltr", title:`About (${exceptions[id] || names.of(lang)})`, url:`/${id}/about/`
}]));

export function editionFields(source, edition) {
  const data = JSON.parse(source)[edition.id];
  const start = new RegExp(`^"${edition.id}":\\s*(?=\\[)`,"m").exec(source);
  if (!start || !Array.isArray(data)) throw new PublishError("This translation could not be opened.",409);
  const offset = start.index+start[0].length;
  const raw = /^(?:\[(?:"(?:[^"\\]|\\.)*"|[^"\[\]]|\[|\])*?)(?=,\r?\n"[^"]+":|\r?\n\})/.exec(source.slice(offset))?.[0];
  if (!raw || JSON.stringify(JSON.parse(raw)) !== JSON.stringify(data)) throw new PublishError("The translation format has changed.",409);
  const fields = descriptors.map((field) => {
    const value = field.indexes.reduce((row,index) => row?.[index],data);
    if (typeof value !== "string") throw new PublishError("This translation is incomplete.",409);
    return {...field,value,type:"translation"};
  });
  return {data,offset,raw,fields};
}

export function applyEdition(source, edition, form) {
  const {data,offset,raw,fields} = editionFields(source,edition);
  let changed = false;
  for (const [i,{indexes,value,compact}] of fields.entries()) {
    const input = form.get(`copy-${i}`);
    if (typeof input !== "string" || !input.trim() || input.length > (compact ? 300 : 4000) || /[<>\p{Cc}]/u.test(input)) throw new PublishError("Use plain, non-empty text for every translation field.");
    if (value === input) continue;
    const parent = indexes.slice(0,-1).reduce((row,index) => row[index],data);
    parent[indexes.at(-1)] = input;
    changed = true;
  }
  if (!changed) throw new PublishError("No changes to publish.");
  return source.slice(0,offset)+JSON.stringify(data)+source.slice(offset+raw.length);
}
