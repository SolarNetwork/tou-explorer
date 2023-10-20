import "../scss/style.scss";
import "bootstrap";
import {
	loadData as byodLoadData,
	setupByodIntegration,
	DatumProperty,
} from "./byodata.ts";
import { loadData as snLoadData, setupSolarNetworkIntegration } from "./sn.ts";
import {
	ChronoField,
	TemporalRangesTariff,
	TemporalRangesTariffSchedule,
	TemporalRangesTariffScheduleOptions,
} from "nifty-tou";
import { TouBreakdown, OverallUsage } from "./breakdown";
import { parseScheduleCsv } from "./csv";
import {
	ByodSettingsFormElements,
	SnSettingsFormElements,
	TouFormElements,
} from "./forms";
import {
	GeneralDatum,
	TariffSchedule,
	formatCurrency,
	replaceData,
} from "./utils";

const ACTIVE_TARIFF_CLASS = "active-tariff";

let tariffSchedule: TariffSchedule | undefined;

const byodSettingsTab =
	document.querySelector<HTMLButtonElement>("#data-byodata-tab")!;
const byodSettingsForm = document.querySelector<HTMLFormElement>(
	"#data-byodata-settings"
)!;
const byodSettings =
	byodSettingsForm.elements as unknown as ByodSettingsFormElements;
const snSettingsForm =
	document.querySelector<HTMLFormElement>("#data-sn-settings")!;
const snSettings = snSettingsForm.elements as unknown as SnSettingsFormElements;
const tariffForm = document.querySelector<HTMLFormElement>("#tou-settings")!;
const tariffSettings = tariffForm.elements as unknown as TouFormElements;
const calcProgressBar = document.querySelector<HTMLElement>("#calc-progress")!;
const resultSection = document.querySelector<HTMLElement>("#tou-results")!;
const calcButton = document.querySelector<HTMLButtonElement>(
	"#calculate-tou-button"
)!;

/**
 * The type of data source.
 */
enum DataSource {
	BYOD,
	SN,
}

function currentDataSource(): DataSource {
	return byodSettingsTab.classList.contains("active")
		? DataSource.BYOD
		: DataSource.SN;
}

// populate app version and then display it
replaceData(document.querySelector<HTMLElement>("#app-version")!, {
	"app-version": APP_VERSION,
}).classList.add("d-md-block");

document
	.querySelector<HTMLElement>("#data-settings-tabs")!
	.addEventListener("shown.bs.tab", () => {
		enableTouCalculation();
	});

calcButton.addEventListener("click", () => {
	const sched = tariffSchedule;
	if (sched) {
		calcButton.disabled = true;
		calcProgressBar.classList.remove("d-none"); // show progress bar
		resultSection.classList.add("d-none"); // hide old results
		(currentDataSource() === DataSource.BYOD ? byodLoadData : snLoadData)()
			.then((datum) => {
				processDatum(datum, sched);
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

setupByodIntegration(byodSettings);
setupSolarNetworkIntegration(snSettings);

for (const form of [snSettingsForm, tariffForm]) {
	form.addEventListener("change", enableTouCalculation);
}

const scheduleFileInput =
	document.querySelector<HTMLInputElement>("#scheduleCsv")!;
scheduleFileInput.addEventListener("change", parseSchedule);
parseSchedule();

async function parseSchedule() {
	try {
		const parsed = await parseScheduleCsv(scheduleFileInput?.files);
		const yearMode = !!parsed.yearMode;
		tariffSchedule = parsed.schedule;
		renderTariffSchedule(yearMode);
		enableTouCalculation();
		scheduleUpdateActiveTariffRules();
	} catch (e) {
		console.warn(e);
	}
}

function updateActiveTariffRules() {
	if (!tariffSchedule) {
		return;
	}
	const table: HTMLTableElement = document.querySelector("#schedule-table")!;
	const rows = table.querySelectorAll<HTMLTableRowElement>("tbody > tr")!;
	const activeRules = tariffSchedule.matches(new Date());
	for (
		let i = 0;
		i < rows.length && i < tariffSchedule.rules.length;
		i += 1
	) {
		if (activeRules.indexOf(tariffSchedule.rules[i]) >= 0) {
			rows[i].classList.add(ACTIVE_TARIFF_CLASS);
		} else {
			rows[i].classList.remove(ACTIVE_TARIFF_CLASS);
		}
	}
}

function scheduleUpdateActiveTariffRules() {
	const delay = (60 - new Date().getSeconds()) * 1000 + 5;
	setTimeout(() => {
		updateActiveTariffRules();
		scheduleUpdateActiveTariffRules();
	}, delay);
}

function renderTariffSchedule(yearMode: boolean) {
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
	const activeRules = tariffSchedule.matches(new Date());

	let idx = 0;
	for (const rule of tariffSchedule.rules) {
		const copy = tmpl.content.cloneNode(true);
		const row = (copy as DocumentFragment).querySelector(
			"tr"
		) as HTMLTableRowElement;
		replaceData(row, {
			idx: ++idx,
			years: rule.format(locale, ChronoField.YEAR),
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
		if (activeRules.indexOf(rule) >= 0) {
			row.classList.add(ACTIVE_TARIFF_CLASS);
		}
		tbody.appendChild(row);
	}

	for (const el of table.querySelectorAll<HTMLElement>(".year")) {
		if (yearMode) {
			el.classList.remove("d-none");
		} else {
			el.classList.add("d-none");
		}
	}

	table.classList.remove("d-none"); // show table
}

function enableTouCalculation() {
	const mode = currentDataSource();
	calcButton.disabled = !(
		tariffSettings.tariffRate.value &&
		tariffSettings.tariffQuantity.value &&
		tariffSchedule &&
		(mode === DataSource.BYOD
			? !!byodSettings.usageDataFile.files?.length
			: snSettings.startDate.valueAsDate &&
			  snSettings.endDate.valueAsDate &&
			  snSettings.snToken.value &&
			  snSettings.snTokenSecret.value &&
			  snSettings.snNodeId.value &&
			  snSettings.snSourceId.selectedIndex > 0 &&
			  snSettings.snDatumProperty.selectedIndex > 0)
	);
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

function processDatum<
	T extends TemporalRangesTariff,
	O extends TemporalRangesTariffScheduleOptions
>(datum: Iterable<GeneralDatum>, schedule: TemporalRangesTariffSchedule<T, O>) {
	const datumPropName =
		snSettings.snDatumProperty.value || DatumProperty.ENERGY;
	const nonTouRate = tariffSettings.tariffRate.valueAsNumber;
	const rateDivisor =
		tariffSettings.tariffCurrencyUnit.value === "$" ? 1 : 100;
	const unitQuantity = tariffSettings.tariffQuantity.valueAsNumber;
	const tariffGroups = new Map<number, TouBreakdown>();
	let overall: OverallUsage | undefined;
	let readingEnd: number = -1;
	for (const d of datum) {
		if (typeof d[datumPropName] !== "number") {
			continue;
		}
		if (!overall) {
			overall = new OverallUsage(
				unitQuantity,
				nonTouRate / rateDivisor,
				d[datumPropName + "_start"],
				tariffSettings.tariffCurrencyCode.value
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
					tariff,
					tariffSettings.tariffCurrencyCode.value
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

	replaceData(document.querySelector<HTMLElement>("#overall-non-tou")!, {
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
	replaceData(document.querySelector<HTMLElement>("#overall-tou")!, {
		cost: formatCurrency(
			overallTouCost,
			tariffSettings.tariffCurrencyCode.value
		),
	});

	// calculate Overall diff
	const diffRow = document.querySelector<HTMLElement>("#overall-diff")!;
	replaceData(diffRow, {
		cost: formatCurrency(
			overallTouCost - overall.cost,
			tariffSettings.tariffCurrencyCode.value
		),
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
		cost: formatCurrency(
			overallTouCost,
			tariffSettings.tariffCurrencyCode.value
		),
	});

	betterOrWorseStyle(
		nonTouRate,
		effectiveTouRate,
		totalsRow.querySelector<HTMLElement>(".data-rate")!
	);

	table.classList.remove("d-none"); // show table
}
