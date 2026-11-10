/**
 * @sigrun/provider-ollama — the reference sigrun provider plugin (provider plugins
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
 *
 * Settings are declared as JSON Schema (`src/settings-schema.ts`) and read
 * through the declared handle, so core owns the settings page's form, the
 * defaults and the malformed-value repair for the one key this plugin has
 * (`baseUrl`). The declared name and the package name are the same string,
 * so the loader's provisional slug equals the final slug (`provider-ollama`)
 * and a factory-time read through the handle resolves the file the settings
 * page writes. It reads once, because the URL is baked into every model the
 * provider publishes (`restart`).
 */
import { type Provider } from "@earendil-works/pi-ai/models";
import type { Model } from "@earendil-works/pi-ai";
import type { DeclaredSettings, SettingsDeclaration } from "@sigrun/sigrun/extension";
/** The provider id models are registered (and stamped) under. */
export declare const OLLAMA_PROVIDER_ID = "ollama";
/** Ambient fallback when auth.json holds no credential. */
export declare const OLLAMA_API_KEY_ENV = "OLLAMA_API_KEY";
export { OLLAMA_BASE_URL, OLLAMA_SETTINGS_SCHEMA } from "./settings-schema.js";
export type { OllamaProviderSettings } from "./settings-schema.js";
/**
 * Structural slice of sigrun's seam host (src/harness/seam-host.ts) a
 * provider plugin may consume: the declared-settings handle (settings
 * rework), whose `get()` returns this plugin's own
 * `settings/<slug>.json` with defaults applied and malformed values
 * repaired. Declared here — structurally, like the bridge's pi-ai
 * re-declarations — because the plugin cannot import sigrun core; the two
 * FUNCTION SHAPES it references are the host's own published declaration
 * types (`@sigrun/sigrun/extension` is type-only, so nothing of core is
 * bundled or loaded at runtime). The read is async-only, which is why the
 * loader awaits factory results.
 */
export interface SigrunPluginHost {
    readonly settings: {
        declare<S = Record<string, unknown>, U = Record<string, unknown>>(declaration: SettingsDeclaration): DeclaredSettings<S, U>;
    };
}
/** Sigrun's three-state per-provider readiness vocabulary (Task 6). */
export type ProviderReadinessStatus = "not_configured" | "degraded" | "ready";
/** One tracker report: the status plus optional operator-facing detail. */
export interface ProviderReadiness {
    readonly status: ProviderReadinessStatus;
    readonly detail?: string;
}
/** Sigrun's §3 health vocabulary. */
export type HealthStatus = "ok" | "degraded";
/**
 * The provider-plugin factory result (the loader's Task 1 contract):
 * a provider-only contributor — `{ name, providers, health? }`, no
 * `extension`. Structural, like the host slice above.
 */
export interface ProviderPluginResult {
    readonly name: string;
    readonly providers: readonly {
        readonly provider: Provider;
        readonly readiness?: () => ProviderReadiness;
    }[];
    readonly health?: () => HealthStatus;
}
/**
 * Parse an OpenAI-compatible `[OI]` `/models` body into pi-ai chat models.
 * Every entry is stamped `provider: "ollama"` — pi-ai's restore path drops
 * stored models whose `provider` field differs from the registered id, so
 * an unstamped catalog silently vanishes on cold boot. Malformed bodies
 * throw (a refresh failure retains the previous catalog; garbage must
 * never publish).
 */
export declare function parseOllamaCatalog(body: unknown, baseUrl: string): Model<"openai-completions">[];
/** One built plugin: the contribution's parts, sharing the tracker closure. */
export interface OllamaPlugin {
    readonly provider: Provider;
    /** Synchronous read over plugin-owned state (never network/storage). */
    readonly readiness: () => ProviderReadiness;
    readonly health: () => HealthStatus;
}
/**
 * Build the Ollama Cloud provider plus its readiness/health trackers.
 * `baseUrl` is overridable so hermetic tests drive a fixture server; the
 * default is the real cloud endpoint.
 */
export declare function createOllamaPlugin(baseUrl?: string): OllamaPlugin;
/**
 * The sigrun extension-package factory (provider-only contributor).
 * Arity 1 declares the host-taking signature — sigrun's loader passes the
 * seam host only to factories that declare one (`factory.length > 0`) —
 * and the factory is ASYNC because the declared-settings read is
 * async-only; sigrun's loader awaits factory results.
 *
 * Settings are DECLARED first (`src/settings-schema.ts` — core owns the
 * page, the defaults and the malformed-value repair) and read ONCE, then
 * baked into the provider: the base URL is factory-time, so the property is
 * `restart`. An absent `baseUrl` — and one core REPAIRED to the key's
 * default, the posture change from the deleted resolver's throw — reads back
 * as the cloud endpoint the schema declares. The declared name and this
 * package's name are the same string (`provider-ollama`), so the loader's
 * provisional slug IS the final slug and the factory-time read resolves
 * `settings/provider-ollama.json`, the file deployments behind a proxy or
 * mirror (and hermetic test fixtures) redirect the endpoint with.
 */
export default function sigrunOllama(host: SigrunPluginHost): Promise<ProviderPluginResult>;
