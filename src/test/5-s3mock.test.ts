import { after, before, describe } from "node:test";
import { expect } from "expect";

import { runTests } from "./common.ts";
import { S3Client } from "../index.ts";
import { S3MockContainer } from "./S3MockContainer.ts";

describe(
	"s3mock",
	{
		// blocked by https://github.com/adobe/S3Mock/pull/2731
		skip: true,
	},
	async () => {
		const s3 = await new S3MockContainer("adobe/s3mock:latest").start();
		const region = "auto";
		const bucket = "test-bucket-s3mock";

		const runId = Date.now();
		{
			const client = new S3Client({
				endpoint: s3.getHttpConnectionUrl(),
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
			s3.getHttpConnectionUrl(),
			s3.getAccessKeyId(),
			s3.getSecretAccessKey(),
			region,
			bucket,
			"s3mock",
		);
	},
);
