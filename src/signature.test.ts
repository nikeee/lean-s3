import { describe, test } from "node:test";

import { expect } from "expect";
import { MockAgent } from "undici";

import { S3Client } from "./index.ts";
import { computeAuthorizationHeaderSignature, computePresignedUrlSignature } from "./test/sigv4.ts";

const origin = "https://s3.example.com";
const secretAccessKey = "sample-secret-key";

// Characters that `encodeURIComponent` or the URL parser leave raw or rewrite, plus some others
const weird = "a!b'c(d)e*f [g]$h&i=j;k@l|m%n+o,p:q\\r\ts\nt/Ð😀";

type CapturedRequest = { url: string; method: string; headers: Record<string, string> };

/**
 * Creates a client whose requests are answered by a mock server, which records them.
 */
function createClient(responseBody = "") {
	const requests: CapturedRequest[] = [];

	const dispatcher = new MockAgent();
	dispatcher.disableNetConnect();
	dispatcher
		.get(origin)
		.intercept({ path: () => true, method: () => true })
		.reply(opts => {
			requests.push({
				url: origin + opts.path,
				method: opts.method,
				headers: opts.headers as Record<string, string>,
			});
			return { statusCode: 200, data: responseBody };
		})
		.persist();

	const client = new S3Client({
		endpoint: origin,
		accessKeyId: "sample-key-id",
		secretAccessKey,
		region: "auto",
		bucket: "mybucket",
		dispatcher,
	});
	return { client, requests };
}

/**
 * Returns the URL of the only recorded request after checking its signature against what the server computes.
 */
function expectSingleValidRequest(requests: CapturedRequest[]): URL {
	expect(requests).toHaveLength(1);
	const { url, method, headers } = requests[0];
	const { expected, actual } = computeAuthorizationHeaderSignature(
		url,
		method,
		headers,
		secretAccessKey,
	);
	expect(actual).toBe(expected);
	return new URL(url);
}

void describe("signatures match what the server computes", () => {
	void test("presign", () => {
		const { client } = createClient();

		for (const method of ["GET", "PUT"] as const) {
			const url = client.presign(`key/${weird}`, {
				method,
				response: {
					cacheControl: "public, max-age=60",
					contentDisposition: { type: "attachment", filename: weird },
				},
			});

			expect(decodeURIComponent(new URL(url).pathname)).toBe(`/mybucket/key/${weird}`);
			const { expected, actual } = computePresignedUrlSignature(url, method, secretAccessKey);
			expect(actual).toBe(expected);
		}
	});

	void test("object request", async () => {
		const { client, requests } = createClient();

		await client.file(`key/${weird}`).exists();

		const url = expectSingleValidRequest(requests);
		expect(decodeURIComponent(url.pathname)).toBe(`/mybucket/key/${weird}`);
	});

	void test("list", async () => {
		const { client, requests } = createClient(
			"<ListBucketResult><Name>mybucket</Name></ListBucketResult>",
		);

		await client.list({
			prefix: weird,
			startAfter: weird,
			continuationToken: weird,
			delimiter: weird,
		});

		const url = expectSingleValidRequest(requests);
		expect(url.searchParams.get("prefix")).toBe(weird);
		expect(url.searchParams.get("start-after")).toBe(weird);
		expect(url.searchParams.get("continuation-token")).toBe(weird);
		expect(url.searchParams.get("delimiter")).toBe(weird);
	});

	void test("listMultipartUploads", async () => {
		const { client, requests } = createClient(
			"<ListMultipartUploadsResult></ListMultipartUploadsResult>",
		);

		await client.listMultipartUploads({
			prefix: weird,
			keyMarker: weird,
			uploadIdMarker: weird,
			delimiter: weird,
		});

		const url = expectSingleValidRequest(requests);
		expect(url.searchParams.get("prefix")).toBe(weird);
		expect(url.searchParams.get("key-marker")).toBe(weird);
		expect(url.searchParams.get("upload-id-marker")).toBe(weird);
		expect(url.searchParams.get("delimiter")).toBe(weird);
	});

	void test("multipart upload parts", async () => {
		const { client, requests } = createClient("<ListPartsResult></ListPartsResult>");

		await client.multipartUpload(`key/${weird}`, weird).parts({ partNumberMarker: weird });

		const url = expectSingleValidRequest(requests);
		expect(decodeURIComponent(url.pathname)).toBe(`/mybucket/key/${weird}`);
		expect(url.searchParams.get("uploadId")).toBe(weird);
		expect(url.searchParams.get("part-number-marker")).toBe(weird);
	});
});
