export default class S3Error extends Error {
	readonly code: string;
	/** Path/key of the affected object. */
	readonly path: string;
	override readonly message: string;
	readonly requestId: string | undefined;
	readonly hostId: string | undefined;
	/** The HTTP status code. */
	readonly status: number | undefined;

	constructor(
		code: string,
		path: string,
		{
			message = undefined,
			requestId = undefined,
			hostId = undefined,
			cause = undefined,
			status = undefined,
		}: S3ErrorOptions = {},
	) {
		super(message, { cause });
		this.code = code;
		this.path = path;
		this.message = message ?? "Some unknown error occurred.";
		this.requestId = requestId;
		this.hostId = hostId;
		this.status = status;
	}
}

export type S3ErrorOptions = {
	message?: string | undefined;
	requestId?: string | undefined;
	hostId?: string | undefined;
	cause?: unknown;
	status?: number;
};
