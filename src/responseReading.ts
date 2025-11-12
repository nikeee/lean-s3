import type { Readable } from "node:stream";

export async function readResponseIntoWasmMemory(response: Readable) {
	const PAGE_SIZE = 65536;

	const memory = new WebAssembly.Memory({
		initial: 1,
	});

	let view = new Uint8Array(memory.buffer);
	let writeOffset = 0;
	// not using await for, to save the overhead of promise allocations and stuff
	await response.forEach((chunk: Buffer) => {
		const requiredBytes = writeOffset + chunk.byteLength;
		if (requiredBytes > memory.buffer.byteLength) {
			const pages = Math.ceil(
				(requiredBytes - memory.buffer.byteLength) / PAGE_SIZE,
			);
			memory.grow(pages);
			view = new Uint8Array(memory.buffer);
		}

		view.set(chunk, writeOffset);
		writeOffset += chunk.byteLength;
	});

	return [memory, writeOffset] as const;
}
