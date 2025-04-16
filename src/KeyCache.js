// @ts-check

import * as sign from "./sign.js";

/**@typedef {import("./AmzDate.js").AmzDate} AmzDate */

export default class KeyCache {
	/** @type {number} */
	#lastNumericDay = -1;
	/** @type {Map<string, Buffer>} */
	#keys = new Map();

	/**
	 * @param {AmzDate} date
	 * @param {string} region
	 * @param {string} accessKeyId
	 * @param {string} secretAccessKey
	 * @returns {Buffer}
	 */
	computeIfAbsent(date, region, accessKeyId, secretAccessKey) {
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
