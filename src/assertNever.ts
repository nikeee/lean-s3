export default function assertNever(v: never): never {
	throw new TypeError(`Expected value not to have type ${typeof v}`);
}
