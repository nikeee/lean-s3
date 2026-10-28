import { describe, test } from "node:test";

import { expect } from "expect";
import { MockAgent } from "undici";

import { S3Client } from "./index.ts";
import { computeAuthorizationHeaderSignature } from "./test/sigv4.ts";

const origin = "https://s3.example.com";

type CapturedRequest = { url: string; method: string; headers: Record<string, string> };

/**
 * Creates a client whose requests are answered by a mock server, which records them.
 */
function createClient(responseBody: string, statusCode = 200) {
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
			return { statusCode, data: responseBody };
		})
		.persist();

	const client = new S3Client({
		endpoint: origin,
		accessKeyId: "sample-key-id",
		secretAccessKey: "sample-secret-key",
		region: "auto",
		bucket: "mybucket",
		dispatcher,
	});
	return { client, requests };
}

function expectValidSignature(request: CapturedRequest | undefined) {
	expect(request).toBeDefined();
	const { url, method, headers } = request as CapturedRequest;
	const { expected, actual } = computeAuthorizationHeaderSignature(
		url,
		method,
		headers,
		"sample-secret-key",
	);
	expect(actual).toBe(expected);
}

// Characters that `encodeURIComponent` leaves raw, but SigV4 requires to be percent-encoded, plus some others
const weird = "a!b'c(d)e*f [g]$h&i=j;k@l|m%n+o,p:q/Ð😀";

void describe("signed requests encode query values as required by SigV4", () => {
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

		expect(requests).toHaveLength(1);
		const url = new URL(requests[0].url);
		expect(url.searchParams.get("prefix")).toBe(weird);
		expect(url.searchParams.get("start-after")).toBe(weird);
		expect(url.searchParams.get("continuation-token")).toBe(weird);
		expect(url.searchParams.get("delimiter")).toBe(weird);
		expectValidSignature(requests[0]);
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

		expect(requests).toHaveLength(1);
		const url = new URL(requests[0].url);
		expect(url.searchParams.get("prefix")).toBe(weird);
		expect(url.searchParams.get("key-marker")).toBe(weird);
		expect(url.searchParams.get("upload-id-marker")).toBe(weird);
		expect(url.searchParams.get("delimiter")).toBe(weird);
		expectValidSignature(requests[0]);
	});

	void test("multipart upload with an upload id that needs encoding", async () => {
		const { client, requests } = createClient("<ListPartsResult></ListPartsResult>");

		const upload = client.multipartUpload(`key/${weird}`, weird);
		await upload.parts({ partNumberMarker: weird });

		expect(requests).toHaveLength(1);
		const url = new URL(requests[0].url);
		expect(decodeURIComponent(url.pathname)).toBe(`/mybucket/key/${weird}`);
		expect(url.searchParams.get("uploadId")).toBe(weird);
		expect(url.searchParams.get("part-number-marker")).toBe(weird);
		expectValidSignature(requests[0]);
	});

	void test("object requests with keys that need encoding", async () => {
		const { client, requests } = createClient("");

		await client.file(`key/${weird}`).exists();

		expect(requests).toHaveLength(1);
		expect(decodeURIComponent(new URL(requests[0].url).pathname)).toBe(
			`/mybucket/key/${weird}`,
		);
		expectValidSignature(requests[0]);
	});
});
