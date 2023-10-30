import {
	TemporalRangesTariff,
	TemporalRangesTariffSchedule,
	TemporalRangesTariffScheduleOptions,
	YearTemporalRangesTariff,
	YearTemporalRangesTariffSchedule,
	YearTemporalRangesTariffScheduleOptions,
} from "nifty-tou";

/** Custom expando element property name. */
export const TOU_DATA = "touData";

/** Custom data property for an "item". */
export const ITEM = "item";

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

interface ExpandoElement extends HTMLElement {
	touData?: object;
}

/**
 * Get all available custom data.
 * @param el - the element to get the data from
 * @returns - the data object or undefined
 */
export function touData<T extends HTMLElement>(
	el: T
): { [k: string]: object } | undefined;

/**
 * Get a custom data value.
 * @param el - the element get get the data value from
 * @param key - the key of the data value to get
 * @returns - the data value or undefined
 */
export function touData<T extends HTMLElement>(el: T, key: string): any;

/**
 * Set a custom data value.
 *
 * @param el - the element get set the data value on
 * @param key - the key of the data value to set
 * @param val - the data value to set
 * @returns the `el` element
 */
export function touData<T extends HTMLElement>(el: T, key: string, val: any): T;

/**
 *
 * @param el - the element to manage data on
 * @param key  - if provided, the key of the data property to get or set
 * @param val  - if provided, the value to set on `key`
 * @returns if neither `key` nor `val` provided, the custom data object (or undefined);
 *     if `key` provided without `val` then the current value of the `key` data property;
 *     if both `key` and `val` then then the `el` element
 */
export function touData<T extends HTMLElement>(
	el: T,
	key?: string,
	val?: any
): T | { [k: string]: object } | any {
	const ex = el as ExpandoElement;
	if (val && key) {
		let d = ex[TOU_DATA] as { [k: string]: object };
		if (!d) {
			d = {};
			ex[TOU_DATA] = d;
		}
		d[key] = val;
		return el;
	} else if (key) {
		let d = ex[TOU_DATA] as { [k: string]: object };
		return d?.[key];
	}
	return ex[TOU_DATA] as { [k: string]: object };
}
