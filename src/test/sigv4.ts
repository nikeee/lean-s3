/**
 * @module Reference SigV4 implementation for unit tests, independent of lean-s3's signing code.
 * It verifies signatures the way the server does: decode the path and query, then re-encode them with `UriEncode()`.
 *
 * Ref: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
 */

import { createHash, createHmac } from "node:crypto";

/**
 * SigV4's `UriEncode()`, working on UTF-8 bytes: everything except `A-Z a-z 0-9 - _ . ~` is percent-encoded.
 */
export function sigV4UriEncode(value: string): string {
	let res = "";
	for (const byte of Buffer.from(value, "utf8")) {
		const c = String.fromCharCode(byte);
		res += /[A-Za-z0-9\-._~]/.test(c)
			? c
			: `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
	}
	return res;
}

/**
 * Every ASCII character (except `/`) and some non-ASCII ones, for checking encoders against {@link sigV4UriEncode}.
 */
export const sweepChars = [
	...Array.from({ length: 128 }, (_, i) => String.fromCharCode(i)),
	"Ð",
	"ø",
	"á",
	"ß",
	"你",
	"😀",
].filter(c => c !== "/");

const hmac = (key: string | Buffer, data: string) =>
	createHmac("sha256", key).update(data).digest();

function canonicalUri(url: URL): string {
	return url.pathname
		.split("/")
		.map(segment => sigV4UriEncode(decodeURIComponent(segment)))
		.join("/");
}

function canonicalQuery(url: URL): string {
	return [...url.searchParams]
		.filter(([name]) => name !== "X-Amz-Signature")
		.map(([name, value]) => [sigV4UriEncode(name), sigV4UriEncode(value)])
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([name, value]) => `${name}=${value}`)
		.join("&");
}

function sign(
	canonicalRequest: string,
	dateTime: string,
	credentialScope: string,
	secretAccessKey: string,
): string {
	const [date, region, service] = credentialScope.split("/");
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		dateTime,
		credentialScope,
		createHash("sha256").update(canonicalRequest).digest("hex"),
	].join("\n");

	const signingKey = hmac(
		hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), service),
		"aws4_request",
	);
	return hmac(signingKey, stringToSign).toString("hex");
}

/**
 * Computes the signature the server expects for a presigned URL (only `host` signed, unsigned payload).
 * @returns The expected signature and the one the URL was signed with.
 */
export function computePresignedUrlSignature(
	presignedUrl: string,
	method: string,
	secretAccessKey: string,
): { expected: string; actual: string } {
	const url = new URL(presignedUrl);

	const canonicalRequest = [
		method,
		canonicalUri(url),
		canonicalQuery(url),
		`host:${url.host}\n`,
		"host",
		"UNSIGNED-PAYLOAD",
	].join("\n");

	const credential = url.searchParams.get("X-Amz-Credential") ?? "";
	const credentialScope = credential.substring(credential.indexOf("/") + 1);
	return {
		expected: sign(
			canonicalRequest,
			url.searchParams.get("X-Amz-Date") ?? "",
			credentialScope,
			secretAccessKey,
		),
		actual: url.searchParams.get("X-Amz-Signature") ?? "",
	};
}

/**
 * Computes the signature the server expects for a request signed with an `authorization` header.
 * @returns The expected signature and the one the request was sent with.
 */
export function computeAuthorizationHeaderSignature(
	requestUrl: string,
	method: string,
	headers: Record<string, string>,
	secretAccessKey: string,
): { expected: string; actual: string } {
	const url = new URL(requestUrl);
	const lowerCaseHeaders = Object.fromEntries(
		Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
	);

	const authorization = lowerCaseHeaders.authorization ?? "";
	const match =
		/^AWS4-HMAC-SHA256 Credential=[^/]+\/([^,]+), ?SignedHeaders=([^,]+), ?Signature=([0-9a-f]+)$/.exec(
			authorization,
		);
	if (!match) {
		throw new Error(`Unexpected authorization header: ${authorization}`);
	}
	const [, credentialScope, signedHeaders, actual] = match;

	const canonicalHeaders = signedHeaders
		.split(";")
		.map(name => `${name}:${(name === "host" ? url.host : lowerCaseHeaders[name]).trim()}\n`)
		.join("");

	const canonicalRequest = [
		method,
		canonicalUri(url),
		canonicalQuery(url),
		canonicalHeaders,
		signedHeaders,
		lowerCaseHeaders["x-amz-content-sha256"],
	].join("\n");

	return {
		expected: sign(
			canonicalRequest,
			lowerCaseHeaders["x-amz-date"],
			credentialScope,
			secretAccessKey,
		),
		actual,
	};
}
