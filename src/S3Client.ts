import { request, Agent, type Dispatcher } from "undici";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

import S3File from "./S3File.ts";
import S3Error from "./S3Error.ts";
import type S3BucketEntry from "./S3BucketEntry.ts";
import KeyCache from "./KeyCache.ts";
import * as amzDate from "./AmzDate.ts";
import * as sign from "./sign.ts";
import {
	buildRequestUrl,
	getRangeHeader,
	normalizePath,
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
import type { Readable } from "node:stream";

import {
	parseListPartsResult,
	parseListBucketResult,
	parseInitiateMultipartUploadResult,
	parseListMultipartUploadsResult,
	parseCompleteMultipartUploadResult,
	parseDeleteResult,
	parseGetBucketCorsResult,
	parseCopyObjectResult,
} from "./parsers.ts";

export const kWrite = Symbol("kWrite");
export const kStream = Symbol("kStream");
export const kSignedRequest = Symbol("kSignedRequest");
export const kGetEffectiveParams = Symbol("kGetEffectiveParams");

const xmlParser = new XMLParser({
	ignoreAttributes: true,
});
const xmlBuilder = new XMLBuilder({
	attributeNamePrefix: "$",
	ignoreAttributes: false,
});

export interface S3ClientOptions {
	/**
	 * The name of the bucket to operate on.
	 * Different S3 providers have different limitations here. All of them require:
	 * - Must be at least 3 characters long
	 * - Must be at most 63 characters long
	 * - Must not start or end with a period (.)
	 * - Must not contain two adjacent periods (..)
	 * - Must only contain lowercase letters, numbers, periods (.), and hyphens (-).
	 */
	bucket: string;
	/**
	 * The region of the S3 bucket.
	 * This value is required for all S3 proviers. However, some providers don't care about its actual value.
	 */
	region: string;
	/**
	 * The endpoint of the S3 service.
	 * This is required for all S3 providers.
	 *
	 * The endpoint may contain placeholders for region and bucket, which will be replaced internally with the actual values on use.
	 *
	 * For example, `https://{bucket}.s3.{region}.example.com` will be replaced with `https://my-bucket.s3.us-west-2.example.com` if the bucket is `my-bucket` and the region is `us-west-2`.
	 *
	 * If the endpoint does not contain a placeholder for the bucket, it will be appended to the path of the endpoint.
	 */
	endpoint: string;
	/**
	 * The access key ID to use for authentication.
	 * This is required for all S3 providers.
	 */
	accessKeyId: string;
	/**
	 * The secret access key to use for authentication.
	 * This is required for all S3 providers.
	 */
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
	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;
	/** Signal to abort the request. */
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

export type CopyObjectOptions = {
	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	sourceBucket?: string;
	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	destinationBucket?: string;
	/** Signal to abort the request. */
	signal?: AbortSignal;
};

export type CopyObjectResult = {
	etag?: string;
	lastModified?: Date;
	checksumCRC32?: string;
	checksumCRC32C?: string;
	checksumSHA1?: string;
	checksumSHA256?: string;
};

export type ListObjectsOptions = {
	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;

	prefix?: string;
	maxKeys?: number;
	delimiter?: string;
	startAfter?: string;
	continuationToken?: string;
	/** Signal to abort the request. */
	signal?: AbortSignal;
};
export type ListObjectsIteratingOptions = {
	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;

	prefix?: string;
	startAfter?: string;
	/** Signal to abort the request. */
	signal?: AbortSignal;
	internalPageSize?: number;
};

//#region ListMultipartUploads
export type ListMultipartUploadsOptions = {
	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;
	delimiter?: string;
	keyMarker?: string;
	maxUploads?: number;
	prefix?: string;
	uploadIdMarker?: string;

	/** Signal to abort the request. */
	signal?: AbortSignal;
};
export type ListMultipartUploadsResult = {
	/** Name of the bucket the operation was used upon. */
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
	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;
	/** Signal to abort the request. */
	signal?: AbortSignal;
};
export type CreateMultipartUploadResult = {
	/** Name of the bucket the multipart upload was created in. */
	bucket: string;
	key: string;
	uploadId: string;
};
export type AbortMultipartUploadOptions = {
	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;
	/** Signal to abort the request. */
	signal?: AbortSignal;
};

export type CompleteMultipartUploadOptions = {
	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;
	/** Signal to abort the request. */
	signal?: AbortSignal;
};
export type CompleteMultipartUploadResult = {
	/** The URI that identifies the newly created object. */
	location?: string;
	/** Name of the bucket the multipart upload was created in. */
	bucket?: string;
	key?: string;
	etag?: string;
	/** The Base64 encoded, 32-bit `CRC32` checksum of the part. This checksum is present if the multipart upload request was created with the `CRC32` checksum algorithm. */
	checksumCRC32?: string;
	/** The Base64 encoded, 32-bit `CRC32C` checksum of the part. This checksum is present if the multipart upload request was created with the `CRC32C` checksum algorithm. */
	checksumCRC32C?: string;
	/** The Base64 encoded, 64-bit `CRC64NVME` checksum of the part. This checksum is present if the multipart upload request was created with the `CRC64NVME` checksum algorithm. */
	checksumCRC64NVME?: string;
	/** The Base64 encoded, 160-bit `SHA1` checksum of the part. This checksum is present if the multipart upload request was created with the `SHA1` checksum algorithm. */
	checksumSHA1?: string;
	/** The Base64 encoded, 256-bit `SHA256` checksum of the part. This checksum is present if the multipart upload request was created with the `SHA256` checksum algorithm. */
	checksumSHA256?: string;
	/**
	 * The checksum type, which determines how part-level checksums are combined to create an object-level checksum for multipart objects.
	 * You can use this header as a data integrity check to verify that the checksum type that is received is the same checksum type that was specified during the `CreateMultipartUpload` request.
	 */
	checksumType?: ChecksumType;
};
export type MultipartUploadPart = {
	partNumber: number;
	etag: string;
};
export type UploadPartOptions = {
	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;
	/** Signal to abort the request. */
	signal?: AbortSignal;
};
export type UploadPartResult = {
	partNumber: number;
	etag: string;
};
export type ListPartsOptions = {
	maxParts?: number;
	partNumberMarker?: string;

	/** Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;
	/** Signal to abort the request. */
	signal?: AbortSignal;
};
export type ListPartsResult = {
	/** Name of the bucket. */
	bucket: string;
	key: string;
	uploadId: string;
	partNumberMarker?: string;
	nextPartNumberMarker?: string;
	maxParts?: number;
	isTruncated: boolean;
	parts: Array<{
		/** The Base64 encoded, 32-bit `CRC32` checksum of the part. This checksum is present if the multipart upload request was created with the `CRC32` checksum algorithm. */
		checksumCRC32?: string;
		/** The Base64 encoded, 32-bit `CRC32C` checksum of the part. This checksum is present if the multipart upload request was created with the `CRC32C` checksum algorithm. */
		checksumCRC32C?: string;
		/** The Base64 encoded, 64-bit `CRC64NVME` checksum of the part. This checksum is present if the multipart upload request was created with the `CRC64NVME` checksum algorithm. */
		checksumCRC64NVME?: string;
		/** The Base64 encoded, 160-bit `SHA1` checksum of the part. This checksum is present if the multipart upload request was created with the `SHA1` checksum algorithm. */
		checksumSHA1?: string;
		/** The Base64 encoded, 256-bit `SHA256` checksum of the part. This checksum is present if the multipart upload request was created with the `SHA256` checksum algorithm. */
		checksumSHA256?: string;
		etag: string;
		lastModified: Date;
		partNumber: number;
		size: number;
	}>;

	storageClass?: StorageClass;
	checksumAlgorithm?: ChecksumAlgorithm;
	checksumType?: ChecksumType;
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
	/** Set this to override the {@link S3ClientOptions#endpoint} that was passed on creation of the {@link S3Client}. */
	endpoint?: string;
	/** Set this to override the {@link S3ClientOptions#region} that was passed on creation of the {@link S3Client}. */
	region?: string;
	locationConstraint?: string;
	location?: BucketLocationInfo;
	info?: BucketInfo;
	/** Signal to abort the request. */
	signal?: AbortSignal;
};
export type BucketDeletionOptions = {
	/** Signal to abort the request. */
	signal?: AbortSignal;
};
export type BucketExistsOptions = {
	/** Signal to abort the request. */
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
	/** The CORS rules to set on the bucket. Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;
	/** Signal to abort the request. */
	signal?: AbortSignal;
};
export type DeleteBucketCorsOptions = {
	/** The name of the bucket to delete the CORS configuration for. Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;
	/** Signal to abort the request. */
	signal?: AbortSignal;
};

export type GetBucketCorsOptions = {
	/** The name of the bucket to get the CORS configuration for. Set this to override the {@link S3ClientOptions#bucket} that was passed on creation of the {@link S3Client}. */
	bucket?: string;
	/** Signal to abort the request. */
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

	/**
	 * Copies an object from a source to a destination.
	 * @remarks Uses [`CopyObject`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html).
	 */
	async copyObject(
		sourceKey: string,
		destinationKey: string,
		options: CopyObjectOptions = {},
	): Promise<CopyObjectResult> {
		const sourceBucket = options.sourceBucket
			? ensureValidBucketName(options.sourceBucket)
			: this.#options.bucket;
		const destinationBucket = options.destinationBucket
			? ensureValidBucketName(options.destinationBucket)
			: this.#options.bucket;

		// The value must be URL-encoded.
		const normalizedSourceKey = normalizePath(ensureValidPath(sourceKey));
		const copySource = encodeURIComponent(
			`${sourceBucket}/${normalizedSourceKey}`,
		);

		const response = await this[kSignedRequest](
			this.#options.region,
			this.#options.endpoint,
			destinationBucket,
			"PUT",
			ensureValidPath(destinationKey),
			undefined,
			undefined,
			{
				"x-amz-copy-source": copySource,
			},
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode !== 200) {
			throw await getResponseError(response, destinationKey);
		}

		const text = await response.body.text();

		// biome-ignore lint/suspicious/noExplicitAny: PoC
		return parseCopyObjectResult(text) as any as CopyObjectResult;
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

		// biome-ignore lint/suspicious/noExplicitAny: PoC
		return (parseInitiateMultipartUploadResult(text) as any)
			.result as CreateMultipartUploadResult;
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
		// biome-ignore lint/suspicious/noExplicitAny: PoC
		return (parseListMultipartUploadsResult(text) as any)
			.result as ListMultipartUploadsResult;
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

		if (response.statusCode !== 204) {
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

		// biome-ignore lint/suspicious/noExplicitAny: PoC
		return (parseCompleteMultipartUploadResult(text) as any).result;
	}

	/**
	 * @remarks Uses [`UploadPart`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_UploadPart.html).
	 * @throws {RangeError} If `key` is not at least 1 character long.
	 * @throws {Error} If `uploadId` is not provided.
	 */
	async uploadPart(
		path: string,
		uploadId: string,
		data: string | Buffer | Uint8Array | Readable,
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
			// biome-ignore lint/suspicious/noExplicitAny: POC
			return (parseListPartsResult(text) as any).result;
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
			// garage returns 204 instead of 404
			// fix submitted here: https://git.deuxfleurs.fr/Deuxfleurs/garage/pulls/1096
			// This workaround should be removed as soon as garage fixed the compat issue
			throw fromStatusCode(
				response.statusCode === 204 ? 404 : response.statusCode,
				"",
			);
		}

		const text = await response.body.text();

		// biome-ignore lint/suspicious/noExplicitAny: PoC
		return (parseGetBucketCorsResult(text) as any)
			.result as GetBucketCorsResult;
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
		try {
			// biome-ignore lint/suspicious/noExplicitAny: PoC
			return (parseListBucketResult(text) as any).result;
		} catch (cause) {
			throw new S3Error("Unknown", "", {
				message: "Could not read bucket contents.",
				cause,
			});
		}
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

			// biome-ignore lint/suspicious/noExplicitAny: PoC
			let deleteResult: any;
			try {
				// Quite mode omits all deleted elements, so it will be parsed as "", wich we need to coalasce to null/undefined
				// biome-ignore lint/suspicious/noExplicitAny: PoC
				deleteResult = (parseDeleteResult(text) as any).result;
			} catch (cause) {
				// Possible according to AWS docs
				throw new S3Error("Unknown", "", {
					message: "S3 service responded with invalid XML.",
					cause,
				});
			}

			return { errors: deleteResult.errors };
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
		body: string | Buffer | Uint8Array | Readable | undefined,
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

	/** @internal */
	async [kWrite](
		path: ObjectKey,
		data: string | Buffer | Uint8Array | Readable,
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
	): ReadableStream<Uint8Array> {
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
											status: response.statusCode,
											cause,
										}),
									);
								}
								return controller.error(
									new S3Error(error.Error.Code || "Unknown", path, {
										message: error.Error.Message || undefined, // Message might be "",
										status: response.statusCode,
									}),
								);
							}, onNetworkError);
						}

						return controller.error(
							new S3Error("Unknown", path, {
								status: response.statusCode,
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
