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
import { Type } from "typebox";
/**
 * Widen a TypeBox schema to the host's structural JSON-Schema contract
 * (`SettingsJsonSchema = Readonly<Record<string, unknown>>`): TypeBox's
 * TObject carries no string index signature, but every schema it builds
 * IS a plain JSON object. The `Static` type stays on the original.
 */
function asJsonSchema(schema) {
    return schema;
}
/**
 * Ollama Cloud's [OI]-compatible endpoint: the `baseUrl` default, and what a
 * repaired value falls back to.
 */
export const OLLAMA_BASE_URL = "https://ollama.com/v1";
export const OLLAMA_SETTINGS_SCHEMA = asJsonSchema(Type.Object({
    baseUrl: Type.Optional(Type.String({
        title: "Base URL",
        description: "The [OI]-compatible `/v1` base URL the catalog is fetched from (`<base>/models`) — a proxy or mirror. Ollama Cloud's own endpoint is the default.",
        // The deleted resolver trimmed the value before its non-empty
        // test; JSON Schema cannot trim, so `\S` is that same "not blank"
        // test — and `format: "uri"` adds the check the resolver never
        // made, so a padded or scheme-less value is malformed (repaired to
        // the default) instead of silently trimmed or
        // passed to the client.
        minLength: 1,
        pattern: "\\S",
        format: "uri",
        // The deleted resolver's "absent → the constant", made
        // declarative: core materialises it on every checked read, so the
        // page shows the endpoint and a repaired value lands back on it.
        default: OLLAMA_BASE_URL,
        "x-sigrun-apply": "restart",
    })),
}));
