import { ByodSettingsFormElements } from "./forms";
import { GeneralDatum } from "./utils";

import readXlsxFile from "read-excel-file";
import Papa from "papaparse";

const EXCEL_CONTENT_TYPE =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_CONTENT_TYPE = "text/csv";

/** The datum property used for the parsed energy value. */
export const ENERGY_DATUM_PROPERTY = "wattHours";

const ENERGY_DATUM_PROPERTY_START = ENERGY_DATUM_PROPERTY + "_start";
const ENERGY_DATUM_PROPERTY_END = ENERGY_DATUM_PROPERTY + "_end";

let settingsForm: ByodSettingsFormElements;
let rawData: any[][] | undefined;
let datumStream: Iterable<GeneralDatum> | undefined;

export function setupByodIntegration(form: ByodSettingsFormElements) {
	settingsForm = form;
	settingsForm.usageDataFile.addEventListener("change", () => {
		if (rawData) {
			console.debug("Reset parsed data.");
			rawData = undefined;
			datumStream = undefined;
		}
	});
}

export async function extractHeader(): Promise<string[]> {
	if (rawData && rawData.length) {
		return rawData[0];
	}
	try {
		rawData = await parseData(settingsForm.usageDataFile?.files);
		console.debug("Parsed raw data: %o", rawData);
		if (rawData && rawData.length) {
			return rawData[0];
		}
		return Promise.reject("No data available.");
	} catch (e) {
		console.warn(e);
		return Promise.reject(e);
	}
}

export async function loadData(): Promise<Iterable<GeneralDatum>> {
	if (datumStream) {
		return datumStream;
	}
	try {
		rawData = await parseData(settingsForm.usageDataFile?.files);
		console.debug("Parsed raw data: %o", rawData);
		datumStream = decodeData(rawData);
		console.debug("Decoded data: %o", Array.from(datumStream));
		return datumStream;
	} catch (e) {
		console.warn(e);
		return Promise.reject(e);
	}
}

async function parseData(files: FileList | null): Promise<any[][]> {
	if (!files?.length) {
		return Promise.reject("No file provided.");
	}
	const file = files[0];
	console.info(
		"Data file provided: type [%s] name [%s]",
		file.type,
		file.name
	);
	if (
		file.type === EXCEL_CONTENT_TYPE ||
		file.name.toLowerCase().endsWith(".xslx")
	) {
		return readXlsxFile(file);
	} else if (
		file.type === CSV_CONTENT_TYPE ||
		file.name.toLowerCase().endsWith(".csv")
	) {
		return parseCsvData(file);
	}
	return Promise.reject("Unsupported file type.");
}

async function parseCsvData(file: File): Promise<any[][]> {
	return new Promise((resolve, reject) => {
		Papa.parse(file, {
			complete: (results) => {
				if (!Array.isArray(results?.data)) {
					reject("No CSV data available.");
				}
				resolve(results.data as string[][]);
			},
		});
	});
}

function decodeData(raw: any[][]): Iterable<GeneralDatum> {
	if (!(raw && raw.length > 1)) {
		return [];
	}
	const headerRow = raw[0];
	const colCount = headerRow.length;
	if (colCount > 24) {
		// assume day rows with time-based columns
		return decodeDayRowsWithTimeCols(raw);
	}
	return [];
}

function decodeDayRowsWithTimeCols(raw: any[][]): Iterable<GeneralDatum> {
	const headerRow = raw[0];
	const dateCol = findDateCol(headerRow);
	const timeColMinutes = extractTimeCols(headerRow);
	if (timeColMinutes.size < 1) {
		throw new Error("Time columns not discovered.");
	}
	const timeCols = Array.from(timeColMinutes.keys());
	const rowCount = raw.length;
	const timeColsCount = timeCols.length;
	return {
		[Symbol.iterator](): Iterator<GeneralDatum> {
			let rowNum: number = 1; // in raw
			let timeColNum: number = 0; // in timeCols
			let done: boolean = false;
			let row = raw[rowNum];
			let date: Date = cellDate(row, dateCol);
			let reading = 0;
			return {
				next(): IteratorResult<GeneralDatum, number | undefined> {
					if (done) {
						return { done: done, value: undefined };
					} else if (rowNum === rowCount) {
						done = true;
						return { done: done, value: rowNum };
					}
					const colNum = timeCols[timeColNum];
					const minutes = timeColMinutes.get(colNum)!;
					const ts = new Date(date.getTime() + minutes * 60 * 1000);
					const kwh = Number(row[colNum]);
					timeColNum += 1;
					if (timeColNum === timeColsCount) {
						rowNum += 1;
						timeColNum = 0;
						if (rowNum < rowCount) {
							row = raw[rowNum];
							date = cellDate(row, dateCol);
						}
					}
					const d: GeneralDatum = {
						date: ts,
						nodeId: 0,
						sourceId: "",
					};
					const wh = kwh * 1000;
					d[ENERGY_DATUM_PROPERTY] = wh;
					d[ENERGY_DATUM_PROPERTY_START] = reading;
					d[ENERGY_DATUM_PROPERTY_END] = reading += wh;
					return {
						done: false,
						value: d,
					};
				},
			};
		},
	};
}

const DATE_HEADER_PATTERN = /date/i;

function findDateCol(headerRow: any[]): number {
	const len = headerRow.length;
	for (let i = 0; i < len; i += 1) {
		if (DATE_HEADER_PATTERN.test(headerRow[i])) {
			return i;
		}
	}
	throw new Error("Date column not found in [" + headerRow.join(",") + "]");
}

// match with 3 groups of hour, min, am/pm
const TIME_HEADER_PATTERN = /^(\d{1,2})(?:$|:(\d{2})(AM?|PM?)?$)/i;

/**
 * Extract a mapping of time offset column headers from a sheet header row.
 *
 * @param headerRow the sheet header row of column names
 * @returns a mapping of column number (0-based) to associated minute-of-day offset values
 */
function extractTimeCols(headerRow: any[]): Map<number, number> {
	const result = new Map<number, number>();
	const len = headerRow.length;
	for (let i = 0; i < len; i += 1) {
		const match = TIME_HEADER_PATTERN.exec(headerRow[i]);
		if (match) {
			let minutes = Number(match[1]) * 60;
			if (match[2]) {
				minutes += Number(match[2]);
			}
			if (match[3] && match[3].toLowerCase().startsWith("p")) {
				minutes += 12 * 60;
			}
			result.set(i, minutes);
		}
	}
	return result;
}

// see http://www.cpearson.com/excel/datetime.htm for good explaination of Excel date encoding
const EXCEL_EPOCH = new Date(1899, 11, 30);

function cellDate(row: any[], idx: number): Date {
	let val = undefined;
	if (idx < row.length) {
		val = row[idx];
	}
	const num = Number(val);
	if (!isNaN(num)) {
		// treat as Excel date, as number of days since 1900-01-00 with 1900 (bug) leap year
		return new Date(EXCEL_EPOCH.getTime() + num * 24 * 60 * 60 * 1000);
	}
	return new Date(val as any);
}
