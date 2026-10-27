# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-10-27
### Changed
- Re-released through CI trusted publishing; this version carries SLSA
  provenance. No functional change from 0.1.0.

## [Unreleased]

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
