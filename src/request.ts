import type { AmzDate } from "./AmzDate.ts";
import type {
	AccessKeyId,
	ObjectKey,
	Region,
	SecretAccessKey,
} from "./branded.ts";
import type { HttpMethod } from "./index.ts";
import type KeyCache from "./KeyCache.ts";

import * as sign from "./sign.ts";

export function getAuthorizationHeader(
	keyCache: KeyCache,
	method: HttpMethod,
	path: ObjectKey,
	query: string,
	date: AmzDate,
	sortedSignedHeaders: Record<string, string>,
	region: Region,
	contentHashStr: string,
	accessKeyId: AccessKeyId,
	secretAccessKey: SecretAccessKey,
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
