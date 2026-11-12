/**
 * The plugin's declared settings (settings rework, Task 9): one JSON Schema
 * through `host.settings.declare`, so core draws the settings page, applies
 * the defaults and repairs a malformed stored value. Every default asserted
 * here is the deleted `resolveOllamaBaseUrl`'s (`git show HEAD~1:src/index.ts`),
 * with the one posture change the rework intends: a malformed `baseUrl` used
 * to THROW (quarantining the plugin) and now falls back to the default
 * endpoint with core's repair notice.
 */
import { describe, expect, it } from "vitest";
import { assertDrawable, checkStoredSettings } from "@sigrun/sigrun/settings-schema";

import sigrunOllama, {
	OLLAMA_BASE_URL,
	OLLAMA_PROVIDER_ID,
	type ProviderPluginResult,
} from "../src/index.js";
import { OLLAMA_SETTINGS_SCHEMA } from "../src/settings-schema.js";
import { createFakeHost } from "./fake-host.js";

/** A live install's file: a proxy in front of Ollama Cloud. */
const OLD_FILE = { baseUrl: "https://ollama-proxy.example/v1" };

/** One factory run over `settings`, and the provider it built. */
async function declared(settings?: Record<string, unknown>): Promise<{
	fake: ReturnType<typeof createFakeHost>;
	result: ProviderPluginResult;
	baseUrl: string | undefined;
}> {
	const fake = createFakeHost(settings);
	const result = await sigrunOllama(fake.host);
	return { fake, result, baseUrl: result.providers[0]!.provider.baseUrl };
}

describe("ollama settings schema", () => {
	it("schema is drawable", () => {
		// No property may fall back to a JSON box: the page is a form, not an
		// editor, and `assertDrawable` also runs the load-time keyword checks.
		assertDrawable(OLLAMA_SETTINGS_SCHEMA);
	});

	it("factory declares its title", async () => {
		const { result } = await declared();
		expect(result.title).toBe("Ollama");
		// The identity is unchanged: the display title never becomes the slug.
		expect(result.name).toBe("provider-ollama");
	});

	it("defaults match the old parser", async () => {
		// The deleted resolver returned OLLAMA_BASE_URL for an absent key and
		// for a document with no usable one. The schema states that same
		// default, so the page shows the endpoint every install uses and an
		// absent file reads back as the constant.
		expect(checkStoredSettings(OLLAMA_SETTINGS_SCHEMA, {}).value).toEqual({
			baseUrl: OLLAMA_BASE_URL,
		});
		// Unknown keys survive the read untouched (the page lists them as
		// advanced/unknown; nothing here repairs them away).
		expect(checkStoredSettings(OLLAMA_SETTINGS_SCHEMA, { other: true }).value).toEqual({
			baseUrl: OLLAMA_BASE_URL,
			other: true,
		});

		const { fake, baseUrl } = await declared();
		// Declared once, read once, at boot (`x-sigrun-apply: restart`).
		expect(fake.declaration).toEqual({ schema: OLLAMA_SETTINGS_SCHEMA });
		expect(fake.reads).toBe(1);
		expect(baseUrl).toBe(OLLAMA_BASE_URL);
	});

	it("an old settings file still loads", async () => {
		// Nothing to repair: the documented shape is schema-valid as written,
		// and the override reaches every published model's base URL.
		expect(checkStoredSettings(OLLAMA_SETTINGS_SCHEMA, OLD_FILE).repairs).toEqual([]);
		const { fake, result, baseUrl } = await declared(OLD_FILE);
		expect(await fake.read()).toEqual(OLD_FILE);
		expect(fake.repairs).toEqual([]);
		expect(baseUrl).toBe(OLD_FILE.baseUrl);
		expect(result.providers[0]!.provider.id).toBe(OLLAMA_PROVIDER_ID);
	});

	it("empty file equals old defaults", async () => {
		// No settings file at all: the plugin boots exactly as before — the
		// cloud endpoint, an empty baseline catalog, and an unconfigured
		// provider (the optional plugin's health stays ok).
		const { result, baseUrl } = await declared();
		expect(baseUrl).toBe(OLLAMA_BASE_URL);
		expect(result.providers[0]!.provider.getModels()).toEqual([]);
		expect(result.providers[0]!.readiness!()).toEqual({ status: "not_configured" });
		expect(result.health!()).toBe("ok");
	});

	it("a malformed baseUrl falls back with a notice", async () => {
		// THE POSTURE CHANGE. The deleted resolver threw on every one of these,
		// quarantining the whole plugin; the checked read now replaces the value
		// with the schema's default — a repair core logs and turns into one
		// `settings.invalid` admin notice — and the plugin boots on the default
		// endpoint.
		for (const malformed of ["not a url", "", "   ", 42, "gateway.example/v1"]) {
			const { fake, baseUrl } = await declared({ baseUrl: malformed });
			expect(fake.repairs).toEqual([
				{ path: "/baseUrl", action: "replaced", message: expect.any(String) },
			]);
			expect(baseUrl).toBe(OLLAMA_BASE_URL);
		}
		// A whitespace-padded URL is malformed too: JSON Schema cannot trim, and
		// the form's `format: "uri"` check is what refuses it (the deleted
		// resolver silently trimmed instead).
		const padded = await declared({ baseUrl: `  ${OLD_FILE.baseUrl}  ` });
		expect(padded.fake.repairs.map((repair) => repair.path)).toEqual(["/baseUrl"]);
		expect(padded.baseUrl).toBe(OLLAMA_BASE_URL);
	});
});
