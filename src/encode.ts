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

// See: https://github.com/nikeee/lean-s3/issues/61
const extendedChars = /[:+(),'*]/;
const extendedCharsGlobal = /[:+(),'*]/g;
const extendedCharMap: Record<string, string> = {
	":": "%3A",
	"+": "%2B",
	"(": "%28",
	")": "%29",
	",": "%2C",
	"'": "%27",
	"*": "%2A",
};
const replaceExtendedChar = (c: string) => extendedCharMap[c];

/**
 * Escapes the characters of {@link extendedChars} that `encodeURIComponent` leaves alone.
 * Single pass with a no-op fast path, most values contain none of these characters.
 */
export function escapeExtendedChars(value: string): string {
	return extendedChars.test(value)
		? value.replace(extendedCharsGlobal, replaceExtendedChar)
		: value;
}

export function encodeURIComponentExtended(value: string) {
	return escapeExtendedChars(encodeURIComponent(value));
}
