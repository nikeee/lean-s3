import assertNever from "./assertNever.ts";
import type { ContentDisposition } from "./index.ts";

/**
 *
 * Ref: https://datatracker.ietf.org/doc/html/rfc5987#section-3.2
 */
function rfc5987Encode(_value: string) {
	throw new Error("Not implemented");
}

export function getContentDispositionHeader(value: ContentDisposition) {
	switch (value.type) {
		case "inline":
			return "inline";
		case "attachment": {
			const { filename } = value;
			if (typeof filename === "undefined") {
				return "attachment";
			}
			return `attachment ${rfc5987Encode(filename)}`;
		}
		default:
			assertNever(value);
	}
}
