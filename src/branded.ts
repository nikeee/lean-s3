declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B };
export type Branded<T, B> = T & Brand<B>;

export type BucketName = Branded<string, "BucketName">;
export type ObjectKey = Branded<string, "ObjectKey">;
export type Endpoint = Branded<string, "Endpoint">;
export type Region = Branded<string, "Region">;

export function ensureValidBucketName(name: string): BucketName {
	if (name.length < 3 || name.length > 63) {
		throw new Error("`name` must be between 3 and 63 characters long.");
	}

	if (name.startsWith(".") || name.endsWith(".")) {
		throw new Error("`name` must not start or end with a period (.)");
	}

	if (!/^[a-z0-9.-]+$/.test(name)) {
		throw new Error(
			"`name` can only contain lowercase letters, numbers, periods (.), and hyphens (-).",
		);
	}

	if (name.includes("..")) {
		throw new Error("`name` must not contain two adjacent periods (..)");
	}
	return name as BucketName;
}

export function ensureValidPath(path: string): ObjectKey {
	if (typeof path !== "string") {
		throw new TypeError("`path` must be a `string`.");
	}
	if (path.length < 1) {
		throw new RangeError("`path` must be at least 1 character long.");
	}
	return path as ObjectKey;
}

export function ensureValidEndpoint(endpoint: string): Endpoint {
	if (typeof endpoint !== "string") {
		throw new TypeError("`endpoint` must be a `string`.");
	}
	if (endpoint.length < 1) {
		throw new RangeError("`endpoint` must be at least 1 character long.");
	}
	return endpoint as Endpoint;
}

export function ensureValidRegion(region: string): Region {
	if (typeof region !== "string") {
		throw new TypeError("`region` must be a `string`.");
	}
	if (region.length < 1) {
		throw new RangeError("`region` must be at least 1 character long.");
	}
	return region as Region;
}
