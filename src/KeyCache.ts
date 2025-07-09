import * as sign from "./sign.ts";
import type { AmzDate } from "./AmzDate.ts";
import type { AccessKeyId, Region, SecretAccessKey } from "./branded.ts";

export default class KeyCache {
	#lastNumericDay = -1;
	#keys: Map<string, Buffer> = new Map();

	computeIfAbsent(
		date: AmzDate,
		region: Region,
		accessKeyId: AccessKeyId,
		secretAccessKey: SecretAccessKey,
	): Buffer {
		if (date.numericDayStart !== this.#lastNumericDay) {
			this.#keys.clear();
			this.#lastNumericDay = date.numericDayStart;
			// TODO: Add mechanism to clear the cache after some time
		}

		// using accessKeyId to prevent keeping the secretAccessKey somewhere
		const cacheKey = `${date.date}:${region}:${accessKeyId}`;
		const key = this.#keys.get(cacheKey);
		if (key) {
			return key;
		}

		const newKey = sign.deriveSigningKey(date.date, region, secretAccessKey);
		this.#keys.set(cacheKey, newKey);
		return newKey;
	}
}
