/**
 * @module Used to generate a static file containing a parser module for debugging purposes.
 * Invoke using:
 * ```sh
 * tsx ./cli-generator.ts > parse.js
 * ```
 */

import { buildStaticParserSource } from "./generator.ts";
import { listPartsResultSpec } from "../parsers.ts";

const source = buildStaticParserSource(listPartsResultSpec);

console.log(source);
