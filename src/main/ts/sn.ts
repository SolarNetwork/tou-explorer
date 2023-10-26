import {
	Aggregations,
	DatumFilter,
	DatumReadingTypes,
} from "solarnetwork-api-core/lib/domain";
import {
	AuthorizationV2Builder,
	SolarQueryApi,
} from "solarnetwork-api-core/lib/net";
import { DatumStreamMetadataRegistry } from "solarnetwork-api-core/lib/util";
import { datumForStreamData } from "solarnetwork-api-core/lib/util/datum";

import { SnSettingsFormElements } from "./forms";
import { GeneralDatum } from "./utils";

const urlHelper = new SolarQueryApi();
const auth = new AuthorizationV2Builder();
let settingsForm: SnSettingsFormElements;

export function setupSolarNetworkIntegration(form: SnSettingsFormElements) {
	settingsForm = form;
	for (const control of [
		settingsForm.startDate,
		settingsForm.endDate,
		settingsForm.snToken,
		settingsForm.snTokenSecret,
		settingsForm.snNodeId,
	]) {
		control.addEventListener("change", loadSources);
	}
	settingsForm.snSourceId.addEventListener("change", loadSourceProperties);
}

function toExclusiveDate(date?: Date | null): Date | undefined {
	if (!date) {
		return undefined;
	}
	date.setDate(date.getDate() + 1);
	return date;
}

/**
 * Generate SN token authorization headers for a given URL.
 *
 * @param url - the URL to authorize
 * @returns a `Headers` instance with authorization headers populated
 */
function authorizeUrl(url: string): Headers {
	const authHeader = auth.reset().snDate(true).url(url).buildWithSavedKey();
	return new Headers({
		Authorization: authHeader,
		"X-SN-Date": auth.requestDateHeaderValue!,
		Accept: "application/json",
	});
}

/**
 * Populate the Source ID drop-down menu with all source IDs
 * discovered in the given node ID.
 *
 * @param event - the event
 */
async function loadSources(event: Event) {
	const token = settingsForm.snToken.value;
	const secret = settingsForm.snTokenSecret.value;
	const nodeId = settingsForm.snNodeId.value;
	if (!(token && secret && nodeId)) {
		return;
	}

	if (
		!auth.tokenId ||
		event.target === settingsForm.snToken ||
		event.target === settingsForm.snTokenSecret
	) {
		// save credentials
		auth.tokenId = settingsForm.snToken.value;
		auth.saveSigningKey(settingsForm.snTokenSecret.value);
	}

	// get start/end date; note end date is inclusive in UI; change to exclusive here
	const startDate = settingsForm.startDate.valueAsDate;
	const endDate = toExclusiveDate(settingsForm.endDate.valueAsDate);

	const filter = new DatumFilter();
	filter.nodeId = Number(nodeId);
	if (startDate) {
		startDate.setHours(0, 0, 0, 0);
		filter.localStartDate = startDate;
	}
	if (endDate) {
		endDate.setHours(0, 0, 0, 0);
		filter.localEndDate = endDate;
	}

	const findSourcesUrl = urlHelper.findSourcesUrl(filter);
	const headers = authorizeUrl(findSourcesUrl);
	const res = await fetch(findSourcesUrl, {
		method: "GET",
		headers: headers,
	});
	const json = await res.json();
	if (json && Array.isArray(json.data)) {
		// clear out and re-populate the source IDs menu
		while (settingsForm.snSourceId.length) {
			settingsForm.snSourceId.remove(0);
		}
		if (json.data.length) {
			settingsForm.snSourceId.add(new Option("Choose...", ""));
			for (const src of json.data) {
				const opt = new Option(src.sourceId, src.sourceId);
				settingsForm.snSourceId.add(opt);
			}
		}
		settingsForm.snSourceId.selectedIndex = 0;
		settingsForm.snSourceId.dispatchEvent(
			new Event("change", { bubbles: true })
		);
	}
}

/**
 * Populate the Datum Properties drop-down menu with all accumulating properties
 * discovered in the given node ID + source ID stream metadata.
 */
async function loadSourceProperties() {
	const nodeId = settingsForm.snNodeId.value;
	const sourceId = settingsForm.snSourceId.value;
	if (!(nodeId && sourceId)) {
		return;
	}
	const filter = new DatumFilter();
	filter.nodeId = Number(nodeId);
	filter.sourceId = sourceId;
	const streamMetaUrl =
		urlHelper.baseUrl() +
		"/datum/stream/meta/node?" +
		filter.toUriEncoding();
	const headers = authorizeUrl(streamMetaUrl);
	const res = await fetch(streamMetaUrl, {
		method: "GET",
		headers: headers,
	});
	const json = await res.json();
	if (!(json && Array.isArray(json.data))) {
		return;
	}
	// save ref to current property (if any) to try to re-select same name
	let currValue =
		settingsForm.snDatumProperty.selectedIndex > 0
			? settingsForm.snDatumProperty.options[
					settingsForm.snDatumProperty.selectedIndex
			  ]!.value
			: undefined;
	// clear out and re-populate the property names menu
	while (settingsForm.snDatumProperty.length) {
		settingsForm.snDatumProperty.remove(0);
	}
	let newSelectedIndex = 0;
	if (json.data.length) {
		settingsForm.snDatumProperty.add(new Option("Choose...", ""));
		let i = 0;
		for (const meta of json.data) {
			// add all accumulating properties to menu
			if (Array.isArray(meta.a)) {
				for (const p of meta.a) {
					i += 1;
					settingsForm.snDatumProperty.add(new Option(p, p));
					if (p === currValue) {
						newSelectedIndex = i;
					}
				}
			}
		}
	}
	settingsForm.snDatumProperty.selectedIndex = newSelectedIndex;
	settingsForm.snDatumProperty.dispatchEvent(
		new Event("change", { bubbles: true })
	);
}

export async function loadData(): Promise<Iterable<GeneralDatum>> {
	const nodeId = settingsForm.snNodeId.value;
	const sourceId = settingsForm.snSourceId.value;

	// get start/end date; note end date is inclusive in UI; change to exclusive here
	const startDate = settingsForm.startDate.valueAsDate;
	const endDate = toExclusiveDate(settingsForm.endDate.valueAsDate);
	if (!(nodeId && sourceId && startDate && endDate)) {
		return Promise.reject("Incomplete settings.");
	}

	const filter = new DatumFilter();
	filter.aggregation = Aggregations.Hour;
	filter.nodeId = Number(nodeId);
	filter.sourceId = sourceId;
	if (startDate) {
		startDate.setHours(0, 0, 0, 0);
		filter.localStartDate = startDate;
	}
	if (endDate) {
		endDate.setHours(0, 0, 0, 0);
		filter.localEndDate = endDate;
	}

	const streamDataUrl =
		urlHelper.baseUrl() +
		"/datum/stream/reading?readingType=" +
		DatumReadingTypes.Difference.name +
		"&" +
		filter.toUriEncoding();
	const headers = authorizeUrl(streamDataUrl);
	const res = await fetch(streamDataUrl, {
		method: "GET",
		headers: headers,
	});
	const json = await res.json();
	if (
		!(
			json &&
			Array.isArray(json.data) &&
			Array.isArray(json.meta) &&
			json.meta.length
		)
	) {
		return Promise.reject("No data available.");
	}

	const result: GeneralDatum[] = [];
	const reg = DatumStreamMetadataRegistry.fromJsonObject(json.meta);
	if (!reg) {
		return Promise.reject("JSON could not be parsed.");
	}
	for (const data of json.data) {
		const meta = reg.metadataAt(data[0]);
		if (!meta) {
			continue;
		}
		const d = datumForStreamData(data, meta)?.toObject();
		if (d) {
			result.push(d as GeneralDatum);
		}
	}
	return Promise.resolve(result);
}
