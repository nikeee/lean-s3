import { describe, test } from "node:test";
import { expect } from "expect";

import { buildRequestUrl } from "./url.ts";
import { encodeObjectKey } from "./encode.ts";
import type { BucketName, Endpoint, ObjectKey, Region } from "./branded.ts";
import { sweepChars } from "./test/sigv4.ts";

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

	void test("trailing slash is kept (directory marker keys)", () => {
		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"folder/" as ObjectKey,
			),
		).toStrictEqual(new URL("https://mybucket.s3.us-west-1.amazonaws.com/folder/"));
	});

	void test("literal percent is escaped", () => {
		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"file 100%.txt" as ObjectKey,
			),
		).toStrictEqual(new URL("https://mybucket.s3.us-west-1.amazonaws.com/file%20100%25.txt"));

		// keys are taken literally, "%41" is not decoded to "A"
		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"%41.txt" as ObjectKey,
			),
		).toStrictEqual(new URL("https://mybucket.s3.us-west-1.amazonaws.com/%2541.txt"));
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

	void test("reserved characters are percent-encoded as required by SigV4", () => {
		// The URL parser's path percent-encode set leaves these raw, the server would compute a different signature
		expect(
			buildRequestUrl(
				"https://s3.example.com" as Endpoint,
				"mybucket" as BucketName,
				"auto" as Region,
				"docs/invoice[2] !$&;=@|.pdf" as ObjectKey,
			).pathname,
		).toBe("/mybucket/docs/invoice%5B2%5D%20%21%24%26%3B%3D%40%7C.pdf");
	});

	void test("characters the URL parser would rewrite are percent-encoded", () => {
		// the URL parser removes tabs/newlines and turns "\" into "/", which would address a different key
		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"a\\b\tc\nd\re.txt" as ObjectKey,
			).pathname,
		).toBe("/a%5Cb%09c%0Ad%0De.txt");
	});

	void test("non-ASCII characters are UTF-8 percent-encoded", () => {
		expect(
			buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				"Ðøá/😀.txt" as ObjectKey,
			).pathname,
		).toBe("/%C3%90%C3%B8%C3%A1/%F0%9F%98%80.txt");
	});

	void test("endpoint path is kept", () => {
		expect(
			buildRequestUrl(
				"https://example.com/some/prefix/" as Endpoint,
				"mybucket" as BucketName,
				"auto" as Region,
				"a[1].txt" as ObjectKey,
			).pathname,
		).toBe("/some/prefix/mybucket/a%5B1%5D.txt");
	});

	void test("path is sent as encoded and decodes back to the original key", () => {
		for (const c of sweepChars) {
			const key = `folder/a${c}b/${c}.txt`;
			const url = buildRequestUrl(
				"https://{bucket}.s3.{region}.amazonaws.com" as Endpoint,
				"mybucket" as BucketName,
				"us-west-1" as Region,
				key as ObjectKey,
			);
			// not re-encoded or rewritten by the URL parser
			expect({ c, pathname: url.pathname }).toStrictEqual({
				c,
				pathname: `/${encodeObjectKey(key)}`,
			});
			expect({ c, decoded: decodeURIComponent(url.pathname.substring(1)) }).toStrictEqual({
				c,
				decoded: key,
			});
		}
	});
});
