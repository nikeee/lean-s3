import * as nodeUtil from "node:util";
import type { Readable } from "node:stream";

import type S3Client from "./S3Client.ts";
import {
	kSignedRequest,
	kGetEffectiveParams,
	xmlBuilder,
	ensureParsedXml,
	xmlNumber,
} from "./S3Client.ts";
import S3Error from "./S3Error.ts";
import { getResponseError } from "./error.ts";
import type { BucketName, ObjectKey } from "./branded.ts";
import type { ChecksumAlgorithm, ChecksumType, StorageClass } from "./index.ts";

/**
 * A handle to a multipart upload of a specific object.
 *
 * Created via {@link S3Client#createMultipartUpload} (starts a new upload) or
 * {@link S3Client#multipartUpload} (re-attaches to an existing upload).
 *
 * @example
 * ```js
 * const upload = await client.createMultipartUpload("large-file.bin");
 * try {
 *   const parts = [
 *     await upload.uploadPart(1, chunk1),
 *     await upload.uploadPart(2, chunk2),
 *   ];
 *   await upload.complete(parts);
 * } catch (err) {
 *   await upload.abort();
 *   throw err;
 * }
 * ```
 */
export default class S3MultipartUpload {
	#client: S3Client;
	#key: ObjectKey;
	#uploadId: string;
	#bucket: BucketName;

	/** @internal */
	constructor(client: S3Client, key: ObjectKey, uploadId: string, bucket: BucketName) {
		if (!uploadId) {
			throw new Error("`uploadId` is required.");
		}

		this.#client = client;
		this.#key = key;
		this.#uploadId = uploadId;
		this.#bucket = bucket;
	}

	/** Key of the object this multipart upload was initiated for. */
	get key(): string {
		return this.#key;
	}

	/** Upload ID identifying this multipart upload. */
	get uploadId(): string {
		return this.#uploadId;
	}

	/** Name of the bucket this multipart upload was created in. */
	get bucket(): string {
		return this.#bucket;
	}

	/**
	 * @remarks Uses [`UploadPart`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_UploadPart.html).
	 * @throws {Error} If `partNumber` is not a `number` which is >= 1.
	 */
	async uploadPart(
		partNumber: number,
		data: string | Buffer | Uint8Array | Readable,
		options: UploadPartOptions = {},
	): Promise<UploadPartResult> {
		if (!data) {
			throw new Error("`data` is required.");
		}
		if (typeof partNumber !== "number" || partNumber <= 0) {
			throw new Error("`partNumber` has to be a `number` which is >= 1.");
		}

		const [region, endpoint] = this.#client[kGetEffectiveParams]({});

		const response = await this.#client[kSignedRequest](
			region,
			endpoint,
			this.#bucket,
			"PUT",
			this.#key,
			`partNumber=${partNumber}&uploadId=${encodeURIComponent(this.#uploadId)}`,
			data,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode === 200) {
			void response.body.dump(); // dump's floating promise should not throw

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
	 * @throws {TypeError} If `options.maxParts` is not a `number`.
	 * @throws {RangeError} If `options.maxParts` is <= 0.
	 * @throws {TypeError} If `options.partNumberMarker` is not a `string`.
	 */
	async parts(options: ListPartsOptions = {}): Promise<ListPartsResult> {
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

		query += `&uploadId=${encodeURIComponent(this.#uploadId)}`;

		const [region, endpoint] = this.#client[kGetEffectiveParams]({});

		const response = await this.#client[kSignedRequest](
			region,
			endpoint,
			this.#bucket,
			"GET",
			this.#key,
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
				maxParts: xmlNumber(root.MaxParts) ?? 1000,
				isTruncated: root.IsTruncated === "true",
				parts:
					// biome-ignore lint/suspicious/noExplicitAny: parsing code
					root.Part?.map((part: any) => ({
						etag: part.ETag,
						lastModified: part.LastModified ? new Date(part.LastModified) : undefined,
						partNumber: xmlNumber(part.PartNumber),
						size: xmlNumber(part.Size),
					})) ?? [],
			};
		}

		throw await getResponseError(response, this.#key);
	}

	/**
	 * Uses [`ListParts`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListParts.html) to iterate over all parts. Pagination and continuation is handled internally.
	 */
	async *partsIterating(options: ListPartsIteratingOptions = {}): AsyncGenerator<ListedPart> {
		// only used to get smaller pages, so we can test this properly
		const maxParts = options?.internalPageSize ?? undefined;

		let partNumberMarker: string | undefined;
		let isTruncated = false;
		do {
			const res = await this.parts({
				maxParts,
				partNumberMarker,
				signal: options.signal,
			});

			yield* res.parts;

			partNumberMarker = res.nextPartNumberMarker;
			isTruncated = res.isTruncated && partNumberMarker !== undefined;
		} while (isTruncated);
	}

	/**
	 * @remarks Uses [`CompleteMultipartUpload`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html).
	 */
	async complete(
		parts: readonly MultipartUploadPart[],
		options: CompleteMultipartUploadOptions = {},
	): Promise<CompleteMultipartUploadResult> {
		const body = xmlBuilder.build({
			CompleteMultipartUpload: {
				Part: parts.map(part => ({
					PartNumber: part.partNumber,
					ETag: part.etag,
				})),
			},
		});

		const [region, endpoint] = this.#client[kGetEffectiveParams]({});

		const response = await this.#client[kSignedRequest](
			region,
			endpoint,
			this.#bucket,
			"POST",
			this.#key,
			`uploadId=${encodeURIComponent(this.#uploadId)}`,
			body,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode !== 200) {
			throw await getResponseError(response, this.#key);
		}
		const text = await response.body.text();
		const parsed = ensureParsedXml(text);
		// CompleteMultipartUpload can return "200 OK" with an error document as body:
		// https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html
		if (parsed.Error) {
			throw new S3Error(parsed.Error.Code || "Unknown", this.#key, {
				message: parsed.Error.Message || undefined,
				status: response.statusCode,
			});
		}
		const res = parsed.CompleteMultipartUploadResult ?? {};

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
	 * @remarks Uses [`AbortMultipartUpload`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html).
	 */
	async abort(options: AbortMultipartUploadOptions = {}): Promise<void> {
		const [region, endpoint] = this.#client[kGetEffectiveParams]({});

		const response = await this.#client[kSignedRequest](
			region,
			endpoint,
			this.#bucket,
			"DELETE",
			this.#key,
			`uploadId=${encodeURIComponent(this.#uploadId)}`,
			undefined,
			undefined,
			undefined,
			undefined,
			options.signal,
		);

		if (response.statusCode !== 204) {
			throw await getResponseError(response, this.#key);
		}

		// undici docs state that we should dump the body if not used
		void response.body.dump(); // dump's floating promise should not throw
	}

	toString() {
		return `S3MultipartUpload { key: "${this.#key}", uploadId: "${this.#uploadId}" }`;
	}

	[nodeUtil.inspect.custom](_depth?: number, options: nodeUtil.InspectOptions = {}) {
		if (options.depth === null) {
			options.depth = 2;
		}

		options.colors ??= true;
		const properties = {
			key: this.#key,
			uploadId: this.#uploadId,
			bucket: this.#bucket,
		};

		return `S3MultipartUpload ${nodeUtil.formatWithOptions(options, properties)}`;
	}
}

export type MultipartUploadPart = {
	partNumber: number;
	etag: string;
};
export type UploadPartOptions = {
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

	/** Signal to abort the request. */
	signal?: AbortSignal;
};
export type ListPartsIteratingOptions = {
	/** Signal to abort the request. */
	signal?: AbortSignal;
	internalPageSize?: number;
};
export type ListedPart = {
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
	parts: ListedPart[];

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
export type CompleteMultipartUploadOptions = {
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
export type AbortMultipartUploadOptions = {
	/** Signal to abort the request. */
	signal?: AbortSignal;
};
