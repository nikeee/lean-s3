import { describe, test } from "node:test";
import { createHash } from "node:crypto";

import { expect } from "expect";

import * as sign from "./sign.js";
import { getAmzDate } from "./AmzDate.js";

describe("deriveSigningKey", () => {
	test("snapshot", () => {
		const date = new Date("August 19, 1975 23:15:30 GMT+11:00");
		const signinKey = sign.deriveSigningKey(
			getAmzDate(date).date,
			"auto",
			"secretKey",
		);

		expect(signinKey).toStrictEqual(
			Buffer.from(
				"ee60fc9b7cd227df081ef4029ec48a21310784374dd919fa91dc9b4796b71823",
				"hex",
			),
		);
	});
});

describe("signCanonicalDataHash", () => {
	/**
	 * Taken from:
	 * https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
	 */
	test("spec-sample", () => {
		const canonicalData =
			"GET\n/test.txt\nX-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host\nhost:examplebucket.s3.amazonaws.com\n\nhost\nUNSIGNED-PAYLOAD";

		const canonicalDataHash = createHash("sha256")
			.update(canonicalData)
			.digest("hex");

		const amzDate = {
			numericDayStart: -1,
			date: "20130524",
			dateTime: "20130524T000000Z",
		};

		const singingKey = sign.deriveSigningKey(
			amzDate.date,
			"us-east-1",
			"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		);
		const signature = sign.signCanonicalDataHash(
			singingKey,
			canonicalDataHash,
			amzDate,
			"us-east-1",
		);
		expect(signature).toStrictEqual(
			"aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
		);
	});

	/**
	 * URL created using AWS SDK:
	 * ```js
	 * import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
	 * import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
	 *
	 * const s3Client = new S3Client({
	 *     region: "auto",
	 *     requestChecksumCalculation: "WHEN_REQUIRED", // omit CRC32 from signed headers
	 *     credentials: {
	 *         accessKeyId: "sample-key-id",
	 *         secretAccessKey: "sample-secret-key",
	 *     },
	 * });
	 *
	 * async function generatePresignedUrl(bucketName, key, expiresIn) {
	 *     return await getSignedUrl(s3Client, new PutObjectCommand({
	 *         Bucket: bucketName,
	 *         Key: key,
	 *         ContentType: "image/jpeg",
	 *     }), { expiresIn });
	 * }
	 *
	 * console.log(await generatePresignedUrl("test-bucket", "test.json", 42690));
	 * ```
	 */
	test("ref by `@aws-sdk/s3-request-presigner`", () => {
		// AWS sdk still adds the x-id field, which seems to have no use in this context:
		// https://github.com/aws/aws-sdk-go-v2/discussions/2847#discussioncomment-11093778
		// -> we don't add it, but to get the signature right, we need to act as if we have added it
		const ref = new URL(
			"https://test-bucket.localhost:9000/test.json?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=sample-key-id%2F20250319%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20250319T151759Z&X-Amz-Expires=42690&X-Amz-Signature=8c9d30ff6c442437200f89cf33d0b4b8e5fb681fbf4e5e68df0a2350147343da&X-Amz-SignedHeaders=host&x-id=PutObject",
		);

		const canonicalData =
			"PUT\n/test.json\nX-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=sample-key-id%2F20250319%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20250319T151759Z&X-Amz-Expires=42690&X-Amz-SignedHeaders=host&x-id=PutObject\nhost:test-bucket.localhost:9000\n\nhost\nUNSIGNED-PAYLOAD";
		const canonicalDataHash = createHash("sha256")
			.update(canonicalData)
			.digest("hex");

		const amzDate = {
			numericDayStart: -1,
			date: "20250319",
			dateTime: "20250319T151759Z",
		};

		const singingKey = sign.deriveSigningKey(
			amzDate.date,
			"auto",
			"sample-secret-key",
		);
		const signature = sign.signCanonicalDataHash(
			singingKey,
			canonicalDataHash,
			amzDate,
			"auto",
		);
		expect(signature).toStrictEqual(ref.searchParams.get("X-Amz-Signature"));
	});

	/**
	 *  URL created using bun:
	 *  ```js
	 *  import { S3Client } from "bun";
	 *  const s3 = new S3Client({
	 *      region: "auto",
	 *      accessKeyId: "sample-key-id",
	 *      secretAccessKey: "sample-secret-key",
	 *      bucket: "test-bucket",
	 *      endpoint: "http://localhost:9000",
	 *  });
	 *  console.log(s3.presign("test.json"));
	 *  ```
	 */
	test("ref by `bun`", () => {
		const ref = new URL(
			"http://localhost:9000/test-bucket/test.json?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=sample-key-id%2F20250319%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20250319T143536Z&X-Amz-Expires=42069&X-Amz-SignedHeaders=host&X-Amz-Signature=50fa21a675d33d7ce7b1001f4c98f7c07b1ebba8c58debcf333a37498b87ef78",
		);

		const canonicalData =
			"PUT\n/test-bucket/test.json\nX-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=sample-key-id%2F20250319%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20250319T143536Z&X-Amz-Expires=42069&X-Amz-SignedHeaders=host\nhost:localhost:9000\n\nhost\nUNSIGNED-PAYLOAD";
		const canonicalDataHash = createHash("sha256")
			.update(canonicalData)
			.digest("hex");

		const amzDate = {
			numericDayStart: -1,
			date: "20250319",
			dateTime: "20250319T143536Z",
		};

		const singingKey = sign.deriveSigningKey(
			amzDate.date,
			"auto",
			"sample-secret-key",
		);
		const signature = sign.signCanonicalDataHash(
			singingKey,
			canonicalDataHash,
			amzDate,
			"auto",
		);
		expect(signature).toStrictEqual(ref.searchParams.get("X-Amz-Signature"));
	});
	test("ref by native", () => {
		const ref = new URL(
			"https://s3.us-east-1.amazonaws.com/TODO?x-amz-algorithm=AWS4-HMAC-SHA256&x-amz-credential=sample-key-id%2F20250326%2Fauto%2Fs3%2Faws4_request&x-amz-date=20250326T132719Z&x-amz-expires=3600&x-amz-signedheaders=host&x-amz-signature=cbe53da647e87bb7cb5ffa5915ba7cf3f7018eeb485bb52b00cb66020f6345eb",
		);

		const canonicalData =
			"GET\nTODO\nx-amz-algorithm=AWS4-HMAC-SHA256&x-amz-credential=sample-key-id%2F20250326%2Fauto%2Fs3%2Faws4_request&x-amz-date=20250326T132719Z&x-amz-expires=3600&x-amz-signedheaders=host\nhost:s3.us-east-1.amazonaws.com\n\nhost\nUNSIGNED-PAYLOAD";
		const canonicalDataHash = createHash("sha256")
			.update(canonicalData)
			.digest("hex");

		const amzDate = {
			numericDayStart: -1,
			date: "20250326",
			dateTime: "20250326T132719Z",
		};

		const singingKey = sign.deriveSigningKey(
			amzDate.date,
			"auto",
			"sample-secret-key",
		);
		const signature = sign.signCanonicalDataHash(
			singingKey,
			canonicalDataHash,
			amzDate,
			"auto",
		);
		expect(signature).toStrictEqual(ref.searchParams.get("x-amz-signature"));
	});
});

describe("createCanonicalData", () => {
	test("equvalence of secpialized", () => {
		const general = sign.createCanonicalDataDigest(
			"GET",
			"/test.json",
			"query",
			{ host: "abc:8080" },
			sign.unsignedPayload,
		);
		const special = sign.createCanonicalDataDigestHostOnly(
			"GET",
			"/test.json",
			"query",
			"abc:8080",
		);
		expect(general).toBe(special);
	});

	test("authorization header", () => {
		const signedHeaders = {
			"amz-sdk-invocation-id": "f5cf146b-5839-46da-b8d8-86536fb6be87",
			"amz-sdk-request": "attempt=1; max=3",
			"content-length": "17",
			"content-type": "application/octet-stream",
			host: "lol.localhost:1337",
			"x-amz-content-sha256":
				"93a23971a914e5eacbf0a8d25154cda309c3c1c72fbb9914d47c60f3cb681588",
			"x-amz-date": "20250408T200640Z",
			"x-amz-user-agent": "aws-sdk-js/3.782.0",
		};

		const dataDigest = sign.createCanonicalDataDigest(
			"PUT",
			"//path.json",
			"x-id=PutObject",
			signedHeaders,
			"93a23971a914e5eacbf0a8d25154cda309c3c1c72fbb9914d47c60f3cb681588",
		);

		expect(dataDigest).toBe(
			"7d48b15c07c1302bfa78b5b9364ae72cef4286424e91948d41a094d544f604c5",
		);

		const signingKey = sign.deriveSigningKey("20250408", "auto", "secret");
		expect(signingKey).toStrictEqual(
			Buffer.from(
				"59e981d9fe3accad88bd41e770978852020f9af961302e0ffd07509f086ad9a0",
				"hex",
			),
		);

		const signature = sign.signCanonicalDataHash(
			signingKey,
			dataDigest,
			{ date: "20250408", dateTime: "20250408T200640Z", numericDayStart: -1 },
			"auto",
		);
		expect(signature).toBe(
			"83324a8f1745a6aae04f47806978294e00c715e72fd715f24f7be5a57dc46b62",
		);

		const signedHeadersSpec = Object.keys(signedHeaders).toSorted().join(";");
		const credentialSpec = "access-key/20250408/auto/s3/aws4_request";

		expect(
			`AWS4-HMAC-SHA256 Credential=${credentialSpec}, SignedHeaders=${signedHeadersSpec}, Signature=${signature}`,
		).toBe(
			"AWS4-HMAC-SHA256 Credential=access-key/20250408/auto/s3/aws4_request, SignedHeaders=amz-sdk-invocation-id;amz-sdk-request;content-length;content-type;host;x-amz-content-sha256;x-amz-date;x-amz-user-agent, Signature=83324a8f1745a6aae04f47806978294e00c715e72fd715f24f7be5a57dc46b62",
		);
	});
});
