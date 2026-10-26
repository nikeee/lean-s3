import assert from "node:assert/strict";
import { test } from "node:test";
import { Agent } from "undici";

import { S3Client } from "./index.ts";

void test("closing a client does not close a caller-provided dispatcher", async () => {
	const dispatcher = new Agent();
	const client = new S3Client({
		endpoint: "https://s3.example.com",
		accessKeyId: "test",
		secretAccessKey: "test-secret",
		region: "us-east-1",
		bucket: "test-bucket",
		dispatcher,
	});

	try {
		await client.close();

		assert.equal(dispatcher.closed, false);
		await assert.rejects(client.bucketExists("test-bucket"), /S3Client is closed\./);
	} finally {
		await dispatcher.close();
	}
});
