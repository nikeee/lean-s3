// @ts-check

import { describe, test } from "node:test";
import { expect } from "expect";

import { buildRequestUrl } from "./url.js";

describe("buildRequestUrl", () => {
	test("aws", () => {
		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com",
				"mybucket",
				"us-west-1",
				"object.json",
			),
		).toStrictEqual(
			new URL("https://mybucket.s3.us-west-1.amazonaws.com/object.json"),
		);

		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com",
				"mybucket",
				"us-west-1",
				"/object.json",
			),
		).toStrictEqual(
			new URL("https://mybucket.s3.us-west-1.amazonaws.com/object.json"),
		);

		expect(
			buildRequestUrl(
				"https://{bucket}.s3.us-west-1.amazonaws.com",
				"mybucket",
				"us-west-1",
				"/object.json",
			),
		).toStrictEqual(
			new URL("https://mybucket.s3.us-west-1.amazonaws.com/object.json"),
		);

		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com/",
				"/mybucket/",
				"us-west-1",
				"/object.json",
			),
		).toStrictEqual(
			new URL("https://mybucket.s3.us-west-1.amazonaws.com/object.json"),
		);

		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com/",
				"/mybucket/",
				"eu-west-1",
				"object.json",
			),
		).toStrictEqual(
			new URL("https://mybucket.s3.eu-west-1.amazonaws.com/object.json"),
		);
	});

	test("r2", () => {
		expect(
			buildRequestUrl(
				"https://my-account-id.r2.cloudflarestorage.com",
				"/mybucket/",
				"auto",
				"object.json",
			),
		).toStrictEqual(
			new URL(
				"https://my-account-id.r2.cloudflarestorage.com/mybucket/object.json",
			),
		);

		expect(
			buildRequestUrl(
				"https://my-account-id.r2.cloudflarestorage.com/",
				"mybucket",
				"auto",
				"object.json",
			),
		).toStrictEqual(
			new URL(
				"https://my-account-id.r2.cloudflarestorage.com/mybucket/object.json",
			),
		);

		expect(
			buildRequestUrl(
				"https://my-account-id.eu.r2.cloudflarestorage.com/",
				"mybucket",
				"auto",
				"object.json",
			),
		).toStrictEqual(
			new URL(
				"https://my-account-id.eu.r2.cloudflarestorage.com/mybucket/object.json",
			),
		);

		expect(
			buildRequestUrl(
				"https://{bucket}.my-account-id.r2.cloudflarestorage.com",
				"mybucket",
				"auto",
				"object.json",
			),
		).toStrictEqual(
			new URL(
				"https://mybucket.my-account-id.r2.cloudflarestorage.com/object.json",
			),
		);
	});

	test("hetzner", () => {
		expect(
			buildRequestUrl(
				"https://fsn1.your-objectstorage.com",
				"mybucket",
				"auto",
				"object.json",
			),
		).toStrictEqual(
			new URL("https://fsn1.your-objectstorage.com/mybucket/object.json"),
		);
	});
});
