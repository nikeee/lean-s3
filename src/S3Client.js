import { request, Dispatcher, Agent } from "undici";
import { XMLParser } from "fast-xml-parser";

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

/**
 * @typedef {import("./index.d.ts").S3ClientOptions} S3ClientOptions
 * @typedef {import("./index.d.ts").PresignableHttpMethod} PresignableHttpMethod
 * @typedef {import("./index.d.ts").StorageClass} StorageClass
 * @typedef {import("./index.d.ts").Acl} Acl
 * @typedef {import("./index.d.ts").S3FilePresignOptions} S3FilePresignOptions
 * @typedef {import("./index.d.ts").OverridableS3ClientOptions} OverridableS3ClientOptions
 * @typedef {import("./index.d.ts").CreateFileInstanceOptions} CreateFileInstanceOptions
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
			query.toString(),
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
		query.set("X-Amz-Signature", signature);

		res.search = query.toString();
		return res.toString();
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
	 * // TODO: Maybe support `delimiter`
	 */
	async list(options = {}) {
		// See `benchmark-simple-qs.js` on why we don't use URLSearchParams but string concat
		// tldr: This is faster and we know the params exactly, so we can focus our encoding
		let query = "list-type=2";

		// GET /?list-type=2&continuation-token=ContinuationToken&delimiter=Delimiter&encoding-type=EncodingType&fetch-owner=FetchOwner&max-keys=MaxKeys&prefix=Prefix&start-after=StartAfter HTTP/1.1

		if (typeof options.continuationToken !== "undefined") {
			if (typeof options.continuationToken !== "string") {
				throw new TypeError("`continuationToken` should be a `string`.");
			}

			query += `&continuation-token=${encodeURIComponent(options.continuationToken)}`;
		}

		// TODO: delimiter?

		if (typeof options.maxKeys !== "undefined") {
			if (typeof options.maxKeys !== "number") {
				throw new TypeError("`maxKeys` should be a `number`.");
			}

			query += `&max-keys=${options.maxKeys}`; // no encoding needed, it's a number
		}

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
			const res = xmlParser.parse(text)?.ListBucketResult;
			console.log(res);
			return {
				name: res.Name,
				prefix: res.Prefix,
				startAfter: res.StartAfter,
				isTruncated: res.IsTruncated,
				continuationToken: res.ContinuationToken,
				maxKeys: res.MaxKeys,
				keyCount: res.KeyCount,
				nextContinuationToken: res.NextContinuationToken,
				contents: res.Contents?.map(S3BucketEntry.parse),
			};
		}

		// undicis docs state that we shoul dump the body if not used
		response.body.dump();

		console.log(await response.body.text());

		throw new Error(
			`Response code not implemented yet: ${response.statusCode}`,
		);
	}

	/**
	 * @param {string} method
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

		// Signed headers have to be sorted
		// To enhance sorting, we're adding all possible values somehow pre-ordered
		const headersToBeSigned = prepareHeadersForSigning({
			host: url.host,
			"x-amz-date": now.dateTime,
			"x-amz-content-sha256":
				contentHash?.toString("hex") ?? "UNSIGNED-PAYLOAD",
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
						contentHash,
						this.#options.accessKeyId,
						this.#options.secretAccessKey,
					),
					...additionalUnsignedHeaders,
					accept: "application/json", // So that we can parse errors as JSON instead of XML, if the server supports that
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

		// Signed headers have to be sorted
		// To enhance sorting, we're adding all possible values somehow pre-ordered
		const headersToBeSigned = prepareHeadersForSigning({
			"content-length": contentLength?.toString() ?? undefined,
			"content-type": contentType,
			host: url.host,
			range: getRangeHeader(rageStart, rangeEndExclusive),
			"x-amz-content-sha256": contentHash?.toString("hex") ?? undefined,
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
						contentHash,
						this.#options.accessKeyId,
						this.#options.secretAccessKey,
					),
					accept: "application/json", // So that we can parse errors as JSON instead of XML, if the server supports that
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

		const ct = response.headers["content-type"];
		if (ct === "application/json") {
			/** @type {any} */
			let error = undefined;
			try {
				error = await response.body.json();
			} catch (cause) {
				throw new S3Error("Unknown", path, {
					message: "Could not read response body.",
					cause,
				});
			}
			throw new S3Error(error?.Code ?? "Unknown", path, {
				message: error?.Message || undefined, // Message might be "",
				requestId: error?.RequestId || undefined, // RequestId might be ""
				hostId: error?.HostId || undefined, // HostId might be ""
			});
		}

		let body = undefined;
		try {
			body = await response.body.text();
		} catch (cause) {
			throw new S3Error("Unknown", path, {
				message: "Could not read response body.",
				cause,
			});
		}
		if (ct === "application/xml") {
			const error = tryProcessXMLError(body);
			throw new S3Error(error.code ?? "Unknown", path, {
				message: error.message || undefined, // Message might be "",
			});
		}
		throw new S3Error("Unknown", path, {
			message: "Unknown error during S3 request.",
		});
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

		const headersToBeSigned = prepareHeadersForSigning({
			"amz-sdk-invocation-id": crypto.randomUUID(),
			// TODO: Maybe support retries and do "amz-sdk-request": attempt=1; max=3
			host: url.host,
			range,
			// Hetzner doesnt care if the x-amz-content-sha256 header is missing, R2 requires it to be present
			"x-amz-content-sha256":
				contentHash?.toString("hex") ?? "UNSIGNED-PAYLOAD",
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
							contentHash,
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

						if (ct === "application/xml") {
							return response.body.text().then(body => {
								const error = tryProcessXMLError(body);
								const code = error?.code || "Unknown"; // || instead of ??, so we coerce empty strings
								return controller.error(
									new S3Error(code, path, {
										message: error?.message || undefined, // || instead of ??, so we coerce empty strings
										cause: responseText,
									}),
								);
							}, onNetworkError);
						}

						if (typeof ct === "string" && ct.startsWith("application/json")) {
							return response.body.json().then((/** @type {any} */ error) => {
								const code = error?.code || "Unknown"; // || instead of ??, so we coerce empty strings
								return controller.error(
									new S3Error(code, path, {
										message: error?.message || undefined, // || instead of ??, so we coerce empty strings
										cause: responseText,
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
	 * @param {string} method
	 * @param {string} path
	 * @param {string} query
	 * @param {amzDate.AmzDate} date
	 * @param {Record<string, string>} sortedSignedHeaders
	 * @param {string} region
	 * @param {Buffer | undefined} contentHash
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
		contentHash,
		accessKeyId,
		secretAccessKey,
	) {
		const dataDigest = sign.createCanonicalDataDigest(
			method,
			path,
			query,
			sortedSignedHeaders,
			contentHash?.toString("hex") ?? sign.unsignedPayload,
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
 * @returns
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

	const q = new URLSearchParams();
	q.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
	q.set("X-Amz-Credential", amzCredential);
	q.set("X-Amz-Date", date.dateTime);
	q.set("X-Amz-Expires", expiresIn.toString());
	q.set("X-Amz-SignedHeaders", headerList);

	if (contentHashStr) {
		q.set("X-Amz-Content-Sha256", contentHashStr);
	}
	if (storageClass) {
		q.set("X-Amz-Storage-Class", storageClass);
	}
	if (sessionToken) {
		q.set("X-Amz-Security-Token", sessionToken);
	}
	if (acl) {
		q.set("X-Amz-Acl", acl);
	}
	return q;
}

const codePattern = /<Code>([a-zA-Z0-9\s-]+?)<\/Code>/g;
const messagePattern = /<Message>([a-zA-Z0-9\s-\.]+?)<\/Message>/g;
/**
 * @param {string} responseText May or may not be XML
 */
function tryProcessXMLError(responseText) {
	// We don't have an XML parser in Node.js' std lib and we don't want to reference one for an optional diagnostic
	// So... :hide-the-pain-harold:
	return {
		code: codePattern.exec(responseText)?.[1] ?? undefined,
		message: messagePattern.exec(responseText)?.[1] ?? undefined,
	};
}
