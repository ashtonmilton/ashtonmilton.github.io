# ESCAP Localisation Plan

The English About page is the editorial master. Translate only that profile and its welcome-page controls, not the rest of the site. Use the same sections, affiliations, dates, disclosures and links, with natural wording in each language. See the [ESCAP membership roster](https://www.unescap.org/about/member-states); associate members are outside this rollout. The table is a proposed editorial allocation, not a list of every official or community language.

| Editions | Languages and Countries | Routing Decision |
| --- | --- | --- |
| Implemented in source | Simplified Chinese (China), Japanese (Japan), Thai (Thailand), Vietnamese (Viet Nam) | Four standalone welcome pages. One edition per language. |
| East and Southeast Asia | Korean (both Koreas), Indonesian (Indonesia), Malay (Malaysia and Brunei Darussalam), Khmer (Cambodia), Lao (Lao PDR), Burmese (Myanmar), Tetum (Timor-Leste) | Share a Korean edition and a Malay edition where their wording can be neutral and locally reviewed. Do not assume mainland access, including in the DPRK. |
| South and South-West Asia | Bengali (Bangladesh), Dzongkha (Bhutan), Nepali (Nepal), Dhivehi (Maldives), Persian (Iran), Turkish (Türkiye), Dari and Pashto (Afghanistan) | For Afghanistan, prefer the matching browser language if both editions are ready, with English fallback for an ambiguous preference. Dari should not silently redirect to an Iranian edition. |
| North and Central Asia | Armenian (Armenia), Azerbaijani (Azerbaijan), Georgian (Georgia), Kazakh (Kazakhstan), Kyrgyz (Kyrgyzstan), Mongolian (Mongolia), Russian (Russian Federation), Tajik (Tajikistan), Turkmen (Turkmenistan), Uzbek (Uzbekistan) | Do not use Russian as a proxy for other countries. Choose writing systems and fonts with native reviewers. |
| European members | French (France), Dutch (Kingdom of the Netherlands) | These are ESCAP members, even though these editions are not for Asian IPs. |
| English edition | Australia, Fiji, India, Kiribati, Marshall Islands, Micronesia, Naoero, New Zealand, Pakistan, Palau, Papua New Guinea, Philippines, Samoa, Singapore, Solomon Islands, Sri Lanka, Tonga, Tuvalu, United Kingdom, Vanuatu | Keep English as an available shared edition, not a claim that it is everyone’s first or preferred language. Review this choice locally before extending a rollout. |

## Editorial and Technical Release Gate

1. Before activating production routing, verify each country-to-language choice and script against local institutional sources. Match the English About lead, background, education, research and governance, journalism, operations and skills. Preserve original proper names and use accepted translations for institutions. Treat different career dates, roles and research claims as errors, not localisation choices.
2. Have a fluent local reader check idiom, professional titles, research terms and layout. Include RTL testing for Persian, Dari and Pashto; do not route to an edition awaiting that check.
3. Use the existing standalone profile layout, one canonical URL per language and the existing English continuation link. Add the locale to the reciprocity registry so sitemap and search-language checks can cover it. Do not restore visible language tabs on English About.
4. Add the country code to the Worker only after that translation exists and has been checked. Test every route and the English fallback. Country lookup is an approximate default, not a language detector. Do not redirect deep links or visitors who have selected English. Unknown countries and unpublished locales remain in English.
5. Deploy the static pages before enabling or updating the Worker. Follow [the activation and rollback procedure](INTERNATIONAL.md). All editions in the table build from source; the translations have not been independently reviewed by native editors. IP routing requires the separately approved Cloudflare setup; publishing to GitHub Pages alone does not turn it on.

When English About changes, review that diff against every translated edition in the same release. Automated tests can catch missing sections, language annotations and routing targets, but cannot certify translation quality.
