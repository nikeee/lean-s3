import { after, before, describe } from "node:test";
import { MinioContainer } from "@testcontainers/minio";
import { expect } from "expect";

import { runTests } from "./common.ts";
import { S3Client } from "../index.ts";

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
		before(async () => {
			const res = await client.createBucket("test-bucket-minio");
			expect(res).toBeUndefined();
		});
		after(async () => {
			// you can use this to debug leftover files:
			// for await (const f of client.listIterating({
			// 	prefix: runId.toString(),
			// 	bucket: "test-bucket",
			// })) {
			// 	console.log(`Leftover: ${f.key}`);
			// }

			expect(await client.bucketExists("test-bucket-minio")).toBe(true);
			await client.deleteBucket("test-bucket-minio");
			expect(await client.bucketExists("test-bucket-minio")).toBe(false);
			await s3.stop();
		});
	}

	runTests(
		runId,
		s3.getConnectionUrl(),
		"minioadmin",
		"minioadmin",
		"us-east-1",
		"test-bucket-minio",
	);
});
