import {
	AbstractStartedContainer,
	GenericContainer,
	Wait,
	type StartedTestContainer,
} from "testcontainers";

const S3_PORT = 9000;

const ACCESS_KEY_ID = "rustfsadmin";
const SECRET_ACCESS_KEY = "rustfsadmin";

export class RustFsContainer extends GenericContainer {
	constructor(image: string) {
		super(image);
		this.withExposedPorts(S3_PORT);
		this.withEnvironment({
			RUSTFS_ACCESS_KEY: ACCESS_KEY_ID,
			RUSTFS_SECRET_KEY: SECRET_ACCESS_KEY,
		});

		this.withWaitStrategy(
			Wait.forAll([Wait.forLogMessage("API:"), Wait.forHttp("/", S3_PORT)]),
		);
	}

	override async start(): Promise<StartedRustFsContainer> {
		const startedContainer = await super.start();
		return new StartedRustFsContainer(
			startedContainer,
			ACCESS_KEY_ID,
			SECRET_ACCESS_KEY,
			S3_PORT,
		);
	}
}

export class StartedRustFsContainer extends AbstractStartedContainer {
	readonly #accessKeyId: string;
	readonly #secretAccessKey: string;
	readonly #s3Port: number;

	constructor(
		startedContainer: StartedTestContainer,
		accessKeyId: string,
		secretAccessKey: string,
		s3Port: number,
	) {
		super(startedContainer);
		this.#accessKeyId = accessKeyId;
		this.#secretAccessKey = secretAccessKey;
		this.#s3Port = s3Port;
	}

	getPort() {
		return this.startedTestContainer.getMappedPort(this.#s3Port);
	}
	getAccessKeyId(): string {
		return this.#accessKeyId;
	}
	getSecretAccessKey(): string {
		return this.#secretAccessKey;
	}
	getConnectionUrl() {
		return `http://${this.getHost()}:${this.getPort()}`;
	}
}
