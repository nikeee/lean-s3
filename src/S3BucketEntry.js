// @ts-check

/**
 * @typedef {import("./index.js").StorageClass} StorageClass
 * @typedef {import("./index.js").ChecksumAlgorithm} ChecksumAlgorithm
 * @typedef {import("./index.js").ChecksumType} ChecksumType
 */

/**
 * @internal Normally, we'd use an interface for that, but having a class with pre-defined fields makes it easier for V8 top optimize hidden classes.
 */
export default class S3BucketEntry {
	/**
	 * @readonly
	 * @type {string}
	 */
	key;
	/**
	 * @readonly
	 * @type {number}
	 */
	size;
	/**
	 * @readonly
	 * @type {Date}
	 */
	lastModified;
	/**
	 * @readonly
	 * @type {string}
	 */
	etag;
	/**
	 * @readonly
	 * @type {StorageClass}
	 */
	storageClass;
	/**
	 * @readonly
	 * @type {ChecksumAlgorithm | undefined}
	 */
	checksumAlgorithm;
	/**
	 * @readonly
	 * @type {ChecksumType | undefined}
	 */
	checksumType;

	/**
	 * @param {string} key
	 * @param {number} size
	 * @param {Date} lastModified
	 * @param {string} etag
	 * @param {StorageClass} storageClass
	 * @param {ChecksumAlgorithm | undefined} checksumAlgorithm
	 * @param {ChecksumType | undefined} checksumType
	 */
	constructor(
		key,
		size,
		lastModified,
		etag,
		storageClass,
		checksumAlgorithm,
		checksumType,
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
	 * @param {any} source
	 * @returns {S3BucketEntry}
	 */
	static parse(source) {
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
