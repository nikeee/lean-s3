import { after, before, describe } from "node:test";
import { expect } from "expect";

import { runTests } from "./common.ts";
import { S3Client } from "../index.ts";
import { RustFsContainer } from "./RustFsContainer.ts";

describe(
	"rustfs",
	{
		// blocked by release of latest fixes in rustfs
		skip: true,
	},
	async () => {
		const s3 = await new RustFsContainer("rustfs/rustfs:latest").start();
		const region = "auto";
		const bucketName = "test-bucket-rustfs";

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
				const res = await client.createBucket(bucketName);
				expect(res).toBeUndefined();
			});
			after(async () => {
				// you can use this to debug leftover files:
				// for await (const f of client.listIterating({
				// 	prefix: runId.toString(),
				// 	bucket: bucketName,
				// })) {
				// 	console.log(`Leftover: ${f.key}`);
				// }

				expect(await client.bucketExists(bucketName)).toBe(true);
				await client.deleteBucket(bucketName);
				expect(await client.bucketExists(bucketName)).toBe(false);
				await s3.stop();
			});
		}

		runTests(
			runId,
			s3.getConnectionUrl(),
			s3.getAccessKeyId(),
			s3.getSecretAccessKey(),
			region,
			bucketName,
		);
	},
);
