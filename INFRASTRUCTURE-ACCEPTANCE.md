# Infrastructure Acceptance

## Confirmed on the Live Site

- Cloudflare is authoritative and the apex is proxied. GitHub Pages remains the origin. Apex HTTPS, www HTTPS, canonical redirects and direct origin certificate validation passed. The sampled CSS response used Brotli. The live audit retrieved 49 listed pages with each of four user-agent strings (196 requests); these are not verified crawler requests.
- The public homepage response did not contain the proposed security headers. No DS record was observed at the parent, and no public admin A record was observed. The Cloudflare account was not available in an authenticated session, so SSL mode, security settings, plan, existing Worker assignments and existing analytics configuration were not confirmed in the dashboard.
- The external reference audit returned one repeated 404. The repository changes that citation to the official statistics bureau release URL; the replacement returned HTTP 200 but its full body exceeded the local timeout. Bot-blocking responses and transient external timeouts were reported separately.

## Implemented, Awaiting Deployment or Activation

| Feature | Acceptance and Limits |
| --- | --- |
| International editions and search | 32 standalone editions remain. Canonical, alternate, sitemap, redirect and language-preference checks passed. Browser search returned relevant English, Simplified Chinese, Japanese and Thai results at a 390px viewport. Search is client-side and uses only published content. |
| Public edge Worker | Source and local simulation tested, with separate switches for security headers and routing. No live region or setting was changed. Mainstream international discovery is aided by metadata, not verified indexing. Mainland connectivity is unverified. |
| Images | Hero AVIF with the original JPEG fallback; photo essays retain existing WebP variants, alt text, ordering and originals. All 15 photographs have intrinsic dimensions and sitemap entries. |
| Analytics | Explicit opt-in behind an optional public beacon variable. No real analytics were collected or verified during development. The draft disclosure and Cloudflare settings need owner review before activation. |
| Publications | Validated metadata, release-only file passthrough, checksums and public catalogue. A private integration fixture built the entry and its downloadable CSV; the real catalogue is empty. |
| Administration | Separate Worker with tested authenticated-context, audience and email checks. Public hostname, Access policy and private analytics permissions are not provisioned. Mail, subscriber history and annual analytics have no connected source. |
| Monitoring | Build checks and a post-deployment/weekly workflow are committed. Scripts were run locally against the live domain; the workflow and its Lighthouse artifacts are not verified remotely until the commit is published. |

## Local Lighthouse Comparison

Lighthouse 13.6, simulated mobile, same local environment, one run for each baseline/release pair. These are lab observations, not field Core Web Vitals or measurements of Cloudflare delivery.

| Page | Performance | Accessibility | LCP | CLS | Transfer |
| --- | --- | --- | --- | --- | --- |
| Home | 100 → 100 | 100 → 100 | 1.80 s → 1.80 s | 0.021 → 0.000 | 629 kB → 425 kB |
| On Display | 85 → 96 | 100 → 100 | 2.41 s → 2.71 s | 0.248 → 0.000 | 1,696 kB → 1,303 kB |

The photo essay was more stable and transferred less, but its largest paint was slower in this sample. The scheduled Lighthouse workflow collects three runs per URL to make regression review less sensitive to one run.

## Cost and Handover

No new billable service was activated. Registrar and existing account costs were not inspected. Operation is designed for the current free allowances, subject to account eligibility and traffic. See [the infrastructure runbook](INFRASTRUCTURE.md) for the single activation checklist, owner approvals, supported metrics, backup and rollback steps.
