# Ashton Milton

Static publication website for Ashton Milton, built with Eleventy. The public address is https://ashtonmilton.net/.

## Build and Check

Use Node.js 22 or newer and pnpm 11.7.0, matching the package manager setting. Python 3 is needed for the verification command; it is available on the GitHub-hosted Ubuntu runner.

```sh
pnpm install --frozen-lockfile
pnpm run build
python3 scripts/verify-site.py
```

Generated output is in `_site/`. Preview with `pnpm run serve` and use the address printed by Eleventy.

## Deploy

Create `ashtonmilton/ashtonmilton.github.io`. In repository Settings, open Pages and select GitHub Actions. The included workflow installs locked dependencies, builds and verifies the output, then deploys `_site/` on pushes to `main` or manual dispatch.

Set `ashtonmilton.net` as the custom domain in repository Pages settings before pointing DNS to GitHub. Preserve email DNS records. Enable HTTPS when available. An Actions deployment uses the domain setting; a source CNAME file is not required.

## Edit Content

- Main pages: `src/index.njk`, `src/research.njk`, `src/policy-analysis.njk`, `src/about.njk` and `src/contact.njk`
- Archive introduction: `src/writing/index.njk`
- Essays: `src/writing/essays/*.md`
- Shared templates: `src/_includes/`
- Identity and verified public profiles: `src/_data/site.json`
- Styles, fonts, image and favicon: `assets/`

For a new essay, follow an existing article’s structure. Supply a unique permalink, title, metaTitle, description, summary, category and tags. Supported category values are exactly `Independent work`, `Essays & reflections` and `Selected academic work`. Use `status: published` only for completed public work.

Reading time is manually maintained at approximately 220 words per minute, excluding references. The order field controls archive ordering. Exactly three essays should have `featured: true` for the homepage. Keep existing permalinks unless a redirect is planned.

Use lastmod only for a genuine modification date. Add date only for a real publication date; undated work is deliberately excluded from the feed. Do not leave a blank date field. There is no private draft workflow: a draft inside the source input may still produce a public page. A public repository exposes its files even when Eleventy does not render them. Keep private material outside the repository.

## Identity and Search

The sameAs array is deliberately empty until genuine public profile URLs have been supplied and checked. Add only complete HTTPS URLs belonging to Ashton Milton; the templates then include them in the shared Person identity. Do not add invented qualifications or affiliations.

The homepage provides WebSite data, About provides ProfilePage data and articles refer to the same Person identity with visible author attribution. No personal photograph is required. Search Console verification should use DNS, not a website tag. No Analytics or tracking scripts are installed. Metadata cannot guarantee a search position.

## Upload Hygiene

Include source, assets, scripts, workflow, package files, configuration, robots.txt and this README. Exclude private drafts, documents, backups, dependencies, generated output, reports, archives and credentials. The deployment uploads only the generated site.
