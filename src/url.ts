import type { BucketName, Endpoint, ObjectKey, Region } from "./branded.ts";

export function buildRequestUrl(
	endpoint: Endpoint,
	bucket: BucketName,
	region: Region,
	path: ObjectKey,
): URL {
	const normalizedBucket = normalizePath(bucket) as BucketName;

	const [endpointWithBucketAndRegion, replacedBucket] =
		replaceDomainPlaceholders(endpoint, normalizedBucket, region);

	const result = new URL(endpointWithBucketAndRegion);

	const pathPrefix = result.pathname.endsWith("/")
		? result.pathname
		: `${result.pathname}/`;

	const pathSuffix = replacedBucket
		? normalizePath(path)
		: `${normalizedBucket}/${normalizePath(path)}`;

	result.pathname =
		pathPrefix +
		pathSuffix
			.replaceAll(":", "%3A") // See: https://github.com/nikeee/lean-s3/issues/61
			.replaceAll("+", "%2B")
			.replaceAll("(", "%28")
			.replaceAll(")", "%29")
			.replaceAll(",", "%2C")
			.replaceAll("'", "%27")
			.replaceAll("*", "%2A");

	return result;
}

function replaceDomainPlaceholders(
	endpoint: Endpoint,
	bucket: BucketName,
	region: Region,
): [endpoint: string, replacedBucket: boolean] {
	const replacedBucket = endpoint.includes("{bucket}");
	return [
		endpoint.replaceAll("{bucket}", bucket).replaceAll("{region}", region),
		replacedBucket,
	];
}

/**
 * Removes trailing and leading slash.
 */
function normalizePath(path: string): string {
	const start = path[0] === "/" ? 1 : 0;
	const end = path[path.length - 1] === "/" ? path.length - 1 : path.length;
	return path.substring(start, end);
}

/**
 * Sorts headers alphabetically. Removes headers that are undefined/null.
 *
 * `http.request` doesn't allow passing `undefined` as header values (despite the types allowing it),
 * so we have to filter afterwards.
 */
export function prepareHeadersForSigning(
	unfilteredHeadersUnsorted: Record<string, string | undefined>,
): Record<string, string> {
	const result: Record<string, string> = {};

	for (const header of Object.keys(unfilteredHeadersUnsorted).sort()) {
		const v = unfilteredHeadersUnsorted[header];
		if (v !== undefined && v !== null) {
			result[header] = v;
		}
	}
	return result;
}

export function getRangeHeader(
	start: number | undefined,
	endExclusive: number | undefined,
): string | undefined {
	return typeof start === "number" || typeof endExclusive === "number"
		? // Http-ranges are end-inclusive, we are exclusiv ein our slice
			`bytes=${start ?? 0}-${typeof endExclusive === "number" ? endExclusive - 1 : ""}`
		: undefined;
}
