/**
 * Runtime-agnostic test harness.
 *
 * The test suite is written using the `node:test` lifecycle API
 * (`describe`/`test`/`before`/`after`) together with the `expect` matcher
 * library. This works great under `node --test`.
 *
 * Bun, however, only partially implements `node:test` and additionally has a
 * known interop bug where `import { expect } from "expect"` resolves to
 * `undefined` (see https://github.com/oven-sh/bun/issues/21326). Bun ships its
 * own Jest-compatible runner under `bun:test` instead.
 *
 * To run the exact same test files under both runtimes, every test module
 * imports its harness primitives from here, and we pick the appropriate source
 * based on the runtime.
 */

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The minimal subset of the `node:test` `TestContext` / `bun:test` context that
 * the test suite relies on (currently just `skip`/`todo`).
 */
export interface TestContext {
	skip: (message?: string) => void;
	todo: (message?: string) => void;
}

type TestFn = (t: TestContext) => void | Promise<void>;

interface Harness {
	describe: (name: string, ...rest: any[]) => unknown;
	test: ((name: string, fn: TestFn) => unknown) &
		((name: string, options: unknown, fn: TestFn) => unknown);
	before: (fn: () => void | Promise<void>) => unknown;
	after: (fn: () => void | Promise<void>) => unknown;
	expect: any;
}

async function loadHarness(): Promise<Harness> {
	if (isBun) {
		// Bun's Jest-compatible runner. `expect` here is Bun's native matcher,
		// which avoids the broken `expect@30` interop.
		// The specifier is built dynamically so that TypeScript (configured for
		// Node) doesn't try to resolve the Bun-only `bun:test` module.
		const bunTestSpecifier = ["bun", "test"].join(":");
		const bunTest = (await import(bunTestSpecifier)) as unknown as {
			describe: (name: string, fn: () => unknown) => unknown;
			test: ((name: string, fn: (t?: unknown) => unknown) => unknown) & {
				skip: (name: string, fn?: (t?: unknown) => unknown) => unknown;
			};
			// `bun:test` uses `beforeAll`/`afterAll`; `node:test` uses `before`/`after`.
			beforeAll: Harness["before"];
			afterAll: Harness["after"];
			expect: any;
		};

		// `node:test` exposes `t.skip()`/`t.todo()` on the per-test context, and
		// `describe(name, { skip: true }, fn)` accepts an options object. `bun:test`
		// does neither. We bridge the gap here so the shared test files work as-is.
		const SKIP = Symbol("skip");

		const describe: Harness["describe"] = (name, ...rest) => {
			// node:test allows `describe(name, options, fn)`; bun:test does not.
			const fn = (rest.length > 1 ? rest[1] : rest[0]) as () => unknown;
			const options = (rest.length > 1 ? rest[0] : undefined) as { skip?: boolean } | undefined;
			if (options?.skip) {
				return (bunTest.describe as any).skip?.(name, fn) ?? bunTest.describe(name, () => {});
			}
			return bunTest.describe(name, fn);
		};

		const test: Harness["test"] = ((name: string, ...rest: unknown[]) => {
			const fn = (rest.length > 1 ? rest[1] : rest[0]) as TestFn;
			return bunTest.test(name, async () => {
				const ctx: TestContext = {
					skip: () => {
						throw SKIP;
					},
					// `todo` just continues the test under Bun.
					todo: () => {},
				};
				try {
					await fn(ctx);
				} catch (e) {
					if (e === SKIP) {
						return; // treat an in-test skip as a pass under Bun
					}
					throw e;
				}
			});
		}) as Harness["test"];

		return {
			describe,
			test,
			before: bunTest.beforeAll,
			after: bunTest.afterAll,
			expect: bunTest.expect,
		};
	}

	const nodeTest = await import("node:test");
	const expectMod = await import("expect");
	// `expect` is exported as both a named and default export depending on the bundler.
	const expectFn = (expectMod as unknown as { expect?: unknown }).expect ?? expectMod.default;

	return {
		describe: nodeTest.describe as Harness["describe"],
		test: nodeTest.test as unknown as Harness["test"],
		before: nodeTest.before as Harness["before"],
		after: nodeTest.after as Harness["after"],
		expect: expectFn,
	};
}

const harness = await loadHarness();

export const describe = harness.describe;
export const test = harness.test;
export const before = harness.before;
export const after = harness.after;
export const expect = harness.expect;
