import { describe, test } from "node:test";

import { expect } from "expect";

import { S3Client } from "./index.ts";
import { computePresignedUrlSignature } from "./test/sigv4.ts";

void describe("presign", () => {
	const client = new S3Client({
		endpoint: "https://s3.example.com",
		accessKeyId: "sample-key-id",
		secretAccessKey: "sample-secret-key",
		region: "auto",
		bucket: "mybucket",
	});

	const keys = [
		"docs/invoice[2].pdf",
		"docs/receipt-3$.pdf",
		"docs/report_2025[01].PDF",
		"special/!&;=@|%:+(),'*~ .txt",
		"rewritten/a\\b\tc\nd\re.txt",
		"unicode/Ðøá 😀.txt",
		"folder/",
	];

	for (const key of keys) {
		void test(`signature matches the server-side canonical request for ${JSON.stringify(key)}`, () => {
			for (const method of ["GET", "PUT"] as const) {
				const url = client.presign(key, { method });

				// the server addresses the decoded key
				expect(decodeURIComponent(new URL(url).pathname)).toBe(`/mybucket/${key}`);
				expect(computePresignedUrlSignature(url, method, "sample-secret-key")).toBe(
					new URL(url).searchParams.get("X-Amz-Signature"),
				);
			}
		});
	}

	void test("signature matches the server-side canonical request with response overrides", () => {
		const url = client.presign("file.pdf", {
			response: {
				cacheControl: "public, max-age=60",
				contentDisposition: { type: "attachment", filename: "a!b (1)*'.pdf" },
			},
		});

		expect(computePresignedUrlSignature(url, "GET", "sample-secret-key")).toBe(
			new URL(url).searchParams.get("X-Amz-Signature"),
		);
	});
});
