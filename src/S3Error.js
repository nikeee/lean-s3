// @ts-check

export default class S3Error extends Error {
	/**
	 * @type {string}
	 * @readonly
	 */
	code;
	/**
	 * @type {string}
	 * @readonly
	 */
	path;
	/**
	 * @type {string}
	 * @readonly
	 */
	message;
	/**
	 * @type {string | undefined}
	 * @readonly
	 */
	requestId;
	/**
	 * @type {string | undefined}
	 * @readonly
	 */
	hostId;

	/**
	 * @param {string} code
	 * @param {string} path
	 * @param {{
	 *    message?: string | undefined
	 *    requestId?: string | undefined
	 *    hostId?: string | undefined
	 *    cause?: unknown
	 * }} options
	 */
	constructor(
		code,
		path,
		{
			message = undefined,
			requestId = undefined,
			hostId = undefined,
			cause = undefined,
		} = {},
	) {
		super(message, { cause });
		this.code = code;
		this.path = path;
		this.message = message ?? "Some unknown error occurred.";
		this.requestId = requestId;
		this.hostId = hostId;
	}
}
