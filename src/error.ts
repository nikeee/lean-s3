import type { Dispatcher } from "undici";
import { XMLParser } from "fast-xml-parser";

import S3Error from "./S3Error.ts";

const xmlParser = new XMLParser();

export async function getResponseError(
	response: Dispatcher.ResponseData<unknown>,
	path: string,
): Promise<S3Error> {
	let body = undefined;
	try {
		body = await response.body.text();
	} catch (cause) {
		return new S3Error("Unknown", path, {
			message: "Could not read response body.",
			cause,
		});
	}

	if (response.headers["content-type"] === "application/xml") {
		return parseAndGetXmlError(body, path);
	}

	return new S3Error("Unknown", path, {
		message: "Unknown error during S3 request.",
	});
}

export function fromStatusCode(
	code: number,
	path: string,
): S3Error | undefined {
	switch (code) {
		case 404:
			return new S3Error("NoSuchKey", path, {
				message: "The specified key does not exist.",
			});
		case 403:
			return new S3Error("AccessDenied", path, {
				message: "Access denied to the file.",
			});
		// TODO: Add more status codes as needed
		default:
			return undefined;
	}
}

function parseAndGetXmlError(body: string, path: string): S3Error {
	let error = undefined;
	try {
		error = xmlParser.parse(body);
	} catch (cause) {
		return new S3Error("Unknown", path, {
			message: "Could not parse XML error response.",
			cause,
		});
	}

	if (error.Error) {
		const e = error.Error;
		return new S3Error(e.Code || "Unknown", path, {
			message: e.Message || undefined, // Message might be "",
		});
	}

	return new S3Error(error.Code || "Unknown", path, {
		message: error.Message || undefined, // Message might be "",
	});
}
