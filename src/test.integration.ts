// @ts-check

import { describe, before, after } from "node:test";

import { expect } from "expect";

import { runTests } from "./test-common.ts";
import { S3Client } from "./index.ts";

const env = process.env;

const runId = Date.now();

for (const provider of ["hetzner", "aws", "cloudflare"]) {
	describe(`integration with ${provider}@runId:${runId}`, () => {
		const p = provider.toUpperCase();

		const endpoint = env[`${p}_S3_ENDPOINT`];
		const region = env[`${p}_S3_REGION`];
		const bucket = env[`${p}_S3_BUCKET`];
		const accessKeyId = env[`${p}_S3_ACCESS_KEY_ID`];
		const secretAccessKey = env[`${p}_S3_SECRET_KEY`];

		if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
			throw new Error("Invalid config");
		}

		{
			const client = new S3Client({
				endpoint,
				accessKeyId,
				secretAccessKey,
				region,
				bucket,
			});

			before(async () => {
				expect(await client.bucketExists(bucket)).toBe(true);
				const objects = (await client.list({ prefix: `${runId}/` })).contents;
				expect(objects.length).toBe(0);
			});
			after(async () => {
				expect(await client.bucketExists(bucket)).toBe(true);

				const objects = (
					await client.list({ prefix: `${runId}/`, maxKeys: 1000 })
				).contents;

				// clean up after all tests, but we want to fail because there are still objects
				if (objects.length > 0) {
					await client.deleteObjects(objects);
				}
				expect(objects.length).toBe(0);
			});
		}

		runTests(runId, endpoint, accessKeyId, secretAccessKey, region, bucket);
	});
}
