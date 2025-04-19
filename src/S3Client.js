import { request, Dispatcher, Agent } from "undici";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

import S3File from "./S3File.js";
import S3Error from "./S3Error.js";
import S3BucketEntry from "./S3BucketEntry.js";
import KeyCache from "./KeyCache.js";
import * as amzDate from "./AmzDate.js";
import * as sign from "./sign.js";
import {
	buildRequestUrl,
	getRangeHeader,
	prepareHeadersForSigning,
} from "./url.js";

export const write = Symbol("write");
export const stream = Symbol("stream");

const xmlParser = new XMLParser();
const xmlBuilder = new XMLBuilder();

/**
 * @typedef {import("./index.d.ts").S3ClientOptions} S3ClientOptions
 * @typedef {import("./index.d.ts").PresignableHttpMethod} PresignableHttpMethod
 * @typedef {import("./index.d.ts").StorageClass} StorageClass
 * @typedef {import("./index.d.ts").Acl} Acl
 * @typedef {import("./index.d.ts").S3FilePresignOptions} S3FilePresignOptions
 * @typedef {import("./index.d.ts").OverridableS3ClientOptions} OverridableS3ClientOptions
 * @typedef {import("./index.d.ts").CreateFileInstanceOptions} CreateFileInstanceOptions
 * @typedef {import("./index.d.ts").ListObjectsResponse} ListObjectsResponse
 */

/**
 * A configured S3 bucket instance for managing files.
 *
 * @example
 * ```js
 * // Basic bucket setup
 * const bucket = new S3Client({
 *   bucket: "my-bucket",
 *   accessKeyId: "key",
 *   secretAccessKey: "secret"
 * });
 * // Get file instance
 * const file = bucket.file("image.jpg");
 * await file.delete();
 * ```
 */
export default class S3Client {
	/** @type {Readonly<S3ClientOptions>} */
	#options;
	#keyCache = new KeyCache();

	// TODO: pass options to this in client
	/** @type {Dispatcher} */
	#dispatcher = new Agent();

	/**
	 * Create a new instance of an S3 bucket so that credentials can be managed from a single instance instead of being passed to every method.
	 *
	 * @param {S3ClientOptions} options The default options to use for the S3 client.
	 */
	constructor(options) {
		if (!options) {
			throw new Error("`options` is required.");
		}

		const {
			accessKeyId,
			secretAccessKey,
			endpoint,
			region,
			bucket,
			sessionToken,
		} = options;

		if (!accessKeyId || typeof accessKeyId !== "string") {
			throw new Error("`accessKeyId` is required.");
		}
		if (!secretAccessKey || typeof secretAccessKey !== "string") {
			throw new Error("`secretAccessKey` is required.");
		}
		if (!endpoint || typeof endpoint !== "string") {
			throw new Error("`endpoint` is required.");
		}
		if (!region || typeof region !== "string") {
			throw new Error("`region` is required.");
		}
		if (!bucket || typeof bucket !== "string") {
			throw new Error("`bucket` is required.");
		}

		this.#options = {
			accessKeyId,
			secretAccessKey,
			endpoint,
			region,
			bucket,
			sessionToken,
		};
	}

	/**
	 * Creates an S3File instance for the given path.
	 *
	 * @param {string} path
	 * @param {Partial<CreateFileInstanceOptions> | undefined} [options] TODO
	 * @returns {S3File}
	 * @example
	 * ```js
	 * const file = client.file("image.jpg");
	 * await file.write(imageData);
	 *
	 * const configFile = client.file("config.json", {
	 *   type: "application/json",
	 *   acl: "private"
	 * });
	 * ```
	 */
	file(path, options) {
		return new S3File(this, path, undefined, undefined, undefined);
	}

	/**
	 * Generate a presigned URL for temporary access to a file.
	 * Useful for generating upload/download URLs without exposing credentials.
	 * @param {string} path
	 * @param {Partial<S3FilePresignOptions & OverridableS3ClientOptions>} [signOptions]
	 * @returns {string} The operation on {@link S3Client#presign.path} as a pre-signed URL.
	 *
	 * @example
	 * ```js
	 * const downloadUrl = client.presign("file.pdf", {
	 *   expiresIn: 3600 // 1 hour
	 * });
	 * ```
	 */
	presign(
		path,
		{
			method = "GET",
			expiresIn = 3600, // TODO: Maybe rename this to expiresInSeconds
			storageClass,
			acl,
			region: regionOverride,
			bucket: bucketOverride,
			endpoint: endpointOverride,
		} = {},
	) {
		const now = new Date();
		const date = amzDate.getAmzDate(now);
		const options = this.#options;

		const region = regionOverride ?? options.region;
		const bucket = bucketOverride ?? options.bucket;
		const endpoint = endpointOverride ?? options.endpoint;

		const res = buildRequestUrl(endpoint, bucket, region, path);

		const query = buildSearchParams(
			`${options.accessKeyId}/${date.date}/${region}/s3/aws4_request`,
			date,
			expiresIn,
			"host",
			undefined,
			storageClass,
			options.sessionToken,
			acl,
		);

		const dataDigest = sign.createCanonicalDataDigestHostOnly(
			method,
			res.pathname,
			query,
			res.host,
		);

		const signingKey = this.#keyCache.computeIfAbsent(
			date,
			region,
			options.accessKeyId,
			options.secretAccessKey,
		);

		const signature = sign.signCanonicalDataHash(
			signingKey,
			dataDigest,
			date,
			region,
		);

		// See `buildSearchParams` for casing on this parameter
		res.search = `${query}&X-Amz-Signature=${signature}`;
		return res.toString();
	}

	/**
	 * Uses `DeleteObjects` to delete multiple objects in a single request.
	 *
	 * @param {readonly S3BucketEntry[] | readonly string[]} objects
	 * @param {{
	 *    signal?: AbortSignal;
	 * }} [options]
	 */
	async deleteObjects(objects, options = {}) {
		const body = xmlBuilder.build({
			Delete: {
				Quiet: true,
				Object: objects.map(o => ({
					Key: typeof o === "string" ? o : o.key,
				})),
			},
		});

		const response = await this.#signedRequest(
			"POST",
			"",
			"delete=", // "=" is needed by minio for some reason
			body,
			{
				"content-md5": sign.md5Base64(body),
			},
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode === 200) {
			const text = await response.body.text();

			let res = undefined;
			try {
				// Quite mode omits all deleted elements, so it will be parsed as "", wich we need to coalasce to null/undefined
				res = (xmlParser.parse(text)?.DeleteResult || undefined)?.Error ?? [];
			} catch (cause) {
				// Possible according to AWS docs
				throw new S3Error("Unknown", "", {
					message: "S3 service responded with invalid XML.",
					cause,
				});
			}

			if (!res || !Array.isArray(res)) {
				throw new S3Error("Unknown", "", {
					message: "Could not process response.",
				});
			}

			const errors = res.map(e => ({
				code: e.Code,
				key: e.Key,
				message: e.Message,
				versionId: e.VersionId,
			}));

			return errors.length > 0 ? { errors } : null;
		}

		if (400 <= response.statusCode && response.statusCode < 500) {
			throw await getResponseError(response, "");
		}

		// undici docs state that we shoul dump the body if not used
		response.body.dump();
		throw new Error(
			`Response code not implemented yet: ${response.statusCode}`,
		);
	}

	//#region list

	/**
	 * Uses `ListObjectsV2` to iterate over all keys. Pagination and continuation is handled internally.
	 *
	 * @param {{
	 *   prefix?: string;
	 *   startAfter?: string;
	 *   signal?: AbortSignal;
	 *   internalPageSize?: number;
	 * }} [options]
	 * @returns {AsyncGenerator<S3BucketEntry>}
	 */
	async *listIterating(options) {
		// only used to get smaller pages, so we can test this properly
		const maxKeys = options?.internalPageSize ?? undefined;

		let res = undefined;
		let continuationToken = undefined;
		do {
			res = await this.list({
				...options,
				maxKeys,
				continuationToken,
			});

			if (!res || res.contents.length === 0) {
				break;
			}

			yield* res.contents;

			continuationToken = res.nextContinuationToken;
		} while (continuationToken);
	}

	/**
	 *
	 * @param {{
	 *   prefix?: string;
	 *   maxKeys?: number;
	 *   startAfter?: string;
	 *   continuationToken?: string;
	 *   signal?: AbortSignal;
	 * }} [options]
	 * @returns {Promise<ListObjectsResponse>}
	 */
	async list(options = {}) {
		// See `benchmark-operations.js` on why we don't use URLSearchParams but string concat
		// tldr: This is faster and we know the params exactly, so we can focus our encoding

		// ! minio requires these params to be in alphabetical order

		let query = "";

		if (typeof options.continuationToken !== "undefined") {
			if (typeof options.continuationToken !== "string") {
				throw new TypeError("`continuationToken` should be a `string`.");
			}

			query += `continuation-token=${encodeURIComponent(options.continuationToken)}&`;
		}

		query += "list-type=2";

		if (typeof options.maxKeys !== "undefined") {
			if (typeof options.maxKeys !== "number") {
				throw new TypeError("`maxKeys` should be a `number`.");
			}

			query += `&max-keys=${options.maxKeys}`; // no encoding needed, it's a number
		}

		// TODO: delimiter?

		// plan `if(a)` check, so empty strings will also not go into this branch, omitting the parameter
		if (options.prefix) {
			if (typeof options.prefix !== "string") {
				throw new TypeError("`prefix` should be a `string`.");
			}

			query += `&prefix=${encodeURIComponent(options.prefix)}`;
		}

		if (typeof options.startAfter !== "undefined") {
			if (typeof options.startAfter !== "string") {
				throw new TypeError("`startAfter` should be a `string`.");
			}

			query += `&start-after=${encodeURIComponent(options.startAfter)}`;
		}

		const response = await this.#signedRequest(
			"GET",
			"",
			query,
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode === 200) {
			const text = await response.body.text();

			let res = undefined;
			try {
				res = xmlParser.parse(text)?.ListBucketResult;
			} catch (cause) {
				// Possible according to AWS docs
				throw new S3Error("Unknown", "", {
					message: "S3 service responded with invalid XML.",
					cause,
				});
			}

			if (!res) {
				throw new S3Error("Unknown", "", {
					message: "Could not read bucket contents.",
				});
			}

			// S3 is weird and doesn't return an array if there is only one item
			const contents = Array.isArray(res.Contents)
				? (res.Contents?.map(S3BucketEntry.parse) ?? [])
				: res.Contents
					? [res.Contents]
					: [];

			return {
				name: res.Name,
				prefix: res.Prefix,
				startAfter: res.StartAfter,
				isTruncated: res.IsTruncated,
				continuationToken: res.ContinuationToken,
				maxKeys: res.MaxKeys,
				keyCount: res.KeyCount,
				nextContinuationToken: res.NextContinuationToken,
				contents,
			};
		}

		// undici docs state that we shoul dump the body if not used
		response.body.dump();
		throw new Error(
			`Response code not implemented yet: ${response.statusCode}`,
		);
	}

	//#endregion

	/**
	 * @param {import("./index.js").HttpMethod} method
	 * @param {string} pathWithoutBucket
	 * @param {string | undefined} query
	 * @param {import("./index.d.ts").UndiciBodyInit | undefined} body
	 * @param {Record<string, string>| undefined} additionalSignedHeaders
	 * @param {Record<string, string> | undefined} additionalUnsignedHeaders
	 * @param {Buffer | undefined} contentHash
	 * @param {AbortSignal | undefined} signal
	 */
	async #signedRequest(
		method,
		pathWithoutBucket,
		query,
		body,
		additionalSignedHeaders,
		additionalUnsignedHeaders,
		contentHash,
		signal,
	) {
		const bucket = this.#options.bucket;
		const endpoint = this.#options.endpoint;
		const region = this.#options.region;

		const url = buildRequestUrl(endpoint, bucket, region, pathWithoutBucket);
		if (query) {
			url.search = query;
		}

		const now = amzDate.now();

		const contentHashStr = contentHash?.toString("hex") ?? sign.unsignedPayload;

		// Signed headers have to be sorted
		// To enhance sorting, we're adding all possible values somehow pre-ordered
		const headersToBeSigned = prepareHeadersForSigning({
			host: url.host,
			"x-amz-date": now.dateTime,
			"x-amz-content-sha256": contentHashStr,
			...additionalSignedHeaders,
		});

		try {
			return await request(url, {
				method,
				signal,
				dispatcher: this.#dispatcher,
				headers: {
					...headersToBeSigned,
					authorization: this.#getAuthorizationHeader(
						method,
						url.pathname,
						query ?? "",
						now,
						headersToBeSigned,
						region,
						contentHashStr,
						this.#options.accessKeyId,
						this.#options.secretAccessKey,
					),
					...additionalUnsignedHeaders,
					"user-agent": "lean-s3",
				},
				body,
			});
		} catch (cause) {
			signal?.throwIfAborted();
			throw new S3Error("Unknown", pathWithoutBucket, {
				message: "Unknown error during S3 request.",
				cause,
			});
		}
	}

	/**
	 * @internal
	 * @param {string} path
	 * @param {import("./index.d.ts").UndiciBodyInit} data TODO
	 * @param {string} contentType
	 * @param {number | undefined} contentLength
	 * @param {Buffer | undefined} contentHash
	 * @param {number | undefined} rageStart
	 * @param {number | undefined} rangeEndExclusive
	 * @param {AbortSignal | undefined} signal
	 * @returns {Promise<void>}
	 */
	async [write](
		path,
		data,
		contentType,
		contentLength,
		contentHash,
		rageStart,
		rangeEndExclusive,
		signal,
	) {
		const bucket = this.#options.bucket;
		const endpoint = this.#options.endpoint;
		const region = this.#options.region;

		const url = buildRequestUrl(endpoint, bucket, region, path);

		const now = amzDate.now();

		const contentHashStr = contentHash?.toString("hex") ?? sign.unsignedPayload;

		// Signed headers have to be sorted
		// To enhance sorting, we're adding all possible values somehow pre-ordered
		const headersToBeSigned = prepareHeadersForSigning({
			"content-length": contentLength?.toString() ?? undefined,
			"content-type": contentType,
			host: url.host,
			range: getRangeHeader(rageStart, rangeEndExclusive),
			"x-amz-content-sha256": contentHashStr,
			"x-amz-date": now.dateTime,
		});

		/** @type {import("undici").Dispatcher.ResponseData<unknown> | undefined} */
		let response = undefined;
		try {
			response = await request(url, {
				method: "PUT",
				signal,
				dispatcher: this.#dispatcher,
				headers: {
					...headersToBeSigned,
					authorization: this.#getAuthorizationHeader(
						"PUT",
						url.pathname,
						url.search,
						now,
						headersToBeSigned,
						region,
						contentHashStr,
						this.#options.accessKeyId,
						this.#options.secretAccessKey,
					),
					"user-agent": "lean-s3",
				},
				body: data,
			});
		} catch (cause) {
			signal?.throwIfAborted();
			throw new S3Error("Unknown", path, {
				message: "Unknown error during S3 request.",
				cause,
			});
		}

		const status = response.statusCode;
		if (200 <= status && status < 300) {
			// everything seemed to work, no need to process response body
			return;
		}

		throw await getResponseError(response, path);
	}

	// TODO: Support abortSignal

	/**
	 * @internal
	 * @param {string} path
	 * @param {Buffer | undefined} contentHash
	 * @param {number | undefined} rageStart
	 * @param {number | undefined} rangeEndExclusive
	 * @returns
	 */
	[stream](path, contentHash, rageStart, rangeEndExclusive) {
		const bucket = this.#options.bucket;
		const endpoint = this.#options.endpoint;
		const region = this.#options.region;
		const now = amzDate.now();
		const url = buildRequestUrl(endpoint, bucket, region, path);

		const range = getRangeHeader(rageStart, rangeEndExclusive);

		const contentHashStr = contentHash?.toString("hex") ?? sign.unsignedPayload;

		const headersToBeSigned = prepareHeadersForSigning({
			"amz-sdk-invocation-id": crypto.randomUUID(),
			// TODO: Maybe support retries and do "amz-sdk-request": attempt=1; max=3
			host: url.host,
			range,
			// Hetzner doesnt care if the x-amz-content-sha256 header is missing, R2 requires it to be present
			"x-amz-content-sha256": contentHashStr,
			"x-amz-date": now.dateTime,
		});

		const ac = new AbortController();

		return new ReadableStream({
			type: "bytes",
			start: controller => {
				const onNetworkError = (/** @type {unknown} */ cause) => {
					controller.error(
						new S3Error("Unknown", path, {
							message: undefined,
							cause,
						}),
					);
				};

				request(url, {
					method: "GET",
					signal: ac.signal,
					dispatcher: this.#dispatcher,
					headers: {
						...headersToBeSigned,
						authorization: this.#getAuthorizationHeader(
							"GET",
							url.pathname,
							url.search,
							now,
							headersToBeSigned,
							region,
							contentHashStr,
							this.#options.accessKeyId,
							this.#options.secretAccessKey,
						),
						"user-agent": "lean-s3",
					},
				}).then(response => {
					const onData = controller.enqueue.bind(controller);
					const onClose = controller.close.bind(controller);

					const expectPartialResponse = range !== undefined;
					const status = response.statusCode;
					if (status === 200) {
						if (expectPartialResponse) {
							return controller.error(
								new S3Error("Unknown", path, {
									message: "Expected partial response to range request.",
								}),
							);
						}

						response.body.on("data", onData);
						response.body.once("error", onNetworkError);
						response.body.once("end", onClose);
						return;
					}

					if (status === 206) {
						if (!expectPartialResponse) {
							return controller.error(
								new S3Error("Unknown", path, {
									message:
										"Received partial response but expected a full response.",
								}),
							);
						}

						response.body.on("data", onData);
						response.body.once("error", onNetworkError);
						response.body.once("end", onClose);
						return;
					}

					if (400 <= status && status < 500) {
						// Some providers actually support JSON via "accept: application/json", but we cant rely on it
						const responseText = undefined;
						const ct = response.headers["content-type"];

						if (response.headers["content-type"] === "application/xml") {
							return response.body.text().then(body => {
								let error = undefined;
								try {
									error = xmlParser.parse(body);
								} catch (cause) {
									return controller.error(
										new S3Error("Unknown", path, {
											message: "Could not parse XML error response.",
											cause,
										}),
									);
								}
								return controller.error(
									new S3Error(error.Code || "Unknown", path, {
										message: error.Message || undefined, // Message might be "",
									}),
								);
							}, onNetworkError);
						}

						return controller.error(
							new S3Error("Unknown", path, {
								message: undefined,
								cause: responseText,
							}),
						);
					}

					// TODO: Support other status codes
					return controller.error(
						new Error(
							`Handling for status code ${status} not implemented yet. You might want to open an issue and describe your situation.`,
						),
					);
				}, onNetworkError);
			},
			cancel(reason) {
				ac.abort(reason);
			},
		});
	}

	/**
	 * @param {import("./index.js").HttpMethod} method
	 * @param {string} path
	 * @param {string} query
	 * @param {amzDate.AmzDate} date
	 * @param {Record<string, string>} sortedSignedHeaders
	 * @param {string} region
	 * @param {string} contentHashStr
	 * @param {string} accessKeyId
	 * @param {string} secretAccessKey
	 */
	#getAuthorizationHeader(
		method,
		path,
		query,
		date,
		sortedSignedHeaders,
		region,
		contentHashStr,
		accessKeyId,
		secretAccessKey,
	) {
		const dataDigest = sign.createCanonicalDataDigest(
			method,
			path,
			query,
			sortedSignedHeaders,
			contentHashStr,
		);

		const signingKey = this.#keyCache.computeIfAbsent(
			date,
			region,
			accessKeyId,
			secretAccessKey,
		);

		const signature = sign.signCanonicalDataHash(
			signingKey,
			dataDigest,
			date,
			region,
		);

		// no encodeURIComponent because because we assume that all headers don't need escaping
		const signedHeadersSpec = Object.keys(sortedSignedHeaders).join(";");
		const credentialSpec = `${accessKeyId}/${date.date}/${region}/s3/aws4_request`;
		return `AWS4-HMAC-SHA256 Credential=${credentialSpec}, SignedHeaders=${signedHeadersSpec}, Signature=${signature}`;
	}
}

/**
 * @param {string} amzCredential
 * @param {import("./AmzDate.js").AmzDate} date
 * @param {number} expiresIn
 * @param {string} headerList
 * @param {StorageClass | null | undefined} storageClass
 * @param {string | null | undefined} sessionToken
 * @param {Acl | null | undefined} acl
 * @param {string | null | undefined} contentHashStr
 * @returns {string}
 */
export function buildSearchParams(
	amzCredential,
	date,
	expiresIn,
	headerList,
	contentHashStr,
	storageClass,
	sessionToken,
	acl,
) {
	// We tried to make these query params entirely lower-cased, just like the headers
	// but Cloudflare R2 requires them to have this exact casing

	// We didn't have any issues with them being in non-alphaetical order, but as some implementations decide to require sorting
	// in non-pre-signed cases, we do it here as well

	// See `benchmark-operations.js` on why we don't use URLSearchParams but string concat

	let res = "";

	if (acl) {
		res += `X-Amz-Acl=${encodeURIComponent(acl)}&`;
	}

	res += "X-Amz-Algorithm=AWS4-HMAC-SHA256";

	if (contentHashStr) {
		// We assume that this is always hex-encoded, so no encoding needed
		res += `&X-Amz-Content-Sha256=${contentHashStr}`;
	}

	res += `&X-Amz-Credential=${encodeURIComponent(amzCredential)}`;
	res += `&X-Amz-Date=${date.dateTime}`; // internal dateTimes don't need encoding
	res += `&X-Amz-Expires=${expiresIn}`; // number -> no encoding

	if (sessionToken) {
		res += `&X-Amz-Security-Token=${encodeURIComponent(sessionToken)}`;
	}

	res += `&X-Amz-SignedHeaders=${encodeURIComponent(headerList)}`;

	if (storageClass) {
		res += `&X-Amz-Storage-Class=${storageClass}`;
	}
	return res;
}

/**
 * @param {Dispatcher.ResponseData<unknown>} response
 * @param {string} path
 * @returns {Promise<S3Error>}
 */
async function getResponseError(response, path) {
	let body = undefined;
	try {
		body = await response.body.text();
	} catch (cause) {
		return new S3Error("Unknown", path, {
			message: "Could not read response body.",
			cause,
		});
	}

	if (response.headers["content-type"] === "application/xml") {
		return parseAndGetXmlError(body, path);
	}

	return new S3Error("Unknown", path, {
		message: "Unknown error during S3 request.",
	});
}

/**
 * @param {string} body
 * @param {string} path
 * @returns {S3Error}
 */
function parseAndGetXmlError(body, path) {
	let error = undefined;
	try {
		error = xmlParser.parse(body);
	} catch (cause) {
		return new S3Error("Unknown", path, {
			message: "Could not parse XML error response.",
			cause,
		});
	}

	console.log(error);

	if (error.Error) {
		const e = error.Error;
		return new S3Error(e.Code || "Unknown", path, {
			message: e.Message || undefined, // Message might be "",
		});
	}

	return new S3Error(error.Code || "Unknown", path, {
		message: error.Message || undefined, // Message might be "",
	});
}
