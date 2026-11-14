const goldWeight = { places: 4, positive: true, group: false, example: "12.350", positiveMessage: "Enter a weight above zero." };
const rules = {
  rate:   { places: 2, positive: true,  group: true,  example: "7,600", positiveMessage: "Enter a gold rate above zero." },
  weight: goldWeight,
  gross: goldWeight,
  stoneWeight: { places: 4, positive: false, group: false, example: "0.670" },
  making: { places: 4, positive: false, group: false, example: "12.5" },
  stone:  { places: 2, positive: false, group: true,  example: "2,500" },
  stoneRate: { places: 2, positive: false, required: true, group: true, example: "1,000" },
  gst:    { places: 4, positive: false, group: false, example: "3" }
};

const indian = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const groupedNumber = /^(?:(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d*)?|\.\d+)$/;
const scale = places => 10n ** BigInt(places);

export function readField(key, raw) {
  const rule = rules[key];
  let clean = raw.trim();
  if (!clean) return { value: rule.positive || rule.required ? null : 0n, decimal: "", error: "" };
  if (rule.group) clean = clean.replace(/^₹\s*/, "");
  if (key === "weight" || key === "gross" || key === "stoneWeight") clean = clean.replace(/\s*g$/i, "");
  if (key === "making" || key === "gst") clean = clean.replace(/\s*%$/, "");

  const invalid = error => ({ value: null, decimal: "", error });
  if (clean.startsWith("-")) {
    return invalid(rule.positiveMessage || "Enter zero or a positive number.");
  }
  if (!groupedNumber.test(clean)) {
    return invalid("Enter a number such as " + rule.example + ".");
  }
  const [whole = "", fraction = ""] = clean.replaceAll(",", "").split(".");
  if (fraction.replace(/0+$/, "").length > rule.places) {
    return invalid("Use up to " + rule.places + " decimal places.");
  }
  const units = BigInt(whole || "0");
  const digits = fraction.slice(0, rule.places);
  const value = units * scale(rule.places) + BigInt(digits.padEnd(rule.places, "0"));
  if (rule.positive && value === 0n) return invalid(rule.positiveMessage);
  if (key === "gst" && value > 100n * scale(rule.places)) return invalid("GST must be between 0 and 100%.");
  const decimal = units.toString() + (digits ? "." + digits : "");
  return { value, decimal, error: "" };
}

export function formatEntry(key, decimal) {
  if (!decimal || !rules[key].group) return decimal;
  const [whole, fraction] = decimal.split(".");
  return indian.format(BigInt(whole)) + (fraction ? "." + fraction : "");
}

export function money(paise) {
  if (paise === null) return "—";
  const fraction = paise % 100n;
  const decimals = fraction ? "." + fraction.toString().padStart(2, "0") : "";
  return "₹" + indian.format(paise / 100n) + decimals;
}

export function quantity(units, key) {
  const places = rules[key].places;
  const base = scale(places);
  const fraction = (units % base).toString().padStart(places, "0").replace(/0+$/, "");
  return indian.format(units / base) + (fraction ? "." + fraction : "");
}

// Round each displayed charge to a whole paisa before using it in the bill.
const rounded = (numerator, denominator) => (numerator + denominator / 2n) / denominator;
const weightScale = scale(rules.weight.places);
const makingDivisor = 100n * scale(rules.making.places);
const gstDivisor = 100n * scale(rules.gst.places);

export function amountDecimal(paise) {
  return (paise / 100n).toString() + "." + (paise % 100n).toString().padStart(2, "0");
}

// Weight stays in grams. One metric carat is exactly 0.2 g.
export function stoneCharge(weight, rate, basis) {
  if (weight === null || rate === null || !["carat", "gram"].includes(basis)) return null;
  return rounded(weight * rate * (basis === "carat" ? 5n : 1n), weightScale);
}

export function netGoldWeight(gross, stoneWeight) {
  if (gross === null || stoneWeight === null) return { value: null, error: "" };
  if (stoneWeight > gross) return { value: null, error: "Stone weight cannot exceed gross weight." };
  if (stoneWeight === gross) return { value: 0n, error: "The net gold weight is zero. Check the weights to price this piece." };
  return { value: gross - stoneWeight, error: "" };
}

// Jewellery weights display to the milligram, retaining a fourth decimal when entered.
export function weightDecimal(units) {
  const fraction = (units % weightScale).toString().padStart(rules.weight.places, "0");
  return (units / weightScale).toString() + "." + fraction.replace(/0$/, "");
}

export function calculate({ rate, weight, making, stone, gst }) {
  const hasGold = rate !== null && weight !== null && weight > 0n;
  const gold = hasGold ? rounded(rate * weight, weightScale) : null;
  const makingFee = gold !== null && making !== null ? rounded(gold * making, makingDivisor) : null;
  const subtotal = makingFee !== null && stone !== null ? gold + makingFee + stone : null;
  const tax = subtotal !== null && gst !== null ? rounded(subtotal * gst, gstDivisor) : null;
  const bill = tax !== null ? subtotal + tax : null;
  const perGram = bill !== null ? rounded(bill * weightScale, weight) : null;
  return { gold, makingFee, stone, subtotal, tax, bill, perGram };
}

export function caratRate(base, carat) {
  if (base === null) return null;
  if (carat === 22) return rounded(base * 92n, 100n);
  return rounded(base * BigInt(carat), 24n);
}
