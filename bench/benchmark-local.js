// @ts-check
import { MinioContainer } from "@testcontainers/minio";
import { Bench } from "tinybench";
import { tinybenchPrinter } from "@monstermann/tinybench-pretty-printer";

import {
	S3Client as AWSS3Client,
	PutObjectCommand,
	CreateBucketCommand,
	GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Client as MinioClient } from "minio";
import { s3mini as s3miniClient } from "s3mini";
import { S3Client as LeanS3Client } from "../dist/index.js";

async function createContainer(buckets) {
	const s3 = await new MinioContainer(
		"minio/minio:RELEASE.2025-04-08T15-41-24Z-cpuv1",
	).start();
	process.once("beforeExit", () => void s3.stop());

	const aws = new AWSS3Client({
		endpoint: s3.getConnectionUrl(),
		forcePathStyle: true,
		credentials: {
			accessKeyId,
			secretAccessKey,
		},
		region: "us-east-1",
	});

	for (const bucket of buckets) {
		await aws.send(
			new CreateBucketCommand({
				Bucket: bucket,
			}),
		);

		await aws.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: "perf/perf.txt",
				Body: crypto.randomUUID(),
			}),
		);
	}
	return s3;
}

const region = "us-east-1";
const accessKeyId = "minioadmin";
const secretAccessKey = "minioadmin";

let bun;
try {
	bun = await import("bun");
} catch {
	// Not executed in bun
}

const s3 = await createContainer([
	"test-aws",
	"test-lean-s3",
	"test-minio",
	"test-s3mini",
	"test-bun",
]);

const awsS3 = new AWSS3Client({
	region,
	endpoint: s3.getConnectionUrl(),
	forcePathStyle: true,
	requestChecksumCalculation: "WHEN_REQUIRED",
	credentials: {
		accessKeyId,
		secretAccessKey,
	},
});
const leanS3 = new LeanS3Client({
	region,
	endpoint: s3.getConnectionUrl(),
	accessKeyId,
	secretAccessKey,
	bucket: "test-lean-s3",
});

const s3mini = new s3miniClient({
	region,
	endpoint: `${s3.getConnectionUrl()}/test-s3mini`,
	accessKeyId,
	secretAccessKey,
});

const minio = new MinioClient({
	region,
	endPoint: new URL(s3.getConnectionUrl()).hostname,
	port: Number(new URL(s3.getConnectionUrl()).port),
	useSSL: new URL(s3.getConnectionUrl()).protocol === "https:",
	accessKey: accessKeyId,
	secretKey: secretAccessKey,
});

const putBench = new Bench({ name: "PutObject", time: 10_000 });
putBench
	.add("@aws-sdk/client-s3 - PutObject", async () => {
		await awsS3.send(
			new PutObjectCommand({
				Bucket: "test-aws",
				Key: "perf/perf.txt",
				Body: crypto.randomUUID(),
			}),
		);
	})
	.add("minio - PutObject", async () => {
		await minio.putObject("test-minio", "perf/perf.txt", crypto.randomUUID());
	})
	.add("lean-s3 - PutObject", async () => {
		await leanS3.file("perf/perf.txt").write(crypto.randomUUID());
	})
	.add("s3mini - PutObject", async () => {
		await s3mini.putObject("perf/perf.txt", crypto.randomUUID());
	});

const getBench = new Bench({ name: "GetObject", time: 3_000 });
getBench
	.add("@aws-sdk/client-s3 - GetObject", async () => {
		const res = await awsS3.send(
			new GetObjectCommand({
				Bucket: "test-aws",
				Key: "perf/perf.txt",
			}),
		);
		await res.Body?.transformToByteArray();
	})
	.add("minio - GetObject", async () => {
		const stream = await minio.getObject("test-minio", "perf/perf.txt");
		await streamToBuffer(stream);
	})
	.add("lean-s3 - GetObject", async () => {
		const stream = await leanS3.file("perf/perf.txt").arrayBuffer();
	})
	.add("s3mini - GetObject", async () => {
		const stream = await s3mini.getObject("perf/perf.txt");
		await streamToBuffer(stream);
	});

if (bun) {
	const buns3 = new bun.S3Client({
		region: region,
		endpoint: s3.getConnectionUrl(),
		accessKeyId: accessKeyId,
		secretAccessKey,
		bucket: "test-bun",
	});
	getBench.add("bun - PutObject", async () => {
		await buns3.file("perf/perf.txt").write(crypto.randomUUID());
	});
	putBench.add("bun - GetObject", async () => {
		await buns3.file("perf/perf.txt").bytes();
	});
}

await putBench.run();
await getBench.run();

console.log("PutObject Benchmark Results:");
console.log(tinybenchPrinter.toCli(putBench));
console.log();
console.log("GetObject Benchmark Results:");
console.log(tinybenchPrinter.toCli(getBench));

/** needed for minio */
function streamToBuffer(stream) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		stream.on("data", chunk => chunks.push(chunk));
		stream.on("end", () => resolve(Buffer.concat(chunks)));
		stream.on("error", reject);
	});
}
