import { after, before, describe, test } from "node:test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { expect } from "expect";

import { S3Client } from "./index.ts";

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
		void test("write rejects", async () => {
			const ac = new AbortController();
			ac.abort();
			await expect(makeClient().file("k").write("data", { signal: ac.signal })).rejects.toThrow();
		});

		void test("delete rejects", async () => {
			const ac = new AbortController();
			ac.abort();
			await expect(makeClient().file("k").delete({ signal: ac.signal })).rejects.toThrow();
		});

		void test("exists rejects", async () => {
			const ac = new AbortController();
			ac.abort();
			await expect(makeClient().file("k").exists({ signal: ac.signal })).rejects.toThrow();
		});

		void test("stat rejects", async () => {
			const ac = new AbortController();
			ac.abort();
			await expect(makeClient().file("k").stat({ signal: ac.signal })).rejects.toThrow();
		});

		void test("text rejects", async () => {
			const ac = new AbortController();
			ac.abort();
			await expect(makeClient().file("k").text({ signal: ac.signal })).rejects.toThrow();
		});

		void test("stream errors on read", async () => {
			const ac = new AbortController();
			ac.abort();
			const stream = makeClient().file("k").stream({ signal: ac.signal });
			const reader = stream.getReader();
			await expect(reader.read()).rejects.toThrow();
		});

		void test("list rejects", async () => {
			const ac = new AbortController();
			ac.abort();
			await expect(makeClient().list({ signal: ac.signal })).rejects.toThrow();
		});

		void test("uses provided abort reason", async () => {
			const ac = new AbortController();
			const reason = new Error("custom-abort-reason");
			ac.abort(reason);
			await expect(makeClient().file("k").exists({ signal: ac.signal })).rejects.toBe(reason);
		});
	});

	void describe("in-flight abort", () => {
		void test("write rejects when aborted during request", async () => {
			const ac = new AbortController();
			const promise = makeClient().file("k").write("data", { signal: ac.signal });
			await delay(25);
			ac.abort();
			await expect(promise).rejects.toThrow();
		});

		void test("exists rejects when aborted during request", async () => {
			const ac = new AbortController();
			const promise = makeClient().file("k").exists({ signal: ac.signal });
			await delay(25);
			ac.abort();
			await expect(promise).rejects.toThrow();
		});

		void test("stream rejects when aborted during request", async () => {
			const ac = new AbortController();
			const stream = makeClient().file("k").stream({ signal: ac.signal });
			const reader = stream.getReader();
			const readPromise = reader.read();
			await delay(25);
			ac.abort();
			await expect(readPromise).rejects.toThrow();
		});

		void test("list rejects when aborted during request", async () => {
			const ac = new AbortController();
			const promise = makeClient().list({ signal: ac.signal });
			await delay(25);
			ac.abort();
			await expect(promise).rejects.toThrow();
		});

		void test("AbortSignal.timeout works", async () => {
			await expect(
				makeClient()
					.file("k")
					.exists({ signal: AbortSignal.timeout(25) }),
			).rejects.toThrow();
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
});
