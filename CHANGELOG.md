# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `src/settings-schema.ts`: the plugin's scoped settings are DECLARED as JSON
  Schema through `host.settings.declare`, so core generates the settings page's
  form, applies the defaults and repairs a malformed stored value.
  `OllamaProviderSettings` is the schema's `Static`.

### Changed

- `baseUrl` now overrides the endpoint through the declared settings handle;
  the hand-written `resolveOllamaBaseUrl` parser and its `stores.settings.get()`
  read are gone. The key is `restart` (the URL is baked into every published
  model at construction), exactly as before.
- POSTURE CHANGE: a malformed `baseUrl` no longer quarantines the plugin. The
  deleted parser THREW (the whole provider failed to load on a typo); core now
  repairs the value away — one boot-time warning — and the
  plugin boots on `https://ollama.com/v1`. The form refuses a malformed value at
  save (`format: "uri"`), so only a hand-edited file reaches the repair path.
- `baseUrl` is strict about scheme and whitespace: a value that is not a URI
  (including one with surrounding whitespace) is malformed. The deleted parser
  trimmed and accepted any non-empty string.
- peer `@sigrun/sigrun >=0.13.0` (the release carrying `host.settings.declare`),
  dev-pinned to the REGISTRY release `0.13.0` because this repo's CI runs
  without a core checkout; `typebox` `1.3.27` is now a peer as well as the dev
  pin. `scripts/check-manifest.mjs` pins both.

## [0.1.4] - 2026-11-08

- CI: grant actions: read to the release workflow (the release-test skip lookup). No code change.

## [0.1.3] - 2026-11-07

## [Unreleased]

### Changed

- peer pi-durable/pi-ai/chord ~1.5.0 (requires sigrun 0.11.0).

## [0.1.1] - 2026-10-27
### Changed
- Re-released through CI trusted publishing; this version carries SLSA
  provenance. No functional change from 0.1.0.

## [Unreleased]
### Changed
- Forward-compatible with pi-durable 1.4.0 (widened peer range). No behaviour change.

## [0.1.0] - 2026-10-18
### Changed
- Renamed to `@sigrun/provider-ollama` for the 0.1.0 release (GitHub
  repo `sigrun-ai/sigrun-provider-ollama`): published package metadata
  (`publishConfig` access/provenance), host modules
  (`@earendil-works/pi-ai`, `@earendil-works/pi-durable`) moved to
  `peerDependencies` mirrored in `devDependencies` at exact `1.3.0`,
  CHANGELOG.md joined the files whitelist, and a manifest hygiene check
  wired into `npm test`. The contributor identity follows the package
  slug: the factory result's `name` becomes `provider-ollama` and the
  scoped settings file `settings/provider-ollama.json` (the loader
  pre-keys the two-phase host from the package name; a stale declared
  name would split the factory-time settings scope).

### Added
- Deployment-configurable base URL: the (now async) factory reads
  `baseUrl` from the plugin's scoped settings
  (`settings/provider-ollama.json`) with the constant as fallback; a
  malformed override fails the factory loudly instead of silently
  falling back (mirrors sigrun-pareto; restart-required).
- Reference sigrun provider plugin: Ollama Cloud (`https://ollama.com/v1`)
  as one dynamic OpenAI-compatible provider (`provider: "ollama"` stamped on
  every catalog entry so persisted catalogs survive cold-boot restore).
- Provider-only contributor factory: `{ name: "provider-ollama", providers:
  [{ provider, readiness }], health }` — no pi-durable extension surface.
- Credential resolution through sigrun's auth.json bridge with
  `OLLAMA_API_KEY` as the ambient fallback (bridge credential always wins).
- Three-state readiness tracker (`not_configured` / `degraded` / `ready`)
  seeded from credential resolution and updated per refresh outcome;
  `console.warn` on state transitions only. `health()` maps `not_configured`
  to `"ok"` and configured-and-failing to `"degraded"`.
- `fetchModels` throws on unconfigured and on failure — never returns `[]`
  (an empty array would publish and wipe the persisted catalog).
