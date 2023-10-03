import {
	TemporalRangesTariff,
	TemporalRangesTariffSchedule,
	TemporalRangesTariffScheduleOptions,
	YearTemporalRangesTariff,
	YearTemporalRangesTariffSchedule,
	YearTemporalRangesTariffScheduleOptions,
} from "nifty-tou";

export interface GeneralDatum extends Object {
	nodeId: number;
	sourceId: string;
	date: Date;
	[index: string]: any;
}

export type TariffSchedule =
	| TemporalRangesTariffSchedule<
			TemporalRangesTariff,
			TemporalRangesTariffScheduleOptions
	  >
	| YearTemporalRangesTariffSchedule<
			YearTemporalRangesTariff,
			YearTemporalRangesTariffScheduleOptions
	  >;

/**
 * Replace elements with `data-X` class values with the value of `X`.
 *
 * `X` stands for a property on the given `data` object.
 *
 * @param root - the root element to replace data in
 * @param data - the data to replace
 * @returns the `root` parameter
 */
export function replaceData<T extends HTMLElement>(root: T, data: any): T {
	for (const prop in data) {
		for (const el of root.querySelectorAll(
			".data-" + prop
		) as NodeListOf<HTMLElement>) {
			const val = data[prop];
			el.textContent = val !== undefined ? "" + val : "";
		}
	}
	return root;
}

export const usageFormatter = new Intl.NumberFormat(undefined, {
	useGrouping: true,
	maximumFractionDigits: 0,
});

export function formatUsage(n: number): string {
	if (n === undefined || n === null) {
		return "";
	}
	return usageFormatter.format(n);
}

const CURRENCY_FORMAT_CACHE = new Map<string, Intl.NumberFormat>();

export function formatCurrency(n: number, currency?: string): string {
	if (n === undefined || n === null) {
		return "";
	}
	const currencyCode = currency || "NZD";
	let fmt = CURRENCY_FORMAT_CACHE.get(currencyCode);
	if (!fmt) {
		fmt = new Intl.NumberFormat(undefined, {
			useGrouping: true,
			style: "currency",
			currency: currencyCode,
		});
		CURRENCY_FORMAT_CACHE.set(currencyCode, fmt);
	}
	return fmt.format(n);
}
