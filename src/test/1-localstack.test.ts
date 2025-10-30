import { after, before, describe } from "node:test";
import { LocalstackContainer } from "@testcontainers/localstack";
import { expect } from "expect";

import { runTests } from "./common.ts";
import { S3Client } from "../index.ts";

describe("localstack", async () => {
	const s3 = await new LocalstackContainer("localstack/localstack:4").start();
	const region = "us-east-1";
	const bucket = "test-bucket-localstack";

	const runId = Date.now();
	{
		const client = new S3Client({
			endpoint: s3.getConnectionUri(),
			accessKeyId: "test",
			secretAccessKey: "test",
			region,
			bucket: "none", // intentionally set to a non-existent one, so we catch cases where the bucket is not passed correctly
		});

		before(async () => {
			const res = await client.createBucket(bucket);
			expect(res).toBeUndefined();
		});
		after(async () => {
			expect(await client.bucketExists(bucket)).toBe(true);
			await client.deleteBucket(bucket);
			expect(await client.bucketExists(bucket)).toBe(false);
			await s3.stop();
		});
	}

	runTests(runId, s3.getConnectionUri(), "test", "test", region, bucket);
});
