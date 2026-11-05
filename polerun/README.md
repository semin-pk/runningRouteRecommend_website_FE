# PoleRun public pages

Canonical homepage: `https://www.run2yourstyle.com/polerun/`.

`node polerun/build.mjs` generates `dist/polerun/`. The root build invokes this after the existing website and Route Agent builds. No dependency or environment secret is needed for these static pages.

Routes: `/polerun/`, `/polerun/privacy/`, `/polerun/terms/`, `/polerun/location/`, `/polerun/disclosures/`, `/polerun/support/`, `/polerun/courses/?id=<UUID>`.

The HTML uses its own stylesheet and loads no advertising or analytics script. Only the course page fetches the existing public course-sharing API using a public anonymous key. It never requests account sessions or private runs. App links keep the existing `crewjam` scheme.

Source content was migrated from PoleRun's `sites/polerun-public` on 2026-11-05. The policy content and pre-launch status are preserved. Moving these pages does not activate legal terms, consent, or change authentication callbacks. Confirm future policy changes against PoleRun's canonical `docs/policies/` manuscripts.

The current host resolves directory index pages and redirects paths without a trailing slash. Verify all routes after Amplify publishes the build; do not replace the existing website or `/agent` rewrite rules. The root build script and existing Amplify environment remain in use.

`node polerun/check.mjs` validates scoped internal links, assets, canonical URLs, support information, pre-launch policy status and the public API key role. Google domain ownership and branding URLs must also be verified in the operator's Google project; copying a verification tag is not proof that a new domain is verified.
