import { Readable } from "node:stream";
import type { HttpMethod } from "./index.ts";

/** The body type accepted by the global `fetch`, derived from `RequestInit`. */
type FetchBodyInit = NonNullable<RequestInit["body"]>;

/**
 * A minimal response interface that lean-s3 consumes internally.
 *
 * lean-s3 was originally built on undici's `request()` for performance reasons
 * (see `DESIGN_DECISIONS.md`). undici is still the preferred backend on Node.js.
 * However, some runtimes (most notably Bun) don't implement the undici
 * `Dispatcher`/`request` API. For those, we fall back to the global `fetch`.
 *
 * Both backends are normalized to this shape, which mirrors the small subset of
 * the undici response surface that lean-s3 actually uses:
 *
 * - `statusCode`
 * - `headers` (a plain, lower-cased object)
 * - `body.text()`
 * - `body.dump()` (drain & discard the body)
 * - `body.on("data" | "end" | "error", ...)` for streaming
 */
export interface ResponseBody {
	/** Reads the full body as a UTF-8 string. */
	text(): Promise<string>;
	/** Drains and discards the body. Mirrors undici's `BodyReadable.dump()`. */
	dump(): Promise<void>;
	/** Subscribe to stream events (`"data"`, `"end"`, `"error"`). */
	// biome-ignore lint/suspicious/noExplicitAny: event listener signature
	on(event: string, listener: (...args: any[]) => void): unknown;
	/** Subscribe to a stream event once. */
	// biome-ignore lint/suspicious/noExplicitAny: event listener signature
	once(event: string, listener: (...args: any[]) => void): unknown;
}

export interface ResponseData {
	statusCode: number;
	headers: Record<string, string | string[] | undefined>;
	body: ResponseBody;
}

export interface RequestOptions {
	method: HttpMethod;
	signal?: AbortSignal | null;
	headers: Record<string, string | undefined>;
	body?: FetchBodyInit | Buffer | Uint8Array | Readable | null;
}

export type RequestFn = (url: URL | string, options: RequestOptions) => Promise<ResponseData>;

/**
 * Whether the current runtime is Bun.
 *
 * Bun ships an incomplete undici implementation (e.g. `BodyReadable.dump()` and
 * the `Agent` dispatcher are missing), so we must use the `fetch` backend there.
 */
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

//#region undici backend

interface UndiciModule {
	request: (url: URL | string, options: unknown) => Promise<UndiciResponse>;
	Agent: new () => unknown;
}

interface UndiciResponse {
	statusCode: number;
	headers: Record<string, string | string[] | undefined>;
	body: ResponseBody;
}

/**
 * Builds a `request()` backed by undici. Returns `undefined` if undici can't be
 * loaded or initialized (e.g. it isn't installed, or the runtime doesn't support it).
 */
async function tryCreateUndiciBackend(): Promise<RequestFn | undefined> {
	try {
		const undici = (await import("undici")) as unknown as UndiciModule;

		// Instantiating an Agent also validates that the dispatcher API is usable.
		const dispatcher = new undici.Agent();
		const undiciRequest = undici.request;

		return (url, options) =>
			undiciRequest(url, {
				method: options.method,
				signal: options.signal,
				dispatcher,
				headers: options.headers,
				body: options.body,
			}) as Promise<ResponseData>;
	} catch {
		return undefined;
	}
}

//#endregion

//#region fetch backend

function headersToObject(headers: Headers): Record<string, string | string[] | undefined> {
	const result: Record<string, string | string[] | undefined> = {};
	headers.forEach((value, key) => {
		// Header keys from `Headers` are already lower-cased.
		const existing = result[key];
		if (existing === undefined) {
			result[key] = value;
		} else if (Array.isArray(existing)) {
			existing.push(value);
		} else {
			result[key] = [existing, value];
		}
	});
	return result;
}

function toFetchBody(body: RequestOptions["body"]): {
	body: FetchBodyInit | undefined;
	duplex: "half" | undefined;
} {
	if (body === undefined || body === null) {
		return { body: undefined, duplex: undefined };
	}

	if (body instanceof Readable) {
		// Convert a Node.js Readable into a web ReadableStream so `fetch` can consume it.
		const webStream = Readable.toWeb(body) as unknown as ReadableStream;
		return { body: webStream as unknown as FetchBodyInit, duplex: "half" };
	}

	if (Buffer.isBuffer(body)) {
		// Buffer is a Uint8Array, but normalize to a plain view to keep fetch happy across runtimes.
		return {
			body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
			duplex: undefined,
		};
	}

	return { body: body as FetchBodyInit, duplex: undefined };
}

function makeFetchResponseBody(response: Response): ResponseBody {
	const webBody = response.body;

	let consumed = false;

	// lean-s3's streaming consumer (`S3Client#kStream`) only ever attaches:
	//   - `on("data", chunk => ...)`
	//   - `once("error", err => ...)`
	//   - `once("end", () => ...)`
	// We implement these directly on top of the web `ReadableStream` reader, which
	// avoids the overhead of converting to a Node.js `Readable` via
	// `Readable.fromWeb` on the read hot path. Chunks are delivered as the same
	// `Uint8Array`s produced by `fetch`, which is exactly what the consumer
	// re-enqueues into its own byte stream.
	let onData: ((chunk: Uint8Array) => void) | undefined;
	let onEnd: (() => void) | undefined;
	let onError: ((error: unknown) => void) | undefined;
	let pumpStarted = false;

	function startPump(): void {
		if (pumpStarted) {
			return;
		}
		pumpStarted = true;
		consumed = true;

		if (!webBody) {
			// No body (e.g. HEAD responses): synthesize an immediate end.
			queueMicrotask(() => onEnd?.());
			return;
		}

		const reader = webBody.getReader();
		const pump = (): void => {
			reader.read().then(
				({ done, value }) => {
					if (done) {
						onEnd?.();
						return;
					}
					if (value) {
						onData?.(value as Uint8Array);
					}
					pump();
				},
				error => onError?.(error),
			);
		};
		pump();
	}

	const body: ResponseBody = {
		on(event, listener) {
			if (event === "data") {
				onData = listener;
			} else if (event === "end") {
				onEnd = listener;
			} else if (event === "error") {
				onError = listener;
			}
			// `on("data", ...)` is the trigger that starts consumption, mirroring
			// Node streams switching to flowing mode on a `data` listener.
			if (event === "data") {
				startPump();
			}
			return body;
		},
		once(event, listener) {
			return body.on(event, listener);
		},
		async text(): Promise<string> {
			consumed = true;
			return await response.text();
		},
		async dump(): Promise<void> {
			if (consumed) {
				return;
			}
			consumed = true;
			try {
				// Cancel the underlying stream so the connection can be reused/released.
				if (webBody && !webBody.locked) {
					await webBody.cancel();
				}
			} catch {
				// Ignore errors while discarding the body.
			}
		},
	};

	return body;
}

/**
 * `request()` implemented on top of the global `fetch`. Used as a fallback when
 * undici is unavailable (e.g. on Bun).
 */
const fetchBackend: RequestFn = async (url, options) => {
	// Fail fast on an already-aborted signal instead of opening a connection
	// that would immediately need tearing down. This mirrors undici's behavior
	// and avoids leaving sockets in a half-open state.
	options.signal?.throwIfAborted();

	const headers: Record<string, string> = {};
	for (const key in options.headers) {
		const value = options.headers[key];
		if (value !== undefined) {
			headers[key] = value;
		}
	}

	const { body, duplex } = toFetchBody(options.body);

	const init: RequestInit & { duplex?: "half" } = {
		method: options.method,
		headers,
		body: (body ?? null) as RequestInit["body"],
		signal: options.signal ?? undefined,
	};
	if (duplex) {
		init.duplex = duplex;
	}

	const response = await fetch(typeof url === "string" ? url : url.toString(), init);

	return {
		statusCode: response.status,
		headers: headersToObject(response.headers),
		body: makeFetchResponseBody(response),
	};
};

//#endregion

//#region backend selection

let cachedBackend: RequestFn | undefined;
let backendInit: Promise<RequestFn> | undefined;

async function resolveBackend(): Promise<RequestFn> {
	// Escape hatch (mainly for benchmarking/debugging): force the fetch backend.
	const forceFetch = typeof process !== "undefined" && process.env?.LEAN_S3_FORCE_FETCH === "1";

	// On Bun, undici is incomplete; always use fetch.
	if (!isBun && !forceFetch) {
		const undiciBackend = await tryCreateUndiciBackend();
		if (undiciBackend) {
			return undiciBackend;
		}
	}
	return fetchBackend;
}

/**
 * Performs an HTTP request using the best available backend for the current
 * runtime (undici on Node.js, `fetch` on Bun and other runtimes).
 *
 * The backend is resolved once and cached. After the first request, the
 * resolved backend is invoked synchronously (no extra microtask) to keep the
 * hot path fast.
 */
export function request(url: URL | string, options: RequestOptions): Promise<ResponseData> {
	if (cachedBackend) {
		return cachedBackend(url, options);
	}
	if (!backendInit) {
		backendInit = resolveBackend().then(backend => {
			cachedBackend = backend;
			return backend;
		});
	}
	return backendInit.then(backend => backend(url, options));
}

//#endregion
