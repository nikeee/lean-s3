import * as rt from "./runtime.ts";

function emitSpecParser(
	spec: ParseSpec<string> | RootSpec<string>,
	tagName: string,
	globals: Map<unknown, string>,
): string {
	if (globals.has(spec)) {
		return "";
	}

	switch (spec.type) {
		case "string":
		case "integer":
		case "boolean":
		case "date":
			return ""; // these are built-in
		case "object":
			return emitObjectParser(spec, tagName, globals);
		case "array":
			return emitSpecParser(spec.item, tagName, globals);
		case "root":
			return emitRootParser(spec, globals);
	}
}
function emitParserCall(
	spec: ParseSpec<string>,
	tagName: string,
	globals: Map<unknown, string>,
): string {
	switch (spec.type) {
		case "string":
			return `(parser.parseStringTag(${asLiteral(tagName)})${spec.emptyIsAbsent ? " || undefined" : ""})`;
		case "integer":
			return `parser.parseIntegerTag(${asLiteral(tagName)})`;
		case "boolean":
			return `parser.parseBooleanTag(${asLiteral(tagName)})`;
		case "date":
			return `parser.parseDateTag(${asLiteral(tagName)})`;
		case "object":
			return `${globals.get(spec)}(parser)`;
		case "array":
			return ""; // arrays handled differently
	}
}

function emitChildParsers(
	spec: RootSpec<string> | ObjectSpec<string>,
	globals: Map<unknown, string>,
): string {
	let code = "";
	for (const [childName, childSpec] of Object.entries(spec.children)) {
		const childTagName = childSpec.tagName ?? childName;
		code += emitSpecParser(childSpec, childTagName, globals);
	}
	return code;
}

function emitChildFieldInit(children: Record<string, ParseSpec<string>>) {
	return Object.entries(children)
		.map(
			([n, childSpec]) =>
				`${n}: ${
					childSpec.type === "array" && childSpec.defaultEmpty
						? "[]"
						: childSpec.type === "boolean" &&
								typeof childSpec.defaultValue === "boolean" &&
								!childSpec.optional
							? childSpec.defaultValue.toString()
							: childSpec.type === "string" &&
									typeof childSpec.defaultValue === "string" &&
									!childSpec.optional
								? childSpec.defaultValue
								: childSpec.type === "integer" &&
										typeof childSpec.defaultValue === "number" &&
										!childSpec.optional
									? childSpec.defaultValue.toString()
									: childSpec.type === "date" &&
											childSpec.defaultValue instanceof Date &&
											!childSpec.optional
										? `new Date("${childSpec.defaultValue.toISOString()}")`
										: "undefined"
				},`,
		)
		.join("\n\t\t");
}

function emitResultAssignment(
	resultField: string,
	spec: ParseSpec<string>,
	fieldName: string,
	globals: Map<unknown, string>,
) {
	return spec.type === "array"
		? spec.defaultEmpty
			? `${resultField}.${fieldName}.push(${emitParserCall(spec.item, spec.tagName ?? fieldName, globals)})`
			: `(${resultField}.${fieldName} ??= []).push(${emitParserCall(spec.item, spec.tagName ?? fieldName, globals)})`
		: `${resultField}.${fieldName} = ${emitParserCall(spec, spec.tagName ?? fieldName, globals)}`;
}

function emitObjectParser(
	spec: ObjectSpec<string>,
	tagName: string,
	globals: Map<unknown, string>,
): string {
	const parseFn = `fn_${globals.size}_${tagName}`;
	globals.set(spec, parseFn);

	const { children } = spec;

	return `
${emitChildParsers(spec, globals)}
/** @param {rt.Parser} parser */
function ${parseFn}(parser) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		${emitChildFieldInit(children)}
	};

	parser.parseIdentifier(${asLiteral(tagName)});
	parser.skipAttributesUntilTagEnd();

	if (parser.token === ${rt.TokenKind.endSelfClosing} /* TokenKind.endSelfClosing */) {
		parser.nextToken();
		${emitObjectInvariants(children).join("\n\t\t\t\t")}
		return res;
	}

	parser.parseExpected(${rt.TokenKind.endTag} /* TokenKind.endTag */);

	while (true) {
		switch (parser.token) {
			case ${rt.TokenKind.startClosingTag} /* TokenKind.startClosingTag */:
				parser.nextToken(); // consume TokenKind.startClosingTag

				parser.parseIdentifier(${asLiteral(tagName)});
				parser.parseExpected(${rt.TokenKind.endTag} /* TokenKind.endTag */);
				${emitObjectInvariants(children).join("\n\t\t\t\t")}
				return res;
			case ${rt.TokenKind.eof}:
				throw new Error(\`Unterminated tag: "${tagName}"\`);
			${
				Object.keys(children).length > 0
					? `
			case ${rt.TokenKind.startTag}: {
				parser.nextToken(); // consume TokenKind.startTag

				switch (parser.scanner.getTokenValueEncoded()) {
					${Object.entries(children)
						.map(
							([name, childSpec]) =>
								`case ${asLiteral(childSpec.tagName ?? name)}:
						${emitResultAssignment("res", childSpec, name, globals)};
						break;`,
						)
						.join("\n\t\t\t\t\t")}
					default:
						throw new Error(\`Unexpected tag identifier: \${parser.scanner.getTokenValueEncoded()}\`);
				}
				break;
			}
			`
					: ""
			}
			default:
				throw new Error(\`Unhandled token kind: \${parser.token}\`);
		}
	}
}
`.trimStart();
}

function emitRootParser(
	spec: RootSpec<string>,
	globals: Map<unknown, string>,
): string {
	const parseFn = `root_parse_fn_${globals.size}`;
	globals.set(spec, parseFn);

	const { children } = spec;

	return `
${emitChildParsers(spec, globals)}
/** @param {rt.Parser} parser */
function ${parseFn}(parser) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		${emitChildFieldInit(children)}
	};

	while (true) {
		switch (parser.token) {
			case ${rt.TokenKind.eof} /* TokenKind.eof */:
				${emitObjectInvariants(children).join("\n\t\t\t\t")}
				return res;
			${
				Object.keys(children).length > 0
					? `
			case ${rt.TokenKind.startTag} /* TokenKind.startTag */: {
				parser.nextToken(); // consume TokenKind.startTag

				switch (parser.scanner.getTokenValueEncoded()) {
					${Object.entries(children)
						.map(
							([name, childSpec]) =>
								`case ${asLiteral(childSpec.tagName ?? name)}:
						${emitResultAssignment("res", childSpec, name, globals)};
						break;`,
						)
						.join("\n\t\t\t\t\t")}
					default:
						throw new Error(\`Unexpected tag identifier: \${parser.scanner.getTokenValueEncoded()}\`);
				}
				break;
			}
			`
					: ""
			}
			default:
				throw new Error(\`Unhandled token kind: \${parser.token}\`);
		}
	}
}
`.trimStart();
}

function emitObjectInvariants(
	children: (ObjectSpec<string> | RootSpec<string>)["children"],
): string[] {
	return Object.entries(children)
		.map(([name, childSpec]) =>
			childSpec.optional ||
			(childSpec.type === "array" && childSpec.defaultEmpty)
				? undefined
				: `if (res.${name} === undefined) throw new TypeError(\`Value for field "${name}" was required but not present (expected as tag name "${childSpec.tagName ?? name}").\`);`,
		)
		.filter(s => s !== undefined);
}

function asLiteral(value: string): string {
	return `"${value}"`; // TODO: Escaping
}
function _asIdentifier(value: string): string {
	return value; // TODO: Escaping
}

type ParseSpec<T extends string> =
	| ObjectSpec<T>
	| ArraySpec<T>
	| StringSpec
	| BooleanSpec
	| IntegerSpec
	| DateSpec;

type RootSpec<T extends string> = {
	type: "root";
	// tagName: string;
	optional?: boolean;
	children: Record<T, ParseSpec<string>>;
};
type ObjectSpec<T extends string> = {
	type: "object";
	tagName?: string;
	optional?: boolean;
	children: Record<T, ParseSpec<string>>;
};
type ArraySpec<T extends string> = {
	type: "array";
	tagName?: string;
	optional?: boolean;
	defaultEmpty?: boolean;
	item: ParseSpec<T>;
};
type StringSpec = {
	type: "string";
	tagName?: string;
	optional?: boolean;
	defaultValue?: string;
	emptyIsAbsent?: boolean;
};
type BooleanSpec = {
	type: "boolean";
	tagName?: string;
	optional?: boolean;
	defaultValue?: boolean;
};
type IntegerSpec = {
	type: "integer";
	tagName?: string;
	optional?: boolean;
	defaultValue?: number;
};
type DateSpec = {
	type: "date";
	tagName?: string;
	optional?: boolean;
	defaultValue?: Date;
};

/*
type ParsedRoot<V extends Record<string, ParseSpec<string>>, T extends RootSpec<V>> = {
	[k in keyof T["children"]]: ParsedType<T["children"][k]>;
};

type ParsedObject<V extends Record<string, ParseSpec<string>>, T extends ObjectSpec<V>> = {
	[k in keyof T["children"]]: ParsedType<T["children"][k]>;
};

type ParsedType<T extends ParseSpec<string>> = T extends StringSpec
	? string
	: T extends BooleanSpec
		? boolean
		: T extends IntegerSpec
			? number
			: T extends DateSpec
				? Date
				: T extends ObjectSpec<infer U>
					? ParsedObject<U , ObjectSpec<U>>
					: never;

function buildParser<T extends Record<string, ParseSpec<string>>, V extends T>(
	rootSpec: RootSpec<T>,
): Parser<ParsedRoot<T, RootSpec<V>>> {
	throw new Error("Not implemented");
}
*/

type Parser<T> = (text: string) => T;

export function buildStaticParserSource<T extends string>(
	rootSpec: RootSpec<T>,
): string {
	const globals = new Map();
	const parsingCode = emitSpecParser(rootSpec, "", globals);
	const rootParseFunctionName = globals.get(rootSpec);
	globals.clear(); // make sure we clear all references (even though this map won't survive past this function)

	return `
import * as rt from "./runtime.ts";
${parsingCode}
export default (text)  => ${rootParseFunctionName}(new rt.Parser(text));
`.trimStart();
}

export function buildStaticParserSourceWithText<T extends string>(
	rootSpec: RootSpec<T>,
	text: string,
): string {
	const globals = new Map();
	const parsingCode = emitSpecParser(rootSpec, "", globals);
	const rootParseFunctionName = globals.get(rootSpec);
	globals.clear(); // make sure we clear all references (even though this map won't survive past this function)

	return `
import * as rt from "./runtime.ts";
${parsingCode}
${rootParseFunctionName}(new rt.Parser(\`${text}\`))
`.trimStart();
}

export function buildParser<T extends string>(
	rootSpec: RootSpec<T>,
): Parser<unknown> {
	const globals = new Map();
	const parsingCode = emitSpecParser(rootSpec, "", globals);
	const rootParseFunctionName = globals.get(rootSpec);
	globals.clear(); // make sure we clear all references (even though this map won't survive past this function)

	return new Function(
		"rt",
		`
return (() => {
${parsingCode}

return (text)  => ${rootParseFunctionName}(new rt.Parser(text));
})()
`.trim(),
	)(rt) as Parser<unknown>;
}
