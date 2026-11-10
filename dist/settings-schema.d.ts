/**
 * @sigrun/provider-ollama's declared settings (settings rework, Task 9): the
 * whole scoped surface — one key, `baseUrl` — as one JSON Schema, declared
 * through `host.settings.declare`. Core draws the settings page's form from
 * it, applies the defaults and repairs a malformed stored value back to its
 * default.
 *
 * THE POSTURE CHANGE. The deleted `resolveOllamaBaseUrl` THREW on a malformed
 * `baseUrl`, quarantining the whole plugin on a typo. Core's checked read now
 * repairs the value to its default (one logged boot-time warning), so
 * the plugin boots on {@link OLLAMA_BASE_URL} instead. The form refuses a
 * malformed value at save (`format: "uri"`), so only a hand-edited file can
 * reach the repair path.
 *
 * The key is `restart` (`x-sigrun-apply`): the factory reads it ONCE and bakes
 * it into the base URL every published model is stamped with, so an edited
 * value lands at the next boot — the contract this package already documents.
 */
import { Type, type Static } from "typebox";
/**
 * Ollama Cloud's [OI]-compatible endpoint: the `baseUrl` default, and what a
 * repaired value falls back to.
 */
export declare const OLLAMA_BASE_URL = "https://ollama.com/v1";
export declare const OLLAMA_SETTINGS_SCHEMA: Type.TObject<{
    baseUrl: Type.TOptional<Type.TString>;
}> & Readonly<Record<string, unknown>>;
export type OllamaProviderSettings = Static<typeof OLLAMA_SETTINGS_SCHEMA>;
