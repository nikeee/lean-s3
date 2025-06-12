/**
 * @module Used by integration tests and unit tests.
 */

import { test } from "node:test";
import { expect } from "expect";

import { S3Client } from "./index.ts";

export function runTests(
	runId: number,
	endpoint: string,
	forcePathStyle: boolean,
	accessKeyId: string,
	secretAccessKey: string,
	region: string,
	bucket: string,
) {
	const client = new S3Client({
		endpoint,
		accessKeyId,
		secretAccessKey,
		region,
		bucket,
	});

	test("presign-put", async () => {
		const testId = crypto.randomUUID();
		const expected = {
			hello: testId,
		};

		const url = client.presign(`${runId}/presign-test.json`, { method: "PUT" });
		const res = await fetch(url, {
			method: "PUT",
			body: JSON.stringify(expected),
			headers: {
				accept: "application/json",
			},
		});
		expect(res.ok).toBe(true);

		const f = client.file(`${runId}/presign-test.json`);
		try {
			const actual = await f.json();
			expect(actual).toStrictEqual(expected);
		} finally {
			await f.delete();
		}
	});

	test("roundtrip", async () => {
		const testId = crypto.randomUUID();
		const f = client.file(`${runId}/roundtrip.txt`);
		await f.write(testId);
		try {
			const stat = await f.stat();
			expect(stat).toEqual(
				expect.objectContaining({
					size: testId.length,
					type: "application/octet-stream",
				}),
			);

			const actual = await f.text();
			expect(actual).toStrictEqual(testId);
		} finally {
			await f.delete();
		}
	});

	test("slicing", async () => {
		const testId = crypto.randomUUID();
		const f = client.file(`${runId}/slicing.txt`);
		await f.write(testId);
		try {
			const slicedFile = f.slice(10, 20);
			const s = await slicedFile.text();
			expect(s).toEqual(testId.substring(10, 20));
		} finally {
			await f.delete();
		}
	});

	test("listIterating", async () => {
		const testId = crypto.randomUUID();
		await client
			.file(`${runId}/${testId}/test-a-0.txt`)
			.write(crypto.randomUUID());
		await client
			.file(`${runId}/${testId}/test-a-1.txt`)
			.write(crypto.randomUUID());
		await client
			.file(`${runId}/${testId}/test-b-2.txt`)
			.write(crypto.randomUUID());
		await client
			.file(`${runId}/${testId}/test-b-3.txt`)
			.write(crypto.randomUUID());

		const entries = [];
		for await (const e of client.listIterating({
			prefix: `${runId}/${testId}`,
			internalPageSize: 1,
		})) {
			entries.push(e);
		}

		expect(entries.length).toBe(4);
	});

	test("list", async () => {
		const testId = crypto.randomUUID();
		await client
			.file(`${runId}/${testId}/test-a-0.txt`)
			.write(crypto.randomUUID());
		await client
			.file(`${runId}/${testId}/test-a-1.txt`)
			.write(crypto.randomUUID());
		await client
			.file(`${runId}/${testId}/test-b-2.txt`)
			.write(crypto.randomUUID());
		await client
			.file(`${runId}/${testId}/test-b-3.txt`)
			.write(crypto.randomUUID());

		const all = await client.list({ prefix: `${runId}/${testId}` });
		expect(all.contents.length).toEqual(4);

		const result0 = await client.list({
			prefix: `${runId}/${testId}`,
		});
		expect(result0).toStrictEqual(
			expect.objectContaining({
				isTruncated: false,
				maxKeys: 1000,
				keyCount: 4,
				name: expect.any(String),
				prefix: `${runId}/${testId}`,
				startAfter: undefined,
				continuationToken: undefined,
				nextContinuationToken: undefined,
				contents: [
					expect.objectContaining({
						key: `${runId}/${testId}/test-a-0.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						// checksumAlgorithm: minio returns something, localstack doesn't
						// checksumType: minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-a-1.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						// checksumAlgorithm: minio returns something, localstack doesn't
						// checksumType: minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-2.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						// checksumAlgorithm: minio returns something, localstack doesn't
						// checksumType: minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-3.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						// checksumAlgorithm: minio returns something, localstack doesn't
						// checksumType: minio returns something, localstack doesn't
					}),
				],
			}),
		);

		const result1 = await client.list({
			prefix: `${runId}/${testId}`,
			maxKeys: 2,
		});
		expect(result1).toStrictEqual(
			expect.objectContaining({
				isTruncated: true,
				maxKeys: 2,
				keyCount: 2,
				name: expect.any(String),
				prefix: `${runId}/${testId}`,
				startAfter: undefined,
				continuationToken: undefined,
				nextContinuationToken: expect.any(String),
				contents: [
					expect.objectContaining({
						key: `${runId}/${testId}/test-a-0.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						// checksumAlgorithm: minio returns something, localstack doesn't
						// checksumType: minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-a-1.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						// checksumAlgorithm: minio returns something, localstack doesn't
						// checksumType minio returns something, localstack doesn't
					}),
				],
			}),
		);

		const result2 = await client.list({
			prefix: `${runId}/${testId}`,
			maxKeys: 2,
			continuationToken: result1.nextContinuationToken,
		});
		expect(result2).toStrictEqual(
			expect.objectContaining({
				isTruncated: false,
				maxKeys: 2,
				keyCount: 2,
				name: expect.any(String),
				prefix: `${runId}/${testId}`,
				startAfter: undefined,
				continuationToken: result1.nextContinuationToken,
				nextContinuationToken: undefined,
				contents: [
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-2.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						// checksumAlgorithm: minio returns something, localstack doesn't
						// checksumType: minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-3.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						// checksumAlgorithm: minio returns something, localstack doesn't
						// checksumType: minio returns something, localstack doesn't
					}),
				],
			}),
		);

		const result3 = await client.list({
			prefix: `${runId}/${testId}`,
			startAfter: `${runId}/${testId}/test-a-1.txt`,
		});
		expect(result3).toStrictEqual(
			expect.objectContaining({
				isTruncated: false,
				maxKeys: 1000,
				keyCount: 2,
				name: expect.any(String),
				prefix: `${runId}/${testId}`,
				startAfter: `${runId}/${testId}/test-a-1.txt`,
				continuationToken: undefined,
				nextContinuationToken: undefined,
				contents: [
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-2.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						// checksumAlgorithm: minio returns something, localstack doesn't
						// checksumType: minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-3.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						// checksumAlgorithm: minio returns something, localstack doesn't
						// checksumType: minio returns something, localstack doesn't
					}),
				],
			}),
		);
	});

	test("deleteObjects", async () => {
		const testId = crypto.randomUUID();
		await client
			.file(`${runId}/${testId}/test-a-0.txt`)
			.write(crypto.randomUUID());
		await client
			.file(`${runId}/${testId}/test-a-1.txt`)
			.write(crypto.randomUUID());
		await client
			.file(`${runId}/${testId}/test-b-2.txt`)
			.write(crypto.randomUUID());
		await client
			.file(`${runId}/${testId}/test-b-3.txt`)
			.write(crypto.randomUUID());

		const res0 = await client.list({ prefix: `${runId}/${testId}` });
		expect(res0.contents.length).toBe(4);

		await client.deleteObjects(res0.contents);

		const res1 = await client.list({ prefix: `${runId}/${testId}` });
		expect(res1.contents.length).toBe(0);
	});
}
