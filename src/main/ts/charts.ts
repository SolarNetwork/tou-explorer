import bb, { area, spline, zoom } from "billboard.js";
import { GeneralDatum } from "./utils";
import { DatumProperty } from "./byodata";
import { timeFormat } from "d3-time-format";
import { rollup, rollups, mean, sum } from "d3-array";
import { seasonForDate } from "solarnetwork-api-core/lib/util/dates";

const tooltipDateFormat = timeFormat("%Y-%m-%d %H:%M");

let datum: GeneralDatum[];

export interface SeriesConfig {
	propName?: string | DatumProperty;
	displayName?: string;
	scale?: number;
}

export function renderCharts(
	data: Iterable<GeneralDatum>,
	config?: SeriesConfig
) {
	datum = Array.from(data);
	generateEnergyChart(config);
	generateSeasonalWeekdayChart(config);
	generateSeasonalTimeOfDayChart(config);
}

function seriesConfig(config?: SeriesConfig): Required<SeriesConfig> {
	return {
		propName: config?.propName || DatumProperty.ENERGY,
		displayName: config?.displayName || "Energy (kWh)",
		scale: 1000 / (config?.scale || 1),
	};
}

function generateEnergyChart(config?: SeriesConfig) {
	const c = seriesConfig(config);
	bb.generate({
		data: {
			json: datum,
			keys: {
				x: "date",
				value: [c.propName],
			},
			type: area(),
		},
		axis: {
			x: {
				type: "timeseries",
				tick: {
					count: 6,
					fit: false,
					format: "%Y-%m-%d %H:%M",
				},
				padding: {
					left: 20,
					right: 10,
					unit: "px",
				},
			},
			y: {
				label: c.displayName,
				tick: {
					format: function (v: number) {
						return v / c.scale;
					},
				},
			},
		},
		legend: {
			hide: true,
		},
		zoom: {
			enabled: zoom(),
			type: "drag",
		},
		tooltip: {
			format: {
				title: tooltipDateFormat,
				name: () => "Energy",
			},
		},
		point: {
			focus: {
				only: true,
			},
		},
		bindto: "#chart-energy",
	});
}

function seasonNameForDate(date: Date): string {
	const n = seasonForDate(date, true);
	switch (n) {
		case 0:
			return "Autumn";
		case 1:
			return "Winter";
		case 2:
			return "Spring";
		default:
			return "Summer";
	}
}

const weekdayTooltipFormat = timeFormat("%A");

const WEEKDAYS: Date[] = [];
for (let i = 1; i < 8; i++) {
	WEEKDAYS.push(new Date(2024, 0, i));
}

const WEEKDAY_COLUMNS: any[] = ["x"].concat(...(WEEKDAYS as any));

function generateSeasonalWeekdayChart(config?: SeriesConfig) {
	const c = seriesConfig(config);
	const days = rollups(
		datum,
		(D) => sum(D, (d) => d[c.propName]),
		(d) => {
			const day = new Date(d.date);
			day.setHours(0, 0, 0, 0);
			return day;
		}
	); // array of [Date, number(sumOfWattHours)]
	const data = rollup(
		days,
		(D) => mean(D, (d) => d[1]),
		(d) => seasonNameForDate(d[0]),
		(d) => {
			const dow = d[0].getDay();
			return new Date(2024, 0, dow === 0 ? 7 : dow);
		}
	);
	const result: any[] = [WEEKDAY_COLUMNS];
	for (const [season, dows] of data) {
		const series: any[] = [season];
		for (const dow of WEEKDAYS) {
			series.push(dows.get(dow));
		}
		result.push(series);
	}

	bb.generate({
		data: {
			x: "x",
			columns: result,
			type: spline(),
			colors: {
				Autumn: "#762123",
				Winter: "#80a3b7",
				Spring: "#5c8726",
				Summer: "#e9a712",
			},
		},
		axis: {
			x: {
				type: "timeseries",
				tick: {
					count: 7,
					fit: false,
					format: "%a",
				},
				padding: {
					left: 20,
					right: 10,
					unit: "px",
				},
			},
			y: {
				label: c.displayName,
				tick: {
					format: function (v: number) {
						return v / c.scale;
					},
				},
			},
		},
		legend: {
			hide: false,
		},
		tooltip: {
			format: {
				title: weekdayTooltipFormat,
			},
		},
		point: {
			focus: {
				only: true,
			},
		},
		bindto: "#chart-weekday-seasonal",
	});
}

const timeOfDayTooltipFormat = timeFormat("%H:%M");

const HOURS_OF_DAY: Date[] = [];
for (let i = 0; i < 24; i++) {
	HOURS_OF_DAY.push(new Date(2024, 0, 1, i));
}

const HOURS_OF_DAY_COLUMNS: any[] = ["x"].concat(...(HOURS_OF_DAY as any));

function generateSeasonalTimeOfDayChart(config?: SeriesConfig) {
	const c = seriesConfig(config);
	const hours = rollups(
		datum,
		(D) => sum(D, (d) => d[c.propName]),
		(d) => {
			const hour = new Date(d.date);
			hour.setMinutes(0, 0, 0);
			return hour;
		}
	); // array of [Date, number(sumOfWattHours)]
	const data = rollup(
		hours,
		(D) => mean(D, (d) => d[1]),
		(d) => seasonNameForDate(d[0]),
		(d) => new Date(2024, 0, 1, d[0].getHours())
	);
	const result: any[] = [HOURS_OF_DAY_COLUMNS];
	for (const [season, hods] of data) {
		const series: any[] = [season];
		for (const hod of HOURS_OF_DAY) {
			series.push(hods.get(hod));
		}
		result.push(series);
	}

	bb.generate({
		data: {
			x: "x",
			columns: result,
			type: spline(),
			colors: {
				Autumn: "#762123",
				Winter: "#80a3b7",
				Spring: "#5c8726",
				Summer: "#e9a712",
			},
		},
		axis: {
			x: {
				type: "timeseries",
				tick: {
					count: 7,
					fit: false,
					format: "%H:%M",
				},
				padding: {
					left: 20,
					right: 10,
					unit: "px",
				},
			},
			y: {
				label: c.displayName,
				tick: {
					format: function (v: number) {
						return v / c.scale;
					},
				},
			},
		},
		legend: {
			hide: false,
		},
		tooltip: {
			format: {
				title: timeOfDayTooltipFormat,
			},
		},
		point: {
			focus: {
				only: true,
			},
		},
		bindto: "#chart-timeofday-seasonal",
	});
}
