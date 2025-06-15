// @ts-check
import { randomBytes } from "node:crypto";
import { MinioContainer } from "@testcontainers/minio";
import * as mitata from "mitata";

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

const s3 = await createContainer([
	"test-aws",
	"test-lean-s3",
	"test-minio",
	"test-s3mini",
	"test-bun",
]);

let buns3 = undefined;
try {
	buns3 = new (await import("bun")).S3Client({
		region: region,
		endpoint: s3.getConnectionUrl(),
		accessKeyId: accessKeyId,
		secretAccessKey,
		bucket: "test-bun",
	});
} catch {
	// Not executed in bun
}

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

const clients = [
	{
		baseline: false,
		name: "@aws-sdk/client-s3",
		bucket: "test-aws",
		put: async (bucket, key, value) => {
			await awsS3.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: key,
					Body: value,
				}),
			);
		},
		getBuffer: async (bucket, key) => {
			const res = await awsS3.send(
				new GetObjectCommand({
					Bucket: bucket,
					Key: key,
				}),
			);
			await res.Body?.transformToByteArray();
		},
		list: bucket => {
			/* TODO */
		},
		delete: (bucket, key) => {
			/* TODO */
		},
	},
	{
		baseline: false,
		name: "minio",
		bucket: "test-minio",
		put: async (bucket, key, value) => {
			await minio.putObject(bucket, key, value);
		},
		getBuffer: async (bucket, key) => {
			const stream = await minio.getObject(bucket, key);
			await streamToBuffer(stream);
		},
		list: bucket => {
			/* TODO */
		},
		delete: (bucket, key) => {
			/* TODO */
		},
	},
	{
		baseline: true,
		name: "lean-s3",
		bucket: "test-lean-s3",
		put: async (_bucket, key, value) => {
			await leanS3.file(key).write(value);
		},
		getBuffer: (_bucket, key) => leanS3.file(key).arrayBuffer(),
		list: bucket => {
			/* TODO */
		},
		delete: (bucket, key) => leanS3.file(key).delete(),
	},
	{
		baseline: false,
		name: "s3mini",
		bucket: "test-s3mini",
		put: async (_bucket, key, value) => {
			await s3mini.putObject(key, value);
		},
		getBuffer: (_bucket, key) => s3mini.getObjectArrayBuffer(key),
		list: bucket => {
			/* TODO */
		},
		delete: (bucket, key) => {
			/* TODO */
		},
	},
];

if (buns3) {
	clients.push({
		baseline: false,
		name: "bun",
		bucket: "test-bun",
		put: async (_bucket, key, value) => {
			await buns3.file(key).write(value);
		},
		getBuffer: async (_bucket, key) => buns3.file(key).arrayBuffer(),
		list: bucket => {
			/* TODO */
		},
		delete: (bucket, key) => buns3.file("perf/perf.txt").delete(),
	});
}

const prefix = `${Date.now()}/`;
const KiB = 1024;
const MiB = 1024 * KiB;

mitata.summary(() => {
	{
		const payload = randomBytes(20);
		mitata.group("PutObject + GetObject (20 bytes)", () => {
			for (const c of clients) {
				mitata
					.bench(c.name, async () => {
						const key = prefix + crypto.randomUUID();
						await c.put(c.bucket, key, payload);
						await c.getBuffer(c.bucket, key);
					})
					.baseline(c.baseline)
					.gc("inner");
			}
		});
	}
	{
		const payload = randomBytes(20 * KiB);
		mitata.group("PutObject + GetObject (20 KiB)", () => {
			for (const c of clients) {
				mitata
					.bench(c.name, async () => {
						const key = prefix + crypto.randomUUID();
						await c.put(c.bucket, key, payload);
						await c.getBuffer(c.bucket, key);
					})
					.baseline(c.baseline)
					.gc("inner");
			}
		});
	}
	{
		const payload = randomBytes(1 * MiB);
		mitata.group("PutObject + GetObject (1 MiB)", () => {
			for (const c of clients) {
				mitata
					.bench(c.name, async () => {
						const key = prefix + crypto.randomUUID();
						await c.put(c.bucket, key, payload);
						await c.getBuffer(c.bucket, key);
					})
					.baseline(c.baseline)
					.gc("inner");
			}
		});
	}
	{
		const payload = randomBytes(20 * MiB);
		mitata.group("PutObject + GetObject (20 MiB)", () => {
			for (const c of clients) {
				mitata
					.bench(c.name, async () => {
						const key = prefix + crypto.randomUUID();
						await c.put(c.bucket, key, payload);
						await c.getBuffer(c.bucket, key);
					})
					.baseline(c.baseline)
					.gc("inner");
			}
		});
	}
	{
		const payload = randomBytes(100 * MiB);
		mitata.group("PutObject + GetObject (100 MiB)", () => {
			for (const c of clients) {
				mitata
					.bench(c.name, async () => {
						const key = prefix + crypto.randomUUID();
						await c.put(c.bucket, key, payload);
						await c.getBuffer(c.bucket, key);
					})
					.baseline(c.baseline)
					.gc("inner");
			}
		});
	}
});

await mitata.run();

/** needed for minio */
function streamToBuffer(stream) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		stream.on("data", chunk => chunks.push(chunk));
		stream.on("end", () => resolve(Buffer.concat(chunks)));
		stream.on("error", reject);
	});
}
