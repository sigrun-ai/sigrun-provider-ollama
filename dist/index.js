/**
 * sigrun-ollama — the reference sigrun provider plugin (provider plugins
 * Task 7): Ollama Cloud (`https://ollama.com/v1`) as one dynamic
 * OpenAI-compatible provider.
 *
 * The default export is the sigrun extension-package factory returning a
 * PROVIDER-ONLY contributor — `{ name, providers, health }` with no
 * `extension` field — consumed structurally by sigrun's loader (Task 1
 * pathway). Credentials resolve through sigrun's auth.json bridge (the
 * stored credential arrives as `credential` on the auth resolver, ambient
 * env as `ctx.env`) with `OLLAMA_API_KEY` as the fallback; the plugin
 * never reads auth.json or `process.env` itself.
 *
 * Runtime imports from pi-ai are deliberate (`createProvider` + the
 * OpenAI-completions api); the package still declares pi-ai/pi-durable as
 * devDependencies only, because sigrun (the host) ships them and
 * `syncPackages` installs with `--omit=dev` — the provider-plugins spec's
 * dependency posture.
 */
import { createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
/** The provider id models are registered (and stamped) under. */
export const OLLAMA_PROVIDER_ID = "ollama";
/** Ollama Cloud's OpenAI-compatible endpoint. */
export const OLLAMA_BASE_URL = "https://ollama.com/v1";
/** Ambient fallback when auth.json holds no credential. */
export const OLLAMA_API_KEY_ENV = "OLLAMA_API_KEY";
/**
 * Conservative placeholders for catalog entries Ollama's `/models` shape
 * gives no metadata for (no window, no limits, no rates). Same values as
 * sigrun's degenerate env provider (`DEFAULT_OPENAI_*`), keeping context
 * management deterministic against unknown windows.
 */
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
/**
 * Parse an OpenAI-compatible `[OI]` `/models` body into pi-ai chat models.
 * Every entry is stamped `provider: "ollama"` — pi-ai's restore path drops
 * stored models whose `provider` field differs from the registered id, so
 * an unstamped catalog silently vanishes on cold boot. Malformed bodies
 * throw (a refresh failure retains the previous catalog; garbage must
 * never publish).
 */
export function parseOllamaCatalog(body, baseUrl) {
    if (typeof body !== "object" || body === null) {
        throw new Error("ollama /models body is not a JSON object");
    }
    const data = body.data;
    if (!Array.isArray(data)) {
        throw new Error("ollama /models body has no data array");
    }
    return data.map((entry) => {
        const id = entry?.id;
        if (typeof id !== "string" || id.length === 0) {
            throw new Error("ollama /models entry without a string id");
        }
        const model = {
            id,
            name: id,
            api: "openai-completions",
            // THE stamp — see the doc comment above.
            provider: OLLAMA_PROVIDER_ID,
            baseUrl,
            // Ollama's /models carries no modality metadata; text is the
            // safe floor (claiming image without evidence would ship image
            // parts to models that cannot read them).
            input: ["text"],
            // Unknown rates: zeroed, usage tracking stays structural.
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            reasoning: false,
            contextWindow: DEFAULT_CONTEXT_WINDOW,
            maxTokens: DEFAULT_MAX_TOKENS,
        };
        return model;
    });
}
/**
 * Build the Ollama Cloud provider plus its readiness/health trackers.
 * `baseUrl` is overridable so hermetic tests drive a fixture server; the
 * default is the real cloud endpoint.
 */
export function createOllamaPlugin(baseUrl = OLLAMA_BASE_URL) {
    // Tracker state: seeded from credential resolution (pi-ai never
    // refreshes an unconfigured provider, so refresh outcomes alone cannot
    // express not_configured), updated per refresh outcome. Readiness and
    // health are synchronous derivations over this state.
    let credentialResolved = false;
    let lastRefreshFailed = false;
    let lastRefreshDetail;
    let lastAnnounced;
    function status() {
        if (!credentialResolved)
            return "not_configured";
        return lastRefreshFailed ? "degraded" : "ready";
    }
    /** Apply a state change; `console.warn` on transitions only. */
    function announce() {
        const next = status();
        if (next === lastAnnounced)
            return;
        console.warn(`sigrun-ollama: ollama ${lastAnnounced ?? "startup"} → ${next}` +
            (lastRefreshDetail !== undefined && next === "degraded"
                ? ` (${lastRefreshDetail})`
                : ""));
        lastAnnounced = next;
    }
    function noteCredential(resolved) {
        credentialResolved = resolved;
        announce();
    }
    function noteRefresh(ok, detail) {
        lastRefreshFailed = !ok;
        lastRefreshDetail = ok ? undefined : detail;
        announce();
    }
    const provider = createProvider({
        id: OLLAMA_PROVIDER_ID,
        name: "Ollama Cloud",
        baseUrl,
        // REQUIRED baseline: createProvider iterates it (omitting throws
        // "baselineModels is not iterable"); empty = purely dynamic.
        models: [],
        auth: {
            apiKey: {
                name: "Ollama Cloud API key (auth.json or OLLAMA_API_KEY)",
                resolve: async ({ credential, ctx }) => {
                    // Bridged auth.json credential (sigrun's bridge: the
                    // "default" entry first, then the provider's own) wins;
                    // the env var is the ambient fallback.
                    const stored = credential?.key?.trim() || undefined;
                    if (stored !== undefined) {
                        noteCredential(true);
                        return { auth: { apiKey: stored }, source: "auth.json" };
                    }
                    const envKey = (await ctx.env(OLLAMA_API_KEY_ENV))?.trim() || undefined;
                    if (envKey !== undefined) {
                        noteCredential(true);
                        return { auth: { apiKey: envKey }, source: OLLAMA_API_KEY_ENV };
                    }
                    // Unconfigured: undefined makes pi-ai skip the refresh
                    // phase entirely and requests fail loud.
                    noteCredential(false);
                    return undefined;
                },
            },
        },
        fetchModels: async (context) => {
            // The context credential is whatever auth resolution produced —
            // for this plugin always the merged api key; narrow rather than
            // trust the union.
            const key = context.credential?.type === "api_key"
                ? context.credential.key?.trim() || undefined
                : undefined;
            if (key === undefined) {
                noteCredential(false);
                // NEVER return [] — the createProvider wrapper publishes +
                // persists whatever fetchModels returns; an empty array
                // would wipe the catalog.
                throw new Error(`sigrun-ollama: Ollama Cloud is not configured ` +
                    `(no auth.json credential and no ${OLLAMA_API_KEY_ENV}); ` +
                    "refusing to publish an empty catalog");
            }
            const effectiveBase = context.baseUrl ?? baseUrl;
            // URL-join needs the trailing slash ("models" against a
            // slash-less base would resolve to the host root).
            const root = effectiveBase.endsWith("/") ? effectiveBase : `${effectiveBase}/`;
            try {
                const response = await fetch(new URL("models", root), {
                    headers: { Authorization: `Bearer ${key}` },
                    signal: context.signal,
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const models = parseOllamaCatalog(await response.json(), effectiveBase);
                noteRefresh(true);
                return models;
            }
            catch (cause) {
                // An aborted refresh is not a failed one: pi-ai discards
                // the outcome anyway, so the tracker must not move.
                if (context.signal.aborted)
                    throw cause;
                const message = cause instanceof Error ? cause.message : String(cause);
                noteRefresh(false, message);
                throw new Error(`sigrun-ollama: Ollama Cloud catalog refresh failed: ${message}`);
            }
        },
        api: openAICompletionsApi(),
    });
    return {
        provider,
        readiness: () => ({
            status: status(),
            ...(lastRefreshDetail !== undefined && status() === "degraded"
                ? { detail: lastRefreshDetail }
                : {}),
        }),
        // not_configured → ok (an unconfigured optional plugin is not a
        // degraded process); configured-and-failing → degraded; else ok.
        health: () => (status() === "degraded" ? "degraded" : "ok"),
    };
}
/**
 * The sigrun extension-package factory (provider-only contributor).
 * Arity 1 declares the host-taking signature — sigrun's loader passes the
 * seam host only to factories that declare one (`factory.length > 0`).
 * sigrun-ollama reads no scoped settings (fixed endpoint, ambient-keyed
 * auth), so the host is accepted for the reference shape and left unused;
 * plugins that do read settings await `host.stores.settings.get()` here.
 */
export default function sigrunOllama(host) {
    const plugin = createOllamaPlugin();
    return {
        name: "sigrun-ollama",
        providers: [{ provider: plugin.provider, readiness: plugin.readiness }],
        health: plugin.health,
    };
}
