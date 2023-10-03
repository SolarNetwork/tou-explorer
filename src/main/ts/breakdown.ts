import { TemporalRangesTariff } from "nifty-tou";

import { formatCurrency, formatUsage } from "./utils";

export class TouBreakdown {
	idx: number;
	unitQuantity: number;
	rateDivisor: number;
	tariff: TemporalRangesTariff;
	usage: number;
	currency?: string;

	constructor(
		idx: number,
		unitQuantity: number,
		rateDivisor: number,
		tariff: TemporalRangesTariff,
		currency?: string
	) {
		this.idx = idx;
		this.unitQuantity = unitQuantity;
		this.rateDivisor = rateDivisor;
		this.tariff = tariff;
		this.usage = 0;
		this.currency = currency;
	}

	addUsage(amount: number) {
		this.usage += amount / this.unitQuantity;
	}

	get cost(): number {
		let c = 0;
		for (const rate of Object.values(this.tariff.rates)) {
			c +=
				(this.usage * rate.amount * Math.pow(10, rate.exponent)) /
				this.rateDivisor;
		}
		return c;
	}

	get usageFormatted(): string {
		return formatUsage(this.usage);
	}

	get rate(): number {
		// TODO: assuming just one rate here
		const rate = Object.values(this.tariff.rates)[0];
		return rate.amount * Math.pow(10, rate.exponent);
	}

	get rateFormatted(): string {
		return "" + this.rate;
	}

	get costFormatted(): string {
		return formatCurrency(this.cost, this.currency);
	}
}

export class OverallUsage {
	unitQuantity: number;
	rate: number;
	readingStart: number;
	readingEnd: number;
	usage: number;
	currency?: string;

	constructor(
		unitQuantity: number,
		rate: number,
		readingStart: number,
		currency?: string
	) {
		this.unitQuantity = unitQuantity;
		this.rate = rate;
		this.readingStart = readingStart / unitQuantity;
		this.readingEnd = this.readingStart;
		this.usage = 0;
		this.currency = currency;
	}

	toString() {
		return `Overall{${this.readingStart}-${this.readingEnd}=${this.usage}}`;
	}

	addUsage(amount: number) {
		this.usage += amount / this.unitQuantity;
	}

	end(readingEnd: number) {
		this.readingEnd = readingEnd / this.unitQuantity;
	}

	get cost(): number {
		return this.usage * this.rate;
	}

	get readingStartFormatted(): string {
		return formatUsage(this.readingStart);
	}

	get readingEndFormatted(): string {
		return formatUsage(this.readingEnd);
	}

	get usageFormatted(): string {
		return formatUsage(this.usage);
	}

	get costFormatted(): string {
		return formatCurrency(this.cost, this.currency);
	}
}
