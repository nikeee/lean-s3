import { after, before, describe, test } from "node:test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { expect } from "expect";

import { S3Client } from "./index.ts";

const chunkSize = 64 * 1024;
const totalSize = 64 * 1024 * 1024;

void describe("stream backpressure", () => {
	let server: Server;
	let baseUrl: string;
	let bytesSent = 0;

	before(async () => {
		const chunk = Buffer.alloc(chunkSize);
		server = createServer((_req, res) => {
			res.writeHead(200, { "content-type": "application/octet-stream" });

			const writeChunks = () => {
				while (bytesSent < totalSize) {
					bytesSent += chunk.length;
					if (!res.write(chunk)) {
						res.once("drain", writeChunks);
						return;
					}
				}
				res.end();
			};
			writeChunks();
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

	void test("slow consumer does not buffer the entire response", async () => {
		const client = new S3Client({
			endpoint: baseUrl,
			accessKeyId: "test",
			secretAccessKey: "test-secret",
			region: "us-east-1",
			bucket: "test-bucket",
		});

		const stream = client.file("k").stream();
		const reader = stream.getReader();

		// Read a single chunk, then stall. Without backpressure, the server can
		// push the entire 64 MiB into the stream's queue while we do nothing.
		const first = await reader.read();
		expect(first.done).toBe(false);

		await delay(500);

		// Socket buffers on both ends + undici's internal buffer + the stream's
		// high water mark hold a few MiB, but nowhere near the full response.
		expect(bytesSent).toBeLessThan(totalSize / 2);

		await reader.cancel("test done");
	});
});
