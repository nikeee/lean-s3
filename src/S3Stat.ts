import type { Headers } from "undici-types";

export default class S3Stat {
	readonly etag: string;
	readonly lastModified: Date;
	readonly size: number;
	readonly type: string;

	constructor(etag: string, lastModified: Date, size: number, type: string) {
		this.etag = etag;
		this.lastModified = lastModified;
		this.size = size;
		this.type = type;
	}

	static tryParseFromHeaders(headers: Headers): S3Stat | undefined {
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
}
