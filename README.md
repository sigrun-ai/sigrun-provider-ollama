# @sigrun/provider-ollama

The reference [sigrun](https://github.com/sigrun-ai/sigrun) provider
plugin: [Ollama Cloud](https://ollama.com) (`https://ollama.com/v1`,
OpenAI-compatible) as one dynamic chat provider.

## What it contributes

A **provider-only contributor** — the default export is a factory
returning `{ name: "provider-ollama", providers: [{ provider, readiness }],
health }` with no pi-durable extension surface. Sigrun's loader merges
the provider into its `Models` store at boot.

- **Provider** `ollama` — dynamic catalog fetched from `<base>/models`
  (OpenAI `[OI]` list shape) over `openai-completions`; boots with an
  empty baseline and publishes the fetched catalog.
- **Readiness** (`not_configured` / `degraded` / `ready`, surfaced on
  sigrun's `/v1/auth/check`) — seeded from credential resolution and
  updated per refresh outcome; state transitions log via `console.warn`
  (transitions only, never per failure). On the first configured boot
  the provider announces `startup → ready` at credential *resolution* —
  before any refresh has run (`ready` there means "credential resolved,
  refresh not yet attempted", not "catalog verified").
- **Health** — `degraded` only when the provider is configured and its
  last refresh failed; an unconfigured optional plugin reports `ok`.

## Credentials

Resolved per request through sigrun's auth.json bridge, falling back to
the ambient environment:

1. the bridged auth.json credential (`"default"` entry, then the
   `"ollama"` entry), then
2. `OLLAMA_API_KEY`.

The plugin never reads auth.json or `process.env` itself. Rotating the
key applies on the next resolution — no restart needed (there are no
plugin settings; the endpoint is fixed).

## Failure semantics

`fetchModels` **throws** when unconfigured or when the catalog fetch
fails — it never returns an empty array, which pi-ai would publish and
persist, wiping the catalog. A failed refresh retains the previous
catalog and records a per-provider error.

## Install

```jsonc
// settings.json (sigrun config dir) — the UNIFIED extensions list:
// install + load in one place; npm and git specifiers are the same list
// npm ("@sigrun/provider-ollama@^0.1.0"), git
// ("git:github.com/sigrun-ai/sigrun-provider-ollama", or any
// https git URL with an optional @ref), or the file: form below.
{
	"extensions": ["file:/path/to/sigrun-ollama"]
}
```

The committed `dist/` is the load target for git installs; pi-ai and
pi-durable are peerDependencies (sigrun supplies them at runtime);
they are mirrored in devDependencies for this repo's own build and tests.

## Development

```sh
npm install        # also builds dist/ via prepare
npm test           # vitest — hermetic fixture HTTP server, no network
npm run typecheck
npm run build
```

## License

MIT
