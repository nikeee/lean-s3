import assertNever from "./assertNever.ts";
import type { ContentDisposition } from "./index.ts";

/**
 * Refs:
 * - https://datatracker.ietf.org/doc/html/rfc5987#section-3.2
 * - https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition
 */
export function getContentDispositionHeader(value: ContentDisposition): string {
	switch (value.type) {
		case "inline":
			return "inline";
		case "attachment": {
			const { filename } = value;
			if (typeof filename === "undefined") {
				return "attachment";
			}
			const encoded = encodeURIComponent(filename);
			return `attachment;filename="${encoded}";filename*=UTF-8''${encoded}`;
		}
		default:
			assertNever(value);
	}
}

export function encodeURIComponentExtended(value: string) {
	return encodeURIComponent(value)
		.replaceAll(":", "%3A") // See: https://github.com/nikeee/lean-s3/issues/61
		.replaceAll("+", "%2B")
		.replaceAll("(", "%28")
		.replaceAll(")", "%29")
		.replaceAll(",", "%2C")
		.replaceAll("*", "%2A");
}
