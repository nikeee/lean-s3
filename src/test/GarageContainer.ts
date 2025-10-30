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
		const nodeId = await this.getNodeId(startedContainer);
		await startedContainer.exec(`/garage layout assign -z dc1 -c 1G ${nodeId}`);
		await startedContainer.exec(`/garage layout apply --version 1`);
		const credentials = await this.#createAccessKey(startedContainer);
		return new StartedGarageContainer(
			startedContainer,
			credentials.accessKeyId,
			credentials.secretAccessKey,
			S3_PORT,
		);
	}

	async #createAccessKey(container: StartedTestContainer) {
		const json = await this.apiFetch(container, "/v2/CreateKey", {
			method: "POST",
			body: JSON.stringify({
				allow: {
					createBucket: true,
				},
				deny: null,
				name: "testcontainer-access",
				neverExpires: true,
				expiration: null,
			}),
		});
		return {
			accessKeyId: json.accessKeyId,
			secretAccessKey: json.secretAccessKey,
		};
	}

	async getNodeId(container: StartedTestContainer) {
		const json = await this.apiFetch(container, "/v2/GetNodeInfo?node=self");
		return Object.keys(json.success)[0] ?? undefined;
	}

	async apiFetch(
		container: StartedTestContainer,
		path: string,
		options?: RequestInit,
		// biome-ignore lint/suspicious/noExplicitAny: shrug
	): Promise<any> {
		const apiBase = `http://${container.getHost()}:${container.getMappedPort(ADMIN_API_PORT)}`;
		const res = await fetch(`${apiBase}${path}`, {
			...options,
			headers: {
				"Content-Type": "application/json",
				...options?.headers,
				Authorization: `Bearer ${this.adminToken}`,
			},
		});
		return await res.json();
	}
}

export class StartedGarageContainer extends AbstractStartedContainer {
	accessKeyId: string;
	secretAccessKey: string;
	s3Port: number;

	constructor(
		startedContainer: StartedTestContainer,
		accessKeyId: string,
		secretAccessKey: string,
		s3Port: number,
	) {
		super(startedContainer);
		this.accessKeyId = accessKeyId;
		this.secretAccessKey = secretAccessKey;
		this.s3Port = s3Port;
	}

	getPort() {
		return this.startedTestContainer.getMappedPort(this.s3Port);
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
