import { createHmac, createHash, type BinaryLike } from "node:crypto";

import type { AmzDate } from "./AmzDate.ts";
import type { HttpMethod, PresignableHttpMethod } from "./index.ts";

// Spec:
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html

export function deriveSigningKey(
	date: string,
	region: string,
	secretAccessKey: string,
): Buffer {
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

export function signCanonicalDataHash(
	signinKey: Buffer,
	canonicalDataHash: string,
	date: AmzDate,
	region: string,
): string {
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
 * Same as {@see createCanonicalDataDigest}, but only sets the `host` header and the content hash to `UNSIGNED-PAYLOAD`.
 *
 * Used for pre-signing only. Pre-signed URLs [cannot contain content hashes](https://github.com/aws/aws-sdk-js/blob/966fa6c316dbb11ca9277564ff7120e6b16467f4/lib/signers/v4.js#L182-L183)
 * and the only header that is signed is `host`. So we can use an optimized version for that.
 */
export function createCanonicalDataDigestHostOnly(
	method: PresignableHttpMethod,
	path: string,
	query: string,
	host: string,
): string {
	// it is actually faster to pass a single large string instead of doing multiple .update() chains with the parameters
	// see `benchmark-operations.js`

	return createHash("sha256")
		.update(
			`${method}\n${path}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`,
		)
		.digest("hex");
}

export function createCanonicalDataDigest(
	method: HttpMethod,
	path: string,
	query: string,
	sortedHeaders: Record<string, string>,
	contentHashStr: string,
): string {
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
	// see `benchmark-operations.js`

	let canonData = `${method}\n${path}\n${query}\n`;
	for (const header of sortedHeaderNames) {
		canonData += `${header}:${sortedHeaders[header]}\n`;
	}
	canonData += "\n";

	// emit the first header without ";", so we can avoid branching inside the loop for the other headers
	// this is just a version of `sortedHeaderList.join(";")` that seems about 2x faster (see `benchmark-operations.js`)
	canonData += sortedHeaderNames.length > 0 ? sortedHeaderNames[0] : "";
	for (let i = 1; i < sortedHeaderNames.length; ++i) {
		canonData += `;${sortedHeaderNames[i]}`;
	}
	canonData += `\n${contentHashStr}`;

	return createHash("sha256").update(canonData).digest("hex");
}

export function sha256(data: BinaryLike): Buffer {
	return createHash("sha256").update(data).digest();
}

export function md5Base64(data: BinaryLike): string {
	return createHash("md5").update(data).digest("base64");
}
