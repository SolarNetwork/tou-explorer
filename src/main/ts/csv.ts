import {
	TariffRate,
	TemporalRangesTariff,
	TemporalRangesTariffSchedule,
	YearTemporalRangesTariff,
	YearTemporalRangesTariffSchedule,
} from "nifty-tou";

import Papa from "papaparse";

import { TariffSchedule } from "./utils";

export interface ParsedSchedule {
	schedule?: TariffSchedule;
	yearMode?: boolean;
}

export async function parseScheduleCsv(
	files: FileList | null
): Promise<ParsedSchedule> {
	if (!files?.length) {
		return Promise.resolve({});
	}
	return new Promise((resolve, reject) => {
		const result: ParsedSchedule = { yearMode: false };
		Papa.parse(files[0], {
			complete: (results) => {
				if (!Array.isArray(results?.data)) {
					reject("No CSV data available.");
				}
				try {
					// save header and process each row
					const rules: TemporalRangesTariff[] = [];
					let header: string[] = [];
					for (let row of results.data as string[][]) {
						if (!header.length) {
							header = row;
							if (
								header.length > 5 &&
								header[0].toLowerCase().indexOf("year") >= 0
							) {
								// switch to year-mode
								result.yearMode = true;
							}
							continue;
						}
						if (row.length >= 5) {
							const rates: TariffRate[] = [];
							for (
								let i = result.yearMode ? 5 : 4;
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
							if (result.yearMode) {
								const rule =
									YearTemporalRangesTariff.parseYears(
										"en-NZ",
										row[0],
										row[1],
										row[2],
										row[3],
										row[4],
										rates
									);
								rules.push(rule);
							} else {
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
					}
					if (rules.length) {
						if (result.yearMode) {
							result.schedule =
								new YearTemporalRangesTariffSchedule(
									rules as YearTemporalRangesTariff[],
									{ yearExtend: true }
								);
						} else {
							result.schedule = new TemporalRangesTariffSchedule(
								rules,
								{ multipleMatch: true }
							);
						}
						resolve(result);
					}
					reject("No rows available.");
				} catch (e) {
					console.warn(
						"Ignoring invalid schedule CSV from error: %s",
						e
					);
					reject(e);
				}
			},
		});
	});
}
