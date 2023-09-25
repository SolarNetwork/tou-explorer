import "../scss/style.scss";
import "bootstrap";
import { loadData, setupSolarNetworkIntegration } from "./sn.ts";
import Papa from "papaparse";
import {
	ChronoField,
	TariffRate,
	TemporalRangesTariff,
	TemporalRangesTariffSchedule,
} from "nifty-tou";
import {
	GeneralDatum,
	replaceData,
	SettingsFormElements,
	TouFormElements,
} from "./utils";

let tariffSchedule: TemporalRangesTariffSchedule;
const settingsForm = document.querySelector<HTMLFormElement>("#data-settings")!;
const settings = settingsForm.elements as unknown as SettingsFormElements;
const tariffForm = document.querySelector<HTMLFormElement>("#tou-settings")!;
const tariffSettings = tariffForm.elements as unknown as TouFormElements;
const calcProgressBar = document.querySelector<HTMLElement>("#calc-progress")!;
const resultSection = document.querySelector<HTMLElement>("#tou-results")!;
const calcButton = document.querySelector<HTMLButtonElement>(
	"#calculate-tou-button"
)!;

calcButton.addEventListener("click", () => {
	if (tariffSchedule) {
		calcButton.disabled = true;
		calcProgressBar.classList.remove("d-none"); // show progress bar
		resultSection.classList.add("d-none"); // hide old results
		loadData()
			.then((datum) => {
				processDatum(datum, tariffSchedule);
				resultSection.classList.remove("d-none");
			})
			.catch((reason) => {
				console.error("Error calculating ToU: %s", reason);
			})
			.finally(() => {
				calcProgressBar.classList.add("d-none");
				calcButton.disabled = false;
			});
	}
});

setupSolarNetworkIntegration(settings);

for (const form of [settingsForm, tariffForm]) {
	form.addEventListener("change", enableTouCalculation);
}

document
	.querySelector<HTMLAnchorElement>("#example-schedule-csv-01")
	?.setAttribute(
		"href",
		(() => {
			const csv = `Month,Day,Day of Week,Hour of Day,Rate\r
		January-December,,Mon-Fri,0-8,10.48\r
		January-December,,Mon-Fri,8-24,11.00\r
		January-December,,Sat-Sun,0-8,9.19\r
		January-December,,Sat-Sun,8-24,11.21\r
		`.replaceAll("\t", "");
			const uri = encodeURI("data:text/csv;charset=utf-8," + csv);
			return uri;
		})()
	);

const scheduleFileInput =
	document.querySelector<HTMLInputElement>("#scheduleCsv")!;
scheduleFileInput.addEventListener("change", parseSchedule);

function parseSchedule() {
	const files = scheduleFileInput?.files;
	if (files?.length) {
		Papa.parse(files[0], {
			complete: (results) => {
				if (!Array.isArray(results?.data)) {
					return;
				}
				try {
					// save header and process each row; every column starting from 5 is a rate
					const rules: TemporalRangesTariff[] = [];
					let header: string[] = [];
					for (let row of results.data as string[][]) {
						if (!header.length) {
							header = row;
							continue;
						}
						if (row.length >= 5) {
							const rates: TariffRate[] = [];
							for (
								let i = 4;
								i < row.length && i < header.length;
								i += 1
							) {
								const rate = TariffRate.parse(
									"en-NZ",
									header[i],
									row[i]
								);
								rates.push(rate);
							}
							const rule = TemporalRangesTariff.parse(
								"en-NZ",
								row[0],
								row[1],
								row[2],
								row[3],
								rates
							);
							rules.push(rule);
						}
					}
					if (rules.length) {
						tariffSchedule = new TemporalRangesTariffSchedule(
							rules
						);
						renderTariffSchedule();
						enableTouCalculation();
					}
				} catch (e) {
					console.warn(
						"Ignoring invalid schedule CSV from error: %s",
						e
					);
				}
			},
		});
	}
}

function renderTariffSchedule() {
	const table: HTMLTableElement = document.querySelector("#schedule-table")!;
	const tbody: HTMLTableSectionElement = table.querySelector("tbody")!;
	const tmpl: HTMLTemplateElement = document.querySelector("#schedule-rule")!;

	// clear existing rows
	while (tbody.firstChild) {
		tbody.removeChild(tbody.firstChild);
	}

	if (!tariffSchedule) {
		table.classList.add("d-none"); // hide table
		return;
	}

	const locale = new Intl.DateTimeFormat().resolvedOptions().locale;

	let idx = 0;
	for (const rule of tariffSchedule.rules) {
		const row = tmpl.content.cloneNode(true) as HTMLTableRowElement;
		replaceData(row, {
			idx: ++idx,
			months: rule.format(locale, ChronoField.MONTH_OF_YEAR),
			days: rule.format(locale, ChronoField.DAY_OF_MONTH),
			weekdays: rule.format(locale, ChronoField.DAY_OF_WEEK),
			hours: rule.format(locale, ChronoField.MINUTE_OF_DAY),
			rates: rule.rates
				? Object.keys(rule.rates).length == 1
					? Object.values(rule.rates)[0].amount
					: Object.values(rule.rates)
							.map((rate) => {
								return `${rate.id}: ${rate.amount}`;
							})
							.join(", ")
				: undefined,
		});
		tbody.appendChild(row);
	}
	table.classList.remove("d-none"); // show table
}

function enableTouCalculation() {
	calcButton.disabled = !(
		settings.startDate.valueAsDate &&
		settings.endDate.valueAsDate &&
		settings.snToken.value &&
		settings.snTokenSecret.value &&
		settings.snNodeId.value &&
		settings.snSourceId.selectedIndex > 0 &&
		settings.snDatumProperty.selectedIndex > 0 &&
		tariffSettings.tariffRate.value &&
		tariffSettings.tariffQuantity.value &&
		tariffSchedule
	);
}

const usageFormatter = new Intl.NumberFormat(undefined, {
	useGrouping: true,
	maximumFractionDigits: 0,
});

function formatUsage(n: number): string {
	if (n === undefined || n === null) {
		return "";
	}
	return usageFormatter.format(n);
}

function formatCurrency(n: number): string {
	if (n === undefined || n === null) {
		return "";
	}
	const currencyCode = tariffSettings.tariffCurrencyCode.value || "NZD";
	const fmt = new Intl.NumberFormat(undefined, {
		useGrouping: true,
		style: "currency",
		currency: currencyCode,
	});
	return fmt.format(n);
}

class TouBreakdown {
	idx: number;
	unitQuantity: number;
	rateDivisor: number;
	tariff: TemporalRangesTariff;
	usage: number;

	constructor(
		idx: number,
		unitQuantity: number,
		rateDivisor: number,
		tariff: TemporalRangesTariff
	) {
		this.idx = idx;
		this.unitQuantity = unitQuantity;
		this.rateDivisor = rateDivisor;
		this.tariff = tariff;
		this.usage = 0;
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
		return formatCurrency(this.cost);
	}
}

class Overall {
	unitQuantity: number;
	rate: number;
	readingStart: number;
	readingEnd: number;
	usage: number;

	constructor(unitQuantity: number, rate: number, readingStart: number) {
		this.unitQuantity = unitQuantity;
		this.rate = rate;
		this.readingStart = readingStart / unitQuantity;
		this.readingEnd = this.readingStart;
		this.usage = 0;
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
		return formatCurrency(this.cost);
	}
}

function betterOrWorseStyle(l: number, r: number, el: HTMLElement) {
	if (r > l) {
		el.classList.remove("text-success");
		el.classList.add("text-danger");
	} else {
		el.classList.add("text-success");
		el.classList.remove("text-danger");
	}
}

function processDatum(
	datum: GeneralDatum[],
	schedule: TemporalRangesTariffSchedule
) {
	const datumPropName = settings.snDatumProperty.value;
	const nonTouRate = tariffSettings.tariffRate.valueAsNumber;
	const rateDivisor =
		tariffSettings.tariffCurrencyUnit.value === "$" ? 1 : 100;
	const unitQuantity = tariffSettings.tariffQuantity.valueAsNumber;
	const tariffGroups = new Map<number, TouBreakdown>();
	let overall: Overall | undefined;
	let readingEnd: number = -1;
	for (const d of datum) {
		if (typeof d[datumPropName] !== "number") {
			continue;
		}
		if (!overall) {
			overall = new Overall(
				unitQuantity,
				nonTouRate / rateDivisor,
				d[datumPropName + "_start"]
			);
		}
		overall.addUsage(d[datumPropName]);

		readingEnd = d[datumPropName + "_end"];

		const tariff = schedule.firstMatch(d.date);
		if (tariff) {
			const ruleIdx = schedule.rules.indexOf(tariff);
			let groupData = tariffGroups.get(ruleIdx);
			if (!groupData) {
				groupData = new TouBreakdown(
					ruleIdx + 1,
					unitQuantity,
					rateDivisor,
					tariff
				);
				tariffGroups.set(ruleIdx, groupData);
			}
			groupData.addUsage(d[datumPropName]);
		}
	}
	if (!overall) {
		return;
	}
	overall.end(readingEnd);

	replaceData(document.querySelector("#overall-non-tou")!, {
		readingStart: overall.readingStartFormatted,
		readingEnd: overall.readingEndFormatted,
		usage: overall.usageFormatted,
		cost: overall.costFormatted,
	});

	// get sorted list of tou rule results
	const tous: TouBreakdown[] = Array.from(tariffGroups.values()).sort(
		(l, r) => {
			return l.idx < r.idx ? -1 : l.idx > r.idx ? 1 : 0;
		}
	);

	// calcualte ToU Overall cost
	let overallTouCost = 0;
	for (const b of tous) {
		overallTouCost += b.cost;
	}
	replaceData(document.querySelector("#overall-tou")!, {
		cost: formatCurrency(overallTouCost),
	});

	// calculate Overall diff
	const diffRow = document.querySelector<HTMLElement>("#overall-diff")!;
	replaceData(diffRow, {
		cost: formatCurrency(overallTouCost - overall.cost),
	});
	betterOrWorseStyle(
		overall.cost,
		overallTouCost,
		diffRow.querySelector(".data-cost")!
	);

	// render ToU breakdown
	const table: HTMLTableElement = document.querySelector(
		"#tou-breakdown-table"
	)!;
	const tbody: HTMLTableSectionElement = table.querySelector("tbody")!;
	const tmpl: HTMLTemplateElement =
		document.querySelector("#tou-breakdown-row")!;

	// clear existing rows
	while (tbody.firstChild) {
		tbody.removeChild(tbody.firstChild);
	}

	let effectiveTouRate = 0;
	for (const b of tous) {
		effectiveTouRate += b.rate * (b.usage / overall.usage);
		const row = tmpl.content.cloneNode(true) as HTMLTableRowElement;
		replaceData(row, {
			idx: b.idx,
			usage: b.usageFormatted,
			rate: b.rateFormatted,
			cost: b.costFormatted,
		});
		tbody.appendChild(row);
	}

	// render breakdown overall footer
	const totalsRow: HTMLTableElement = document.querySelector(
		"#tou-breakdown-table > tfoot > tr"
	)!;
	replaceData(totalsRow, {
		usage: overall.usageFormatted,
		rate: effectiveTouRate.toFixed(2),
		cost: formatCurrency(overallTouCost),
	});

	betterOrWorseStyle(
		nonTouRate,
		effectiveTouRate,
		totalsRow.querySelector<HTMLElement>(".data-rate")!
	);

	table.classList.remove("d-none"); // show table
}
