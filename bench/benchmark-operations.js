//@ts-check
import { createHash } from "node:crypto";

import { summary, group, bench, run, do_not_optimize } from "mitata";

/**
 * @module Case study whether to use URLSearchParams or manual string concat for simple search params and some other micro benchmarks to determine how we should do things.
 *
 * benchmarks marked with `.baseline(true)` are the ones that mark methods that we use in the code.
 */

summary(() => {
	group("building search params", () => {
		function buildSearchParamsURLSP(
			amzCredential,
			date,
			expiresIn,
			headerList,
			contentHashStr,
			storageClass,
			sessionToken,
			acl,
		) {
			const q = new URLSearchParams();

			if (acl) {
				q.set("X-Amz-Acl", acl);
			}

			q.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");

			if (contentHashStr) {
				q.set("X-Amz-Content-Sha256", contentHashStr);
			}

			q.set("X-Amz-Credential", amzCredential);
			q.set("X-Amz-Date", date.dateTime);
			q.set("X-Amz-Expires", expiresIn.toString());

			if (sessionToken) {
				q.set("X-Amz-Security-Token", sessionToken);
			}

			q.set("X-Amz-SignedHeaders", headerList);

			if (storageClass) {
				q.set("X-Amz-Storage-Class", storageClass);
			}
			return q;
		}

		function buildSearchParamsConcat(
			amzCredential,
			date,
			expiresIn,
			headerList,
			contentHashStr,
			storageClass,
			sessionToken,
			acl,
		) {
			let res = "";
			if (acl) {
				res += `X-Amz-Acl=${encodeURIComponent(acl)}&`;
			}

			res += "X-Amz-Algorithm=AWS4-HMAC-SHA256";

			if (contentHashStr) {
				// We assume that this is always hex-encoded, so no encoding needed
				res += `&X-Amz-Content-Sha256=${contentHashStr}`;
			}

			res += `&X-Amz-Credential=${encodeURIComponent(amzCredential)}`;
			res += `&X-Amz-Date=${date.dateTime}`; // internal dateTimes don't need encoding
			res += `&X-Amz-Expires=${expiresIn}`; // number -> no encoding

			if (sessionToken) {
				res += `&X-Amz-Security-Token=${encodeURIComponent(sessionToken)}`;
			}

			res += `&X-Amz-SignedHeaders=${encodeURIComponent(headerList)}`;

			if (storageClass) {
				res += `&X-Amz-Storage-Class=${storageClass}`;
			}
			return res;
		}

		bench("URLSearchParams", () => {
			for (let i = 0; i < 10000; ++i) {
				buildSearchParamsURLSP(
					"dsadsadfasdf",
					{ date: "20250102", dateTime: "20250102T123456Z" },
					32660,
					"host",
					undefined,
					"STANDARD",
					undefined,
					"public-read",
				);
				buildSearchParamsURLSP(
					"dsadsadfasdfsdlkfjlkdsajfkdsalkjflkjsaflksadfjlk",
					{ date: "20250102", dateTime: "20250102T123456Z" },
					32660,
					"host",
					undefined,
					undefined,
					undefined,
					"public-read",
				);
				buildSearchParamsURLSP(
					"dsasdasdadsadfasdf",
					{ date: "20250102", dateTime: "20250102T123456Z" },
					3600,
					"host",
					undefined,
					undefined,
					undefined,
					undefined,
				);
			}
		});

		bench("string concat", () => {
			for (let i = 0; i < 10000; ++i) {
				buildSearchParamsConcat(
					"dsadsadfasdf",
					{ date: "20250102", dateTime: "20250102T123456Z" },
					32660,
					"host",
					undefined,
					"STANDARD",
					undefined,
					"public-read",
				);
				buildSearchParamsConcat(
					"dsadsadfasdfsdlkfjlkdsajfkdsalkjflkjsaflksadfjlk",
					{ date: "20250102", dateTime: "20250102T123456Z" },
					32660,
					"host",
					undefined,
					undefined,
					undefined,
					"public-read",
				);
				buildSearchParamsConcat(
					"dsasdasdadsadfasdf",
					{ date: "20250102", dateTime: "20250102T123456Z" },
					3600,
					"host",
					undefined,
					undefined,
					undefined,
					undefined,
				);
			}
		}).baseline(true);
	});

	group("building search params v2", () => {
		const options = {
			prefix: "/",
			maxKeys: 100,
		};

		bench("URLSearchParams", () => {
			const q = new URLSearchParams({
				"list-type": "2",
			});
			if (options.prefix) {
				q.set("prefix", options.prefix);
			}
			if (options.startAfter) {
				q.set("start-after", options.startAfter);
			}
			if (options.maxKeys) {
				q.set("max-keys", options.maxKeys.toString());
			}
			if (options.continuationToken) {
				q.set("continuation-token", options.continuationToken);
			}
			const _ = q.toString();
		}).gc("once");

		bench("string concat", () => {
			let s = "list-type=2";

			if (options.prefix) {
				// biome-ignore lint/style/useTemplate: this is what we're benchmarking
				s += "&prefix=" + encodeURIComponent(options.prefix);
			}
			if (options.startAfter) {
				// biome-ignore lint/style/useTemplate: this is what we're benchmarking
				s += "&start-after=" + encodeURIComponent(options.startAfter);
			}
			if (options.maxKeys) {
				// biome-ignore lint/style/useTemplate: this is what we're benchmarking
				s += "&max-keys=" + options.maxKeys; // no encoding needed, since it's a number
			}
			if (options.continuationToken) {
				s +=
					"&continuation-token=" +
					encodeURIComponent(options.continuationToken);
			}
			const _ = s;
		}).gc("once");

		bench("string concat with template", () => {
			let s = "list-type=2";

			if (options.prefix) {
				s += `&prefix=${encodeURIComponent(options.prefix)}`;
			}
			if (options.startAfter) {
				s += `&start-after=${encodeURIComponent(options.startAfter)}`;
			}
			if (options.maxKeys) {
				s += `&max-keys=${options.maxKeys}`; // no encoding needed, since it's a number
			}
			if (options.continuationToken) {
				s += `&continuation-token=${encodeURIComponent(options.continuationToken)}`;
			}
			const _ = s;
		})
			.gc("once")
			.baseline(true);
	});

	group("computing sha256 of parts", () => {
		function signUpdate(method, path, query, host) {
			return createHash("sha256")
				.update(method)
				.update("\n")
				.update(path)
				.update("\n")
				.update(query)
				.update("\nhost:")
				.update(host)
				.update("\n\nhost\nUNSIGNED-PAYLOAD")
				.digest();
		}
		function signLargeString(method, path, query, host) {
			return createHash("sha256")
				.update(
					`${method}\n${path}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`,
				)
				.digest();
		}

		bench("large string", () => {
			for (let i = 0; i < 1000; ++i) {
				signLargeString(
					"GET",
					"/test.json",
					"a=b&c=d&x-amazon-whatever=public-read",
					"fsn1.your-objectstorage.com",
				);
				signLargeString(
					"PUT",
					"/some/long/pathtest.json",
					"a=b&c=d&x-amazon-whatever=private&wat=wut",
					"localhost:1337",
				);
				signLargeString(
					"DELETE",
					"/some/long/pathtest.json",
					"a=b&c=d&x-amazon-whatever=private&wat=wut",
					"localhost:1337",
				);
			}
		}).baseline(true);

		bench("consecutive update calls", () => {
			for (let i = 0; i < 1000; ++i) {
				signUpdate(
					"GET",
					"/test.json",
					"a=b&c=d&x-amazon-whatever=public-read",
					"fsn1.your-objectstorage.com",
				);
				signUpdate(
					"PUT",
					"/some/long/pathtest.json",
					"a=b&c=d&x-amazon-whatever=private&wat=wut",
					"localhost:1337",
				);
				signUpdate(
					"DELETE",
					"/some/long/pathtest.json",
					"a=b&c=d&x-amazon-whatever=private&wat=wut",
					"localhost:1337",
				);
			}
		});
	});

	group("joining strings", () => {
		const headers = [
			["host"].sort(),
			["host", "x-amz-date"].sort(),
			["host", "x-amz-date", "x-amz-content-sha256"].sort(),
			["host", "x-amz-date", "x-amz-content-sha256", "range"].sort(),
			[
				"host",
				"x-amz-date",
				"x-amz-content-sha256",
				"range",
				"content-type",
			].sort(),
			[
				"host",
				"x-amz-date",
				"x-amz-content-sha256",
				"range",
				"content-type",
				"content-length",
			].sort(),
		];

		function join(h) {
			return h.join(";");
		}

		/** @param {string[]} h */
		function concat(h) {
			let res = h.length > 0 ? h[0] : "";
			for (let i = 1; i < h.length; ++i) {
				res += `;${h[i]}`;
			}
			return res;
		}

		bench("string concat join", () => {
			for (let i = 0; i < headers.length; ++i) {
				const _ = concat(headers[i]);
			}
		}).baseline(true);

		bench("array string join", () => {
			for (let i = 0; i < headers.length; ++i) {
				const _ = join(headers[i]);
			}
		});
	});

	group("substring vs check if string is empty before append", () => {
		// Which is faster, always adding a & and substring(1) or check if we need a preceeding & on every append?

		bench("substring", () => {
			for (let i = 0; i < 1000; ++i) {
				let a = "";
				if (Math.random() > 0.5) {
					a += "&qwert=asdf";
				}
				if (Math.random() > 0.5) {
					a += "&asdsadfsadf=dsljfhsjdkfh";
				}
				if (Math.random() > 0.5) {
					a += "&kflkfdjglkfdjg=dslkfdsjf";
				}

				a += "&uploadId=12323456432";

				const _ = a.substring(1);
			}
		}).baseline(true);

		bench("conditional", () => {
			for (let i = 0; i < 1000; ++i) {
				let a = "";
				if (Math.random() > 0.5) {
					a += "&qwert=asdf";
				}
				if (Math.random() > 0.5) {
					if (a.length > 0) a += "&";
					a += "asdsadfsadf=dsljfhsjdkfh";
				}
				if (Math.random() > 0.5) {
					if (a.length > 0) a += "&";
					a += "kflkfdjglkfdjg=dslkfdsjf";
				}

				if (a.length > 0) a += "&";
				a += "uploadId=12323456432";
			}
		});

		function fnWithDefaultParam(options = {}) {
			let s = 0;
			if (options.a) {
				s += 1;
			}
			if (options.b) {
				s += 10;
			}
			if (options.c) {
				s += 100;
			}
			if (options.d) {
				s += 1000;
			}
			return s;
		}

		function fnWithOptionalParam(options) {
			let s = 0;
			if (options?.a) {
				s += 1;
			}
			if (options?.b) {
				s += 10;
			}
			if (options?.c) {
				s += 100;
			}
			if (options?.d) {
				s += 1000;
			}
			return s;
		}

		// What is faster, passing an empty object as a default or accepting undefined and use safe-navigation?
		// -> This is probably hard to benchmark and the results are pretty close -> we don't care

		group(
			"empty object as default param vs undefined param + safe navigation",
			() => {
				bench("allocation (param = {})", () => {
					for (let i = 0; i < 1000; ++i) {
						do_not_optimize(fnWithDefaultParam());
						do_not_optimize(fnWithDefaultParam({ a: true }));
						do_not_optimize(fnWithDefaultParam({ a: true, b: true }));
						do_not_optimize(fnWithDefaultParam());
						do_not_optimize(fnWithDefaultParam());
						do_not_optimize(fnWithDefaultParam());
					}
				}).baseline(true);
				bench("conditional (safe navigation, param?.value)", () => {
					for (let i = 0; i < 1000; ++i) {
						do_not_optimize(fnWithOptionalParam());
						do_not_optimize(fnWithOptionalParam({ a: true }));
						do_not_optimize(fnWithOptionalParam({ a: true, b: true }));
						do_not_optimize(fnWithOptionalParam());
						do_not_optimize(fnWithOptionalParam());
						do_not_optimize(fnWithOptionalParam());
					}
				});
			},
		);
	});
});

await run();
