/**
 * @module Used by integration tests and unit tests.
 */

import { describe, test } from "node:test";
import { expect } from "expect";

import { S3Client, S3Error, S3Stat } from "./index.ts";

export function runTests(
	runId: number,
	endpoint: string,
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

	test("presign-put with weird key", async () => {
		const testId = crypto.randomUUID();
		const expected = {
			hello: testId,
		};

		const key = `${runId}/${testId}/Sun Jun 15 2025 00:57:03 GMT+0200 (test)`;

		const url = client.presign(key, { method: "PUT" });
		const res = await fetch(url, {
			method: "PUT",
			body: JSON.stringify(expected),
			headers: {
				accept: "application/json",
			},
		});
		expect(res.ok).toBe(true);

		const f = client.file(key);
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
		try {
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
		} finally {
			await client.deleteObjects([
				`${runId}/${testId}/test-a-0.txt`,
				`${runId}/${testId}/test-a-1.txt`,
				`${runId}/${testId}/test-b-2.txt`,
				`${runId}/${testId}/test-b-3.txt`,
			]);
		}
	});

	describe("list", () => {
		test("list multiple", async () => {
			const testId = crypto.randomUUID();
			try {
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
			} finally {
				await client.deleteObjects([
					`${runId}/${testId}/test-a-0.txt`,
					`${runId}/${testId}/test-a-1.txt`,
					`${runId}/${testId}/test-b-2.txt`,
					`${runId}/${testId}/test-b-3.txt`,
				]);
			}
		});

		test("list with no results", async () => {
			const testId = crypto.randomUUID();
			const result = await client.list({ prefix: `${runId}/${testId}` });
			expect(result).toStrictEqual(
				expect.objectContaining({
					isTruncated: false,
					maxKeys: 1000,
					keyCount: 0,
					name: expect.any(String),
					prefix: `${runId}/${testId}`,
					startAfter: undefined,
					continuationToken: undefined,
					nextContinuationToken: undefined,
					contents: [],
				}),
			);
		});

		test("list with single result", async () => {
			const testId = crypto.randomUUID();

			const f = client.file(`${runId}/${testId}/test-a-0.txt`);
			await f.write(crypto.randomUUID());
			try {
				const result = await client.list({ prefix: `${runId}/${testId}` });
				expect(result).toStrictEqual(
					expect.objectContaining({
						isTruncated: false,
						maxKeys: 1000,
						keyCount: 1,
						name: expect.any(String),
						prefix: `${runId}/${testId}`,
						startAfter: undefined,
						continuationToken: undefined,
						nextContinuationToken: undefined,
						contents: [
							expect.objectContaining({
								key: `${runId}/${testId}/test-a-0.txt`,
								size: expect.any(Number),
								etag: expect.any(String),
								lastModified: expect.any(Date),
								storageClass: "STANDARD",
							}),
						],
					}),
				);
			} finally {
				await f.delete();
			}
		});
	});

	describe("deleteObjects", () => {
		test("with .list entries", async () => {
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
		test("with strings", async () => {
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

			await client.deleteObjects([
				`${runId}/${testId}/test-a-0.txt`,
				`${runId}/${testId}/test-a-1.txt`,
				`${runId}/${testId}/test-b-2.txt`,
				`${runId}/${testId}/test-b-3.txt`,
			]);

			const res1 = await client.list({ prefix: `${runId}/${testId}` });
			expect(res1.contents.length).toBe(0);
		});
	});

	describe("deleteObject", () => {
		test("deleteObject works", async () => {
			const testId = crypto.randomUUID();
			await client
				.file(`${runId}/${testId}/test-a-0.txt`)
				.write(crypto.randomUUID());

			const res0 = await client.list({ prefix: `${runId}/${testId}` });
			expect(res0.contents.length).toBe(1);

			await client.file(`${runId}/${testId}/test-a-0.txt`).delete();

			const res1 = await client.list({ prefix: `${runId}/${testId}` });
			expect(res1.contents.length).toBe(0);
		});
	});

	describe("S3File", () => {
		test(".write()", async () => {
			const testId = crypto.randomUUID();
			const f = client.file(`${runId}/${testId}/test-a-0.txt`);
			const content = crypto.randomUUID();
			await f.write(content);
			try {
				// ensure a new instance works as well
				const f2 = client.file(`${runId}/${testId}/test-a-0.txt`);
				expect(await f2.text()).toBe(await f.text());
				expect(content).toBe(await f.text());
			} finally {
				await f.delete();
			}
		});

		test(".write() with weird keys", async () => {
			const testId = crypto.randomUUID();

			const key = "Sun Jun 15 2025 00:57:03 GMT+0200 (test)";
			const f = client.file(`${runId}/${testId}/${key}`);
			const content = crypto.randomUUID();
			await f.write(content);
			try {
				expect(await f.exists()).toBe(true);
				expect(await f.text()).toBe(content);
			} finally {
				await f.delete();
			}
		});

		test(".exists()", async () => {
			const testId = crypto.randomUUID();

			const f = client.file(`${runId}/${testId}/test-a-0.txt`);
			await f.write(crypto.randomUUID());
			try {
				expect(await f.exists()).toBe(true);

				// ensure a new instance works as well
				expect(
					await client.file(`${runId}/${testId}/test-a-0.txt`).exists(),
				).toBe(true);

				const notExistentFile = client.file(
					`${runId}/${testId}/not-existent.txt`,
				);
				expect(await notExistentFile.exists()).toBe(false);
			} finally {
				await f.delete();
			}
		});

		test(".stat()", async () => {
			const testId = crypto.randomUUID();

			const f = client.file(`${runId}/${testId}/test-a-0.txt`);
			await f.write("some content");

			try {
				const stat = await f.stat();
				expect(stat).not.toBeNull();
				expect(stat).not.toBeUndefined();
				expect(stat).toBeInstanceOf(S3Stat);
				expect(stat.etag).toBeDefined();
				expect(stat.lastModified).toBeInstanceOf(Date);
				expect(stat.size).toBe("some content".length);
				expect(stat.type).toBe("application/octet-stream");

				// ensure a new instance works as well
				const stat2 = await client
					.file(`${runId}/${testId}/test-a-0.txt`)
					.stat();
				expect(stat2).not.toBeNull();
				expect(stat2).not.toBeUndefined();
				expect(stat2).toBeInstanceOf(S3Stat);
				expect(stat2.etag).toBeDefined();
				expect(stat2.lastModified).toBeInstanceOf(Date);
				expect(stat2.size).toBe("some content".length);
				expect(stat2.type).toBe("application/octet-stream");
			} finally {
				await f.delete();
			}
		});

		test(".stat() throws on non-existent", async () => {
			const testId = crypto.randomUUID();

			const f = client.file(`${runId}/${testId}/test-a-0.txt`);
			const promise = f.stat();
			await expect(promise).rejects.toStrictEqual(
				expect.objectContaining({
					code: "NoSuchKey",
					path: `${runId}/${testId}/test-a-0.txt`,
				}),
			);
			await expect(promise).rejects.toBeInstanceOf(S3Error);
		});
	});

	describe("multipart uploads", () => {
		test("create + abort multipart upload", async () => {
			const uploads = await client.listMultipartUploads();
			expect(uploads.uploads.length).toBe(0);

			const res = await client.createMultipartUpload("foo-key-9000");
			try {
				expect(res).toStrictEqual({
					bucket: expect.any(String),
					key: "foo-key-9000",
					uploadId: expect.any(String),
				});

				const uploads = await client.listMultipartUploads();
				expect(uploads.uploads).toStrictEqual([
					expect.objectContaining({
						initiated: expect.any(Date),
						key: "foo-key-9000",
						// storageClass is missing or STANDARD on different services
						checksumType: undefined,
						checksumAlgorithm: undefined,
						// cloudflare somehow returns a different uploadId than the one provided by createMultipartUpload
						// uploadId: res.uploadId,
					}),
				]);
			} finally {
				await client.abortMultipartUpload("foo-key-9000", res.uploadId);
			}
		});

		test("listMultipartUploads", async () => {
			const uploads = await client.listMultipartUploads();
			expect(uploads).toStrictEqual({
				bucket: expect.any(String),
				delimiter: undefined,
				prefix: undefined,
				keyMarker: undefined,
				uploadIdMarker: undefined,
				nextKeyMarker: undefined,
				nextUploadIdMarker: undefined,
				maxUploads: expect.any(Number),
				isTruncated: false,
				uploads: [],
			});
		});
	});
}
