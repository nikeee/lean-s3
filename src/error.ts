import type { Dispatcher } from "undici";
import { XMLParser } from "fast-xml-parser";

import S3Error from "./S3Error.ts";

// never coerce tag values, message contents could look numeric
const xmlParser = new XMLParser({ parseTagValue: false });

export async function getResponseError(
	response: Dispatcher.ResponseData<unknown>,
	path: string,
): Promise<S3Error> {
	// biome-ignore lint/suspicious/noExplicitAny: :shrug:
	let body: any;
	try {
		body = await response.body.text();
	} catch (cause) {
		return new S3Error("Unknown", path, {
			message: "Could not read response body.",
			status: response.statusCode,
			cause,
		});
	}

	// includes() instead of ===: providers append parameters like "; charset=utf-8"
	if (String(response.headers["content-type"] ?? "").includes("xml")) {
		return parseAndGetXmlError(body, path, response.statusCode);
	}

	return new S3Error("Unknown", path, {
		message: "Unknown error during S3 request.",
		status: response.statusCode,
	});
}

export function fromStatusCode(code: number, path: string): S3Error | undefined {
	switch (code) {
		case 404:
			return new S3Error("NoSuchKey", path, {
				message: "The specified key does not exist.",
				status: code,
			});
		case 403:
			return new S3Error("AccessDenied", path, {
				message: "Access denied to the key.",
				status: code,
			});
		// TODO: Add more status codes as needed
		default:
			return undefined;
	}
}

function parseAndGetXmlError(body: string, path: string, status: number): S3Error {
	// biome-ignore lint/suspicious/noExplicitAny: :shrug:
	let error: any;
	try {
		error = xmlParser.parse(body);
	} catch (cause) {
		return new S3Error("Unknown", path, {
			message: "Could not parse XML error response.",
			status,
			cause,
		});
	}

	if (error.Error) {
		const e = error.Error;
		return new S3Error(e.Code || "Unknown", path, {
			message: e.Message || undefined, // Message might be "",
			status,
		});
	}

	return new S3Error(error.Code || "Unknown", path, {
		message: error.Message || undefined, // Message might be "",
		status,
	});
}
