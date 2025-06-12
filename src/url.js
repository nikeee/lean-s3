/**
 * @param {string} endpoint
 * @param {string} bucket
 * @param {string} region
 * @param {string} path
 * @returns {URL}
 */
export function buildRequestUrl(endpoint, bucket, region, path) {
	const normalizedBucket = normalizePath(bucket);

	const [endpointWithBucketAndRegion, replacedBucket] =
		replaceDomainPlaceholders(endpoint, normalizedBucket, region);

	const result = new URL(endpointWithBucketAndRegion);

	const pathPrefix = result.pathname.endsWith("/")
		? result.pathname
		: `${result.pathname}/`;

	const pathSuffix = replacedBucket
		? normalizePath(path)
		: `${normalizedBucket}/${normalizePath(path)}`;

	result.pathname = pathPrefix + pathSuffix;

	return result;
}

/**
 * @param {string} endpoint
 * @param {string} bucket
 * @param {string} region
 * @returns {[endpoint: string, replacedBucket: boolean]}
 */
function replaceDomainPlaceholders(endpoint, bucket, region) {
	const replacedBucket = endpoint.includes("{bucket}");
	return [
		endpoint.replaceAll("{bucket}", bucket).replaceAll("{region}", region),
		replacedBucket,
	];
}

/**
 * Removes trailing and leading slashes.
 * @param {string} path
 * @returns {string}
 */
function normalizePath(path) {
	const start = path[0] === "/" ? 1 : 0;
	const end = path[path.length - 1] === "/" ? path.length - 1 : path.length;
	return path.substring(start, end);
}

/**
 * Sorts headers alphabetically. Removes headers that are undefined/null.
 *
 * `http.request` doesn't allow passing `undefined` as header values (despite the types allowing it),
 * so we have to filter afterwards.
 *
 * @param {Record<string, string | undefined>} unfilteredHeadersUnsorted
 * @returns {Record<string, string>}
 */
export function prepareHeadersForSigning(unfilteredHeadersUnsorted) {
	/** @type {Record<string, string>} */
	const result = {};

	// TODO: `Object.keys(headersUnsorted).sort()` is constant in our case,
	// maybe we want to move this somewhere else to avoid sorting every time

	for (const header of Object.keys(unfilteredHeadersUnsorted).sort()) {
		const v = unfilteredHeadersUnsorted[header];
		if (v !== undefined && v !== null) {
			result[header] = v;
		}
	}
	return result;
}

/**
 * @param {number | undefined} start
 * @param {number | undefined} endExclusive
 * @returns {string | undefined}
 */
export function getRangeHeader(start, endExclusive) {
	return typeof start === "number" || typeof endExclusive === "number"
		? // Http-ranges are end-inclusive, we are exclusiv ein our slice
			`bytes=${start ?? 0}-${typeof endExclusive === "number" ? endExclusive - 1 : ""}`
		: undefined;
}
