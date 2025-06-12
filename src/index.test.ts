import { after, before, describe } from "node:test";
import { MinioContainer } from "@testcontainers/minio";
import { LocalstackContainer } from "@testcontainers/localstack";
import { expect } from "expect";

import { runTests } from "./test-common.ts";
import { S3Client } from "./index.ts";

describe("minio", async () => {
	const s3 = await new MinioContainer(
		"minio/minio:RELEASE.2025-04-08T15-41-24Z-cpuv1",
	).start();
	const runId = Date.now();
	{
		const client = new S3Client({
			endpoint: s3.getConnectionUrl(),
			accessKeyId: "minioadmin",
			secretAccessKey: "minioadmin",
			region: "us-east-1",
			bucket: "none", // intentionally set to a non-existent one, so we catch cases where the bucket is not passed correctly
		});
		after(async () => {
			// you can use this to debug leftover files:
			// for await (const f of client.listIterating({
			// 	prefix: runId.toString(),
			// 	bucket: "test-bucket",
			// })) {
			// 	console.log(`Leftover: ${f.key}`);
			// }

			expect(await client.bucketExists("test-bucket")).toBe(true);
			await client.deleteBucket("test-bucket");
			expect(await client.bucketExists("test-bucket")).toBe(false);
			await s3.stop();
		});
		before(async () => {
			const res = await client.createBucket("test-bucket");
			expect(res).toBeUndefined();
		});
	}

	runTests(
		runId,
		s3.getConnectionUrl(),
		true,
		"minioadmin",
		"minioadmin",
		"us-east-1",
		"test-bucket",
	);
});

describe("localstack", async () => {
	const s3 = await new LocalstackContainer("localstack/localstack:4").start();
	const runId = Date.now();
	{
		const client = new S3Client({
			endpoint: s3.getConnectionUri(),
			accessKeyId: "test",
			secretAccessKey: "test",
			region: "us-east-1",
			bucket: "none", // intentionally set to a non-existent one, so we catch cases where the bucket is not passed correctly
		});

		after(async () => {
			expect(await client.bucketExists("test-bucket")).toBe(true);
			await client.deleteBucket("test-bucket");
			expect(await client.bucketExists("test-bucket")).toBe(false);
			await s3.stop();
		});
		before(async () => {
			const res = await client.createBucket("test-bucket");
			expect(res).toBeUndefined();
		});
	}

	runTests(
		runId,
		s3.getConnectionUri(),
		true,
		"test",
		"test",
		"us-east-1",
		"test-bucket",
	);
});
