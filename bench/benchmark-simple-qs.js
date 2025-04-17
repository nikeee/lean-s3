//@ts-check
import * as mitata from "mitata";

/**
 * @module Case study whether to use URLSearchParams or manual string concat for simple search params.
 */

mitata.summary(() => {
	const options = {
		prefix: "/",
		maxKeys: 100,
	};

	mitata
		.bench("URLSearchParams", async () => {
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
		})
		.gc("once");

	mitata
		.bench("string concat", async () => {
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
		})
		.gc("once");

	mitata
		.bench("string concat with template", async () => {
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
		.gc("once");
});

await mitata.run();
