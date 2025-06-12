// @ts-check

import { describe } from "node:test";
import { runTests } from "./test-common.js";

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

		runTests(
			runId,
			endpoint,
			false,
			accessKeyId,
			secretAccessKey,
			region,
			bucket,
		);
	});
}
