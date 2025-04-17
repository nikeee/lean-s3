import { createHmac, createHash } from "node:crypto";

// Spec:
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html

/**
 * @param {string} date
 * @param {string} region
 * @param {string} secretAccessKey
 * @returns {Buffer}
 */
export function deriveSigningKey(date, region, secretAccessKey) {
	const key = `AWS4${secretAccessKey}`;

	const signedDate = createHmac("sha256", key).update(date).digest();

	const signedDateRegion = createHmac("sha256", signedDate)
		.update(region)
		.digest();

	const signedDateRegionService = createHmac("sha256", signedDateRegion)
		.update("s3")
		.digest();

	return createHmac("sha256", signedDateRegionService)
		.update("aws4_request")
		.digest();
}

/**
 * @param {Buffer} signinKey
 * @param {string} canonicalDataHash
 * @param {import("./AmzDate.js").AmzDate} date
 * @param {string} region
 * @returns {string}
 */
export function signCanonicalDataHash(
	signinKey,
	canonicalDataHash,
	date,
	region,
) {
	// TODO: Investigate if its actually faster than just concatenating the parts and do a single update()
	return createHmac("sha256", signinKey)
		.update("AWS4-HMAC-SHA256\n")
		.update(date.dateTime)
		.update("\n")
		.update(date.date)
		.update("/")
		.update(region)
		.update("/s3/aws4_request\n")
		.update(canonicalDataHash)
		.digest("hex");
}

export const unsignedPayload = "UNSIGNED-PAYLOAD";

/**
 *
 * Same as {@see createCanonicalDataDigest}, but only sets the `host` header and the content hash to `UNSIGNED-PAYLOAD`.
 *
 * Used for pre-signing only. Pre-signed URLs [cannot contain content hashes](https://github.com/aws/aws-sdk-js/blob/966fa6c316dbb11ca9277564ff7120e6b16467f4/lib/signers/v4.js#L182-L183)
 * and the only header that is signed is `host`. So we can use an optimized version for that.
 *
 * TODO: Maybe passing a contentHash is supported on GET in order to restrict access to a specific file
 *
 * @param {import("./index.js").PresignableHttpMethod} method
 * @param {string} path
 * @param {string} query
 * @param {string} host
 * @returns
 */
export function createCanonicalDataDigestHostOnly(method, path, query, host) {
	// TODO: Investigate if its actually faster than just concatenating the parts and do a single update()
	return createHash("sha256")
		.update(method)
		.update("\n")
		.update(path)
		.update("\n")
		.update(query)
		.update("\nhost:")
		.update(host)
		.update("\n\nhost\nUNSIGNED-PAYLOAD")
		.digest("hex");
}

/**
 * @param {import("./index.js").PresignableHttpMethod} method
 * @param {string} path
 * @param {string} query
 * @param {Record<string, string>} sortedHeaders
 * @param {string} contentHashStr
 * @returns
 */
export function createCanonicalDataDigest(
	method,
	path,
	query,
	sortedHeaders,
	contentHashStr,
) {
	// Use this for debugging
	/*
	const xHash = {
		h: createHash("sha256"),
		m: "",
		update(v) {
			this.m += v;
			this.h.update(v);
			return this;
		},
		digest(v) {
			if (this.m.includes("continuation-token")) console.log(this.m);
			return this.h.digest(v);
		},
	};
	*/

	const sortedHeaderNames = Object.keys(sortedHeaders);
	// TODO: Investigate if its actually faster than just concatenating the parts and do a single update()
	const hash = createHash("sha256")
		.update(method)
		.update("\n")
		.update(path)
		.update("\n")
		.update(query)
		.update("\n");

	for (const header of sortedHeaderNames) {
		hash.update(header).update(":").update(sortedHeaders[header]);
		hash.update("\n");
	}

	hash.update("\n");

	for (let i = 0; i < sortedHeaderNames.length; ++i) {
		hash.update(sortedHeaderNames[i]);
		if (i < sortedHeaderNames.length - 1) {
			hash.update(";");
		}
	}

	return hash.update("\n").update(contentHashStr).digest("hex");
}

/**
 * @param {import("node:crypto").BinaryLike} data
 * @returns {Buffer}
 */
export function sha256(data) {
	return createHash("sha256").update(data).digest();
}
