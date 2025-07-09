import {
	AbstractStartedContainer,
	GenericContainer,
	Wait,
} from "testcontainers";

// Based on:
// https://github.com/CleverCloud/ceph-s3-box/blob/main/Dockerfile
// https://github.com/CleverCloud/testcontainers-ceph

const MON_PORT = 3300;
const RGW_PORT = 7480;
const MGR_PORT = 8080;

const CEPH_RGW_ACCESS_KEY = "radosgwadmin";
const CEPH_RGW_SECRET_KEY = "radosgwadmin";
const CEPH_RGW_PROTOCOL = "http";
const MGR_USERNAME = "admin";
const MGR_PASSWORD = "admin";
const CEPH_DEMO_UID = "admin";

export class CephContainer extends GenericContainer {
	constructor(features: string[] = ["radosgw", "rbd"]) {
		super("clevercloud/testcontainer-ceph:reef-20250526");
		this.withExposedPorts(MON_PORT, RGW_PORT, MGR_PORT)
			.withEnvironment({
				FEATURES: features.join(" "),
				ACCESS_KEY: CEPH_RGW_ACCESS_KEY,
				SECRET_KEY: CEPH_RGW_SECRET_KEY,
				MGR_USERNAME: MGR_USERNAME,
				MGR_PASSWORD: MGR_PASSWORD,
				NETWORK_AUTO_DETECT: "1",
			})
			.withWaitStrategy(Wait.forLogMessage("Dashboard API is working"));
	}

	override async start(): Promise<StartedCephContainer> {
		const container = await super.start();
		return new StartedCephContainer(container);
	}
}

export class StartedCephContainer extends AbstractStartedContainer {
	getDashboardApiUrl(): string {
		return `http://${this.getHost()}:${this.getMappedPort(MGR_PORT)}/api`;
	}

	getRGWAccessKey(): string {
		return CEPH_RGW_ACCESS_KEY;
	}

	getRGWSecretKey(): string {
		return CEPH_RGW_SECRET_KEY;
	}

	getRGWUser(): string {
		return CEPH_DEMO_UID;
	}

	getRGWPort(): number {
		return this.getMappedPort(RGW_PORT);
	}

	getRGWHost(): string {
		return this.getHost();
	}

	getRGWProtocol(): string {
		return CEPH_RGW_PROTOCOL;
	}

	getRGWUri(): string {
		return `${this.getRGWProtocol()}://${this.getRGWHost()}:${this.getRGWPort()}`;
	}
}
