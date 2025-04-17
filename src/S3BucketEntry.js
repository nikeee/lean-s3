export default class S3BucketEntry {
	/** @type {string} */
	key;
	/** @type {number} */
	size;
	/** @type {Date} */
	lastModified;
	/** @type {string} */
	etag;
	/** @type {StorageClass} */
	storageClass;

	/**
	 * @param {string} key
	 * @param {number} size
	 * @param {Date} lastModified
	 * @param {string} etag
	 * @param {StorageClass} storageClass
	 */
	constructor(key, size, lastModified, etag, storageClass) {
		this.key = key;
		this.size = size;
		this.lastModified = lastModified;
		this.etag = etag;
		this.storageClass = storageClass;
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
		);
	}
}
