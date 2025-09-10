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
				children: {
					to: {
						type: "string",
					},
					from: {
						type: "string",
					},
				},
			},
		},
	},
	`<?xml version="1.0" encoding="UTF-8"?><note><to>Alice</to><from>Bob</from></note>`,
);

console.log(source);
