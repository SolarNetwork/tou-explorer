export interface ByodSettingsFormElements extends HTMLFormControlsCollection {
	usageDataFile: HTMLInputElement;
}
export interface SnSettingsFormElements extends HTMLFormControlsCollection {
	snToken: HTMLInputElement;
	snTokenSecret: HTMLInputElement;
	snNodeId: HTMLInputElement;
	snSourceId: HTMLSelectElement;
	snDatumProperty: HTMLSelectElement;
	snDatumPropertyScale: HTMLInputElement;
	startDate: HTMLInputElement;
	endDate: HTMLInputElement;
}

export interface TouFormElements extends HTMLFormControlsCollection {
	tariffCurrencyCode: HTMLInputElement;
	tariffRate: HTMLInputElement;
	tariffCurrencyUnit: HTMLSelectElement;
	tariffQuantity: HTMLInputElement;
	scheduleCsv: HTMLInputElement;
}

export interface FixedTariffFormElements extends HTMLFormControlsCollection {
	fixedTariffName: HTMLInputElement;
	fixedTariffRate: HTMLInputElement;
	fixedTariffCurrencyUnit: HTMLSelectElement;
	fixedTariffChronoUnit: HTMLSelectElement;
	fixedTariffChronoUnitSubmit: HTMLButtonElement;
}
