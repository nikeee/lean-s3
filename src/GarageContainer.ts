import {
	AbstractStartedContainer,
	GenericContainer,
	Wait,
} from "testcontainers";

const S3_PORT = 9000;

export class GarageContainer extends GenericContainer {
	username = "garageadmin";
	password = "garageadmin";

	constructor() {
		super("ghcr.io/nikeee/lean-s3-ci-images/garage:latest");
		this.withExposedPorts(S3_PORT);
		this.withWaitStrategy(Wait.forLogMessage("S3 API server listening on"));
	}

	override async start(): Promise<StartedGarageContainer> {
		const startedContainer = await super.start();
		return new StartedGarageContainer(startedContainer);
	}
}

export class StartedGarageContainer extends AbstractStartedContainer {
	getPort() {
		return this.startedTestContainer.getMappedPort(S3_PORT);
	}

	getAccessKeyId(): string {}
	getSecretAccessKey(): string {}

	getConnectionUrl() {
		return `http://${this.getHost()}:${this.getPort()}`;
	}
}
