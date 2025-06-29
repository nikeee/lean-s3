import type { AmzDate } from "./AmzDate.ts";
import type { HttpMethod } from "./index.ts";
import type KeyCache from "./KeyCache.ts";

import * as sign from "./sign.ts";

export function getAuthorizationHeader(
	keyCache: KeyCache,
	method: HttpMethod,
	path: string,
	query: string,
	date: AmzDate,
	sortedSignedHeaders: Record<string, string>,
	region: string,
	contentHashStr: string,
	accessKeyId: string,
	secretAccessKey: string,
) {
	const dataDigest = sign.createCanonicalDataDigest(
		method,
		path,
		query,
		sortedSignedHeaders,
		contentHashStr,
	);

	const signingKey = keyCache.computeIfAbsent(
		date,
		region,
		accessKeyId,
		secretAccessKey,
	);

	const signature = sign.signCanonicalDataHash(
		signingKey,
		dataDigest,
		date,
		region,
	);

	// no encodeURIComponent because because we assume that all headers don't need escaping
	const signedHeadersSpec = Object.keys(sortedSignedHeaders).join(";");
	const credentialSpec = `${accessKeyId}/${date.date}/${region}/s3/aws4_request`;
	return `AWS4-HMAC-SHA256 Credential=${credentialSpec}, SignedHeaders=${signedHeadersSpec}, Signature=${signature}`;
}
