/**
 * @typedef {import("./index.js").StorageClass} StorageClass
 * @typedef {import("./index.js").ChecksumAlgorithm} ChecksumAlgorithm
 * @typedef {import("./index.js").ChecksumType} ChecksumType
 */

import type { ChecksumType, ChecksumAlgorithm, StorageClass } from "./index.ts";

/**
 * @internal Normally, we'd use an interface for that, but having a class with pre-defined fields makes it easier for V8 top optimize hidden classes.
 */
export default class S3BucketEntry {
	readonly key: string;
	readonly size: number;
	readonly lastModified: Date;
	readonly etag: string;
	readonly storageClass: StorageClass;
	readonly checksumAlgorithm: ChecksumAlgorithm | undefined;
	readonly checksumType: ChecksumType | undefined;

	constructor(
		key: string,
		size: number,
		lastModified: Date,
		etag: string,
		storageClass: StorageClass,
		checksumAlgorithm: ChecksumAlgorithm | undefined,
		checksumType: ChecksumType | undefined,
	) {
		this.key = key;
		this.size = size;
		this.lastModified = lastModified;
		this.etag = etag;
		this.storageClass = storageClass;
		this.checksumAlgorithm = checksumAlgorithm;
		this.checksumType = checksumType;
	}

	/**
	 * @internal
	 */
	// biome-ignore lint/suspicious/noExplicitAny: internal use only, any is ok here
	static parse(source: any): S3BucketEntry {
		// TODO: check values and throw exceptions
		return new S3BucketEntry(
			source.Key,
			source.Size,
			new Date(source.LastModified),
			source.ETag,
			source.StorageClass,
			source.ChecksumAlgorithm,
			source.ChecksumType,
		);
	}
}
