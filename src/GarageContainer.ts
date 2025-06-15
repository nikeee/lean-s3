import {
	AbstractStartedContainer,
	GenericContainer,
	Wait,
	type StartedTestContainer,
} from "testcontainers";

const GARAGE_S3_PORT = 9000;

export class GarageContainer extends GenericContainer {
	private adminToken = "garage-admin";

	constructor(image: string) {
		super(image);
		this.withExposedPorts(GARAGE_S3_PORT);
		this.withWaitStrategy(Wait.forSuccessfulCommand("garage status"));
	}

	public withAdminToken(adminToken: string): this {
		this.adminToken = adminToken;
		return this;
	}

	public override async start(): Promise<StartedGarageContainer> {
		this.withEnvironment({
			GARAGE_ADMIN_TOKEN: this.adminToken,
		});
		const startedContainer = await super.start();
		return new StartedGarageContainer(startedContainer, this.adminToken);
	}
}

export class StartedGarageContainer extends AbstractStartedContainer {
	constructor(
		startedTestContainer: StartedTestContainer,
		private readonly adminToken: string,
	) {
		super(startedTestContainer);
	}

	public getPort(): number {
		return this.startedTestContainer.getMappedPort(GARAGE_S3_PORT);
	}

	public getAdminToken(): string {
		return this.adminToken;
	}

	public getConnectionUrl(): string {
		return `http://${this.getHost()}:${this.getPort()}`;
	}
}
