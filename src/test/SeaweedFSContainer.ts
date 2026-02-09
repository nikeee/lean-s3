import {
	AbstractStartedContainer,
	GenericContainer,
	Wait,
	type StartedTestContainer,
} from "testcontainers";

const S3_PORT = 8333;
const MASTER_PORT = 9333;
const FILER_PORT = 8888;

const ACCESS_KEY_ID = "seaweedfsadmin";
const SECRET_ACCESS_KEY = "seaweedfsadmin";

export class SeaweedFSContainer extends GenericContainer {
	constructor() {
		super("chrislusf/seaweedfs:latest");
		this.withExposedPorts(S3_PORT, MASTER_PORT, FILER_PORT);
		this.withEnvironment({
			AWS_ACCESS_KEY_ID: ACCESS_KEY_ID,
			AWS_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
		});
		this.withCommand([
			"server",
			"-s3",
			// "-master.dir=/data/master",
			// "-filer.dir=/data/filer",
			// "-volume.dir=/data/volume",
			// "-master.port=9333",
			// "-filer.port=8888",
			"-s3.port=8333",
		]);

		this.withWaitStrategy(Wait.forLogMessage(/S3.*8333/));
	}

	override async start(): Promise<StartedSeaweedFSContainer> {
		const startedContainer = await super.start();
		return new StartedSeaweedFSContainer(
			startedContainer,
			ACCESS_KEY_ID,
			SECRET_ACCESS_KEY,
			S3_PORT,
		);
	}
}

export class StartedSeaweedFSContainer extends AbstractStartedContainer {
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
