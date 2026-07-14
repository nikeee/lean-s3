const ONE_DAY = 1000 * 60 * 60 * 24;

export type AmzDate = {
	numericDayStart: number;
	date: string;
	dateTime: string;
};

export function getAmzDate(dateTime: Date): AmzDate {
	const date =
		pad4(dateTime.getUTCFullYear()) +
		pad2(dateTime.getUTCMonth() + 1) +
		pad2(dateTime.getUTCDate());

	const time =
		pad2(dateTime.getUTCHours()) + pad2(dateTime.getUTCMinutes()) + pad2(dateTime.getUTCSeconds()); // it seems that we dont support milliseconds

	return {
		numericDayStart: (dateTime.getTime() / ONE_DAY) | 0,
		date,
		dateTime: `${date}T${time}Z`,
	};
}

let lastNowSecond = -1;
let lastNowValue: AmzDate;

/**
 * Returns the current time as {@link AmzDate}.
 * Since the format only has second granularity, the result is cached for the current second.
 * {@link AmzDate} values are never mutated, so sharing one instance is safe.
 */
export function now(): AmzDate {
	const second = (Date.now() / 1000) | 0;
	if (second !== lastNowSecond) {
		lastNowSecond = second;
		lastNowValue = getAmzDate(new Date(second * 1000));
	}
	return lastNowValue;
}

function pad4(v: number): string {
	return v < 10 ? `000${v}` : v < 100 ? `00${v}` : v < 1000 ? `0${v}` : v.toString();
}

function pad2(v: number): string {
	return v < 10 ? `0${v}` : v.toString();
}
