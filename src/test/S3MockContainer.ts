import {
	AbstractStartedContainer,
	GenericContainer,
	Wait,
	type StartedTestContainer,
} from "testcontainers";

const S3_HTTP_PORT = 9090;
const S3_HTTPS_PORT = 3903;
// https://github.com/adobe/S3Mock/issues/1250#issuecomment-1653387576
const ACCESS_KEY_ID = "any";
const SECRET_ACCESS_KEY = "keyId";
const REGION = "auto";

export class S3MockContainer extends GenericContainer {
	constructor(image: string) {
		super(image);
		this.withExposedPorts(S3_HTTP_PORT);
		this.withExposedPorts(S3_HTTPS_PORT);
		this.withEnvironment({
			COM_ADOBE_TESTING_S3MOCK_STORE_REGION: REGION,
		});

		this.withWaitStrategy(Wait.forHttp("/favicon.ico", S3_HTTP_PORT));
	}

	override async start(): Promise<StartedS3MockContainer> {
		const startedContainer = await super.start();
		return new StartedS3MockContainer(
			startedContainer,
			ACCESS_KEY_ID,
			SECRET_ACCESS_KEY,
			S3_HTTP_PORT,
			S3_HTTPS_PORT,
		);
	}
}

export class StartedS3MockContainer extends AbstractStartedContainer {
	readonly #accessKeyId: string;
	readonly #secretAccessKey: string;
	readonly #s3HttpPort: number;
	readonly #s3HttpsPort: number;

	constructor(
		startedContainer: StartedTestContainer,
		accessKeyId: string,
		secretAccessKey: string,
		s3HttpPort: number,
		s3HttpsPort: number,
	) {
		super(startedContainer);
		this.#accessKeyId = accessKeyId;
		this.#secretAccessKey = secretAccessKey;
		this.#s3HttpPort = s3HttpPort;
		this.#s3HttpsPort = s3HttpsPort;
	}

	getHttpPort() {
		return this.startedTestContainer.getMappedPort(this.#s3HttpPort);
	}
	getHttpsPort() {
		return this.startedTestContainer.getMappedPort(this.#s3HttpsPort);
	}
	getAccessKeyId(): string {
		return this.#accessKeyId;
	}
	getSecretAccessKey(): string {
		return this.#secretAccessKey;
	}

	getHttpConnectionUrl() {
		return `http://${this.getHost()}:${this.getHttpPort()}`;
	}
	getHttpsConnectionUrl() {
		return `https://${this.getHost()}:${this.getHttpsPort()}`;
	}
}
