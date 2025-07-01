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
			code: {
				type: "string",
				tagName: "Code",
			},
		},
	},
	`<Code>Tom &amp; Jerry</Code>`,
);

console.log(source);
