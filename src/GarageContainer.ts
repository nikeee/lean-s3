import {
	AbstractStartedContainer,
	GenericContainer,
	Wait,
	type StartedTestContainer,
} from "testcontainers";

const S3_PORT = 9000;
const ADMIN_API_PORT = 3903;

export class GarageContainer extends GenericContainer {
	adminToken = "test-admin-token-for-ci";

	constructor() {
		super("ghcr.io/nikeee/lean-s3-ci-images/garage:latest");
		this.withExposedPorts(S3_PORT);
		this.withExposedPorts(ADMIN_API_PORT);

		this.withWaitStrategy(
			Wait.forAll([
				Wait.forLogMessage("Admin API server listening on"),
				Wait.forLogMessage("S3 API server listening on"),
			]),
		);
	}

	override async start(): Promise<StartedGarageContainer> {
		const startedContainer = await super.start();
		const credentials = await GarageContainer.#createAccessKey(
			startedContainer,
			this.adminToken,
		);
		// TODO: Set up initial bucket and credentials
		return new StartedGarageContainer(
			startedContainer,
			credentials.accessKeyId,
			credentials.secretAccessKey,
		);
	}

	static async #createAccessKey(
		container: StartedTestContainer,
		adminToken: string,
	) {
		const apiBase = `http://${container.getHost()}:${container.getMappedPort(ADMIN_API_PORT)}`;
		const res = await fetch(`${apiBase}/v2/CreateKey`, {
			method: "POST",
			body: JSON.stringify({
				allow: null,
				deny: null,
				name: "testcontainer-access",
				neverExpires: true,
				expiration: null,
			}),
			headers: {
				Authorization: `Bearer ${adminToken}`,
				"Content-Type": "application/json",
			},
		});

		// biome-ignore lint/suspicious/noExplicitAny: shrug
		const json = (await res.json()) as any;
		console.log("garage response", json);
		return {
			accessKeyId: json.accessKeyId,
			secretAccessKey: json.secretAccessKey,
		};
	}
}

export class StartedGarageContainer extends AbstractStartedContainer {
	accessKeyId: string;
	secretAccessKey: string;

	constructor(
		startedContainer: StartedTestContainer,
		accessKeyId: string,
		secretAccessKey: string,
	) {
		super(startedContainer);
		this.accessKeyId = accessKeyId;
		this.secretAccessKey = secretAccessKey;
	}

	getPort() {
		return this.startedTestContainer.getMappedPort(S3_PORT);
	}
	getAccessKeyId(): string {
		return this.accessKeyId;
	}
	getSecretAccessKey(): string {
		return this.secretAccessKey;
	}

	getConnectionUrl() {
		return `http://${this.getHost()}:${this.getPort()}`;
	}
}
