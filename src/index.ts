import type { Readable } from "node:stream";

export {
	default as S3File,
	type S3FileDeleteOptions,
	type S3FileExistsOptions,
	type S3StatOptions,
	type S3FileReadOptions,
	type S3FileWriteOptions,
} from "./S3File.ts";
export {
	default as S3MultipartUpload,
	type UploadPartOptions,
	type UploadPartResult,
	type ListPartsOptions,
	type ListPartsIteratingOptions,
	type ListPartsResult,
	type ListedPart,
	type AbortMultipartUploadOptions,
	type CompleteMultipartUploadOptions,
	type CompleteMultipartUploadResult,
	type MultipartUploadPart,
} from "./S3MultipartUpload.ts";
export {
	default as S3Client,
	type CreateMultipartUploadOptions,
	type CreateMultipartUploadInstanceOptions,
	type DeleteObjectsResult,
	type DeleteObjectsError,
	type ListObjectsOptions,
	type ListObjectsIteratingOptions,
	type ListObjectsResult,
	type ListMultipartUploadsOptions,
	type ListMultipartUploadsResult,
	type MultipartUpload,
	type CreateFileInstanceOptions,
	type OverridableS3ClientOptions,
	type S3ClientOptions,
	type S3FilePresignOptions,
	type BucketCreationOptions,
	type DeleteObjectsOptions,
	type BucketExistsOptions,
	type BucketDeletionOptions,
	type BucketCorsRules,
	type BucketCorsRule,
	type PutBucketCorsOptions,
	type GetBucketCorsOptions,
	type GetBucketCorsResult,
	type DeleteBucketCorsOptions,
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

export type ChecksumAlgorithm = "CRC32" | "CRC32C" | "CRC64NVME" | "SHA1" | "SHA256";

export type ChecksumType = "COMPOSITE" | "FULL_OBJECT";

export type PresignableHttpMethod = "GET" | "DELETE" | "PUT" | "HEAD";
export type HttpMethod = PresignableHttpMethod | "POST"; // There are also others, but we don't want to support them yet

export type ByteSource =
	| string
	| Buffer
	| Uint8Array
	| ArrayBufferView
	| ArrayBuffer
	| SharedArrayBuffer
	| Readable
	| Blob;
// TODO
// | Request
// | Response
// | S3File
// | ReadableStream<Uint8Array>

/**
 * Implements [LocationInfo](https://docs.aws.amazon.com/AmazonS3/latest/API/API_LocationInfo.html)
 */
export type BucketLocationInfo = {
	name?: string;
	type?: string;
};

/**
 * Implements [BucketInfo](https://docs.aws.amazon.com/AmazonS3/latest/API/API_BucketInfo.html)
 */
export type BucketInfo = {
	dataRedundancy?: string;
	type?: string;
};

/**
 * Represents valid values for the [`Content-Disposition`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition) header.
 */
export type ContentDisposition = AttachmentContentDisposition | InlineContentDisposition;

export type InlineContentDisposition = {
	type: "inline";
};

export type AttachmentContentDisposition = {
	type: "attachment";
	filename?: string;
};
