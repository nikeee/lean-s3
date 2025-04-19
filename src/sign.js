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
	// it is actually faster to pass a single large string instead of doing multiple .update() chains with the parameters
	// see `benchmark-operations.js`
	return createHmac("sha256", signinKey)
		.update(
			`AWS4-HMAC-SHA256\n${date.dateTime}\n${date.date}/${region}/s3/aws4_request\n${canonicalDataHash}`,
		)
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
 * @param {import("./index.js").PresignableHttpMethod} method
 * @param {string} path
 * @param {string} query
 * @param {string} host
 * @returns
 */
export function createCanonicalDataDigestHostOnly(method, path, query, host) {
	// it is actually faster to pass a single large string instead of doing multiple .update() chains with the parameters
	// see `benchmark-operations.js`

	return createHash("sha256")
		.update(
			`${method}\n${path}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`,
		)
		.digest("hex");
}

/**
 * @param {import("./index.js").HttpMethod} method
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
	// it is actually faster to pass a single large string instead of doing multiple .update() chains with the parameters
	// TODO: Maybe actually create a large string here
	// see `benchmark-operations.js`

	const hash = createHash("sha256").update(`${method}\n${path}\n${query}\n`);

	for (const header of sortedHeaderNames) {
		hash.update(`${header}:${sortedHeaders[header]}\n`);
	}

	hash.update("\n");

	for (let i = 0; i < sortedHeaderNames.length; ++i) {
		if (i < sortedHeaderNames.length - 1) {
			hash.update(`${sortedHeaderNames[i]};`);
		} else {
			hash.update(sortedHeaderNames[i]);
		}
	}

	return hash.update(`\n${contentHashStr}`).digest("hex");
}

/**
 * @param {import("node:crypto").BinaryLike} data
 * @returns {Buffer}
 */
export function sha256(data) {
	return createHash("sha256").update(data).digest();
}

/**
 * @param {import("node:crypto").BinaryLike} data
 * @returns {string}
 */
export function md5Base64(data) {
	return createHash("md5").update(data).digest("base64");
}
