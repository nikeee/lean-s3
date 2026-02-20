import { describe, test } from "node:test";
import { expect } from "expect";

import { buildRequestUrl } from "./url.ts";
import type { BucketName, Endpoint, ObjectKey, Region } from "./branded.ts";

void describe("buildRequestUrl", () => {
	void test("aws", () => {
		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"object.json" as ObjectKey,
			),
		).toStrictEqual(new URL("https://mybucket.s3.us-west-1.amazonaws.com/object.json"));

		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"/object.json" as ObjectKey,
			),
		).toStrictEqual(new URL("https://mybucket.s3.us-west-1.amazonaws.com/object.json"));

		expect(
			buildRequestUrl(
				"https://{bucket}.s3.us-west-1.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"/object.json" as ObjectKey,
			),
		).toStrictEqual(new URL("https://mybucket.s3.us-west-1.amazonaws.com/object.json"));

		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com/" as Endpoint,
				"/mybucket/" as BucketName,
				"us-west-1" as Region,
				"/object.json" as ObjectKey,
			),
		).toStrictEqual(new URL("https://mybucket.s3.us-west-1.amazonaws.com/object.json"));

		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com/" as Endpoint,
				"/mybucket/" as BucketName,
				"eu-west-1" as Region,
				"object.json" as ObjectKey,
			),
		).toStrictEqual(new URL("https://mybucket.s3.eu-west-1.amazonaws.com/object.json"));
	});

	void test("r2", () => {
		expect(
			buildRequestUrl(
				"https://my-account-id.r2.cloudflarestorage.com" as Endpoint,
				"/mybucket/" as BucketName,
				"auto" as Region,
				"object.json" as ObjectKey,
			),
		).toStrictEqual(
			new URL("https://my-account-id.r2.cloudflarestorage.com/mybucket/object.json"),
		);

		expect(
			buildRequestUrl(
				"https://my-account-id.r2.cloudflarestorage.com/" as Endpoint,
				"mybucket" as BucketName,
				"auto" as Region,
				"object.json" as ObjectKey,
			),
		).toStrictEqual(
			new URL("https://my-account-id.r2.cloudflarestorage.com/mybucket/object.json"),
		);

		expect(
			buildRequestUrl(
				"https://my-account-id.eu.r2.cloudflarestorage.com/" as Endpoint,
				"mybucket" as BucketName,
				"auto" as Region,
				"object.json" as ObjectKey,
			),
		).toStrictEqual(
			new URL("https://my-account-id.eu.r2.cloudflarestorage.com/mybucket/object.json"),
		);

		expect(
			buildRequestUrl(
				"https://{bucket}.my-account-id.r2.cloudflarestorage.com" as Endpoint,
				"mybucket" as BucketName,
				"auto" as Region,
				"object.json" as ObjectKey,
			),
		).toStrictEqual(
			new URL("https://mybucket.my-account-id.r2.cloudflarestorage.com/object.json"),
		);
	});

	void test("hetzner", () => {
		expect(
			buildRequestUrl(
				"https://fsn1.your-objectstorage.com" as Endpoint,
				"mybucket" as BucketName,
				"auto" as Region,
				"object.json" as ObjectKey,
			),
		).toStrictEqual(new URL("https://fsn1.your-objectstorage.com/mybucket/object.json"));
	});

	void test("weird key", () => {
		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"weird:key+with(some)characters,that'need*escaping `.json" as ObjectKey,
			),
		).toStrictEqual(
			new URL(
				"https://mybucket.s3.us-west-1.amazonaws.com/weird%3Akey%2Bwith%28some%29characters%2Cthat%27need%2Aescaping%20%60.json",
			),
		);
	});

	void test("slashes shouldn't be escaped", () => {
		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"weird/key/with/slashes" as ObjectKey,
			),
		).toStrictEqual(
			new URL("https://mybucket.s3.us-west-1.amazonaws.com/weird/key/with/slashes"),
		);
		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"weird/key/with/slashes/:key+with(some)characters,that'need*escaping `.json" as ObjectKey,
			),
		).toStrictEqual(
			new URL(
				"https://mybucket.s3.us-west-1.amazonaws.com/weird/key/with/slashes/%3Akey%2Bwith%28some%29characters%2Cthat%27need%2Aescaping%20%60.json",
			),
		);
	});
});
