import { ByodSettingsFormElements } from "./forms";
import { GeneralDatum } from "./utils";

import readXlsxFile from "read-excel-file";
import Papa from "papaparse";
import { timeParse } from "d3-time-format";

const EXCEL_CONTENT_TYPE =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_CONTENT_TYPE = "text/csv";

/**
 * Data property names.
 */
export enum DatumProperty {
	/** VAh */
	APPARENT_ENERGY = "apparentEnergy",

	/** VA */
	APPARENT_POWER = "apparentPower",

	/** Wh */
	ENERGY = "wattHours",

	/** W */
	POWER = "watts",

	/** PF */
	POWER_FACTOR = "powerFactor",

	/** VARh */
	REACTIVE_ENERGY = "reactiveEnergy",

	/** VAR */
	REACTIVE_POWER = "reactivePower",
}

/** A set of datum properties that represent accumulating values. */
const ACCUMULATING_PROPERTIES = new Set<DatumProperty>();

/** A mapping of accumulating property names for "starting" datum properties. */
const ACCUMULATING_PROPERTY_NAMES_START = new Map<DatumProperty, string>();

/** A mapping of accumulating property names for "ending" datum properties. */
const ACCUMULATING_PROPERTY_NAMES_END = new Map<DatumProperty, string>();

for (const p of [
	DatumProperty.APPARENT_ENERGY,
	DatumProperty.ENERGY,
	DatumProperty.REACTIVE_ENERGY,
]) {
	ACCUMULATING_PROPERTIES.add(p);
	ACCUMULATING_PROPERTY_NAMES_START.set(p, p + "_start");
	ACCUMULATING_PROPERTY_NAMES_END.set(p, p + "_end");
}

// this hard-coding of kilo-units could be made dynamic by inspecting the actual data...
const UNIT_MULTIPLIERS = new Map<DatumProperty, number>();
for (const propName of [
	DatumProperty.APPARENT_ENERGY,
	DatumProperty.APPARENT_POWER,
	DatumProperty.ENERGY,
	DatumProperty.POWER,
	DatumProperty.REACTIVE_ENERGY,
	DatumProperty.REACTIVE_POWER,
]) {
	UNIT_MULTIPLIERS.set(propName, 1000);
}

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

/**
 * Extract the header (first) row from the data.
 * @returns the header row from the data
 */
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
	const dateCol = findDateCol(headerRow); // first date col
	const timeColMinutes = extractTimeCols(headerRow); // cols that appear to be time offsets

	if (timeColMinutes.size) {
		// assume day rows with time-based columns
		return decodeDayRowsWithTimeCols(raw, dateCol, timeColMinutes);
	}

	const propMapping = extractPropertyCols(headerRow);
	if (propMapping.size) {
		return decodeRowsWithDatumPropCols(raw, dateCol, propMapping);
	}
	return [];
}

/**
 * Decode a "wide" dataset where each row represents a single day.
 *
 * In this scheme there are several columns representing time offsets, and the cell
 * value in those columns represent the energy used starting at that time offset, up
 * to the next time offset.
 *
 * @param raw - the raw data
 * @param dateCol - the index of the date (day) column
 * @param timeColMinutes - mapping of time column index to minute offset
 * @returns the decoded data
 */
function decodeDayRowsWithTimeCols(
	raw: any[][],
	dateCol: number,
	timeColMinutes: Map<number, number>
): Iterable<GeneralDatum> {
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
					if (isNaN(ts.getTime())) {
						rowNum += 1;
						timeColNum = 0;
						return this.next();
					}
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
					d[DatumProperty.ENERGY] = wh;
					d[
						ACCUMULATING_PROPERTY_NAMES_START.get(
							DatumProperty.ENERGY
						)!
					] = reading;
					d[
						ACCUMULATING_PROPERTY_NAMES_END.get(
							DatumProperty.ENERGY
						)!
					] = reading += wh;
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
 * @param headerRow - the sheet header row of column names
 * @returns a mapping of column number (0-based) to associated minute-of-day offset values
 */
function extractTimeCols(headerRow: string[]): Map<number, number> {
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

// TODO: need way to let UI specify format
const DMY_DATE_TIME = timeParse("%-m/%-d/%Y %H:%M:%S");
const DMY_DATE_HHMM = timeParse("%-m/%-d/%Y %H:%M");

function cellDate(row: any[], idx: number): Date {
	let val = undefined;
	if (idx < row.length) {
		val = row[idx];
	}
	if (val instanceof Date) {
		return val;
	}
	const num = Number(val);
	if (!isNaN(num)) {
		// treat as Excel date, as number of days since 1900-01-00 with 1900 (bug) leap year
		return new Date(EXCEL_EPOCH.getTime() + num * 24 * 60 * 60 * 1000);
	}
	let result = new Date(val);
	if (isNaN(result.getTime())) {
		let d = DMY_DATE_TIME(val);
		if (d) {
			return d;
		}
		d = DMY_DATE_HHMM(val);
		if (d) {
			return d;
		}
	}
	return result;
}

/** A mapping of datum property names to regular expressions that match header column names. */
const PROPERTY_PATTERNS = new Map<DatumProperty, RegExp>();
PROPERTY_PATTERNS.set(
	DatumProperty.APPARENT_ENERGY,
	/(?:apparent energy|VAh$)/i
);
PROPERTY_PATTERNS.set(DatumProperty.APPARENT_POWER, /(?:apparent power|VA$)/i);
PROPERTY_PATTERNS.set(
	DatumProperty.ENERGY,
	/(?:(?<!apparent ?)(?<!reactive ?)energy$|Wh$)/i
);
PROPERTY_PATTERNS.set(
	DatumProperty.POWER,
	/(?:(?<!apparent ?)(?<!reactive ?)power(?! ?factor)|W$)/i
);
PROPERTY_PATTERNS.set(DatumProperty.POWER_FACTOR, /(?:factor|PF$)/i);
PROPERTY_PATTERNS.set(
	DatumProperty.REACTIVE_ENERGY,
	/(?:reactive energy|VARh$)/i
);
PROPERTY_PATTERNS.set(DatumProperty.REACTIVE_POWER, /(?:reactive power|VAR$)/i);

/**
 * Extract a mapping of datum property column headers from a sheet header row.
 *
 * @param headerRow - the sheet header row of column names
 * @returns a mapping of column number (0-based) to associated datum stream property names
 */
function extractPropertyCols(headerRow: string[]): Map<number, DatumProperty> {
	const result = new Map<number, DatumProperty>();
	const colCount = headerRow.length;
	for (let i = 0; i < colCount; i += 1) {
		for (const [propName, regex] of PROPERTY_PATTERNS) {
			if (regex.test(headerRow[i]) && !result.has(i)) {
				result.set(i, propName);
				break;
			}
		}
	}
	return result;
}

/**
 * Decode a "wide" dataset where each row represents a single day.
 *
 * In this scheme there are several columns representing time offsets, and the cell
 * value in those columns represent the energy used starting at that time offset, up
 * to the next time offset.
 *
 * @param raw - the raw data
 * @param dateCol - the index of the date (day) column
 * @param timeColMinutes - mapping of time column index to minute offset
 * @returns the decoded data
 */
function decodeRowsWithDatumPropCols(
	raw: any[][],
	dateCol: number,
	propMapping: Map<number, DatumProperty>
): Iterable<GeneralDatum> {
	const rowCount = raw.length;
	return {
		[Symbol.iterator](): Iterator<GeneralDatum> {
			let rowNum: number = 0; // in raw
			let done: boolean = false;
			let readings = new Map<DatumProperty, number>();
			for (const propName of propMapping.values()) {
				readings.set(propName, 0);
			}
			return {
				next(): IteratorResult<GeneralDatum, number | undefined> {
					if (done) {
						return { done: done, value: undefined };
					} else if (++rowNum === rowCount) {
						done = true;
						return { done: done, value: rowNum };
					}
					let row = raw[rowNum];
					let date: Date = cellDate(row, dateCol);
					if (isNaN(date.getTime())) {
						return this.next();
					}
					const d: GeneralDatum = {
						date: date,
						nodeId: 0,
						sourceId: "",
					};
					for (const [colNum, propName] of propMapping) {
						if (colNum < row.length) {
							const n =
								Number(row[colNum]) *
								(UNIT_MULTIPLIERS.get(propName) || 1);
							if (!isNaN(n)) {
								if (ACCUMULATING_PROPERTIES.has(propName)) {
									d[
										ACCUMULATING_PROPERTY_NAMES_START.get(
											propName
										)!
									] = readings.get(propName)!;
								}
								d[propName] = n;
								if (ACCUMULATING_PROPERTIES.has(propName)) {
									const end = readings.get(propName)! + n;
									readings.set(propName, end);
									d[
										ACCUMULATING_PROPERTY_NAMES_END.get(
											propName
										)!
									] = end;
								}
							}
						}
					}
					return {
						done: false,
						value: d,
					};
				},
			};
		},
	};
}
