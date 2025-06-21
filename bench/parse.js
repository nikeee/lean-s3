import { Scanner, tokenKind, scanExpected, skipAttributes, expectIdentifier, expectClosingTag, parseStringTag, parseDateTag, parseIntegerTag, parseBooleanTag} from "./parser-runtime.ts";

function fn_2_Initiator(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		displayName: undefined,
		id: undefined,
	};

	skipAttributes(scanner);

	do {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case tokenKind.startClosingTag: {
				expectIdentifier(scanner, "Initiator");
				scanExpected(scanner, tokenKind.endTag);
				return res;
			}
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					case "DisplayName":
						res.displayName = parseStringTag(scanner, "DisplayName");
						break;
					case "ID":
						res.id = parseStringTag(scanner, "ID");
						break;
					default:
						throw new Error(`Unexpected tag identifier: ${scanner.tokenValue}`);
				}
				break;
			}
			default:
				throw new Error(`Unhandled token kind: ${scanner.token}`);
		}
	} while (true);
}
function fn_3_Owner(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		displayName: undefined,
		id: undefined,
	};

	skipAttributes(scanner);

	do {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case tokenKind.startClosingTag: {
				expectIdentifier(scanner, "Owner");
				scanExpected(scanner, tokenKind.endTag);
				return res;
			}
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					case "DisplayName":
						res.displayName = parseStringTag(scanner, "DisplayName");
						break;
					case "ID":
						res.id = parseStringTag(scanner, "ID");
						break;
					default:
						throw new Error(`Unexpected tag identifier: ${scanner.tokenValue}`);
				}
				break;
			}
			default:
				throw new Error(`Unhandled token kind: ${scanner.token}`);
		}
	} while (true);
}
function fn_4_Part(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		etag: undefined,
		lastModified: undefined,
		partNumber: undefined,
		size: undefined,
	};

	skipAttributes(scanner);

	do {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case tokenKind.startClosingTag: {
				expectIdentifier(scanner, "Part");
				scanExpected(scanner, tokenKind.endTag);
				return res;
			}
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					case "ETag":
						res.etag = parseStringTag(scanner, "ETag");
						break;
					case "LastModified":
						res.lastModified = parseDateTag(scanner, "LastModified");
						break;
					case "PartNumber":
						res.partNumber = parseIntegerTag(scanner, "PartNumber");
						break;
					case "Size":
						res.size = parseIntegerTag(scanner, "Size");
						break;
					default:
						throw new Error(`Unexpected tag identifier: ${scanner.tokenValue}`);
				}
				break;
			}
			default:
				throw new Error(`Unhandled token kind: ${scanner.token}`);
		}
	} while (true);
}

function fn_1_ListPartsResult(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		bucket: undefined,
		key: undefined,
		uploadId: undefined,
		storageClass: undefined,
		partNumberMarker: undefined,
		nextPartNumberMarker: undefined,
		maxParts: undefined,
		isTruncated: undefined,
		initiator: undefined,
		owner: undefined,
		parts: undefined,
	};

	skipAttributes(scanner);

	do {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case tokenKind.startClosingTag: {
				expectIdentifier(scanner, "ListPartsResult");
				scanExpected(scanner, tokenKind.endTag);
				return res;
			}
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					case "Bucket":
						res.bucket = parseStringTag(scanner, "Bucket");
						break;
					case "Key":
						res.key = parseStringTag(scanner, "Key");
						break;
					case "UploadId":
						res.uploadId = parseStringTag(scanner, "UploadId");
						break;
					case "StorageClass":
						res.storageClass = parseStringTag(scanner, "StorageClass");
						break;
					case "PartNumberMarker":
						res.partNumberMarker = parseIntegerTag(scanner, "PartNumberMarker");
						break;
					case "NextPartNumberMarker":
						res.nextPartNumberMarker = parseIntegerTag(scanner, "NextPartNumberMarker");
						break;
					case "MaxParts":
						res.maxParts = parseIntegerTag(scanner, "MaxParts");
						break;
					case "IsTruncated":
						res.isTruncated = parseBooleanTag(scanner, "IsTruncated");
						break;
					case "Initiator":
						res.initiator = fn_2_Initiator(scanner);
						break;
					case "Owner":
						res.owner = fn_3_Owner(scanner);
						break;
					case "Part":
						(res.parts ??= []).push(fn_4_Part(scanner));
						break;
					default:
						throw new Error(`Unexpected tag identifier: ${scanner.tokenValue}`);
				}
				break;
			}
			default:
				throw new Error(`Unhandled token kind: ${scanner.token}`);
		}
	} while (true);
}

function root_parse_fn_0(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		result: undefined,
	};

	do {
		scanner.scan();
		switch (scanner.token) {
			case tokenKind.eof: return res;
			case tokenKind.startTag: {
				scanExpected(scanner, tokenKind.identifier);
				switch (scanner.tokenValue) {
					case "ListPartsResult":
						res.result = fn_1_ListPartsResult(scanner);
						break;
					default:
						throw new Error(`Unexpected tag identifier: ${scanner.tokenValue}`);
				}
				break;
			}
			default:
				throw new Error(`Unhandled token kind: ${scanner.token}`);
		}
	} while (true);
}

export function parse(text) {
	const scanner = new Scanner(text);
	return root_parse_fn_0(scanner);
}
// console.log("parse result:", parse(`<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>test-bucket</Bucket><Key>583ea250-5016-48e5-8b26-b3ce0d9e5822/foo-key-9000</Key><UploadId>tWA7cuzMIElE_sIi8weNVQJdxXnxZI9mhRT3hi9Xuaeqv4DjyteO64y_o4SuJP_E0Uf-D4Mzqeno7eWIakTtmlgabUjQ3uko2TE9Qv5BpztLPVqqJKEQnhulwkgLzcOs</UploadId><PartNumberMarker>0</PartNumberMarker><NextPartNumberMarker>3</NextPartNumberMarker><MaxParts>1000</MaxParts><IsTruncated>false</IsTruncated><Part><ETag>"4715e35cf900ae14837e3c098e87d522"</ETag><LastModified>2025-06-20T13:58:01.000Z</LastModified><PartNumber>1</PartNumber><Size>6291456</Size></Part><Part><ETag>"ce1b200f8c97447474929b722ed93b00"</ETag><LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>2</PartNumber><Size>6291456</Size></Part><Part><ETag>"3bc3be0b850eacf461ec036374616058"</ETag><LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>3</PartNumber><Size>1048576</Size></Part><Initiator><DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Initiator><Owner><DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Owner><StorageClass>STANDARD</StorageClass></ListPartsResult>`))
