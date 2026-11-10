/**
 * Settings fakes for the declared-settings suite (settings rework, Task 9).
 *
 * The host slice the factory takes is built here over an IN-MEMORY settings
 * document, with `settings.declare` implemented on core's REAL
 * `checkStoredSettings` — so "the defaults", "a malformed value falls back"
 * and "an old file still loads" are facts about the same code core runs, not
 * a hand-written stand-in. The repairs the checked read reports are recorded
 * because they are exactly what core turns into the admin notice
 * (`src/harness/seam-host.ts`: one `console.warn` per path plus one
 * `settings.invalid` notice), so a test can assert the notice's trigger
 * without re-implementing the notice.
 *
 * `declare` is SINGLE-SHOT, like core's: a second declaration on one host
 * throws, so a test that accidentally runs the factory twice over one fake
 * fails here instead of passing on behaviour real core rejects.
 */

import type {
	DeclaredSettings,
	SettingsDeclaration,
} from "@sigrun/sigrun/extension";
import {
	checkStoredSettings,
	type SettingsRepair,
} from "@sigrun/sigrun/settings-schema";

import type { SigrunPluginHost } from "../src/index.js";

export interface FakeHost {
	/** The host slice the factory takes. */
	readonly host: SigrunPluginHost;
	/** The declaration the factory passed to `settings.declare`. */
	readonly declaration: SettingsDeclaration | undefined;
	/** Checked reads the factory performed through the declared handle. */
	readonly reads: number;
	/** The repairs the LAST checked read reported (core's notice trigger). */
	readonly repairs: readonly SettingsRepair[];
	/** The settings as the declared handle returns them. */
	read(): Promise<Record<string, unknown>>;
}

/** A declaring host over `settings`, an in-memory `settings/<slug>.json`. */
export function createFakeHost(
	settings: Record<string, unknown> = {},
): FakeHost {
	let declaration: SettingsDeclaration | undefined;
	let reads = 0;
	let repairs: readonly SettingsRepair[] = [];
	const declared = (): SettingsDeclaration => {
		if (declaration === undefined) throw new Error("the factory declared no settings");
		return declaration;
	};
	const check = (): Record<string, unknown> => {
		const checked = checkStoredSettings(declared().schema, settings);
		repairs = checked.repairs;
		return checked.value;
	};
	return {
		host: {
			settings: {
				declare<S, U = Record<string, unknown>>(decl: SettingsDeclaration) {
					if (declaration !== undefined) {
						throw new Error("settings.declare may only be called once per extension");
					}
					declaration = decl;
					return {
						get: async () => {
							reads += 1;
							return check() as S;
						},
						user: () => {
							throw new Error("provider-ollama declares no user schema");
						},
					} as unknown as DeclaredSettings<S, U>;
				},
			},
		},
		get declaration() {
			return declaration;
		},
		get reads() {
			return reads;
		},
		get repairs() {
			return repairs;
		},
		read: async () => check(),
	};
}
