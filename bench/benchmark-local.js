// @ts-check
import { LocalstackContainer } from "@testcontainers/localstack";

import {
	S3Client as AWSS3Client,
	PutObjectCommand,
	CreateBucketCommand,
} from "@aws-sdk/client-s3";
import {Client as MinioClient} from "minio";
import { S3Client as LeanS3Client } from "../src/index.js";

async function createContainer() {
	const container = new LocalstackContainer("localstack/localstack:4");
	const s3 = await container.start();
	process.once("beforeExit", () => void s3.stop());

	const aws = new AWSS3Client({
		endpoint: s3.getConnectionUri(),
		forcePathStyle: true,
		credentials: {
			accessKeyId,
			secretAccessKey,
		},
		region: "us-east-1",
	});

	await aws.send(
		new CreateBucketCommand({
			Bucket: "test-bucket",
		}),
	);

	return s3;
}

const region = "us-east-1";
const accessKeyId = "test";
const secretAccessKey = "test";
const bucket = "test-bucket";

const iterations = 7000;

let bun;
try {
	bun = await import("bun");
} catch {
	// Not executed in bun
}

const results = {};

//#region aws sdk
{
	const s3 = await createContainer();
	try {
		const awsS3 = new AWSS3Client({
			region,
			endpoint: s3.getConnectionUri(),
			forcePathStyle: true,
			requestChecksumCalculation: "WHEN_REQUIRED",
			credentials: {
				accessKeyId,
				secretAccessKey,
			},
		});
		const start = performance.now();
		for (let i = 0; i < iterations; ++i) {
			await awsS3.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: "perf/perf.txt",
					Body: crypto.randomUUID(),
				}),
			);
		}
		const end = performance.now();

		results["@aws-sdk/client-s3"] = {
			iterations,
			duration: end - start,
			average: (end - start) / iterations,
		};
	} finally {
		await s3.stop();
	}
}
//#endregion
//#region lean-s3
{
	const s3 = await createContainer();
	try {
		const leanS3 = new LeanS3Client({
			region,
			endpoint: s3.getConnectionUri(),
			accessKeyId,
			secretAccessKey,
			bucket,
		});
		const start = performance.now();
		for (let i = 0; i < iterations; ++i) {
			await leanS3.file("perf/perf.txt").write(crypto.randomUUID());
		}
		const end = performance.now();
		results["lean-s3"] = {
			iterations,
			duration: end - start,
			average: (end - start) / iterations,
		};
	} finally {
		await s3.stop();
	}
}
//#endregion
//#region minio
{
	const s3 = await createContainer();
	try {
		const u = new URL(s3.getConnectionUri());
		const minio = new MinioClient({
			region,
			endPoint: u.hostname,
			port: Number(u.port),
			useSSL: u.protocol === "https:",
			accessKey: accessKeyId,
			secretKey: secretAccessKey,
		});
		const start = performance.now();
		for (let i = 0; i < iterations; ++i) {
			await minio.putObject(bucket, "perf/perf.txt", crypto.randomUUID());
		}
		const end = performance.now();
		results["minio-client"] = {
			iterations,
			duration: end - start,
			average: (end - start) / iterations,
		};
	} finally {
		await s3.stop();
	}
}
//#endregion
//#region bun
if (bun) {
	const s3 = await createContainer();
	try {
		const { S3Client: BunS3 } = bun;
		const buns3 = new BunS3({
			region: region,
			endpoint: s3.getConnectionUri(),
			accessKeyId: accessKeyId,
			secretAccessKey,
			bucket: bucket,
		});
		const start = performance.now();
		for (let i = 0; i < iterations; ++i) {
			await buns3.write("perf/perf.txt", crypto.randomUUID());
		}
		const end = performance.now();
		results.bun = {
			iterations,
			duration: end - start,
			average: (end - start) / iterations,
		};
	} finally {
		await s3.stop();
	}
}
//#endregion

console.table(results);
