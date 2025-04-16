//@ts-check
import * as mitata from "mitata";

import { S3Client as AWSS3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AwsClient as AWSs4FetchClient } from "aws4fetch";
import { Client as MinioClient } from "minio";

import { S3Client as LeanS3Client } from "../src/index.js";

let bun;
try {
	bun = await import("bun");
} catch {
	// Not executed in bun
}

mitata.summary(() => {
	//#region aws sdk
	{
		const awsS3 = new AWSS3Client({
			region: "auto",
			endpoint: "https://localhost:9000",
			requestChecksumCalculation: "WHEN_REQUIRED",
			credentials: {
				accessKeyId: "sample-key-id",
				secretAccessKey: "sample-secret-key",
			},
		});
		async function generatePresignedUrl(bucketName, key, expiresIn) {
			return await getSignedUrl(
				awsS3,
				new PutObjectCommand({
					Bucket: bucketName,
					Key: key,
					ContentType: "image/jpeg",
				}),
				{ expiresIn },
			);
		}

		mitata
			.bench("@aws-sdk/s3-request-presigner", async () => {
				await generatePresignedUrl("test-bucket", "path.json", 3600);
			})
			.gc("once");
	}
	//#endregion
	//#region lean-s3
	{
		const leanS3 = new LeanS3Client({
			region: "auto",
			endpoint: "https://localhost:9000",
			accessKeyId: "sample-key-id",
			secretAccessKey: "sample-secret-key",
			bucket: "test-bucket",
		});

		const options = {
			expiresIn: 3600,
		};

		mitata
			.bench("lean-s3", () => {
				leanS3.presign("path.json", options);
			})
			.gc("once")
			.baseline(true);
	}
	//#endregion
	//#region aws4fetch
	{
		const aws4FetchClient = new AWSs4FetchClient({
			region: "auto",
			accessKeyId: "sample-key-id",
			secretAccessKey: "sample-secret-key",
		});

		const toSign = new Request(
			new URL("https://localhost:9000/test-bucket/path.json"),
		);
		const options = { method: "GET" };

		mitata
			.bench("aws4fetch", async () => {
				await aws4FetchClient.sign(toSign, options);
			})
			.gc("once");
	}
	//#endregion
	//#region minio
	{
		const client = new MinioClient({
			region: "auto",
			port: 9000,
			endPoint: "localhost",
			accessKey: "sample-key-id",
			secretKey: "sample-secret-key",
		});
		mitata
			.bench("minio client", async () => {
				await client.presignedGetObject("test-bucket", "path.json");
			})
			.gc("once");
	}
	//#endregion
	//#region bun
	if (bun) {
		const { S3Client: BunS3 } = bun;
		const buns3 = new BunS3({
			region: "auto",
			endpoint: "https://localhost:9000",
			accessKeyId: "sample-key-id",
			secretAccessKey: "sample-secret-key",
			bucket: "test-bucket",
		});

		mitata
			.bench("bun", () => {
				buns3.presign("path.json");
			})
			.gc("once");
	}
	//#endregion
});

await mitata.run();
