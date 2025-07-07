import { Readable } from "node:stream";

import type S3Client from "./S3Client.ts";
import type { ByteSource } from "./index.ts";
import S3Stat from "./S3Stat.ts";
import {
	write,
	stream,
	type OverridableS3ClientOptions,
	signedRequest,
} from "./S3Client.ts";
import { sha256 } from "./sign.ts";
import { fromStatusCode, getResponseError } from "./error.ts";
import assertNever from "./assertNever.ts";
import type { ObjectKey } from "./branded.ts";

export type S3FileWriteOptions = {
	/** Content-Type of the file. */
	type?: string;
};

// TODO: If we want to hack around, we can use this to access the private implementation of the "get stream" algorithm used by Node.js's blob internally
// We probably have to do this some day if the fetch implementation is moved to internals.
// If this happens, fetch will probably use `[kHandle].getReader()` instead of .stream() to read the Blob
// This would break our use-case of passing an S3File as a body
// Using this hack would also make `.text()`, `.bytes()` etc. "just work" in every case, since these use `[kHandle]` internally as well.
// We now resort back into overriding text/bytes/etc. But as soon as another internal Node.js API uses this functionality, this would probably also use `[kHandle]` and bypass our data.
// const kHandle = Object.getOwnPropertySymbols(new Blob).find(s => s.toString() === 'Symbol(kHandle)');
export default class S3File {
	#client: S3Client;
	#path: ObjectKey;
	#start: number | undefined;
	#end: number | undefined;
	#contentType: string;

	/** @internal */
	constructor(
		client: S3Client,
		path: ObjectKey,
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
	 * @remarks Uses [`HeadObject`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html).
	 * @throws {S3Error} If the file does not exist or the server has some other issues.
	 * @throws {Error} If the server returns an invalid response.
	 */
	async stat(options: S3StatOptions = {}): Promise<S3Stat> {
		// TODO: Support all options

		const response = await this.#client[signedRequest](
			"HEAD",
			this.#path,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		// Heads don't have a body, but we still need to consume it to avoid leaks
		// undici docs state that we should dump the body if not used
		response.body.dump(); // dump's floating promise should not throw

		if (200 <= response.statusCode && response.statusCode < 300) {
			const result = S3Stat.tryParseFromHeaders(response.headers);
			if (!result) {
				throw new Error(
					"S3 server returned an invalid response for `HeadObject`",
				);
			}
			return result;
		}

		throw (
			fromStatusCode(response.statusCode, this.#path) ??
			new Error(
				`S3 server returned an unsupported status code for \`HeadObject\`: ${response.statusCode}`,
			)
		);
	}

	/**
	 * Check if a file exists in the bucket. Uses `HEAD` request to check existence.
	 *
	 * @remarks Uses [`HeadObject`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html).
	 */
	async exists(options: S3FileExistsOptions = {}): Promise<boolean> {
		// TODO: Support all options

		const response = await this.#client[signedRequest](
			"HEAD",
			this.#path,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		// Heads don't have a body, but we still need to consume it to avoid leaks
		// undici docs state that we should dump the body if not used
		response.body.dump(); // dump's floating promise should not throw

		if (200 <= response.statusCode && response.statusCode < 300) {
			return true;
		}

		if (response.statusCode === 404) {
			return false;
		}

		throw (
			fromStatusCode(response.statusCode, this.#path) ??
			new Error(
				`S3 server returned an unsupported status code for \`HeadObject\`: ${response.statusCode}`,
			)
		);
	}

	/**
	 * Delete a file from the bucket.
	 *
	 * @remarks - Uses [`DeleteObject`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html).
	 *          - `versionId` not supported.
	 *
	 * @param {S3FileDeleteOptions} [options]
	 *
	 * @example
	 * ```js
	 * // Simple delete
	 * await client.delete("old-file.txt");
	 *
	 * // With error handling
	 * try {
	 *   await client.delete("file.dat");
	 *   console.log("File deleted");
	 * } catch (err) {
	 *   console.error("Delete failed:", err);
	 * }
	 * ```
	 */
	async delete(options: S3FileDeleteOptions = {}): Promise<void> {
		// TODO: Support all options

		const response = await this.#client[signedRequest](
			"DELETE",
			this.#path,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode === 204) {
			// undici docs state that we should dump the body if not used
			response.body.dump(); // dump's floating promise should not throw
			return;
		}

		throw await getResponseError(response, this.#path);
	}

	toString() {
		return `S3File { path: "${this.#path}" }`;
	}

	json(): Promise<unknown> {
		// Not using JSON.parse(await this.text()), so the env can parse json while loading
		return new Response(this.stream()).json();
	}
	bytes(): Promise<Uint8Array> {
		return new Response(this.stream())
			.arrayBuffer()
			.then(ab => new Uint8Array(ab));
	}
	arrayBuffer(): Promise<ArrayBuffer> {
		return new Response(this.stream()).arrayBuffer();
	}
	text(): Promise<string> {
		return new Response(this.stream()).text();
	}
	blob(): Promise<Blob> {
		return new Response(this.stream()).blob();
	}

	/** @returns {ReadableStream<Uint8Array>} */
	stream(): ReadableStream<Uint8Array> {
		// This function is called for every operation on the blob
		return this.#client[stream](this.#path, undefined, this.#start, this.#end);
	}

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
	 * @param {S3FileWriteOptions} [options.type] Defaults to the Content-Type that was used to create the {@link S3File} instance.
	 * @returns {Promise<void>}
	 */
	async write(
		data: ByteSource,
		options: S3FileWriteOptions = {},
	): Promise<void> {
		/** @type {AbortSignal | undefined} */
		const signal: AbortSignal | undefined = undefined; // TODO: Take this as param

		// TODO: Support S3File as input and maybe use CopyObject
		// TODO: Support Request and Response as input?
		const [bytes, length, hash] = await this.#transformData(data);
		return await this.#client[write](
			this.#path,
			bytes,
			options.type ?? this.#contentType,
			length,
			hash,
			this.#start,
			this.#end,
			signal,
		);
	}

	/*
	// Future API?
	setTags(): Promise<void> {
		throw new Error("Not implemented");
	}
	getTags(): Promise<unknown> {
		throw new Error("Not implemented");
	}
	*/
}

export interface S3FileDeleteOptions extends OverridableS3ClientOptions {
	signal?: AbortSignal;
}
export interface S3StatOptions extends OverridableS3ClientOptions {
	signal?: AbortSignal;
}
export interface S3FileExistsOptions extends OverridableS3ClientOptions {
	signal?: AbortSignal;
}
