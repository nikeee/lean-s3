/**
 * @module Used by integration tests and unit tests.
 */

import { test } from "node:test";
import { expect } from "expect";

import { S3Client } from "./index.js";

/**
 * @param {number} runId
 * @param {string} endpoint
 * @param {boolean} forcePathStyle
 * @param {string} accessKeyId
 * @param {string} secretAccessKey
 * @param {string} region
 * @param {string} bucket
 */
export function runTests(
	runId,
	endpoint,
	forcePathStyle,
	accessKeyId,
	secretAccessKey,
	region,
	bucket,
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

		const all = await client.list();
		expect(all.contents.length).toEqual(4);

		const result0 = await client.list({
			prefix: `${runId}/${testId}`,
		});
		console.log("aaa");
		expect(result0).toEqual(
			expect.objectContaining({
				isTruncated: false,
				maxKeys: 1000,
				keyCount: 4,
				name: "test-bucket",
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
						checksumAlgorithm: expect.anything(), // minio returns something, localstack doesn't
						checksumType: expect.anything(), // minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-a-1.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						checksumAlgorithm: expect.anything(), // minio returns something, localstack doesn't
						checksumType: expect.anything(), // minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-2.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						checksumAlgorithm: expect.anything(), // minio returns something, localstack doesn't
						checksumType: expect.anything(), // minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-3.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						checksumAlgorithm: expect.anything(), // minio returns something, localstack doesn't
						checksumType: expect.anything(), // minio returns something, localstack doesn't
					}),
				],
			}),
		);

		const result1 = await client.list({
			prefix: `${runId}/${testId}`,
			maxKeys: 2,
		});
		console.log("bbb");
		expect(result1).toEqual(
			expect.objectContaining({
				isTruncated: true,
				maxKeys: 2,
				keyCount: 2,
				name: "test-bucket",
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
						checksumAlgorithm: expect.anything(), // minio returns something, localstack doesn't
						checksumType: expect.anything(), // minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-a-1.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						checksumAlgorithm: expect.anything(), // minio returns something, localstack doesn't
						checksumType: expect.anything(), // minio returns something, localstack doesn't
					}),
				],
			}),
		);

		const result2 = await client.list({
			prefix: `${runId}/${testId}`,
			maxKeys: 2,
			//continuationToken: result1.nextContinuationToken,
		});
		console.log("ccc");
		expect(result2).toEqual(
			expect.objectContaining({
				isTruncated: false,
				maxKeys: 2,
				keyCount: 2,
				name: "test-bucket",
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
						checksumAlgorithm: expect.anything(), // minio returns something, localstack doesn't
						checksumType: expect.anything(), // minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-3.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						checksumAlgorithm: expect.anything(), // minio returns something, localstack doesn't
						checksumType: expect.anything(), // minio returns something, localstack doesn't
					}),
				],
			}),
		);

		const result3 = await client.list({
			prefix: `${runId}/${testId}`,
			startAfter: `${runId}/${testId}/test-a-1.txt`,
		});
		console.log("ddd");
		expect(result3).toEqual(
			expect.objectContaining({
				isTruncated: false,
				maxKeys: 1000,
				keyCount: 2,
				name: "test-bucket",
				prefix: `${runId}/${testId}`,
				startAfter: undefined,
				continuationToken: undefined,
				nextContinuationToken: undefined,
				contents: [
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-2.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						checksumAlgorithm: expect.anything(), // minio returns something, localstack doesn't
						checksumType: expect.anything(), // minio returns something, localstack doesn't
					}),
					expect.objectContaining({
						key: `${runId}/${testId}/test-b-3.txt`,
						size: 36,
						etag: expect.any(String),
						lastModified: expect.any(Date),
						storageClass: "STANDARD",
						checksumAlgorithm: expect.anything(), // minio returns something, localstack doesn't
						checksumType: expect.anything(), // minio returns something, localstack doesn't
					}),
				],
			}),
		);
	});
}
