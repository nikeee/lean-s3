import { after, before, describe } from "node:test";
import {
	S3Client as AwsS3Client,
	CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { MinioContainer } from "@testcontainers/minio";
import { LocalstackContainer } from "@testcontainers/localstack";
import { expect } from "expect";

import { runTests } from "./test-common.ts";

describe("minio", async () => {
	const container = new MinioContainer(
		"minio/minio:RELEASE.2025-04-08T15-41-24Z-cpuv1",
	);
	const s3 = await container.start();
	after(async () => await s3.stop());
	before(async () => {
		// TODO: replace this with lean-s3
		const aws = new AwsS3Client({
			endpoint: s3.getConnectionUrl(),
			forcePathStyle: true,
			credentials: {
				accessKeyId: "minioadmin",
				secretAccessKey: "minioadmin",
			},
			region: "us-east-1",
		});

		const res = await aws.send(
			new CreateBucketCommand({
				Bucket: "test-bucket",
			}),
		);
		expect(res.$metadata.httpStatusCode).toEqual(200);
	});

	runTests(
		Date.now(),
		s3.getConnectionUrl(),
		true,
		"minioadmin",
		"minioadmin",
		"us-east-1",
		"test-bucket",
	);
});

describe("localstack", async () => {
	const container = new LocalstackContainer("localstack/localstack:4");
	const s3 = await container.start();
	after(async () => await s3.stop());
	before(async () => {
		// TODO: replace this with lean-s3
		const aws = new AwsS3Client({
			endpoint: s3.getConnectionUri(),
			forcePathStyle: true,
			credentials: {
				accessKeyId: "test",
				secretAccessKey: "test",
			},
			region: "us-east-1",
		});

		const res = await aws.send(
			new CreateBucketCommand({
				Bucket: "test-bucket",
			}),
		);
		expect(res.$metadata.httpStatusCode).toEqual(200);
	});

	runTests(
		Date.now(),
		s3.getConnectionUri(),
		true,
		"test",
		"test",
		"us-east-1",
		"test-bucket",
	);
});
