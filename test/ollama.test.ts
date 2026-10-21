/**
 * Contract tests for sigrun-ollama (provider plugins Task 7), hermetic:
 * every HTTP exchange goes to a node:http fixture server on 127.0.0.1 —
 * never the network, never process.env (ambient env arrives through the
 * injected AuthContext, the same seam sigrun's bridge uses).
 *
 * Model ids are synthetic (the repo convention: tests own their literals).
 */

import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createModels,
	type MutableModels,
} from "@earendil-works/pi-ai/models";
import type {
	AuthContext,
	CredentialStore,
	RefreshModelsContext,
} from "@earendil-works/pi-ai";
import sigrunOllama, {
	createOllamaPlugin,
	OLLAMA_API_KEY_ENV,
	OLLAMA_BASE_URL,
	OLLAMA_PROVIDER_ID,
	parseOllamaCatalog,
	resolveOllamaBaseUrl,
	type SigrunPluginHost,
} from "../src/index.js";

/** The OpenAI-compatible `[OI]` `/models` list shape Ollama Cloud serves. */
const CATALOG_BODY = {
	object: "list",
	data: [
		{ id: "acme-mini", object: "model", created: 1760000000, owned_by: "ollama" },
		{ id: "acme-large", object: "model", created: 1760000001, owned_by: "ollama" },
	],
};

interface RecordedRequest {
	readonly method: string;
	readonly path: string;
	readonly authorization?: string;
}

let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
let server: http.Server | undefined;
let baseUrl = "";
const requests: RecordedRequest[] = [];

beforeEach(async () => {
	requests.length = 0;
	server = http.createServer((req, res) => {
		requests.push({
			method: req.method ?? "",
			path: (req.url ?? "").split("?")[0],
			authorization: req.headers.authorization,
		});
		handler(req, res);
	});
	await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("fixture server did not report a port");
	}
	baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

afterEach(async () => {
	await new Promise<void>((resolve) => server?.close(() => resolve()));
	server = undefined;
});

function serveCatalog(): void {
	handler = (_req, res) => {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify(CATALOG_BODY));
	};
}

/** A read-only credential store holding one api key (or nothing). */
function credentialStore(key: string | undefined): CredentialStore {
	return {
		read: async () =>
			key === undefined ? undefined : { type: "api_key", key },
		list: async () => [],
		modify: async () => {
			throw new Error("unexpected credential write in tests");
		},
		delete: async () => {
			throw new Error("unexpected credential delete in tests");
		},
	};
}

/** Ambient env seam (the AuthContext pi-ai hands auth resolvers). */
function authContext(env: Record<string, string> = {}): AuthContext {
	return {
		env: async (name) => env[name],
		fileExists: async () => false,
	};
}

/** The seam-host slice, scoped to whatever settings the test wants. */
function host(settings: Record<string, unknown> = {}): SigrunPluginHost {
	return {
		stores: {
			settings: {
				get: async () => settings,
				set: async () => {
					throw new Error("unexpected settings write in tests");
				},
			},
		},
	};
}

function models(
	key: string | undefined,
	env: Record<string, string> = {},
): MutableModels {
	const models = createModels({
		credentials: credentialStore(key),
		authContext: authContext(env),
	});
	models.setProvider(createOllamaPlugin(baseUrl).provider);
	return models;
}

describe("the factory contract", () => {
	it("returns a provider-only contributor with an empty baseline catalog", async () => {
		const result = await sigrunOllama(host());
		expect(result.name).toBe("provider-ollama");
		// Provider-only: no extension field (the loader's Task 1 pathway).
		expect("extension" in result).toBe(false);
		expect(result.providers).toHaveLength(1);
		const contribution = result.providers[0]!;
		expect(contribution.provider.id).toBe(OLLAMA_PROVIDER_ID);
		expect(typeof contribution.readiness).toBe("function");
		expect(typeof result.health).toBe("function");
		// Review Focus 1: createProvider REQUIRES a baseline `models` array
		// (omitting it throws "baselineModels is not iterable") — and the
		// empty baseline means the provider boots with no models.
		expect(contribution.provider.getModels()).toEqual([]);
		// Arity 1: the host-taking signature (the loader's factory.length
		// gate passes the seam host only to factories that declare it).
		expect(sigrunOllama.length).toBe(1);
	});
});

describe("the scoped-settings base URL", () => {
	it("overrides the constant end to end (trimmed), absent settings fall back", async () => {
		serveCatalog();
		// Whitespace around the URL proves the trim.
		const result = await sigrunOllama(host({ baseUrl: `  ${baseUrl}  ` }));
		const store = createModels({
			credentials: credentialStore("bridged-key"),
			authContext: authContext({}),
		});
		store.setProvider(result.providers[0]!.provider);
		const refresh = await store.refresh({ force: true });
		expect(refresh.errors.size).toBe(0);
		// The override drove the fixture server, and the catalog is
		// stamped with the (trimmed) overridden base.
		expect(requests).toHaveLength(1);
		expect(requests[0]!.path).toBe("/v1/models");
		const catalog = store.getModels(OLLAMA_PROVIDER_ID);
		expect(catalog.map((model) => model.id)).toEqual([
			"acme-mini",
			"acme-large",
		]);
		expect(catalog.every((model) => model.baseUrl === baseUrl)).toBe(true);
	});

	it("resolves: absent → constant, valid → trimmed, malformed → throws", () => {
		expect(resolveOllamaBaseUrl({})).toBe(OLLAMA_BASE_URL);
		expect(resolveOllamaBaseUrl({ other: true })).toBe(OLLAMA_BASE_URL);
		expect(resolveOllamaBaseUrl({ baseUrl: `  ${baseUrl} ` })).toBe(baseUrl);
		expect(() => resolveOllamaBaseUrl({ baseUrl: "" })).toThrow(/baseUrl/);
		expect(() => resolveOllamaBaseUrl({ baseUrl: "   " })).toThrow(/baseUrl/);
		expect(() => resolveOllamaBaseUrl({ baseUrl: 42 })).toThrow(/baseUrl/);
		// A malformed override quarantines the factory loudly rather than
		// silently falling back to the constant.
	});
});

describe("catalog refresh", () => {
	it("publishes the /models catalog with provider: ollama stamped on every entry", async () => {
		serveCatalog();
		const store = models("bridged-key");
		const result = await store.refresh({ force: true });
		expect(result.errors.size).toBe(0);
		// Exactly one catalog GET against <baseUrl>/models.
		expect(requests).toHaveLength(1);
		expect(requests[0]!.method).toBe("GET");
		expect(requests[0]!.path).toBe("/v1/models");
		const catalog = store.getModels(OLLAMA_PROVIDER_ID);
		expect(catalog.map((model) => model.id)).toEqual([
			"acme-mini",
			"acme-large",
		]);
		for (const model of catalog) {
			// The stamp: pi-ai's restore path drops stored models whose
			// provider field differs from the registered id, and the /v1
			// model list filters by it — unstamped entries silently vanish.
			expect(model.provider).toBe(OLLAMA_PROVIDER_ID);
			expect(model.api).toBe("openai-completions");
			expect(model.baseUrl).toBe(baseUrl);
		}
	});

	it("authenticates with the bridged credential over the env fallback", async () => {
		serveCatalog();
		const result = await models("bridged-key", {
			[OLLAMA_API_KEY_ENV]: "env-key",
		}).refresh({ force: true });
		expect(result.errors.size).toBe(0);
		expect(requests[0]!.authorization).toBe("Bearer bridged-key");
	});

	it("falls back to the ambient OLLAMA_API_KEY when nothing is stored", async () => {
		serveCatalog();
		const store = models(undefined, { [OLLAMA_API_KEY_ENV]: "env-key" });
		const result = await store.refresh({ force: true });
		expect(result.errors.size).toBe(0);
		expect(requests[0]!.authorization).toBe("Bearer env-key");
		expect(store.getModels(OLLAMA_PROVIDER_ID).length).toBe(2);
	});
});

describe("the unconfigured provider", () => {
	it("never fetches, reports not_configured/ok, and fetchModels throws — never []", async () => {
		serveCatalog();
		const plugin = createOllamaPlugin(baseUrl);
		const store = createModels({
			credentials: credentialStore(undefined),
			authContext: authContext({}),
		});
		store.setProvider(plugin.provider);
		const result = await store.refresh({ force: true });
		// pi-ai never refreshes an unconfigured provider: no error, no
		// request, baseline catalog untouched.
		expect(result.errors.size).toBe(0);
		expect(requests).toHaveLength(0);
		expect(store.getModels(OLLAMA_PROVIDER_ID)).toEqual([]);
		expect(plugin.readiness()).toEqual({ status: "not_configured" });
		expect(plugin.health()).toBe("ok");
		// Review Focus 2: the never-[] invariant, pinned by direct
		// invocation — an unconfigured fetchModels THROWS; returning []
		// would publish and wipe the persisted catalog.
		const context: RefreshModelsContext = {
			allowNetwork: true,
			signal: new AbortController().signal,
			publish: async () => true,
		};
		await expect(
			plugin.provider.refreshModels?.(context),
		).rejects.toThrow(/not configured/);
	});
});

describe("readiness tracking", () => {
	it("transitions not_configured → ready → degraded, warning on transitions only", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			let failing = false;
			handler = (_req, res) => {
				if (failing) {
					res.writeHead(500);
					res.end("upstream exploded");
					return;
				}
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify(CATALOG_BODY));
			};
			const plugin = createOllamaPlugin(baseUrl);
			const store = createModels({
				credentials: credentialStore("bridged-key"),
				authContext: authContext({}),
			});
			store.setProvider(plugin.provider);

			// Seeded from credential resolution: not_configured until the
			// first auth resolution succeeds.
			expect(plugin.readiness()).toEqual({ status: "not_configured" });

			await store.refresh({ force: true });
			expect(plugin.readiness()).toEqual({ status: "ready" });
			const warnedAfterFirst = warn.mock.calls.length;
			expect(warnedAfterFirst).toBeGreaterThan(0);

			// A second successful refresh: same state, NO new warnings.
			await store.refresh({ force: true });
			expect(plugin.readiness().status).toBe("ready");
			expect(warn.mock.calls.length).toBe(warnedAfterFirst);

			// A failed refresh: degraded, previous catalog retained, the
			// failure recorded per-provider, one transition warning.
			failing = true;
			const failed = await store.refresh({ force: true });
			expect(failed.errors.get(OLLAMA_PROVIDER_ID)).toBeInstanceOf(Error);
			expect(plugin.readiness().status).toBe("degraded");
			expect(typeof plugin.readiness().detail).toBe("string");
			expect(plugin.health()).toBe("degraded");
			expect(store.getModels(OLLAMA_PROVIDER_ID).map((m) => m.id)).toEqual([
				"acme-mini",
				"acme-large",
			]);
			expect(warn.mock.calls.length).toBe(warnedAfterFirst + 1);
			expect(String(warn.mock.calls.at(-1))).toMatch(/→ degraded/);
		} finally {
			warn.mockRestore();
		}
	});

	it("maps not_configured to health ok (an unconfigured optional plugin is not degraded)", async () => {
		serveCatalog();
		const plugin = createOllamaPlugin(baseUrl);
		expect(plugin.health()).toBe("ok");
	});
});

describe("catalog parsing", () => {
	it("rejects malformed bodies instead of publishing garbage", () => {
		expect(() => parseOllamaCatalog(null, "https://ollama.com/v1")).toThrow(
			/\/models body/,
		);
		expect(() =>
			parseOllamaCatalog({ object: "list" }, "https://ollama.com/v1"),
		).toThrow(/data/);
		expect(() =>
			parseOllamaCatalog({ data: [{}] }, "https://ollama.com/v1"),
		).toThrow(/id/);
	});
});
