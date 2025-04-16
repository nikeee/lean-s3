import * as nodeProcess from "node:process";
import * as mitata from "mitata";

import { S3Client as AWSS3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { S3Client as LeanS3Client } from "../src/index.js";

if (typeof nodeProcess.loadEnvFile === "function") {
	nodeProcess.loadEnvFile()
}

const env = process.env;

const iterations = 20;

let bun;
try {
	bun = await import("bun");
} catch {
	// Not executed in bun
}

mitata.summary(() => {
	//#region aws sdk
	{
		const endpoint = env.S3_ENDPOINT.replaceAll("{bucket}.", "") // client will prepend bucket automagically
			.replaceAll("{region}", env.S3_REGION);

		const awsS3 = new AWSS3Client({
			region: env.S3_REGION,
			endpoint,
			requestChecksumCalculation: "WHEN_REQUIRED",
			credentials: {
				accessKeyId: env.S3_ACCESS_KEY_ID,
				secretAccessKey: env.S3_SECRET_KEY,
			},
		});

		const bucketName = env.S3_BUCKET;
		mitata
			.bench("@aws-sdk/client-s3", async () => {
				for (let i = 0; i < iterations; ++i) {
					await awsS3.send(
						new PutObjectCommand({
							Bucket: bucketName,
							Key: "perf/perf.txt",
							Body: crypto.randomUUID(),
						}),
					);
				}
			})
			.gc("inner");
	}
	//#endregion
	//#region lean-s3
	{
		const leanS3 = new LeanS3Client({
			region: env.S3_REGION,
			endpoint: env.S3_ENDPOINT,
			accessKeyId: env.S3_ACCESS_KEY_ID,
			secretAccessKey: env.S3_SECRET_KEY,
			bucket: env.S3_BUCKET,
		});

		mitata
			.bench("lean-s3", async () => {
				for (let i = 0; i < iterations; ++i) {
					await leanS3.file("perf/perf.txt").write(crypto.randomUUID());
				}
			})
			.gc("inner")
			.baseline(true);
	}
	//#endregion
	//#region bun
	if (bun) {
		const endpoint = env.S3_ENDPOINT.replaceAll("{bucket}.", "") // client will prepend bucket automagically
			.replaceAll("{region}", env.S3_REGION);
		const { S3Client: BunS3 } = bun;
		const buns3 = new BunS3({
			region: env.S3_REGION,
			endpoint,
			accessKeyId: env.S3_ACCESS_KEY_ID,
			secretAccessKey: env.S3_SECRET_KEY,
			bucket: env.S3_BUCKET,
		});

		mitata
			.bench("bun", async () => {
				for (let i = 0; i < iterations; ++i) {
					await buns3.write("perf/perf.txt", crypto.randomUUID());
				}
			})
			.gc("once");
	}
	//#endregion
});

await mitata.run();
