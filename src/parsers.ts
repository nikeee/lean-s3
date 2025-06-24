import { buildParser } from "./xml-parser/generator.ts";

const initiator = {
	type: "object",
	tagName: "Initiator",
	optional: true,
	children: {
		displayName: { type: "string", tagName: "DisplayName" },
		id: { type: "string", tagName: "ID" },
	},
} as const;
const owner = {
	type: "object",
	tagName: "Owner",
	optional: true,
	children: {
		displayName: { type: "string", tagName: "DisplayName" },
		id: { type: "string", tagName: "ID" },
	},
} as const;

export const listPartsResultSpec = {
	type: "root",
	children: {
		result: {
			type: "object",
			tagName: "ListPartsResult",
			children: {
				bucket: { type: "string", tagName: "Bucket" },
				key: { type: "string", tagName: "Key" },
				uploadId: { type: "string", tagName: "UploadId" },
				storageClass: { type: "string", tagName: "StorageClass" },
				checksumAlgorithm: {
					type: "string",
					tagName: "ChecksumAlgorithm",
					optional: true,
					emptyIsAbsent: true,
				},
				checksumType: {
					type: "string",
					tagName: "ChecksumType",
					optional: true,
					emptyIsAbsent: true,
				},
				partNumberMarker: { type: "integer", tagName: "PartNumberMarker" },
				nextPartNumberMarker: {
					type: "integer",
					tagName: "NextPartNumberMarker",
				},
				maxParts: { type: "integer", tagName: "MaxParts" },
				isTruncated: {
					type: "boolean",
					tagName: "IsTruncated",
					defaultValue: false,
				},
				initiator,
				owner,
				parts: {
					type: "array",
					tagName: "Part",
					defaultEmpty: true,
					item: {
						type: "object",
						children: {
							etag: { type: "string", tagName: "ETag" },
							lastModified: { type: "date", tagName: "LastModified" },
							partNumber: { type: "integer", tagName: "PartNumber" },
							size: { type: "integer", tagName: "Size" },
						},
					},
				},
			},
		},
	},
} as const;

export const parseListPartsResult = buildParser(listPartsResultSpec);

export const parseListBucketResult = buildParser({
	type: "root",
	children: {
		result: {
			type: "object",
			tagName: "ListBucketResult",
			children: {
				name: { type: "string", tagName: "Name" },
				prefix: { type: "string", tagName: "Prefix" },
				startAfter: { type: "string", tagName: "StartAfter", optional: true },
				isTruncated: {
					type: "boolean",
					tagName: "IsTruncated",
					defaultValue: false,
				},
				continuationToken: {
					type: "string",
					tagName: "ContinuationToken",
					optional: true,
				},
				nextContinuationToken: {
					type: "string",
					tagName: "NextContinuationToken",
					optional: true,
				},
				maxKeys: { type: "integer", tagName: "MaxKeys", defaultValue: 1000 },
				keyCount: { type: "integer", tagName: "KeyCount" },
				contents: {
					type: "array",
					tagName: "Contents",
					defaultEmpty: true,
					item: {
						type: "object",
						children: {
							key: { type: "string", tagName: "Key" },
							size: { type: "integer", tagName: "Size" },
							lastModified: { type: "date", tagName: "LastModified" },
							etag: { type: "string", tagName: "ETag" },
							storageClass: { type: "string", tagName: "StorageClass" },
							checksumAlgorithm: {
								type: "string",
								tagName: "ChecksumAlgorithm",
								optional: true,
							},
							checksumType: {
								type: "string",
								tagName: "ChecksumType",
								optional: true,
							},
						},
					},
				},
			},
		},
	},
});

export const parseInitiateMultipartUploadResult = buildParser({
	type: "root",
	children: {
		result: {
			type: "object",
			tagName: "InitiateMultipartUploadResult",
			children: {
				bucket: { type: "string", tagName: "Bucket" },
				key: { type: "string", tagName: "Key" },
				uploadId: { type: "string", tagName: "UploadId" },
			},
		},
	},
});

export const parseListMultipartUploadsResult = buildParser({
	type: "root",
	children: {
		result: {
			type: "object",
			tagName: "ListMultipartUploadsResult",
			children: {
				bucket: { type: "string", tagName: "Bucket" },
				keyMarker: {
					type: "string",
					tagName: "KeyMarker",
					optional: true,
					emptyIsAbsent: true,
				},
				uploadIdMarker: {
					type: "string",
					tagName: "UploadIdMarker",
					optional: true,
					emptyIsAbsent: true,
				},
				nextKeyMarker: {
					type: "string",
					tagName: "NextKeyMarker",
					optional: true,
				},
				prefix: {
					type: "string",
					tagName: "Prefix",
					optional: true,
					emptyIsAbsent: true,
				},
				delimiter: {
					type: "string",
					tagName: "Delimiter",
					optional: true,
					emptyIsAbsent: true,
				},
				nextUploadIdMarker: {
					type: "string",
					tagName: "NextUploadIdMarker",
					optional: true,
					emptyIsAbsent: true,
				},
				maxUploads: {
					type: "integer",
					tagName: "MaxUploads",
					defaultValue: 1000,
				},
				isTruncated: {
					type: "boolean",
					tagName: "IsTruncated",
					defaultValue: false,
				},

				uploads: {
					type: "array",
					tagName: "Upload",
					defaultEmpty: true,
					item: {
						type: "object",
						children: {
							checksumAlgorithm: {
								type: "string",
								tagName: "ChecksumAlgorithm",
								optional: true,
							},
							checksumType: {
								type: "string",
								tagName: "ChecksumType",
								optional: true,
							},
							initiated: {
								type: "date",
								tagName: "Initiated",
							},
							initiator,
							owner,
							storageClass: { type: "string", tagName: "StorageClass" },
							key: { type: "string", tagName: "Key" },
							uploadId: { type: "string", tagName: "UploadId" },
						},
					},
				},
			},
		},
	},
});

export const parseCompleteMultipartUploadResult = buildParser({
	type: "root",
	children: {
		result: {
			type: "object",
			tagName: "CompleteMultipartUploadResult",
			children: {
				location: { type: "string", tagName: "Location" },
				bucket: { type: "string", tagName: "Bucket" },
				key: { type: "string", tagName: "Key" },
				etag: { type: "string", tagName: "ETag" },
				checksumCRC: {
					type: "string",
					tagName: "ChecksumCRC",
					optional: true,
				},
				checksumCRC32: {
					type: "string",
					tagName: "ChecksumCRC32",
					optional: true,
				},
				checksumCRC32C: {
					type: "string",
					tagName: "ChecksumCRC32C",
					optional: true,
				},
				checksumCRC64NVME: {
					type: "string",
					tagName: "ChecksumCRC64NVME",
					optional: true,
				},
				checksumSHA1: {
					type: "string",
					tagName: "ChecksumSHA1",
					optional: true,
				},
				checksumSHA256: {
					type: "string",
					tagName: "ChecksumSHA256",
					optional: true,
				},
				checksumType: {
					type: "string",
					tagName: "ChecksumType",
					optional: true,
				},
			},
		},
	},
});

export const parseDeleteResult = buildParser({
	type: "root",
	children: {
		result: {
			type: "object",
			tagName: "DeleteResult",
			children: {
				errors: {
					type: "array",
					optional: true,
					defaultEmpty: true,
					item: {
						type: "object",
						children: {
							code: { type: "string", tagName: "Code" },
							message: { type: "string", tagName: "Message" },
							key: { type: "string", tagName: "Key" },
							etag: { type: "string", tagName: "ETag" },
							versionId: { type: "string", tagName: "VersionId" },
						},
					},
				},
			},
		},
	},
});
