import { after, before, describe } from "node:test";
import { expect } from "expect";

import { runTests } from "./common.ts";
import { S3Client } from "../index.ts";
import { CephContainer } from "./CephContainer.ts";

describe("ceph", async () => {
	const s3 = await new CephContainer().start();
	const region = "default";
	const bucket = "test-bucket-ceph";

	const runId = Date.now();
	{
		const client = new S3Client({
			endpoint: s3.getRGWUri(),
			accessKeyId: s3.getRGWAccessKey(),
			secretAccessKey: s3.getRGWSecretKey(),
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
		s3.getRGWUri(),
		s3.getRGWAccessKey(),
		s3.getRGWSecretKey(),
		region,
		bucket,
	);
});
