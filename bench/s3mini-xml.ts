// parser taken from s3mini (MIT-licensed):
// https://github.com/good-lly/s3mini
// only here to get a comparison for benchmarking

type XmlValue = string | XmlMap | boolean | number | null;
interface XmlMap {
	[key: string]: XmlValue | XmlValue[]; // one or many children
	[key: number]: XmlValue | XmlValue[]; // allow numeric keys
}

const entityMap = {
	"&quot;": '"',
	"&apos;": "'",
	"&lt;": "<",
	"&gt;": ">",
	"&amp;": "&",
} as const;

const unescapeXml = (value: string): string =>
	value.replace(
		/&(quot|apos|lt|gt|amp);/g,
		m => entityMap[m as keyof typeof entityMap] ?? m,
	);

export const parseXml = (input: string): XmlValue => {
	const xmlContent = input.replace(/<\?xml[^?]*\?>\s*/, "");
	const RE_TAG = /<([A-Za-z_][\w\-.]*)[^>]*>([\s\S]*?)<\/\1>/gm;
	const result: XmlMap = {}; // strong type, no `any`
	let match: RegExpExecArray | null;

	// biome-ignore lint/suspicious/noAssignInExpressions: :shrug:
	while ((match = RE_TAG.exec(xmlContent)) !== null) {
		const tagName = match[1];
		const innerContent = match[2];
		const node: XmlValue = innerContent
			? parseXml(innerContent)
			: unescapeXml(innerContent?.trim() || "");
		if (!tagName) {
			continue;
		}
		const current = result[tagName];
		if (current === undefined) {
			// First occurrence
			result[tagName] = node;
		} else if (Array.isArray(current)) {
			// Already an array
			current.push(node);
		} else {
			// Promote to array on the second occurrence
			result[tagName] = [current, node];
		}
	}

	// No child tags? — return the text, after entity decode
	return Object.keys(result).length > 0
		? result
		: unescapeXml(xmlContent.trim());
};
