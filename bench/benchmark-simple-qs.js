//@ts-check
import { summary, group, bench, run } from "mitata";

/**
 * @module Case study whether to use URLSearchParams or manual string concat for simple search params.
 */

summary(() => {
	group(() => {
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
			// We tried to make these query params entirely lower-cased, just like the headers
			// but Cloudflare R2 requires them to have this exact casing

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
			// We tried to make these query params entirely lower-cased, just like the headers
			// but Cloudflare R2 requires them to have this exact casing

			// We didn't have any issues with them being in non-alphaetical order, but as some implementations decide to require sorting
			// in non-pre-signed cases, we do it here as well

			// See `benchmark-simple-qs.js` on why we don't use URLSearchParams but string concat

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

		bench("URLSearchParams", async () => {
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

		bench("string concat", async () => {
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
		});
	});

	group(() => {
		const options = {
			prefix: "/",
			maxKeys: 100,
		};

		bench("URLSearchParams", async () => {
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

		bench("string concat", async () => {
			let s = "list-type=2";

			if (options.prefix) {
				// biome-ignore lint/style/useTemplate: <explanation>
				s += "&prefix=" + encodeURIComponent(options.prefix);
			}
			if (options.startAfter) {
				// biome-ignore lint/style/useTemplate: <explanation>
				s += "&start-after=" + encodeURIComponent(options.startAfter);
			}
			if (options.maxKeys) {
				// biome-ignore lint/style/useTemplate: <explanation>
				s += "&max-keys=" + options.maxKeys; // no encoding needed, since it's a number
			}
			if (options.continuationToken) {
				s +=
					// biome-ignore lint/style/useTemplate: <explanation>
					"&continuation-token=" +
					encodeURIComponent(options.continuationToken);
			}
			const _ = s;
		}).gc("once");

		bench("string concat with template", async () => {
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
		}).gc("once");
	});
});

await run();
