import {
	Scanner,
	scanExpected,
	skipAttributes,
	expectIdentifier,
	parseStringTag,
	parseDateTag,
	parseIntegerTag,
	parseBooleanTag,
} from "./runtime.ts";
function fn_1_ListPartsResult(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		bucket: undefined,
		key: undefined,
		uploadId: undefined,
		storageClass: undefined,
		checksumAlgorithm: undefined,
		checksumType: undefined,
		partNumberMarker: undefined,
		nextPartNumberMarker: undefined,
		maxParts: undefined,
		isTruncated: false,
		initiator: undefined,
		owner: undefined,
		parts: [],
	};

	skipAttributes(scanner);

	while (true) {
		scanner.scan(); // consume >

		switch (scanner.token) {
			case 3: {
				expectIdentifier(scanner, "ListPartsResult");
				scanExpected(scanner, 2);
				if (res.bucket === undefined)
					throw new TypeError(
						`Value for field "bucket" was required but not present (expected as tag name "Bucket").`,
					);
				if (res.key === undefined)
					throw new TypeError(
						`Value for field "key" was required but not present (expected as tag name "Key").`,
					);
				if (res.uploadId === undefined)
					throw new TypeError(
						`Value for field "uploadId" was required but not present (expected as tag name "UploadId").`,
					);
				if (res.storageClass === undefined)
					throw new TypeError(
						`Value for field "storageClass" was required but not present (expected as tag name "StorageClass").`,
					);
				if (res.partNumberMarker === undefined)
					throw new TypeError(
						`Value for field "partNumberMarker" was required but not present (expected as tag name "PartNumberMarker").`,
					);
				if (res.nextPartNumberMarker === undefined)
					throw new TypeError(
						`Value for field "nextPartNumberMarker" was required but not present (expected as tag name "NextPartNumberMarker").`,
					);
				if (res.maxParts === undefined)
					throw new TypeError(
						`Value for field "maxParts" was required but not present (expected as tag name "MaxParts").`,
					);
				if (res.isTruncated === undefined)
					throw new TypeError(
						`Value for field "isTruncated" was required but not present (expected as tag name "IsTruncated").`,
					);
				if (res.initiator === undefined)
					throw new TypeError(
						`Value for field "initiator" was required but not present (expected as tag name "Initiator").`,
					);
				if (res.owner === undefined)
					throw new TypeError(
						`Value for field "owner" was required but not present (expected as tag name "Owner").`,
					);
				return res;
			}
			case 1: {
				scanExpected(scanner, 5);
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
					case "ChecksumAlgorithm":
						res.checksumAlgorithm =
							parseStringTag(scanner, "ChecksumAlgorithm") || undefined;
						break;
					case "ChecksumType":
						res.checksumType =
							parseStringTag(scanner, "ChecksumType") || undefined;
						break;
					case "PartNumberMarker":
						res.partNumberMarker = parseIntegerTag(scanner, "PartNumberMarker");
						break;
					case "NextPartNumberMarker":
						res.nextPartNumberMarker = parseIntegerTag(
							scanner,
							"NextPartNumberMarker",
						);
						break;
					case "MaxParts":
						res.maxParts = parseIntegerTag(scanner, "MaxParts");
						break;
					case "IsTruncated":
						res.isTruncated = parseBooleanTag(scanner, "IsTruncated");
						break;
					case "Initiator":
						res.initiator = undefined(scanner);
						break;
					case "Owner":
						res.owner = undefined(scanner);
						break;
					case "Part":
						res.parts.push(undefined(scanner));
						break;
					default:
						throw new Error(`Unexpected tag identifier: ${scanner.tokenValue}`);
				}
				break;
			}
			default:
				throw new Error(`Unhandled token kind: ${scanner.token}`);
		}
	}
}

function root_parse_fn_0(scanner) {
	// Init structure entirely, so v8 can create a single hidden class
	const res = {
		result: undefined,
	};

	scanner.scan(); // prime scanner

	if (scanner.token === 9) {
		scanner.scan();
	}

	while (true) {
		scanner.scan();
		switch (scanner.token) {
			case 0: {
				if (res.result === undefined)
					throw new TypeError(
						`Value for field "result" was required but not present (expected as tag name "ListPartsResult").`,
					);
				return res;
			}
			case 1: {
				scanExpected(scanner, 5);
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
	}
}

export default function parse(text) {
	return root_parse_fn_0(new Scanner(text));
}
