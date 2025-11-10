/**
 * @module Used by integration tests and unit tests.
 */

import { describe, test } from "node:test";
import { expect } from "expect";

import { S3Client, S3Error, S3Stat } from "../index.ts";

export type S3Implementation =
	| "aws"
	| "hetzner"
	| "cloudflare"
	| "backblaze"
	| "minio"
	| "ceph"
	| "garage"
	| "rustfs"
	| "s3mock"
	| "localstack";

/**
 * @param implementation Try to avoid using this parameter in the tests. If some service diverges from the others, evaluate if it should be fixed upstream.
 */
export function runTests(
	runId: number,
	endpoint: string,
	accessKeyId: string,
	secretAccessKey: string,
	region: string,
	bucket: string,
	implementation: S3Implementation,
) {
	const client = new S3Client({
		endpoint,
		accessKeyId,
		secretAccessKey,
		region,
		bucket,
	});

	describe("presign", () => {
		test("put", async () => {
			const testId = crypto.randomUUID();
			const expected = {
				hello: testId,
			};

			const url = client.presign(`${runId}/presign-test.json`, {
				method: "PUT",
			});
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

		test("put with content length", async () => {
			const body = crypto.randomUUID();

			{
				const url = client.presign(`${runId}/presign-test.txt`, {
					method: "PUT",
					contentLength: body.length,
				});
				const res = await fetch(url, {
					method: "PUT",
					body,
				});
				expect(res.ok).toBe(true);
			}

			// we don't test if it works when the file size is larger or smaller
			// some providers don't care about the content-length (localstack)
			// others see it as an exact requirement for the body (minio)
			// others see it as a maximum body size (AWS?) :shrug:

			const f = client.file(`${runId}/presign-test.txt`);
			try {
				const actual = await f.text();
				expect(actual).toStrictEqual(body);
			} finally {
				await f.delete();
			}
		});

		test("put with content type", async () => {
			const value = crypto.randomUUID();

			{
				const url = client.presign(`${runId}/content-type.json`, {
					method: "PUT",
					type: "application/json",
				});

				const res = await fetch(url, {
					method: "PUT",
					body: JSON.stringify({ value }),
					headers: {
						"Content-Type": "application/json",
					},
				});
				expect(res.ok).toBe(true);
			}

			const f = client.file(`${runId}/content-type.json`);
			try {
				{
					const url = client.presign(`${runId}/content-type.json`, {
						method: "GET",
					});
					const res = await fetch(url);
					expect(res.ok).toBe(true);
					expect(res.headers.get("content-type")).toBe("application/json");
				}
				{
					const url = client.presign(`${runId}/content-type.json`, {
						method: "PUT",
						type: "application/octet-stream",
					});
					const res = await fetch(url, {
						method: "PUT",
						body: JSON.stringify({ value }),
						headers: {
							"Content-Type": "application/octet-stream",
						},
					});
					expect(res.ok).toBe(true);
				}
				{
					const url = client.presign(`${runId}/content-type.json`, {
						method: "GET",
					});
					const res = await fetch(url);
					expect(res.headers.get("content-type")).toBe(
						"application/octet-stream",
					);
				}
			} finally {
				await f.delete();
			}
		});

		test("put with content type and conent-length", async () => {
			const body = crypto.randomUUID();
			const f = client.file(`${runId}/content-type-with-length.json`);
			try {
				const url = client.presign(`${runId}/content-type-with-length.json`, {
					method: "PUT",
					type: "application/json",
					contentLength: body.length,
				});

				const res = await fetch(url, {
					method: "PUT",
					body,
					headers: {
						"Content-Type": "application/json",
					},
				});
				expect(res.ok).toBe(true);
			} finally {
				await f.delete();
			}
		});

		test("put with weird key", async () => {
			const testId = crypto.randomUUID();
			const expected = {
				hello: testId,
			};

			const key = `${runId}/${testId}/Sun Jun 15 2025 00:57:03 * ' GMT+0200 (test)`;

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

		test("put with content disposition", async () => {
			const testId = crypto.randomUUID();
			const f = client.file(`${runId}/${testId}`);
			await f.write(crypto.randomUUID());

			try {
				const url = client.presign(`${runId}/${testId}`, {
					method: "GET",
					response: {
						contentDisposition: {
							type: "attachment",
							filename: "download-💾.json",
						},
					},
				});
				const res = await fetch(url);
				expect(res.ok).toBe(true);

				const cd = res.headers.get("content-disposition");
				expect(cd).toBe(
					`attachment;filename="download-%F0%9F%92%BE.json";filename*=UTF-8''download-%F0%9F%92%BE.json`,
				);
				// @ts-expect-error
				expect(decodeURIComponent(cd)).toBe(
					`attachment;filename="download-💾.json";filename*=UTF-8''download-💾.json`,
				);
			} finally {
				await f.delete();
			}
		});
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

	describe("slicing", async () => {
		test("n-m", async () => {
			const testId = crypto.randomUUID();
			const f = client.file(`${runId}/${testId}/slicing.txt`);
			await f.write(testId);
			try {
				const slicedFile = f.slice(10, 20);
				const s = await slicedFile.text();
				expect(s).toEqual(testId.substring(10, 20));
			} finally {
				await f.delete();
			}
		});
		test("n-m, n > m, Invalid slice `end`", async () => {
			const testId = crypto.randomUUID();
			const f = client.file(`${runId}/${testId}/slicing.txt`);
			expect(() => f.slice(20, 10)).toThrow(new Error("Invalid slice `end`."));
		});
		test("n-m, m < 0, Invalid slice `end`", async () => {
			const testId = crypto.randomUUID();
			const f = client.file(`${runId}/${testId}/slicing.txt`);
			expect(() => f.slice(20, -1)).toThrow(new Error("Invalid slice `end`."));
		});
		test("n-m, n < 0, Invalid slice `start`", async () => {
			const testId = crypto.randomUUID();
			const f = client.file(`${runId}/${testId}/slicing.txt`);
			expect(() => f.slice(-1)).toThrow(new Error("Invalid slice `start`."));
		});
		test("0-m", async () => {
			const testId = crypto.randomUUID();
			const f = client.file(`${runId}/${testId}/slicing.txt`);
			await f.write(testId);
			try {
				const slicedFile = f.slice(0, 20);
				const s = await slicedFile.text();
				expect(s).toEqual(testId.substring(0, 20));
			} finally {
				await f.delete();
			}
		});
		test("undefined-m", async () => {
			const testId = crypto.randomUUID();
			const f = client.file(`${runId}/${testId}/slicing.txt`);
			await f.write(testId);
			try {
				const slicedFile = f.slice(undefined, 20);
				const s = await slicedFile.text();
				expect(s).toEqual(testId.substring(0, 20));
			} finally {
				await f.delete();
			}
		});
		test("0", async () => {
			const testId = crypto.randomUUID();
			const f = client.file(`${runId}/${testId}/slicing.txt`);
			await f.write(testId);
			try {
				const slicedFile = f.slice(0);
				const s = await slicedFile.text();
				expect(s).toEqual(testId.substring(0));
			} finally {
				await f.delete();
			}
		});
		test("n", async () => {
			const testId = crypto.randomUUID();
			const f = client.file(`${runId}/${testId}/slicing.txt`);
			await f.write(testId);
			try {
				const slicedFile = f.slice(10);
				const s = await slicedFile.text();
				expect(s).toEqual(testId.substring(10));
			} finally {
				await f.delete();
			}
		});
		test("n too large", async () => {
			const testId = crypto.randomUUID();
			const path = `${runId}/${testId}/slicing.txt`;
			const f = client.file(path);
			await f.write(testId);
			try {
				const slicedFile = f.slice(10000);
				expect(async () => await slicedFile.text()).rejects.toThrow(
					expect.objectContaining({
						...new S3Error("InvalidRange", path, { status: 416 }),
						name: expect.any(String),
						message: expect.any(String),
					}),
				);
			} finally {
				await f.delete();
			}
		});
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
		test("list multiple", async t => {
			if (implementation === "rustfs" || implementation === "s3mock") {
				// Refs:
				// https://github.com/rustfs/rustfs/issues/764
				// https://github.com/adobe/S3Mock/issues/2736
				t.todo(
					`S3 implementation "${implementation}" does not implement this correctly; upstream fix underway`,
				);
			}

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

		test("list with single result", async t => {
			if (implementation === "s3mock") {
				// Refs:
				// https://github.com/rustfs/rustfs/issues/764
				// https://github.com/adobe/S3Mock/issues/2736
				t.todo(
					`S3 implementation "${implementation}" does not implement this correctly; upstream fix underway`,
				);
			}

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
		test("with .list entries", async t => {
			if (implementation === "s3mock") {
				// Ref: See https://github.com/adobe/S3Mock/issues/2755
				t.todo(
					`S3 implementation "${implementation}" does not implement this feature`,
				);
			}

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
		test("with strings", async t => {
			if (implementation === "s3mock") {
				// Ref: See https://github.com/adobe/S3Mock/issues/2755
				t.todo(
					`S3 implementation "${implementation}" does not implement this feature`,
				);
			}

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

		test(".write() with weird keys 0", async () => {
			const testId = crypto.randomUUID();

			const key = "Sun Jun 15 2025 00:57:03 * ' GMT+0200 (test)`";
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

		test(".write() with weird keys 1", async () => {
			const testId = crypto.randomUUID();

			const key = "weird:key+with(some)characters,that'need*escaping `.json";
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

		test(".write() with content-type", async () => {
			const testId = crypto.randomUUID();

			// using .json to make sure the extension does not intefere with the passed content-type
			const f = client.file(`${runId}/${testId}.json`);

			const content = crypto.randomUUID();
			await f.write(content, { type: "text/plain" });
			try {
				const url = client.presign(`${runId}/${testId}.json`, {
					method: "GET",
				});
				const res = await fetch(url);
				expect(res.headers.get("content-type")).toBe("text/plain");
				expect(await res.text()).toBe(content);
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

	describe("copyObject", () => {
		test("copies an object", async () => {
			const testId = crypto.randomUUID();
			const sourceKey = `${runId}/${testId}/source.txt`;
			const destinationKey = `${runId}/${testId}/destination.txt`;
			const content = crypto.randomUUID();

			const sourceFile = client.file(sourceKey);
			const destinationFile = client.file(destinationKey);

			try {
				await sourceFile.write(content);
				expect(await sourceFile.exists()).toBe(true);
				expect(await destinationFile.exists()).toBe(false);

				await sourceFile.copyTo(destinationKey);

				expect(await destinationFile.exists()).toBe(true);
				const copiedContent = await destinationFile.text();
				expect(copiedContent).toBe(content);
			} finally {
				await sourceFile.delete();
				await destinationFile.delete();
			}
		});
	});

	describe("multipart uploads", () => {
		test("create + abort multipart upload", async t => {
			if (implementation === "rustfs") {
				// Ref:
				// https://github.com/rustfs/rustfs/issues/779
				t.todo(
					`S3 implementation "${implementation}" does not implement this correctly; upstream fix underway`,
				);
			}

			const testId = crypto.randomUUID();
			const key = `${testId}/foo-key-9000`;

			const res = await client.createMultipartUpload(key);
			try {
				expect(res).toStrictEqual({
					bucket: expect.any(String),
					key,
					uploadId: expect.any(String),
				});

				// Use `expect.arrayContaining` because the tests will run in parallel and might interfere
				const uploads = await client.listMultipartUploads();
				expect(uploads.uploads).toStrictEqual(
					expect.arrayContaining([
						expect.objectContaining({
							initiated: expect.any(Date),
							key,
							// storageClass is missing or STANDARD on different services
							// cloudflare somehow returns a different uploadId than the one provided by createMultipartUpload
							// uploadId: res.uploadId,
						}),
					]),
				);
			} finally {
				await client.abortMultipartUpload(key, res.uploadId);
			}
		});

		test("create + complete multipart upload", async () => {
			const testId = crypto.randomUUID();
			const key = `${testId}/foo-key-9000`;

			const res = await client.createMultipartUpload(key);
			expect(res).toStrictEqual({
				bucket: expect.any(String),
				key: key,
				uploadId: expect.any(String),
			});
			try {
				// R2 requires parts to be at least 5 MiB. Also, they have to be the same size (except the last one, which has to be <= in size)
				const parts = [
					Buffer.alloc(6 * 1024 * 1024).fill(1),
					Buffer.alloc(6 * 1024 * 1024).fill(2),
					Buffer.alloc(1 * 1024 * 1024).fill(3),
				];

				const uploadedParts = [
					await client.uploadPart(res.key, res.uploadId, parts[0], 1),
					await client.uploadPart(res.key, res.uploadId, parts[1], 2),
					await client.uploadPart(res.key, res.uploadId, parts[2], 3),
				];

				const completed = await client.completeMultipartUpload(
					res.key,
					res.uploadId,
					uploadedParts,
				);
				expect(completed).toStrictEqual(
					expect.objectContaining({
						bucket: expect.any(String),
						location: expect.any(String),
						key,
					}),
				);

				const expectedData = Buffer.concat(parts);
				const uploaded = await client.file(key).bytes();
				expect(expectedData.compare(uploaded)).toBe(0);
			} finally {
				await client.file(key).delete();
			}
		});

		test("listMultipartUploads", async () => {
			const uploads = await client.listMultipartUploads();
			expect(uploads).toStrictEqual(
				expect.objectContaining({
					bucket: expect.any(String),
					delimiter: undefined,
					prefix: undefined,
					keyMarker: undefined,
					uploadIdMarker: undefined,
					// nextKeyMarker: undefined,
					// nextUploadIdMarker: undefined,
					maxUploads: expect.any(Number),
					isTruncated: false,
					uploads: expect.any(Array),
				}),
			);
		});

		test("list parts", async () => {
			const testId = crypto.randomUUID();
			const key = `${testId}/foo-key-9000`;

			const res = await client.createMultipartUpload(key);
			expect(res).toStrictEqual({
				bucket: expect.any(String),
				key: key,
				uploadId: expect.any(String),
			});

			try {
				// R2 requires parts to be at least 5 MiB. Also, they have to be the same size (except the last one, which has to be <= in size)
				const parts = [
					Buffer.alloc(6 * 1024 * 1024).fill(1),
					Buffer.alloc(6 * 1024 * 1024).fill(2),
					Buffer.alloc(1 * 1024 * 1024).fill(3),
				];

				await client.uploadPart(res.key, res.uploadId, parts[0], 1);
				await client.uploadPart(res.key, res.uploadId, parts[1], 2);
				await client.uploadPart(res.key, res.uploadId, parts[2], 3);

				const availableParts = await client.listParts(key, res.uploadId);

				expect(availableParts).toStrictEqual(
					expect.objectContaining({
						bucket: expect.any(String),
						key,
						uploadId: res.uploadId,
						// partNumberMarker: 0, // minio/localstack return 0, garage returns undefined
						// nextPartNumberMarker: expect.any(Number), // minio returns 0, localstack returns 3, garage returns undefined
						// maxParts: expect.any(Number), garage returns undefined, minio/localstack return some number
						isTruncated: false,
						parts: [
							expect.objectContaining({
								etag: expect.any(String),
								lastModified: expect.any(Date),
								partNumber: 1,
								size: 6 * 1024 * 1024,
							}),
							expect.objectContaining({
								etag: expect.any(String),
								lastModified: expect.any(Date),
								partNumber: 2,
								size: 6 * 1024 * 1024,
							}),
							expect.objectContaining({
								etag: expect.any(String),
								lastModified: expect.any(Date),
								partNumber: 3,
								size: 1 * 1024 * 1024,
							}),
						],
					}),
				);
			} finally {
				await client.abortMultipartUpload(res.key, res.uploadId);
			}
		});
	});

	describe("bucket cors", () => {
		test("put", async t => {
			if (
				implementation === "minio" ||
				implementation === "garage" ||
				implementation === "ceph" ||
				implementation === "localstack" ||
				implementation === "rustfs" ||
				implementation === "s3mock"
			) {
				// Minio doesn't support PutBucketCors
				// https://github.com/minio/minio/issues/15874#issuecomment-1279771751
				t.skip(
					`S3 implementation "${implementation}" does not implement this feature`,
				);
				return;
			}

			await client.putBucketCors([
				{
					allowedMethods: ["GET"],
					allowedOrigins: ["https://example.com"],
					allowedHeaders: ["*"],
				},
			]);

			const { rules } = await client.getBucketCors();
			expect(rules).toStrictEqual([
				{
					allowedMethods: ["GET"],
					allowedOrigins: ["https://example.com"],
					allowedHeaders: undefined,
					exposeHeaders: undefined,
					id: undefined,
					maxAgeSeconds: undefined,
				},
			]);

			await client.deleteBucketCors();

			expect(client.getBucketCors()).rejects.toThrow();
		});
	});
}
