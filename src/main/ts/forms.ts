export interface SettingsFormElements extends HTMLFormControlsCollection {
	snToken: HTMLInputElement;
	snTokenSecret: HTMLInputElement;
	snNodeId: HTMLInputElement;
	snSourceId: HTMLSelectElement;
	snDatumProperty: HTMLSelectElement;
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
