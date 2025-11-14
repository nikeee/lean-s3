/**
 * @module Used to generate a static file containing a parser module for debugging purposes.
 * Invoke using:
 * ```sh
 * tsx ./cli-generator.ts > parse.js
 * ```
 */

import { buildStaticParserSourceWithText } from "./generator.ts";

const memory = new WebAssembly.Memory({ initial: 16, maximum: 256 });
new TextEncoder().encodeInto(
	`<?xml version="1.0" encoding="utf-8"?><note></note>`,
	new Uint8Array(memory.buffer, 0, 39),
);

const source = buildStaticParserSourceWithText(
	{
		type: "root",
		children: {
			note: {
				type: "object",
				children: {},
			},
		},
	},
	memory,
	39,
);

console.log(source);
