import { request, Agent, type Dispatcher } from "undici";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

import S3File from "./S3File.ts";
import S3Error from "./S3Error.ts";
import S3BucketEntry from "./S3BucketEntry.ts";
import KeyCache from "./KeyCache.ts";
import * as amzDate from "./AmzDate.ts";
import * as sign from "./sign.ts";
import {
	buildRequestUrl,
	getRangeHeader,
	prepareHeadersForSigning,
} from "./url.ts";
import type {
	Acl,
	BucketInfo,
	BucketLocationInfo,
	ChecksumAlgorithm,
	ChecksumType,
	ContentDisposition,
	HttpMethod,
	PresignableHttpMethod,
	StorageClass,
	UndiciBodyInit,
} from "./index.ts";
import { fromStatusCode, getResponseError } from "./error.ts";
import { getAuthorizationHeader } from "./request.ts";
import {
	ensureValidAccessKeyId,
	ensureValidBucketName,
	ensureValidEndpoint,
	ensureValidPath,
	ensureValidRegion,
	ensureValidSecretAccessKey,
	type AccessKeyId,
	type BucketName,
	type Endpoint,
	type ObjectKey,
	type Region,
	type SecretAccessKey,
} from "./branded.ts";
import {
	encodeURIComponentExtended,
	getContentDispositionHeader,
} from "./encode.ts";

export const kWrite = Symbol("kWrite");
export const kStream = Symbol("kStream");
export const kSignedRequest = Symbol("kSignedRequest");
export const kGetEffectiveParams = Symbol("kGetEffectiveParams");

const xmlParser = new XMLParser({
	ignoreAttributes: true,
	isArray: (_, jPath) =>
		jPath === "ListMultipartUploadsResult.Upload" ||
		jPath === "ListBucketResult.Contents" ||
		jPath === "ListPartsResult.Part" ||
		jPath === "DeleteResult.Deleted" ||
		jPath === "DeleteResult.Error",
});
const xmlBuilder = new XMLBuilder({
	attributeNamePrefix: "$",
	ignoreAttributes: false,
});

export interface S3ClientOptions {
	bucket: string;
	region: string;
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
}

interface InternalS3ClientOptions {
	bucket: BucketName;
	region: Region;
	endpoint: Endpoint;
	accessKeyId: AccessKeyId;
	secretAccessKey: SecretAccessKey;
	sessionToken?: string;
}

export type OverridableS3ClientOptions = Partial<
	Pick<S3ClientOptions, "region" | "bucket" | "endpoint">
>;

export type CreateFileInstanceOptions = {
	/** Content-Type of the file. */
	type?: string;
};

export type DeleteObjectsOptions = {
	bucket?: string;
	signal?: AbortSignal;
};
export type DeleteObjectsResult = {
	errors: DeleteObjectsError[];
};
export type DeleteObjectsError = {
	code: string;
	key: string;
	message: string;
	versionId: string;
};

export interface S3FilePresignOptions extends OverridableS3ClientOptions {
	contentHash?: Buffer;
	/** Seconds. */
	// TODO: Maybe rename this to expiresInSeconds
	expiresIn?: number; // TODO: Maybe support Temporal.Duration once major support arrives
	method?: PresignableHttpMethod;
	contentLength?: number;
	storageClass?: StorageClass;
	acl?: Acl;
	/** `Content-Type` of the file. */
	type?: string;

	/**
	 * Headers to set on the response of the S3 service.
	 */
	response?: {
		/**
		 * Used to set the file name that browsers display when downloading the file.
		 *
		 * @example
		 * ```js
		 * client.presign("foo.jpg", {
		 *   response: {
		 *     contentDisposition: {
		 *       type: "attachment",
		 *       filename: "download.jpg",
		 *     },
		 *   },
		 * });
		 * ```
		 */
		contentDisposition?: ContentDisposition;
	};
}

export type ListObjectsOptions = {
	bucket?: string;

	prefix?: string;
	maxKeys?: number;
	delimiter?: string;
	startAfter?: string;
	continuationToken?: string;
	signal?: AbortSignal;
};
export type ListObjectsIteratingOptions = {
	bucket?: string;

	prefix?: string;
	startAfter?: string;
	signal?: AbortSignal;
	internalPageSize?: number;
};

//#region ListMultipartUploads
export type ListMultipartUploadsOptions = {
	bucket?: string;
	delimiter?: string;
	keyMarker?: string;
	maxUploads?: number;
	prefix?: string;
	uploadIdMarker?: string;

	signal?: AbortSignal;
};
export type ListMultipartUploadsResult = {
	bucket?: string;
	keyMarker?: string;
	uploadIdMarker?: string;
	nextKeyMarker?: string;
	prefix?: string;
	delimiter?: string;
	nextUploadIdMarker?: string;
	maxUploads?: number;
	isTruncated?: boolean;

	uploads: MultipartUpload[];
};

export type MultipartUpload = {
	checksumAlgorithm?: ChecksumAlgorithm;
	checksumType?: ChecksumType;
	initiated?: Date;
	// TODO: initiator
	/**
	 * Key of the object for which the multipart upload was initiated.
	 * Length Constraints: Minimum length of 1.
	 */
	key?: string;
	// TODO: owner
	storageClass?: StorageClass;
	/**
	 * Upload ID identifying the multipart upload.
	 */
	uploadId?: string;
};
//#endregion
export type CreateMultipartUploadOptions = {
	bucket?: string;
	signal?: AbortSignal;
};
export type CreateMultipartUploadResult = {
	bucket: string;
	key: string;
	uploadId: string;
};
export type AbortMultipartUploadOptions = {
	bucket?: string;
	signal?: AbortSignal;
};

export type CompleteMultipartUploadOptions = {
	bucket?: string;
	signal?: AbortSignal;
};
export type CompleteMultipartUploadResult = {
	location?: string;
	bucket?: string;
	key?: string;
	etag?: string;
	checksumCRC32?: string;
	checksumCRC32C?: string;
	checksumCRC64NVME?: string;
	checksumSHA1?: string;
	checksumSHA256?: string;
	checksumType?: ChecksumType;
};
export type MultipartUploadPart = {
	partNumber: number;
	etag: string;
};
export type UploadPartOptions = {
	bucket?: string;
	signal?: AbortSignal;
};
export type UploadPartResult = {
	partNumber: number;
	etag: string;
};
export type ListPartsOptions = {
	maxParts?: number;
	partNumberMarker?: string;

	bucket?: string;
	signal?: AbortSignal;
};
export type ListPartsResult = {
	bucket: string;
	key: string;
	uploadId: string;
	partNumberMarker?: string;
	nextPartNumberMarker?: string;
	maxParts?: number;
	isTruncated: boolean;
	parts: Array<{
		checksumCRC32?: string;
		checksumCRC32C?: string;
		checksumCRC64NVME?: string;
		checksumSHA1?: string;
		checksumSHA256?: string;
		etag: string;
		lastModified: Date;
		partNumber: number;
		size: number;
	}>;

	storageClass?: StorageClass;
	checksumAlgorithm?: ChecksumAlgorithm;
	checksumType?: ChecksumType;

	// TODO
	// initiator: unknown;
	// <Initiator>
	// 	<DisplayName>string</DisplayName>
	// 	<ID>string</ID>
	// </Initiator>

	// TODO
	// owner: unknown;
	// <Owner>
	// 	<DisplayName>string</DisplayName>
	// 	<ID>string</ID>
	// </Owner>
};

export type ListObjectsResult = {
	name: string;
	prefix: string | undefined;
	startAfter: string | undefined;
	isTruncated: boolean;
	continuationToken: string | undefined;
	maxKeys: number;
	keyCount: number;
	nextContinuationToken: string | undefined;
	contents: readonly S3BucketEntry[];
};

export type BucketCreationOptions = {
	endpoint?: string;
	region?: string;
	locationConstraint?: string;
	location?: BucketLocationInfo;
	info?: BucketInfo;
	signal?: AbortSignal;
};
export type BucketDeletionOptions = {
	signal?: AbortSignal;
};
export type BucketExistsOptions = {
	signal?: AbortSignal;
};

export type BucketCorsRules = readonly BucketCorsRule[];
export type BucketCorsRule = {
	allowedMethods: readonly HttpMethod[];
	/** One or more origins you want customers to be able to access the bucket from. */
	allowedOrigins: readonly string[];
	/** Headers that are specified in the `Access-Control-Request-Headers` header. These headers are allowed in a preflight `OPTIONS` request. */
	allowedHeaders?: readonly string[];
	/** One or more headers in the response that you want customers to be able to access from their applications. */
	exposeHeaders?: readonly string[];
	/** Unique identifier for the rule. The value cannot be longer than 255 characters. */
	id?: string;
	/** The time in seconds that your browser is to cache the preflight response for the specified resource. */
	maxAgeSeconds?: number;
};
export type PutBucketCorsOptions = {
	bucket?: string;
	signal?: AbortSignal;
};
export type DeleteBucketCorsOptions = {
	bucket?: string;
	signal?: AbortSignal;
};

export type GetBucketCorsOptions = {
	bucket?: string;
	signal?: AbortSignal;
};
export type GetBucketCorsResult = {
	rules: BucketCorsRule[];
};

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
	#options: Readonly<InternalS3ClientOptions>;
	#keyCache = new KeyCache();

	// TODO: pass options to this in client? Do we want to expose the internal use of undici?
	#dispatcher: Dispatcher = new Agent();

	/**
	 * Create a new instance of an S3 bucket so that credentials can be managed from a single instance instead of being passed to every method.
	 *
	 * @param  options The default options to use for the S3 client.
	 */
	constructor(options: S3ClientOptions) {
		if (!options) {
			throw new Error("`options` is required.");
		}

		this.#options = {
			accessKeyId: ensureValidAccessKeyId(options.accessKeyId),
			secretAccessKey: ensureValidSecretAccessKey(options.secretAccessKey),
			endpoint: ensureValidEndpoint(options.endpoint),
			region: ensureValidRegion(options.region),
			bucket: ensureValidBucketName(options.bucket),
			sessionToken: options.sessionToken,
		};
	}

	/** @internal */
	[kGetEffectiveParams](
		options: OverridableS3ClientOptions,
	): [region: Region, endpoint: Endpoint, bucket: BucketName] {
		return [
			options.region ? ensureValidRegion(options.region) : this.#options.region,
			options.endpoint
				? ensureValidEndpoint(options.endpoint)
				: this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
		];
	}

	/**
	 * Creates an S3File instance for the given path.
	 *
	 * @param {string} path The path to the object in the bucket. Also known as [object key](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html).
	 * We recommend not using the following characters in a key name because of significant special character handling, which isn't consistent across all applications (see [AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html)):
	 * - Backslash (`\\`)
	 * - Left brace (`{`)
	 * - Non-printable ASCII characters (128–255 decimal characters)
	 * - Caret or circumflex (`^`)
	 * - Right brace (`}`)
	 * - Percent character (`%`)
	 * - Grave accent or backtick (`\``)
	 * - Right bracket (`]`)
	 * - Quotation mark (`"`)
	 * - Greater than sign (`>`)
	 * - Left bracket (`[`)
	 * - Tilde (`~`)
	 * - Less than sign (`<`)
	 * - Pound sign (`#`)
	 * - Vertical bar or pipe (`|`)
	 *
	 * lean-s3 does not enforce these restrictions.
	 *
	 * @example
	 * ```js
	 * const file = client.file("image.jpg");
	 * await file.write(imageData);
	 *
	 * const configFile = client.file("config.json", {
	 *   type: "application/json",
	 * });
	 * ```
	 */
	file(path: string, options: CreateFileInstanceOptions = {}): S3File {
		// TODO: Check max path length in bytes
		return new S3File(
			this,
			ensureValidPath(path),
			undefined,
			undefined,
			options.type ?? undefined,
		);
	}

	/**
	 * Generate a presigned URL for temporary access to a file.
	 * Useful for generating upload/download URLs without exposing credentials.
	 * @returns The operation on {@link S3Client#presign.path} as a pre-signed URL.
	 *
	 * @example
	 * ```js
	 * const downloadUrl = client.presign("file.pdf", {
	 *   expiresIn: 3600 // 1 hour
	 * });
	 * ```
	 *
	 * @example
	 * ```js
	 * client.presign("foo.jpg", {
	 *   expiresIn: 3600 // 1 hour
	 *   response: {
	 *     contentDisposition: {
	 *       type: "attachment",
	 *       filename: "download.jpg",
	 *     },
	 *   },
	 * });
	 * ```
	 */
	presign(path: string, options: S3FilePresignOptions = {}): string {
		const contentLength = options.contentLength ?? undefined;
		if (typeof contentLength === "number") {
			if (contentLength < 0) {
				throw new RangeError("`contentLength` must be >= 0.");
			}
		}

		const method = options.method ?? "GET";
		const contentType = options.type ?? undefined;

		const [region, endpoint, bucket] = this[kGetEffectiveParams](options);
		const responseOptions = options.response;

		const contentDisposition = responseOptions?.contentDisposition;
		const responseContentDisposition = contentDisposition
			? getContentDispositionHeader(contentDisposition)
			: undefined;

		const res = buildRequestUrl(
			endpoint,
			bucket,
			region,
			ensureValidPath(path),
		);

		const now = new Date();
		const date = amzDate.getAmzDate(now);

		const query = buildSearchParams(
			`${this.#options.accessKeyId}/${date.date}/${region}/s3/aws4_request`,
			date,
			options.expiresIn ?? 3600,
			typeof contentLength === "number" || typeof contentType === "string"
				? typeof contentLength === "number" && typeof contentType === "string"
					? "content-length;content-type;host"
					: typeof contentLength === "number"
						? "content-length;host"
						: typeof contentType === "string"
							? "content-type;host"
							: "" // TODO: this should not happen, find different solution
				: "host",
			sign.unsignedPayload,
			options.storageClass,
			this.#options.sessionToken,
			options.acl,
			responseContentDisposition,
		);

		// This probably does'nt scale if there are more headers in the signature
		// But we want to take a fast-path if there is only the host header to sign
		const dataDigest =
			typeof contentLength === "number" || typeof contentType === "string"
				? sign.createCanonicalDataDigest(
						method,
						res.pathname,
						query,
						typeof contentLength === "number" && typeof contentType === "string"
							? {
									"content-length": String(contentLength),
									"content-type": contentType,
									host: res.host,
								}
							: typeof contentLength === "number"
								? { "content-length": String(contentLength), host: res.host }
								: typeof contentType === "string"
									? { "content-type": contentType, host: res.host }
									: {},
						sign.unsignedPayload,
					)
				: sign.createCanonicalDataDigestHostOnly(
						method,
						res.pathname,
						query,
						res.host,
					);

		const signingKey = this.#keyCache.computeIfAbsent(
			date,
			region,
			this.#options.accessKeyId,
			this.#options.secretAccessKey,
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

	//#region multipart uploads

	async createMultipartUpload(
		key: string,
		options: CreateMultipartUploadOptions = {},
	): Promise<CreateMultipartUploadResult> {
		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"POST",
			ensureValidPath(key),
			"uploads=",
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode !== 200) {
			throw await getResponseError(response, key);
		}

		const text = await response.body.text();
		const res = ensureParsedXml(text).InitiateMultipartUploadResult ?? {};

		return {
			bucket: res.Bucket,
			key: res.Key,
			uploadId: res.UploadId,
		};
	}

	/**
	 * @remarks Uses [`ListMultipartUploads`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListMultipartUploads.html).
	 * @throws {RangeError} If `options.maxKeys` is not between `1` and `1000`.
	 */
	async listMultipartUploads(
		options: ListMultipartUploadsOptions = {},
	): Promise<ListMultipartUploadsResult> {
		// See `benchmark-operations.js` on why we don't use URLSearchParams but string concat
		// tldr: This is faster and we know the params exactly, so we can focus our encoding

		let query = "uploads="; // MinIO requires the = to be present

		if (options.delimiter) {
			if (typeof options.delimiter !== "string") {
				throw new TypeError("`delimiter` must be a `string`.");
			}

			query += `&delimiter=${encodeURIComponent(options.delimiter)}`;
		}

		// we don't support encoding-type

		if (options.keyMarker) {
			if (typeof options.keyMarker !== "string") {
				throw new TypeError("`keyMarker` must be a `string`.");
			}

			query += `&key-marker=${encodeURIComponent(options.keyMarker)}`;
		}
		if (typeof options.maxUploads !== "undefined") {
			if (typeof options.maxUploads !== "number") {
				throw new TypeError("`maxUploads` must be a `number`.");
			}
			if (options.maxUploads < 1 || options.maxUploads > 1000) {
				throw new RangeError("`maxUploads` has to be between 1 and 1000.");
			}

			query += `&max-uploads=${options.maxUploads}`; // no encoding needed, it's a number
		}

		if (options.prefix) {
			if (typeof options.prefix !== "string") {
				throw new TypeError("`prefix` must be a `string`.");
			}

			query += `&prefix=${encodeURIComponent(options.prefix)}`;
		}

		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"GET",
			"" as ObjectKey,
			query,
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode !== 200) {
			throw await getResponseError(response, "");
		}

		const text = await response.body.text();
		const root = ensureParsedXml(text).ListMultipartUploadsResult ?? {};

		return {
			bucket: root.Bucket || undefined,
			delimiter: root.Delimiter || undefined,
			prefix: root.Prefix || undefined,
			keyMarker: root.KeyMarker || undefined,
			uploadIdMarker: root.UploadIdMarker || undefined,
			nextKeyMarker: root.NextKeyMarker || undefined,
			nextUploadIdMarker: root.NextUploadIdMarker || undefined,
			maxUploads: root.MaxUploads ?? 1000, // not using || to not override 0; caution: minio supports 10000(!)
			isTruncated: root.IsTruncated === "true",
			uploads:
				root.Upload?.map(
					// biome-ignore lint/suspicious/noExplicitAny: we're parsing here
					(u: any) =>
						({
							key: u.Key || undefined,
							uploadId: u.UploadId || undefined,
							// TODO: Initiator
							// TODO: Owner
							storageClass: u.StorageClass || undefined,
							checksumAlgorithm: u.ChecksumAlgorithm || undefined,
							checksumType: u.ChecksumType || undefined,
							initiated: u.Initiated ? new Date(u.Initiated) : undefined,
						}) satisfies MultipartUpload,
				) ?? [],
		};
	}

	/**
	 * @remarks Uses [`AbortMultipartUpload`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html).
	 * @throws {RangeError} If `key` is not at least 1 character long.
	 * @throws {Error} If `uploadId` is not provided.
	 */
	async abortMultipartUpload(
		path: string,
		uploadId: string,
		options: AbortMultipartUploadOptions = {},
	): Promise<void> {
		if (!uploadId) {
			throw new Error("`uploadId` is required.");
		}

		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"DELETE",
			ensureValidPath(path),
			`uploadId=${encodeURIComponent(uploadId)}`,
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		// garage returns 200 even though the spec states 204 should be returned
		// fix @ garage proposed in https://git.deuxfleurs.fr/Deuxfleurs/garage/pulls/1095
		if (response.statusCode !== 204 && response.statusCode !== 200) {
			throw await getResponseError(response, path);
		}
	}

	/**
	 * @remarks Uses [`CompleteMultipartUpload`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html).
	 * @throws {RangeError} If `key` is not at least 1 character long.
	 * @throws {Error} If `uploadId` is not provided.
	 */
	async completeMultipartUpload(
		path: string,
		uploadId: string,
		parts: readonly MultipartUploadPart[],
		options: CompleteMultipartUploadOptions = {},
	): Promise<CompleteMultipartUploadResult> {
		if (!uploadId) {
			throw new Error("`uploadId` is required.");
		}

		const body = xmlBuilder.build({
			CompleteMultipartUpload: {
				Part: parts.map(part => ({
					PartNumber: part.partNumber,
					ETag: part.etag,
				})),
			},
		});

		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"POST",
			ensureValidPath(path),
			`uploadId=${encodeURIComponent(uploadId)}`,
			body,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode !== 200) {
			throw await getResponseError(response, path);
		}
		const text = await response.body.text();
		const res = ensureParsedXml(text).CompleteMultipartUploadResult ?? {};

		return {
			location: res.Location || undefined,
			bucket: res.Bucket || undefined,
			key: res.Key || undefined,
			etag: res.ETag || undefined,
			checksumCRC32: res.ChecksumCRC32 || undefined,
			checksumCRC32C: res.ChecksumCRC32C || undefined,
			checksumCRC64NVME: res.ChecksumCRC64NVME || undefined,
			checksumSHA1: res.ChecksumSHA1 || undefined,
			checksumSHA256: res.ChecksumSHA256 || undefined,
			checksumType: res.ChecksumType || undefined,
		};
	}

	/**
	 * @remarks Uses [`UploadPart`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_UploadPart.html).
	 * @throws {RangeError} If `key` is not at least 1 character long.
	 * @throws {Error} If `uploadId` is not provided.
	 */
	async uploadPart(
		path: string,
		uploadId: string,
		data: UndiciBodyInit,
		partNumber: number,
		options: UploadPartOptions = {},
	): Promise<UploadPartResult> {
		if (!uploadId) {
			throw new Error("`uploadId` is required.");
		}
		if (!data) {
			throw new Error("`data` is required.");
		}
		if (typeof partNumber !== "number" || partNumber <= 0) {
			throw new Error("`partNumber` has to be a `number` which is >= 1.");
		}

		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"PUT",
			ensureValidPath(path),
			`partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`,
			data,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode === 200) {
			response.body.dump(); // dump's floating promise should not throw

			const etag = response.headers.etag;
			if (typeof etag !== "string" || etag.length === 0) {
				throw new S3Error("Unknown", "", {
					message: "Response did not contain an etag.",
				});
			}
			return {
				partNumber,
				etag,
			};
		}

		throw await getResponseError(response, "");
	}

	/**
	 * @remarks Uses [`ListParts`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListParts.html).
	 * @throws {RangeError} If `key` is not at least 1 character long.
	 * @throws {Error} If `uploadId` is not provided.
	 * @throws {TypeError} If `options.maxParts` is not a `number`.
	 * @throws {RangeError} If `options.maxParts` is <= 0.
	 * @throws {TypeError} If `options.partNumberMarker` is not a `string`.
	 */
	async listParts(
		path: string,
		uploadId: string,
		options: ListPartsOptions = {},
	): Promise<ListPartsResult> {
		let query = "";

		if (options.maxParts) {
			if (typeof options.maxParts !== "number") {
				throw new TypeError("`maxParts` must be a `number`.");
			}
			if (options.maxParts <= 0) {
				throw new RangeError("`maxParts` must be >= 1.");
			}

			query += `&max-parts=${options.maxParts}`;
		}

		if (options.partNumberMarker) {
			if (typeof options.partNumberMarker !== "string") {
				throw new TypeError("`partNumberMarker` must be a `string`.");
			}
			query += `&part-number-marker=${encodeURIComponent(options.partNumberMarker)}`;
		}

		query += `&uploadId=${encodeURIComponent(uploadId)}`;

		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"GET",
			ensureValidPath(path),
			// We always have a leading &, so we can slice the leading & away (this way, we have less conditionals on the hot path); see benchmark-operations.js
			query.substring(1),
			undefined,
			undefined,
			undefined,
			undefined,
			options?.signal,
		);

		if (response.statusCode === 200) {
			const text = await response.body.text();
			const root = ensureParsedXml(text).ListPartsResult ?? {};
			return {
				bucket: root.Bucket,
				key: root.Key,
				uploadId: root.UploadId,
				partNumberMarker: root.PartNumberMarker ?? undefined,
				nextPartNumberMarker: root.NextPartNumberMarker ?? undefined,
				maxParts: root.MaxParts ?? 1000,
				isTruncated: root.IsTruncated ?? false,
				parts:
					// biome-ignore lint/suspicious/noExplicitAny: parsing code
					root.Part?.map((part: any) => ({
						etag: part.ETag,
						lastModified: part.LastModified
							? new Date(part.LastModified)
							: undefined,
						partNumber: part.PartNumber ?? undefined,
						size: part.Size ?? undefined,
					})) ?? [],
			};
		}

		throw await getResponseError(response, path);
	}

	//#endregion
	//#region bucket operations

	/**
	 * Creates a new bucket on the S3 server.
	 *
	 * @param name The name of the bucket to create. AWS the name according to [some rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html). The most important ones are:
	 * - Bucket names must be between `3` (min) and `63` (max) characters long.
	 * - Bucket names can consist only of lowercase letters, numbers, periods (`.`), and hyphens (`-`).
	 * - Bucket names must begin and end with a letter or number.
	 * - Bucket names must not contain two adjacent periods.
	 * - Bucket names must not be formatted as an IP address (for example, `192.168.5.4`).
	 *
	 * @throws {Error} If the bucket name is invalid.
	 * @throws {S3Error} If the bucket could not be created, e.g. if it already exists.
	 * @remarks Uses [`CreateBucket`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html)
	 */
	async createBucket(name: string, options: BucketCreationOptions = {}) {
		let body: string | undefined;
		if (options) {
			const location =
				options.location && (options.location.name || options.location.type)
					? {
							Name: options.location.name ?? undefined,
							Type: options.location.type ?? undefined,
						}
					: undefined;
			const bucket =
				options.info && (options.info.dataRedundancy || options.info.type)
					? {
							DataRedundancy: options.info.dataRedundancy ?? undefined,
							Type: options.info.type ?? undefined,
						}
					: undefined;

			body =
				location || bucket || options.locationConstraint
					? xmlBuilder.build({
							CreateBucketConfiguration: {
								$xmlns: "http://s3.amazonaws.com/doc/2006-03-01/",
								LocationConstraint: options.locationConstraint ?? undefined,
								Location: location,
								Bucket: bucket,
							},
						})
					: undefined;
		}

		const additionalSignedHeaders = body
			? { "content-md5": sign.md5Base64(body) }
			: undefined;

		const response = await this[kSignedRequest](
			options.region ? ensureValidRegion(options.region) : this.#options.region,
			options.endpoint
				? ensureValidEndpoint(options.endpoint)
				: this.#options.endpoint,
			ensureValidBucketName(name),
			"PUT",
			"" as ObjectKey,
			undefined,
			body,
			additionalSignedHeaders,
			undefined,
			undefined,
			options.signal,
		);

		if (400 <= response.statusCode && response.statusCode < 500) {
			throw await getResponseError(response, "");
		}

		// undici docs state that we should dump the body if not used
		response.body.dump(); // dump's floating promise should not throw

		if (response.statusCode === 200) {
			return;
		}

		throw new Error(`Response code not supported: ${response.statusCode}`);
	}

	/**
	 * Deletes a bucket from the S3 server.
	 * @param name The name of the bucket to delete. Same restrictions as in {@link S3Client#createBucket}.
	 * @throws {Error} If the bucket name is invalid.
	 * @throws {S3Error} If the bucket could not be deleted, e.g. if it is not empty.
	 * @remarks Uses [`DeleteBucket`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteBucket.html).
	 */
	async deleteBucket(name: string, options?: BucketDeletionOptions) {
		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			ensureValidBucketName(name),
			"DELETE",
			"" as ObjectKey,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			options?.signal,
		);

		if (400 <= response.statusCode && response.statusCode < 500) {
			throw await getResponseError(response, "");
		}

		// undici docs state that we should dump the body if not used
		response.body.dump(); // dump's floating promise should not throw

		if (response.statusCode === 204) {
			return;
		}
		throw new Error(`Response code not supported: ${response.statusCode}`);
	}

	/**
	 * Checks if a bucket exists.
	 * @param name The name of the bucket to delete. Same restrictions as in {@link S3Client#createBucket}.
	 * @throws {Error} If the bucket name is invalid.
	 * @remarks Uses [`HeadBucket`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadBucket.html).
	 */
	async bucketExists(
		name: string,
		options?: BucketExistsOptions,
	): Promise<boolean> {
		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			ensureValidBucketName(name),
			"HEAD",
			"" as ObjectKey,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			options?.signal,
		);

		if (
			response.statusCode !== 404 &&
			400 <= response.statusCode &&
			response.statusCode < 500
		) {
			throw await getResponseError(response, "");
		}

		// undici docs state that we should dump the body if not used
		response.body.dump(); // dump's floating promise should not throw

		if (response.statusCode === 200) {
			return true;
		}
		if (response.statusCode === 404) {
			return false;
		}
		throw new Error(`Response code not supported: ${response.statusCode}`);
	}

	//#region bucket cors

	/**
	 * @remarks Uses [`PutBucketCors`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketCors.html).
	 */
	async putBucketCors(
		rules: BucketCorsRules,
		options: PutBucketCorsOptions = {},
	): Promise<void> {
		const body = xmlBuilder.build({
			CORSConfiguration: {
				CORSRule: rules.map(r => ({
					AllowedOrigin: r.allowedOrigins,
					AllowedMethod: r.allowedMethods,
					ExposeHeader: r.exposeHeaders,
					ID: r.id ?? undefined,
					MaxAgeSeconds: r.maxAgeSeconds ?? undefined,
				})),
			},
		});

		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"PUT",
			"" as ObjectKey,
			"cors=", // "=" is needed by minio for some reason
			body,
			{
				"content-md5": sign.md5Base64(body),
			},
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode === 200) {
			// undici docs state that we should dump the body if not used
			response.body.dump(); // dump's floating promise should not throw
			return;
		}

		if (400 <= response.statusCode && response.statusCode < 500) {
			throw await getResponseError(response, "");
		}

		throw new Error(
			`Response code not implemented yet: ${response.statusCode}`,
		);
	}

	/**
	 * @remarks Uses [`GetBucketCors`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketCors.html).
	 */
	async getBucketCors(
		options: GetBucketCorsOptions = {},
	): Promise<GetBucketCorsResult> {
		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"GET",
			"" as ObjectKey,
			"cors=", // "=" is needed by minio for some reason
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode !== 200) {
			// undici docs state that we should dump the body if not used
			response.body.dump(); // dump's floating promise should not throw
			throw fromStatusCode(response.statusCode, "");
		}

		// const text = await response.body.text();
		// console.log(text)

		throw new Error("Not implemented");
	}

	/**
	 * @remarks Uses [`DeleteBucketCors`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteBucketCors.html).
	 */
	async deleteBucketCors(options: DeleteBucketCorsOptions = {}): Promise<void> {
		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"DELETE",
			"" as ObjectKey,
			"cors=", // "=" is needed by minio for some reason
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode !== 204) {
			// undici docs state that we should dump the body if not used
			response.body.dump(); // dump's floating promise should not throw
			throw fromStatusCode(response.statusCode, "");
		}
	}

	//#endregion

	//#region list objects

	/**
	 * Uses [`ListObjectsV2`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html) to iterate over all keys. Pagination and continuation is handled internally.
	 */
	async *listIterating(
		options: ListObjectsIteratingOptions,
	): AsyncGenerator<S3BucketEntry> {
		// only used to get smaller pages, so we can test this properly
		const maxKeys = options?.internalPageSize ?? undefined;

		let continuationToken: string | undefined;
		do {
			const res = await this.list({
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
	 * Implements [`ListObjectsV2`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html) to iterate over all keys.
	 *
	 * @throws {RangeError} If `maxKeys` is not between `1` and `1000`.
	 */
	async list(options: ListObjectsOptions = {}): Promise<ListObjectsResult> {
		// See `benchmark-operations.js` on why we don't use URLSearchParams but string concat
		// tldr: This is faster and we know the params exactly, so we can focus our encoding

		// ! minio requires these params to be in alphabetical order

		let query = "";

		if (typeof options.continuationToken !== "undefined") {
			if (typeof options.continuationToken !== "string") {
				throw new TypeError("`continuationToken` must be a `string`.");
			}

			query += `continuation-token=${encodeURIComponent(options.continuationToken)}&`;
		}

		query += "list-type=2";

		if (typeof options.maxKeys !== "undefined") {
			if (typeof options.maxKeys !== "number") {
				throw new TypeError("`maxKeys` must be a `number`.");
			}

			if (options.maxKeys < 1 || options.maxKeys > 1000) {
				throw new RangeError("`maxKeys` has to be between 1 and 1000.");
			}

			query += `&max-keys=${options.maxKeys}`; // no encoding needed, it's a number
		}

		if (typeof options.delimiter !== "undefined") {
			if (typeof options.delimiter !== "string") {
				throw new TypeError("`delimiter` must be a `string`.");
			}
			query += `&delimiter=${options.delimiter === "/" ? "/" : encodeURIComponent(options.delimiter)}`;
		}

		// plain `if(a)` check, so empty strings will also not go into this branch, omitting the parameter
		if (options.prefix) {
			if (typeof options.prefix !== "string") {
				throw new TypeError("`prefix` must be a `string`.");
			}

			query += `&prefix=${encodeURIComponent(options.prefix)}`;
		}

		if (typeof options.startAfter !== "undefined") {
			if (typeof options.startAfter !== "string") {
				throw new TypeError("`startAfter` must be a `string`.");
			}

			query += `&start-after=${encodeURIComponent(options.startAfter)}`;
		}

		const response = await this[kSignedRequest](
			ensureValidRegion(this.#options.region),
			ensureValidEndpoint(this.#options.endpoint),
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"GET",
			"" as ObjectKey,
			query,
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode !== 200) {
			// undici docs state that we should dump the body if not used
			response.body.dump(); // dump's floating promise should not throw
			throw new Error(
				`Response code not implemented yet: ${response.statusCode}`,
			);
		}

		const text = await response.body.text();

		const res = ensureParsedXml(text).ListBucketResult ?? {};
		if (!res) {
			throw new S3Error("Unknown", "", {
				message: "Could not read bucket contents.",
			});
		}

		return {
			name: res.Name,
			prefix: res.Prefix,
			startAfter: res.StartAfter,
			isTruncated: res.IsTruncated,
			continuationToken: res.ContinuationToken,
			maxKeys: res.MaxKeys,
			keyCount: res.KeyCount,
			nextContinuationToken: res.NextContinuationToken,
			contents: res.Contents?.map(S3BucketEntry.parse) ?? [],
		};
	}

	//#endregion

	/**
	 * Uses [`DeleteObjects`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html) to delete multiple objects in a single request.
	 */
	async deleteObjects(
		objects: readonly S3BucketEntry[] | readonly string[],
		options: DeleteObjectsOptions = {},
	): Promise<DeleteObjectsResult> {
		const body = xmlBuilder.build({
			Delete: {
				Quiet: true,
				Object: objects.map(o => ({
					Key: typeof o === "string" ? o : o.key,
				})),
			},
		});

		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			options.bucket
				? ensureValidBucketName(options.bucket)
				: this.#options.bucket,
			"POST",
			"" as ObjectKey,
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

			// biome-ignore lint/suspicious/noExplicitAny: parsing
			let deleteResult: any;
			try {
				// Quite mode omits all deleted elements, so it will be parsed as "", wich we need to coalasce to null/undefined
				deleteResult = ensureParsedXml(text).DeleteResult ?? {};
			} catch (cause) {
				// Possible according to AWS docs
				throw new S3Error("Unknown", "", {
					message: "S3 service responded with invalid XML.",
					cause,
				});
			}

			const errors =
				// biome-ignore lint/suspicious/noExplicitAny: parsing
				deleteResult.Error?.map((e: any) => ({
					code: e.Code,
					key: e.Key,
					message: e.Message,
					versionId: e.VersionId,
				})) ?? [];

			return { errors };
		}

		if (400 <= response.statusCode && response.statusCode < 500) {
			throw await getResponseError(response, "");
		}

		// undici docs state that we should dump the body if not used
		response.body.dump(); // dump's floating promise should not throw
		throw new Error(
			`Response code not implemented yet: ${response.statusCode}`,
		);
	}

	/**
	 * Do not use this. This is an internal method.
	 * TODO: Maybe move this into a separate free function?
	 * @internal
	 */
	async [kSignedRequest](
		region: Region,
		endpoint: Endpoint,
		bucket: BucketName,
		method: HttpMethod,
		pathWithoutBucket: ObjectKey,
		query: string | undefined,
		body: UndiciBodyInit | undefined,
		additionalSignedHeaders: Record<string, string> | undefined,
		additionalUnsignedHeaders: Record<string, string> | undefined,
		contentHash: Buffer | undefined,
		signal: AbortSignal | undefined,
	) {
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
					authorization: getAuthorizationHeader(
						this.#keyCache,
						method,
						url.pathname as ObjectKey,
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
	 * @param {import("./index.d.ts").UndiciBodyInit} data TODO
	 */
	async [kWrite](
		path: ObjectKey,
		data: UndiciBodyInit,
		contentType: string,
		contentLength: number | undefined,
		contentHash: Buffer | undefined,
		rageStart: number | undefined,
		rangeEndExclusive: number | undefined,
		signal: AbortSignal | undefined = undefined,
	): Promise<void> {
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

		let response: Dispatcher.ResponseData<unknown>;
		try {
			response = await request(url, {
				method: "PUT",
				signal,
				dispatcher: this.#dispatcher,
				headers: {
					...headersToBeSigned,
					authorization: getAuthorizationHeader(
						this.#keyCache,
						"PUT",
						url.pathname as ObjectKey,
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
	 */
	[kStream](
		path: ObjectKey,
		contentHash: Buffer | undefined,
		rageStart: number | undefined,
		rangeEndExclusive: number | undefined,
	) {
		const bucket = this.#options.bucket;
		const endpoint = this.#options.endpoint;
		const region = this.#options.region;
		const now = amzDate.now();
		const url = buildRequestUrl(endpoint, bucket, region, path);

		const range = getRangeHeader(rageStart, rangeEndExclusive);

		const contentHashStr = contentHash?.toString("hex") ?? sign.unsignedPayload;

		const headersToBeSigned = prepareHeadersForSigning({
			"amz-sdk-invocation-id": crypto.randomUUID(),
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
				const onNetworkError = (cause: unknown) => {
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
						authorization: getAuthorizationHeader(
							this.#keyCache,
							"GET",
							url.pathname as ObjectKey,
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

						if (response.headers["content-type"] === "application/xml") {
							return response.body.text().then(body => {
								// biome-ignore lint/suspicious/noExplicitAny: :shrug:
								let error: any;
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
}

export function buildSearchParams(
	amzCredential: string,
	date: amzDate.AmzDate,
	expiresIn: number,
	headerList: string,
	contentHashStr: string | null | undefined,
	storageClass: StorageClass | null | undefined,
	sessionToken: string | null | undefined,
	acl: Acl | null | undefined,
	responseContentDisposition: string | null | undefined,
): string {
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

	res += `&X-Amz-Credential=${encodeURIComponentExtended(amzCredential)}`;
	res += `&X-Amz-Date=${date.dateTime}`; // internal dateTimes don't need encoding
	res += `&X-Amz-Expires=${expiresIn}`; // number -> no encoding

	if (sessionToken) {
		res += `&X-Amz-Security-Token=${encodeURIComponent(sessionToken)}`;
	}

	res += `&X-Amz-SignedHeaders=${encodeURIComponent(headerList)}`;

	if (storageClass) {
		res += `&X-Amz-Storage-Class=${storageClass}`;
	}

	if (responseContentDisposition) {
		res += `&response-content-disposition=${encodeURIComponentExtended(responseContentDisposition)}`;
	}

	return res;
}

// biome-ignore lint/suspicious/noExplicitAny: parsing result is just unknown
function ensureParsedXml(text: string): any {
	try {
		const r = xmlParser.parse(text);
		if (!r) {
			throw new S3Error("Unknown", "", {
				message: "S3 service responded with empty XML.",
			});
		}
		return r;
	} catch (cause) {
		// Possible according to AWS docs
		throw new S3Error("Unknown", "", {
			message: "S3 service responded with invalid XML.",
			cause,
		});
	}
}
