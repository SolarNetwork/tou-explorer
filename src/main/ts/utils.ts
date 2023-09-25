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

export interface GeneralDatum extends Object {
	nodeId: number;
	sourceId: string;
	date: Date;
	[index: string]: any;
}

/**
 * Replace elements with `data-X` class values with the value of `X`.
 *
 * `X` stands for a property on the given `data` object.
 *
 * @param root - the root element to replace data in
 * @param data - the data to replace
 */
export function replaceData(root: HTMLElement, data: any) {
	for (const prop in data) {
		for (const el of root.querySelectorAll(
			".data-" + prop
		) as NodeListOf<HTMLElement>) {
			const val = data[prop];
			el.textContent = val !== undefined ? "" + val : "";
		}
	}
}
