import { Scanner, buildParserClassAsync, listPartsResultSpec } from "../dist/index.mjs";

const parserClass = buildParserClassAsync(listPartsResultSpec);

const s = `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<Bucket>test-bucket</Bucket>
<Key>583ea250-5016-48e5-8b26-b3ce0d9e5822/foo-key-9000</Key>
<UploadId>tWA7cuzMIElE_sIi8weNVQJdxXnxZI9mhRT3hi9Xuaeqv4DjyteO64y_o4SuJP_E0Uf-D4Mzqeno7eWIakTtmlgabUjQ3uko2TE9Qv5BpztLPVqqJKEQnhulwkgLzcOs</UploadId>
<PartNumberMarker>0</PartNumberMarker>
<NextPartNumberMarker>3</NextPartNumberMarker>
<MaxParts>1000</MaxParts>
<IsTruncated>false</IsTruncated>
${Array.from({ length: 10 })
  .fill(0)
  .map(
    (_, i) => `
<Part>
<ETag>"${crypto.randomUUID()}"</ETag>
<LastModified>2025-06-20T13:58:01.000Z</LastModified>
<PartNumber>${i + 3}</PartNumber><Size>6291456</Size>
</Part>
`,
  )
  .join("")}
<Part>
<ETag>
"4715e35cf900ae14837e3c098e87d522"</ETag>
<LastModified>2025-06-20T13:58:01.000Z</LastModified>
<PartNumber>1</PartNumber><Size>6291456</Size>
</Part>
<Part><ETag>"ce1b200f8c97447474929b722ed93b00"</ETag>
<LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>2</PartNumber><Size>6291456</Size></Part><Part><ETag>"3bc3be0b850eacf461ec036374616058"</ETag>
<LastModified>2025-06-20T13:58:02.000Z</LastModified><PartNumber>3</PartNumber><Size>1048576</Size></Part><Initiator>
<DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Initiator><Owner><DisplayName>webfile</DisplayName><ID>75aa57f09aa0c8caeab4f8c24e99d10f8e7faeebf76c078efc7c6caea54ba06a</ID></Owner><StorageClass>STANDARD</StorageClass></ListPartsResult>`;
const sb = new TextEncoder().encode(s);

const memory = new WebAssembly.Memory({ initial: 256, maximum: 256 });
new Uint8Array(memory.buffer, 0, sb.length).set(sb);

const memRef = {
  memory,
  byteLength: sb.length,
};

const scanner = await Scanner.create(memRef);

for (let i = 0; i < 100; ++i) {
  scanner.reset();
  new parserClass(scanner).parse_0();
}
// console.log(p.parse_0());

/*
for (let i = 0; i < 10000; ++i) {
	runtimeGeneratedParser(s);
}
*/
