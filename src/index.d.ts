import type { Readable } from "node:stream";

export { default as S3File } from "./S3File.js";
export { default as S3Client } from "./S3Client.js";
export { default as S3Error } from "./S3Error.js";
export { default as S3Stat } from "./S3Stat.js";

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

export type PresignableHttpMethod = "GET" | "DELETE" | "PUT" | "HEAD";

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
