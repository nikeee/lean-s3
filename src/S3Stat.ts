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

	static tryParseFromHeaders(
		headers: Record<string, string | string[] | undefined>,
	): S3Stat | undefined {
		const lm = headers["last-modified"];
		if (lm === null || typeof lm !== "string") {
			return undefined;
		}

		const etag = headers.etag;
		if (etag === null || typeof etag !== "string") {
			return undefined;
		}

		const cl = headers["content-length"];
		if (cl === null) {
			return undefined;
		}

		const size = Number(cl);
		if (!Number.isSafeInteger(size)) {
			return undefined;
		}

		const ct = headers["content-type"];
		if (ct === null || typeof ct !== "string") {
			return undefined;
		}

		return new S3Stat(etag, new Date(lm), size, ct);
	}
}
