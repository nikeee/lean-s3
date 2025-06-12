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
	{
		const client = new S3Client({
			endpoint: s3.getConnectionUrl(),
			accessKeyId: "minioadmin",
			secretAccessKey: "minioadmin",
			region: "us-east-1",
			bucket: "none",
		});
		after(async () => {
			client.deleteBucket("test-bucket");
			await s3.stop();
		});
		before(async () => {
			const res = await client.createBucket("test-bucket");
			expect(res).toBeUndefined();
		});
	}

	runTests(
		Date.now(),
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
	{
		const client = new S3Client({
			endpoint: s3.getConnectionUri(),
			accessKeyId: "test",
			secretAccessKey: "test",
			region: "us-east-1",
			bucket: "none",
		});

		after(async () => {
			await client.deleteBucket("test-bucket");
			await s3.stop();
		});
		before(async () => {
			const res = await client.createBucket("test-bucket");
			expect(res).toBeUndefined();
		});
	}

	runTests(
		Date.now(),
		s3.getConnectionUri(),
		true,
		"test",
		"test",
		"us-east-1",
		"test-bucket",
	);
});
