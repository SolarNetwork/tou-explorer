import { Modal } from "bootstrap";
import { ChronoTariff, ChronoTariffUnit } from "nifty-tou";
import { FixedTariffFormElements } from "./forms";
import { ITEM, replaceData, touData } from "./utils";

function rateDisplay(rule: ChronoTariff, divisor: number): string {
	return divisor === 100 ? rule.rate + "¢" : "$" + rule.rate;
}

function chronoUnitDisplay(rule: ChronoTariff): string {
	return rule.unit === ChronoTariffUnit.DAYS
		? "day"
		: rule.unit === ChronoTariffUnit.WEEKS
		? "week"
		: "month";
}

export class RatedChronoTariff extends ChronoTariff {
	/** The rate divisor. */
	readonly #rateDivisor: number;

	/**
	 * Constructor.
	 *
	 * @param unit - the chrono unit
	 * @param rate - the rate per chrono unit
	 * @param rateDivisor - the rate divisor
	 * @param name - an optional description
	 */
	constructor(
		unit: ChronoTariffUnit,
		rate: number,
		rateDivisor: number,
		name?: string
	) {
		super(unit, rate, name);
		this.#rateDivisor = rateDivisor;
	}

	/**
	 * Get the rate divisor.
	 */
	get rateDivisor(): number {
		return this.#rateDivisor;
	}
}

export class ChronoTariffCost {
	#rule: RatedChronoTariff;
	#quantity: number;

	constructor(rule: RatedChronoTariff, quantity: number) {
		this.#rule = rule;
		this.#quantity = quantity;
	}

	get rule() {
		return this.#rule;
	}

	get quantity() {
		return this.#quantity;
	}
}

/**
 * The fixed rate UI.
 */
export class FixedUI {
	readonly #addFixedTariffForm: HTMLFormElement;
	readonly #addFixedTariffSettings: FixedTariffFormElements;
	readonly #fixedTable: HTMLTableElement;

	readonly fixedTariffs: RatedChronoTariff[] = [];

	constructor() {
		this.#addFixedTariffForm =
			document.querySelector<HTMLFormElement>("#add-fixed-modal")!;
		this.#addFixedTariffSettings = this.#addFixedTariffForm
			.elements as unknown as FixedTariffFormElements;
		this.#fixedTable =
			document.querySelector<HTMLTableElement>("#fixed-table")!;

		this.#addFixedTariffForm.addEventListener("shown.bs.modal", () => {
			this.#addFixedTariffSettings.fixedTariffName.focus();
		});

		this.#addFixedTariffForm.addEventListener("hidden.bs.modal", () => {
			this.#addFixedTariffForm.reset();
			this.#addFixedTariffSettings.fixedTariffChronoUnitSubmit.disabled =
				true;
		});

		this.#addFixedTariffSettings.fixedTariffRate.addEventListener(
			"change",
			this.#enableAddFixedTariff.bind(this)
		);
		this.#addFixedTariffSettings.fixedTariffRate.addEventListener(
			"keyup",
			this.#enableAddFixedTariff.bind(this)
		);

		this.#addFixedTariffSettings.fixedTariffChronoUnitSubmit.addEventListener(
			"click",
			this.#addFixedTariff.bind(this)
		);

		this.#fixedTable.addEventListener(
			"click",
			this.#removeFixedTariff.bind(this)
		);
	}

	#enableAddFixedTariff() {
		this.#addFixedTariffSettings.fixedTariffChronoUnitSubmit.disabled =
			!this.#addFixedTariffSettings.fixedTariffRate.value;
	}

	#addFixedTariff() {
		const chronoUnit =
			ChronoTariffUnit[
				this.#addFixedTariffSettings.fixedTariffChronoUnit.options[
					this.#addFixedTariffSettings.fixedTariffChronoUnit
						.selectedIndex
				].value as keyof typeof ChronoTariffUnit
			];
		const rateDivisor =
			this.#addFixedTariffSettings.fixedTariffCurrencyUnit.value === "$"
				? 1
				: 100;
		const rule = new RatedChronoTariff(
			chronoUnit,
			this.#addFixedTariffSettings.fixedTariffRate.valueAsNumber,
			rateDivisor,
			this.#addFixedTariffSettings.fixedTariffName.value
		);
		const idx = this.fixedTariffs.length;
		this.fixedTariffs.push(rule);

		const tmpl: HTMLTemplateElement =
			document.querySelector("#fixed-rule")!;
		const copy = tmpl.content.cloneNode(true);
		const row = (copy as DocumentFragment).querySelector(
			"tr"
		) as HTMLTableRowElement;
		replaceData(row, {
			idx: idx + 1,
			name: rule.name,
			rate: rateDisplay(rule, rateDivisor),
			chronoUnit: chronoUnitDisplay(rule),
		});
		touData(row, ITEM, rule);
		const tbody: HTMLTableSectionElement =
			this.#fixedTable.querySelector("tbody")!;
		tbody.appendChild(row);
		this.#fixedTable.classList.remove("d-none");

		Modal.getInstance(this.#addFixedTariffForm)?.hide();
	}

	#removeFixedTariff(event: Event) {
		const target = event.target as HTMLElement | null;
		if (target && !target.classList.contains("delete")) {
			return;
		}
		let el = target;
		while (el) {
			const rule = touData(el, ITEM) as RatedChronoTariff | undefined;
			if (rule !== undefined) {
				const idx = this.fixedTariffs.indexOf(rule);
				if (idx >= 0) {
					this.fixedTariffs.splice(idx, 1);
				}
				let i = 0;
				el.remove();
				if (this.fixedTariffs.length) {
					for (const row of this.#fixedTable.querySelectorAll<HTMLTableRowElement>(
						"tbody > tr"
					)) {
						replaceData(row, { idx: ++i });
					}
				} else {
					this.#fixedTable.classList.add("d-none");
				}
				return;
			}
			el = el.parentElement;
		}
	}

	costs(from: Date, to: Date): ChronoTariffCost[] {
		const result = [] as ChronoTariffCost[];
		for (const rule of this.fixedTariffs) {
			const quantity = rule.quantity(from, to);
			result.push(new ChronoTariffCost(rule, quantity));
		}
		return result;
	}
}
