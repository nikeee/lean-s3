import { after, before, describe } from "node:test";
import { expect } from "expect";

import { runTests } from "./common.ts";
import { S3Client } from "../index.ts";
import { GarageContainer } from "./GarageContainer.ts";

void describe("garage", async () => {
	const s3 = await new GarageContainer().start();
	const region = "garage";
	const bucket = "test-bucket-garage";

	const runId = Date.now();
	{
		const client = new S3Client({
			endpoint: s3.getConnectionUrl(),
			accessKeyId: s3.getAccessKeyId(),
			secretAccessKey: s3.getSecretAccessKey(),
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
	runTests(
		runId,
		s3.getConnectionUrl(),
		s3.getAccessKeyId(),
		s3.getSecretAccessKey(),
		region,
		bucket,
		"garage",
	);
});
