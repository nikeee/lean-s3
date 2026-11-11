import { after, before, describe } from "node:test";
import * as tls from "node:tls";
import { expect } from "expect";
import { GenericContainer, Wait } from "testcontainers";

import { runTests } from "./common.ts";
import { S3Client } from "../index.ts";

const PORT = 9297;
const DATA_DIR = `/home/emulator/.aws/emulator/${PORT}`;

void describe("aws-emulator", async () => {
	// AWS does not publish a prebuilt image
	const image = await GenericContainer.fromDockerfile(
		`${import.meta.dirname}/aws-emulator`,
	).build("lean-s3-aws-emulator", { deleteOnExit: false });

	const s3 = await image
		.withExposedPorts(PORT)
		.withCommand(["--telemetry", "off"])
		.withWaitStrategy(
			Wait.forHttp("/__admin/health", PORT).usingTls().allowInsecure().forStatusCode(200),
		)
		.start();

	// The emulator only speaks HTTPS with a self-signed CA and generates new keys on every start
	const readFile = async (name: string) => (await s3.exec(["cat", `${DATA_DIR}/${name}`])).output;
	// node --test runs each file in its own process, so this does not leak into other tests
	tls.setDefaultCACertificates([...tls.getCACertificates("default"), await readFile("ca.pem")]);

	const credentials = await readFile("emulator_credentials");
	const accessKeyId = credentials.match(/aws_access_key_id\s*=\s*(\S+)/)?.[1];
	const secretAccessKey = credentials.match(/aws_secret_access_key\s*=\s*(\S+)/)?.[1];
	if (!accessKeyId || !secretAccessKey) {
		throw new Error("Could not read aws-emulator credentials");
	}

	// The emulator's certificate is only valid for localhost and 127.0.0.1
	const endpoint = `https://127.0.0.1:${s3.getMappedPort(PORT)}`;
	const region = "us-east-1";
	const bucket = "test-bucket-aws-emulator";

	const runId = Date.now();
	{
		const client = new S3Client({
			endpoint,
			accessKeyId,
			secretAccessKey,
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
	runTests(runId, endpoint, accessKeyId, secretAccessKey, region, bucket, "aws-emulator");
});
