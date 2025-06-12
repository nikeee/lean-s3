import type { Readable } from "node:stream";

export {
	default as S3File,
	type S3FileDeleteOptions,
	type S3FileExistsOptions,
	type S3StatOptions,
} from "./S3File.ts";
export {
	default as S3Client,
	type ListObjectsOptions,
	type ListObjectsIteratingOptions,
	type ListObjectsResponse,
	type CreateFileInstanceOptions,
	type OverridableS3ClientOptions,
	type S3ClientOptions,
	type S3FilePresignOptions,
} from "./S3Client.ts";
export { default as S3Error, type S3ErrorOptions } from "./S3Error.ts";
export { default as S3Stat } from "./S3Stat.ts";
export { default as S3BucketEntry } from "./S3BucketEntry.ts";

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
