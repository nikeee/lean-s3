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

// `encodeURIComponent` leaves `! * ' ( )` raw, SigV4 requires them to be percent-encoded.
const extendedChars = /[!'()*]/;
const extendedCharsGlobal = /[!'()*]/g;
const extendedCharMap: Record<string, string> = {
	"!": "%21",
	"'": "%27",
	"(": "%28",
	")": "%29",
	"*": "%2A",
};
const replaceExtendedChar = (c: string) => extendedCharMap[c];

/**
 * Escapes the characters of {@link extendedChars} that `encodeURIComponent` leaves alone.
 * Single pass with a no-op fast path, most values contain none of these characters.
 */
function escapeExtendedChars(value: string): string {
	return extendedChars.test(value)
		? value.replace(extendedCharsGlobal, replaceExtendedChar)
		: value;
}

/**
 * Encodes a value as required by SigV4's `UriEncode()`: every byte except `A-Z a-z 0-9 - _ . ~` is percent-encoded
 * (with uppercase hex digits).
 *
 * Ref: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
 */
export function encodeURIComponentExtended(value: string) {
	return escapeExtendedChars(encodeURIComponent(value));
}

const unreservedKey = /^[A-Za-z0-9\-._~/]*$/;

/**
 * Encodes an object key for the canonical URI of SigV4. Same as {@link encodeURIComponentExtended}, except that the
 * `/` between key segments are kept.
 *
 * We can't leave this to the URL parser. Its path percent-encode set leaves characters like `! $ & ; = @ [ ] |` raw,
 * while the server signs the fully encoded form (-> `SignatureDoesNotMatch`). It also strips tabs/newlines and turns `\`
 * into `/`, which would address a different key.
 *
 * A literal `%` becomes `%25`, keys are taken literally (`%41` is not decoded to `A`).
 *
 * Ref: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
 */
export function encodeObjectKey(key: string): string {
	// Fast path, most keys contain only unreserved characters and slashes
	return unreservedKey.test(key) ? key : key.split("/").map(encodeURIComponentExtended).join("/");
}
