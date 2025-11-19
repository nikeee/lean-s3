# xml-parser
lean-s3 seems to re-invent the wheel by shipping its own XML parser.

## Why?
`fast-xml-parser` is kind of slow and cannot take advantage of the schema we know beforehand. We use a custom parser that uses runtime-code-gen to create a parser that is tailored to a specific response. It's also possible to intentionally not implement stuff that is not needed in the context of S3.

Not only will a specialized parser be faster, but it can also rename object fields and validate in the same step, rednering post-processing of the parsed output unnecessary.

## Limitations
This parser only supports what's needed to parse S3 responses. It intentionally does not cover the entirety of xml. Namely:
- CDATA
- Attributes (they are skiped entirely)
- XXE
- XSD
- Comments
- Using `'` as quotes
- and probably much more
