import type { Readable } from "node:stream";

import type S3BucketEntry from "./S3BucketEntry.js";

export { default as S3File } from "./S3File.js";
export { default as S3Client } from "./S3Client.js";
export { default as S3Error } from "./S3Error.js";
export { default as S3Stat } from "./S3Stat.ts";
export { default as S3BucketEntry } from "./S3BucketEntry.js";

export interface S3ClientOptions {
	bucket: string;
	region: string;
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
}

export type Acl =
	| "private"
	| "public-read"
	| "public-read-write"
	| "aws-exec-read"
	| "authenticated-read"
	| "bucket-owner-read"
	| "bucket-owner-full-control"
	| "log-delivery-write";

export type StorageClass =
	| "STANDARD"
	| "DEEP_ARCHIVE"
	| "EXPRESS_ONEZONE"
	| "GLACIER"
	| "GLACIER_IR"
	| "INTELLIGENT_TIERING"
	| "ONEZONE_IA"
	| "OUTPOSTS"
	| "REDUCED_REDUNDANCY"
	| "SNOW"
	| "STANDARD_IA";

export type ChecksumAlgorithm =
	| "CRC32"
	| "CRC32C"
	| "CRC64NVME"
	| "SHA1"
	| "SHA256";

export type ChecksumType = "COMPOSITE" | "FULL_OBJECT";

export type PresignableHttpMethod = "GET" | "DELETE" | "PUT" | "HEAD";
export type HttpMethod = PresignableHttpMethod | "POST"; // There are also others, but we don't want to support them yet

export interface S3FilePresignOptions {
	contentHash: Buffer;
	/** Seconds. */
	expiresIn: number; // TODO: Maybe support Temporal.Duration once major support arrives
	method: PresignableHttpMethod;
	storageClass: StorageClass;
	acl: Acl;
}

export type OverridableS3ClientOptions = Pick<
	S3ClientOptions,
	"region" | "bucket" | "endpoint"
>;

export interface S3StatOptions extends OverridableS3ClientOptions {
	signal: AbortSignal;
}
export interface S3FileExistsOptions extends OverridableS3ClientOptions {
	signal: AbortSignal;
}
export interface S3FileDeleteOptions extends OverridableS3ClientOptions {
	signal: AbortSignal;
}

// biome-ignore lint/complexity/noBannedTypes: TODO
export type CreateFileInstanceOptions = {}; // TODO

/** Body values supported by undici. */
export type UndiciBodyInit = string | Buffer | Uint8Array | Readable;

export type ByteSource = UndiciBodyInit | Blob;
// TODO
// | ArrayBufferView
// | ArrayBuffer
// | SharedArrayBuffer
// | Request
// | Response
// | S3File
// | ReadableStream<Uint8Array>

export type ListObjectsResponse = {
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
