import { AbstractStartedContainer, GenericContainer, Wait } from "testcontainers";

// Based on:
// https://github.com/CleverCloud/ceph-s3-box/blob/main/Dockerfile
// https://github.com/CleverCloud/testcontainers-ceph

const MON_PORT = 3300;
const RGW_PORT = 7480;
const MGR_PORT = 8080;

const CEPH_RGW_ACCESS_KEY = "radosgwadmin";
const CEPH_RGW_SECRET_KEY = "radosgwadmin";
const MGR_USERNAME = "admin";
const MGR_PASSWORD = "admin";
const CEPH_DEMO_UID = "admin";

/**
 * @remarks We use 127.0.0.1 instead of this.getHost() and stuff because ceph uses "localhost" wrongly as a bucket name.
 */
export class CephContainer extends GenericContainer {
	constructor() {
		super("ghcr.io/nikeee/lean-s3-ci-images/ceph:latest");
		this.withExposedPorts(MON_PORT, RGW_PORT, MGR_PORT)
			.withEnvironment({
				FEATURES: "radosgw rbd",
				ACCESS_KEY: CEPH_RGW_ACCESS_KEY,
				SECRET_KEY: CEPH_RGW_SECRET_KEY,
				MGR_USERNAME: MGR_USERNAME,
				MGR_PASSWORD: MGR_PASSWORD,
				NETWORK_AUTO_DETECT: "1",
			})
			.withWaitStrategy(
				Wait.forAll([
					Wait.forLogMessage("Dashboard API is working"),
					Wait.forHttp("/", RGW_PORT)
						.withHeaders({ host: "127.0.0.1" })
						.forStatusCode(200),
				]),
			);
	}

	override async start(): Promise<StartedCephContainer> {
		const container = await super.start();
		return new StartedCephContainer(container);
	}
}

export class StartedCephContainer extends AbstractStartedContainer {
	getRGWAccessKey(): string {
		return CEPH_RGW_ACCESS_KEY;
	}

	getRGWSecretKey(): string {
		return CEPH_RGW_SECRET_KEY;
	}

	getRGWUser(): string {
		return CEPH_DEMO_UID;
	}

	getRGWUri(): string {
		return `http://127.0.0.1:${this.getMappedPort(RGW_PORT)}`;
	}
}
