/**
 * @module Used to generate a static file containing a parser module for debugging purposes.
 * Invoke using:
 * ```sh
 * tsx ./cli-generator.ts > parse.js
 * ```
 */

import { buildStaticParserSourceWithText } from "./generator.ts";

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
	`<?xml version="1.0" encoding="utf-8"?><note></note>`,
);

console.log(source);
