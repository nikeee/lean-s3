import { Readable } from "node:stream";

import S3Error from "./S3Error.ts";
import S3Stat from "./S3Stat.ts";
import type S3Client from "./S3Client.ts";
import { write, stream, type OverridableS3ClientOptions } from "./S3Client.ts";
import { sha256 } from "./sign.ts";
import type { ByteSource } from "./index.ts";

// TODO: If we want to hack around, we can use this to access the private implementation of the "get stream" algorithm used by Node.js's blob internally
// We probably have to do this some day if the fetch implementation is moved to internals.
// If this happens, fetch will probably use `[kHandle].getReader()` instead of .stream() to read the Blob
// This would break our use-case of passing an S3File as a body
// Using this hack would also make `.text()`, `.bytes()` etc. "just work" in every case, since these use `[kHandle]` internally as well.
// We now resort back into overriding text/bytes/etc. But as soon as another internal Node.js API uses this functionality, this would probably also use `[kHandle]` and bypass our data.
// const kHandle = Object.getOwnPropertySymbols(new Blob).find(s => s.toString() === 'Symbol(kHandle)');
export default class S3File {
	#client: S3Client;
	#path: string;
	#start: number | undefined;
	#end: number | undefined;
	#contentType: string;

	/**
	 * @internal
	 */
	constructor(
		client: S3Client,
		path: string,
		start: number | undefined,
		end: number | undefined,
		contentType: string | undefined,
	) {
		if (typeof start === "number" && start < 0) {
			throw new Error("Invalid slice `start`.");
		}
		if (
			typeof end === "number" &&
			(end < 0 || (typeof start === "number" && end < start))
		) {
			throw new Error("Invalid slice `end`.");
		}

		this.#client = client;
		this.#path = path;
		this.#start = start;
		this.#end = end;
		this.#contentType = contentType ?? "application/octet-stream";
	}

	// TODO: slice overloads
	slice(
		start?: number | undefined,
		end?: number | undefined,
		contentType?: string | undefined,
	): S3File {
		return new S3File(
			this.#client,
			this.#path,
			start ?? undefined,
			end ?? undefined,
			contentType ?? this.#contentType,
		);
	}

	/**
	 *  Get the stat of a file in the bucket. Uses `HEAD` request to check existence.
	 *
	 * @throws {Error} If the file does not exist.
	 * @param {Partial<S3StatOptions>} [options]
	 * @returns {Promise<S3Stat>}
	 */
	async stat({ signal }: Partial<S3StatOptions> = {}): Promise<S3Stat> {
		// TODO: Support all options

		// TODO: Don't use presign here
		const url = this.#client.presign(this.#path, { method: "HEAD" });
		const response = await fetch(url, { method: "HEAD", signal }); // TODO: Use undici

		if (!response.ok) {
			switch (response.status) {
				case 404:
					// TODO: Process response body
					throw new S3Error("NoSuchKey", this.#path);
				default:
					// TODO: Process response body
					throw new S3Error("Unknown", this.#path);
			}
		}

		const result = S3Stat.tryParseFromHeaders(response.headers);
		if (!result) {
			throw new Error("S3 server returned an invalid response for HEAD");
		}
		return result;
	}
	/**
	 * Check if a file exists in the bucket. Uses `HEAD` request to check existence.
	 * @param {Partial<S3FileExistsOptions>} [options]
	 * @returns {Promise<boolean>}
	 */
	async exists({
		signal,
	}: Partial<S3FileExistsOptions> = {}): Promise<boolean> {
		// TODO: Support all options

		// TODO: Don't use presign here
		const url = this.#client.presign(this.#path, { method: "HEAD" });
		const res = await fetch(url, { method: "HEAD", signal }); // TODO: Use undici
		return res.ok;
	}

	/**
	 * Delete a file from the bucket.
	 * @param {Partial<S3FileDeleteOptions>} [options]
	 * @returns {Promise<void>}
	 *
	 * @example
	 * ```js
	 * // Simple delete
	 * await client.unlink("old-file.txt");
	 *
	 * // With error handling
	 * try {
	 *   await client.unlink("file.dat");
	 *   console.log("File deleted");
	 * } catch (err) {
	 *   console.error("Delete failed:", err);
	 * }
	 * ```
	 */
	async delete({ signal }: Partial<S3FileDeleteOptions> = {}): Promise<void> {
		// TODO: Support all options

		// TODO: Don't use presign here
		const url = this.#client.presign(this.#path, { method: "DELETE" });
		const response = await fetch(url, { method: "DELETE", signal }); // TODO: Use undici
		if (!response.ok) {
			switch (response.status) {
				case 404:
					// TODO: Process response body
					throw new S3Error("NoSuchKey", this.#path);
				default:
					// TODO: Process response body
					throw new S3Error("Unknown", this.#path);
			}
		}
	}

	toString() {
		return `S3File { path: "${this.#path}" }`;
	}

	/** @returns {Promise<unknown>} */
	json(): Promise<unknown> {
		// Not using JSON.parse(await this.text()), so the env can parse json while loading
		// Also, see TODO note above this class
		return new Response(this.stream()).json();
	}
	// TODO
	// /** @returns {Promise<Uint8Array>} */
	// bytes() {
	// 	return new Response(this.stream()).bytes(); // TODO: Does this exist?
	// }
	/** @returns {Promise<ArrayBuffer>} */
	arrayBuffer(): Promise<ArrayBuffer> {
		return new Response(this.stream()).arrayBuffer();
	}
	/** @returns {Promise<string>} */
	text(): Promise<string> {
		return new Response(this.stream()).text();
	}
	/** @returns {Promise<Blob>} */
	blob(): Promise<Blob> {
		return new Response(this.stream()).blob();
	}

	/** @returns {ReadableStream<Uint8Array>} */
	stream(): ReadableStream<Uint8Array> {
		// This function is called for every operation on the blob
		return this.#client[stream](this.#path, undefined, this.#start, this.#end);
	}

	/**
	 * @param {ByteSource} data
	 * @returns {Promise<[
	 *   buffer: import("./index.d.ts").UndiciBodyInit,
	 *   size: number | undefined,
	 *   hash: Buffer | undefined,
	 * ]>}
	 */
	async #transformData(
		data: ByteSource,
	): Promise<
		[
			buffer: import("./index.d.ts").UndiciBodyInit,
			size: number | undefined,
			hash: Buffer | undefined,
		]
	> {
		if (typeof data === "string") {
			const binary = new TextEncoder();
			const bytes = binary.encode(data);
			return [
				bytes,
				bytes.byteLength,
				sha256(bytes), // TODO: Maybe use some streaming to compute hash while encoding?
			];
		}

		if (data instanceof Blob) {
			const bytes = await data.bytes();
			return [
				bytes,
				bytes.byteLength,
				sha256(bytes), // TODO: Maybe use some streaming to compute hash while encoding?
			];
		}

		if (data instanceof Readable) {
			return [data, undefined, undefined];
		}

		if (
			data instanceof ArrayBuffer ||
			data instanceof SharedArrayBuffer ||
			ArrayBuffer.isView(data)
		) {
			// TODO: Support hashing
			return [
				data,
				data.byteLength,
				undefined, // TODO: Compute hash some day
			];
		}

		assertNever(data);
	}

	/**
	 * @param {ByteSource} data
	 * @returns {Promise<void>}
	 */
	async write(data: ByteSource): Promise<void> {
		/** @type {AbortSignal | undefined} */
		const signal: AbortSignal | undefined = undefined; // TODO: Take this as param

		// TODO: Support S3File as input and maybe use CopyObject
		// TODO: Support Request and Response as input?
		const [bytes, length, hash] = await this.#transformData(data);
		return await this.#client[write](
			this.#path,
			bytes,
			this.#contentType,
			length,
			hash,
			this.#start,
			this.#end,
			signal,
		);
	}

	/*
	// Future API?
	/** @returns {WritableStream<ArrayBufferLike | ArrayBufferView>} *
	writer() {
		throw new Error("Not implemented");
	}
	// Future API?
	/** @returns {Promise<void>} *
	setTags() {
		throw new Error("Not implemented");
	}
	/** @returns {Promise<unknown>} *
	getTags() {
		throw new Error("Not implemented");
	}
	*/
}

/**
 * @param {never} v
 * @returns {never}
 */
function assertNever(v: never): never {
	throw new TypeError(`Expected value not to have type ${typeof v}`);
}

export interface S3FileDeleteOptions extends OverridableS3ClientOptions {
	signal: AbortSignal;
}

export interface S3StatOptions extends OverridableS3ClientOptions {
	signal: AbortSignal;
}
export interface S3FileExistsOptions extends OverridableS3ClientOptions {
	signal: AbortSignal;
}
