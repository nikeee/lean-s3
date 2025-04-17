import { inspect } from "node:util";

export default class S3Stat {
	/**
	 * @type {string}
	 * @readonly
	 */
	etag;
	/**
	 * @type {Date}
	 * @readonly
	 */
	lastModified;
	/**
	 * @type {number}
	 * @readonly
	 */
	size;
	/**
	 * @type {string}
	 * @readonly
	 */
	type;

	/**
	 * @param {string} etag
	 * @param {Date} lastModified
	 * @param {number} size
	 * @param {string} type
	 */
	constructor(etag, lastModified, size, type) {
		this.etag = etag;
		this.lastModified = lastModified;
		this.size = size;
		this.type = type;
	}

	/**
	 * @param {Headers} headers
	 * @returns {S3Stat | undefined}
	 */
	static tryParseFromHeaders(headers) {
		const lm = headers.get("last-modified");
		if (lm === null) {
			return undefined;
		}

		const etag = headers.get("etag");
		if (etag === null) {
			return undefined;
		}

		const cl = headers.get("content-length");
		if (cl === null) {
			return undefined;
		}

		const size = Number(cl);
		if (!Number.isSafeInteger(size)) {
			return undefined;
		}

		const ct = headers.get("content-type");
		if (ct === null) {
			return undefined;
		}

		return new S3Stat(etag, new Date(lm), size, ct);
	}

	toString() {
		return `S3Stats {\n\tlastModified: ${inspect(this.lastModified)},\n\tsize: ${inspect(this.size)},\n\ttype: ${inspect(this.type)},\n\tetag: ${inspect(this.etag)}\n}`;
	}
}
