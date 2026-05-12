import { after, before, describe, test } from "node:test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { expect } from "expect";

import { S3Client, S3Error } from "./index.ts";

/**
 * For methods that go through `kSignedRequest` / `kWrite`, the catch block calls
 * `signal?.throwIfAborted()` which throws the abort reason directly.
 */
async function expectAbortRejection(promise: Promise<unknown>, signal: AbortSignal) {
	await expect(promise).rejects.toBe(signal.reason);
}

/**
 * For methods that go through `kStream`, the `request()` rejection is caught by
 * `onNetworkError` which wraps it as `new S3Error("Unknown", path, { cause })`.
 */
async function expectStreamAbortRejection(promise: Promise<unknown>, signal: AbortSignal) {
	let err: unknown;
	try {
		await promise;
	} catch (e) {
		err = e;
	}
	expect(err).toBeInstanceOf(S3Error);
	expect((err as S3Error).code).toBe("Unknown");
	expect((err as S3Error).cause).toBe(signal.reason);
}

void describe("cancellation", () => {
	let server: Server;
	let baseUrl: string;

	before(async () => {
		server = createServer(() => {
			// hang and never respond; lets us test abort behavior of in-flight requests
		});
		server.listen(0, "127.0.0.1");

		await once(server, "listening");
		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("server has no address");
		}

		baseUrl = `http://127.0.0.1:${address.port}`;
	});

	after(() => {
		server.closeAllConnections();
		server.close();
	});

	function makeClient() {
		return new S3Client({
			endpoint: baseUrl,
			accessKeyId: "test",
			secretAccessKey: "test-secret",
			region: "us-east-1",
			bucket: "test-bucket",
		});
	}

	void describe("pre-aborted signal", () => {
		void test("write rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().file("k").write("data", { signal: ac.signal }),
				ac.signal,
			);
		});

		void test("delete rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(makeClient().file("k").delete({ signal: ac.signal }), ac.signal);
		});

		void test("exists rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(makeClient().file("k").exists({ signal: ac.signal }), ac.signal);
		});

		void test("stat rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(makeClient().file("k").stat({ signal: ac.signal }), ac.signal);
		});

		void test("text rejects with S3Error wrapping abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectStreamAbortRejection(
				makeClient().file("k").text({ signal: ac.signal }),
				ac.signal,
			);
		});

		void test("stream errors on read with S3Error wrapping abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			const stream = makeClient().file("k").stream({ signal: ac.signal });
			const reader = stream.getReader();
			await expectStreamAbortRejection(reader.read(), ac.signal);
		});

		void test("list rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(makeClient().list({ signal: ac.signal }), ac.signal);
		});

		void test("uses default DOMException AbortError when no reason given", async () => {
			const ac = new AbortController();
			ac.abort();
			expect(ac.signal.reason).toBeInstanceOf(DOMException);
			expect((ac.signal.reason as DOMException).name).toBe("AbortError");
			await expect(makeClient().file("k").exists({ signal: ac.signal })).rejects.toBe(
				ac.signal.reason,
			);
		});

		void test("uses provided abort reason verbatim", async () => {
			const ac = new AbortController();
			const reason = new Error("custom-abort-reason");
			ac.abort(reason);
			await expect(makeClient().file("k").exists({ signal: ac.signal })).rejects.toBe(reason);
		});

		void test("uses provided abort reason verbatim for stream (wrapped as cause)", async () => {
			const ac = new AbortController();
			const reason = new Error("custom-stream-abort");
			ac.abort(reason);
			const stream = makeClient().file("k").stream({ signal: ac.signal });
			const reader = stream.getReader();
			let err: unknown;
			try {
				await reader.read();
			} catch (e) {
				err = e;
			}
			expect(err).toBeInstanceOf(S3Error);
			expect((err as S3Error).cause).toBe(reason);
		});
	});

	void describe("in-flight abort", () => {
		void test("write rejects with abort reason", async () => {
			const ac = new AbortController();
			const promise = makeClient().file("k").write("data", { signal: ac.signal });
			await delay(25);
			ac.abort();
			await expectAbortRejection(promise, ac.signal);
		});

		void test("exists rejects with abort reason", async () => {
			const ac = new AbortController();
			const promise = makeClient().file("k").exists({ signal: ac.signal });
			await delay(25);
			ac.abort();
			await expectAbortRejection(promise, ac.signal);
		});

		void test("stream rejects with S3Error wrapping abort reason", async () => {
			const ac = new AbortController();
			const stream = makeClient().file("k").stream({ signal: ac.signal });
			const reader = stream.getReader();
			const readPromise = reader.read();
			await delay(25);
			ac.abort();
			await expectStreamAbortRejection(readPromise, ac.signal);
		});

		void test("list rejects with abort reason", async () => {
			const ac = new AbortController();
			const promise = makeClient().list({ signal: ac.signal });
			await delay(25);
			ac.abort();
			await expectAbortRejection(promise, ac.signal);
		});

		void test("AbortSignal.timeout works and rejects with TimeoutError DOMException", async () => {
			const signal = AbortSignal.timeout(25);
			let err: unknown;
			try {
				await makeClient().file("k").exists({ signal });
			} catch (e) {
				err = e;
			}
			expect(err).toBeInstanceOf(DOMException);
			expect((err as DOMException).name).toBe("TimeoutError");
		});
	});

	void describe("stream consumer cancel", () => {
		void test("reader.cancel() tears down request without external signal", async () => {
			const stream = makeClient().file("k").stream();
			const reader = stream.getReader();
			await reader.cancel("done");
			// no assertion needed, just verify no hang/unhandled rejection
		});
	});

	void describe("client methods, pre-aborted signal", () => {
		void test("copyObject rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().copyObject("src", "dst", { signal: ac.signal }),
				ac.signal,
			);
		});

		void test("deleteObjects rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().deleteObjects(["a", "b"], { signal: ac.signal }),
				ac.signal,
			);
		});

		void test("createMultipartUpload rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().createMultipartUpload("k", { signal: ac.signal }),
				ac.signal,
			);
		});

		void test("listMultipartUploads rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().listMultipartUploads({ signal: ac.signal }),
				ac.signal,
			);
		});

		void test("abortMultipartUpload rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().abortMultipartUpload("k", "upload-id", { signal: ac.signal }),
				ac.signal,
			);
		});

		void test("completeMultipartUpload rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().completeMultipartUpload("k", "upload-id", [{ partNumber: 1, etag: "etag" }], {
					signal: ac.signal,
				}),
				ac.signal,
			);
		});

		void test("uploadPart rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().uploadPart("k", "upload-id", "data", 1, { signal: ac.signal }),
				ac.signal,
			);
		});

		void test("listParts rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().listParts("k", "upload-id", { signal: ac.signal }),
				ac.signal,
			);
		});

		void test("createBucket rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().createBucket("new-bucket", { signal: ac.signal }),
				ac.signal,
			);
		});

		void test("deleteBucket rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().deleteBucket("new-bucket", { signal: ac.signal }),
				ac.signal,
			);
		});

		void test("bucketExists rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().bucketExists("new-bucket", { signal: ac.signal }),
				ac.signal,
			);
		});

		void test("putBucketCors rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().putBucketCors([{ allowedMethods: ["GET"], allowedOrigins: ["*"] }], {
					signal: ac.signal,
				}),
				ac.signal,
			);
		});

		void test("getBucketCors rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(makeClient().getBucketCors({ signal: ac.signal }), ac.signal);
		});

		void test("deleteBucketCors rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(makeClient().deleteBucketCors({ signal: ac.signal }), ac.signal);
		});

		void test("listIterating rejects with abort reason on first iteration", async () => {
			const ac = new AbortController();
			ac.abort();
			const iter = makeClient().listIterating({ signal: ac.signal });
			await expectAbortRejection(iter.next(), ac.signal);
		});

		void test("S3File.copyTo rejects with abort reason", async () => {
			const ac = new AbortController();
			ac.abort();
			await expectAbortRejection(
				makeClient().file("src").copyTo("dst", { signal: ac.signal }),
				ac.signal,
			);
		});
	});

	void describe("client methods, in-flight abort", () => {
		void test("copyObject rejects with abort reason", async () => {
			const ac = new AbortController();
			const promise = makeClient().copyObject("src", "dst", { signal: ac.signal });
			await delay(25);
			ac.abort();
			await expectAbortRejection(promise, ac.signal);
		});

		void test("listMultipartUploads rejects with abort reason", async () => {
			const ac = new AbortController();
			const promise = makeClient().listMultipartUploads({ signal: ac.signal });
			await delay(25);
			ac.abort();
			await expectAbortRejection(promise, ac.signal);
		});

		void test("uploadPart rejects with abort reason", async () => {
			const ac = new AbortController();
			const promise = makeClient().uploadPart("k", "upload-id", "data", 1, {
				signal: ac.signal,
			});
			await delay(25);
			ac.abort();
			await expectAbortRejection(promise, ac.signal);
		});

		void test("bucketExists rejects with abort reason", async () => {
			const ac = new AbortController();
			const promise = makeClient().bucketExists("name", { signal: ac.signal });
			await delay(25);
			ac.abort();
			await expectAbortRejection(promise, ac.signal);
		});

		void test("listIterating rejects with abort reason during first page", async () => {
			const ac = new AbortController();
			const iter = makeClient().listIterating({ signal: ac.signal });
			const promise = iter.next();
			await delay(25);
			ac.abort();
			await expectAbortRejection(promise, ac.signal);
		});
	});
});
