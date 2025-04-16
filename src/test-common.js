/**
 * @module Used by integration tests and unit tests.
 */

// @ts-check
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
}
