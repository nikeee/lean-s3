declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B };
export type Branded<T, B> = T & Brand<B>;

export type AccessKeyId = Branded<string, "AccessKeyId">;
export type SecretAccessKey = Branded<string, "SecretAccessKey">;
export type BucketName = Branded<string, "BucketName">;
export type ObjectKey = Branded<string, "ObjectKey">;
export type Endpoint = Branded<string, "Endpoint">;
export type Region = Branded<string, "Region">;

export function ensureValidBucketName(bucket: string): BucketName {
	if (typeof bucket !== "string") {
		throw new TypeError("`bucket` is required and must be a `string`.");
	}

	if (bucket.length < 3 || bucket.length > 63) {
		throw new Error("`bucket` must be between 3 and 63 characters long.");
	}

	if (bucket.startsWith(".") || bucket.endsWith(".")) {
		throw new Error("`bucket` must not start or end with a period (.)");
	}

	if (!/^[a-z0-9.-]+$/.test(bucket)) {
		throw new Error(
			"`bucket` can only contain lowercase letters, numbers, periods (.), and hyphens (-).",
		);
	}

	if (bucket.includes("..")) {
		throw new Error("`bucket` must not contain two adjacent periods (..)");
	}
	return bucket as BucketName;
}

export function ensureValidAccessKeyId(accessKeyId: string): AccessKeyId {
	if (typeof accessKeyId !== "string") {
		throw new TypeError("`AccessKeyId` is required and must be a `string`.");
	}
	if (accessKeyId.length < 1) {
		throw new RangeError("`AccessKeyId` must be at least 1 character long.");
	}
	return accessKeyId as AccessKeyId;
}

export function ensureValidSecretAccessKey(
	secretAccessKey: string,
): SecretAccessKey {
	if (typeof secretAccessKey !== "string") {
		throw new TypeError(
			"`SecretAccessKey` is required and must be a `string`.",
		);
	}
	if (secretAccessKey.length < 1) {
		throw new RangeError(
			"`SecretAccessKey` must be at least 1 character long.",
		);
	}
	return secretAccessKey as SecretAccessKey;
}

export function ensureValidPath(path: string): ObjectKey {
	if (typeof path !== "string") {
		throw new TypeError("`path` is required and must be a `string`.");
	}
	if (path.length < 1) {
		throw new RangeError("`path` must be at least 1 character long.");
	}
	return path as ObjectKey;
}

export function ensureValidEndpoint(endpoint: unknown): Endpoint {
	if (typeof endpoint !== "string") {
		throw new TypeError("`endpoint` is required and must be a `string`.");
	}
	if (endpoint.length < 1) {
		throw new RangeError("`endpoint` must be at least 1 character long.");
	}
	return endpoint as Endpoint;
}

export function ensureValidRegion(region: unknown): Region {
	if (typeof region !== "string") {
		throw new TypeError("`region` is required and must be a `string`.");
	}
	if (region.length < 1) {
		throw new RangeError("`region` must be at least 1 character long.");
	}
	return region as Region;
}
