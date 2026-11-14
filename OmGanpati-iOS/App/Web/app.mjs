import { readField, formatEntry, calculate, money, quantity, caratRate, netGoldWeight, weightDecimal, stoneCharge, amountDecimal } from "./price.mjs";
import { decodeItem, itemFields, legacyFields, itemFromFields } from "./tags/payload.mjs";
import { labelDetails } from "./tags/label-details.mjs";
import { setupEstimate } from "./estimate.mjs";
import { readHuid } from "./huid/identity.mjs";
import { setupScanner } from "./tags/scanner.mjs";
import { setupMaker } from "./tags/maker.mjs";
import { setupIdentity } from "./huid/fields.mjs";

import { setupEmbellishments } from "./embellishments/editor.mjs";
import { validatedRows } from "./embellishments/model.mjs";

const byId = id => document.getElementById(id);
const form = byId("price-form");
const inputs = [...form.querySelectorAll("input[name]")];
const outputs = [...document.querySelectorAll("[data-amount]")];
const touched = new Set();
const toggle = byId("details-toggle");
const breakdown = byId("breakdown");
const status = byId("status");
const carat = byId("carat");
const shopRate = byId("shop-rate");
const stoneBasis = byId("stone-basis");
const overrides = new Map();
const supportedCarats = new Set([...carat.options].map(option => option.value));
const tagNotice = byId("tag-notice");
let announcement;
let scannedNetOnly = null;
const identity = setupIdentity();
const embellishments = setupEmbellishments(() => { scannedNetOnly = null; refresh(); });

function applyCarat(base, errors) {
  const k = Number(carat.value);
  const derived = caratRate(base, k);
  for (const option of carat.options) {
    const grade = Number(option.value);
    const quote = overrides.has(grade) ? readField("rate", overrides.get(grade)).value : caratRate(base, grade);
    option.textContent = grade + "K" + (quote === null ? "" : " · " + money(quote) + "/g");
  }
  byId("applied-label").textContent = k + "K rate per gram";
  shopRate.readOnly = k === 24;
  shopRate.placeholder = derived === null ? "—" : money(derived).slice(1);
  const manual = shopRate.value.trim() !== "" && k !== 24;
  const parsed = manual ? readField("rate", shopRate.value) : { value: derived, error: "" };
  byId("shop-error").textContent = parsed.error;
  shopRate.setAttribute("aria-invalid", String(Boolean(parsed.error)));
  shopRate.closest(".field").classList.toggle("invalid", Boolean(parsed.error));
  if (parsed.error) errors.push(parsed.error);
  const basis = k === 22 ? "92% of 24K" : k + "/24 of 24K";
  byId("shop-hint").textContent = k === 24 ? "Uses the 24K base rate." :
    manual ? "Shop rate · Clear to use " + basis + "." : basis + " · Edit for your shop rate.";
  return parsed.value;
}

carat.addEventListener("change", () => {
  shopRate.value = overrides.get(Number(carat.value)) || "";
  refresh();
});
shopRate.addEventListener("input", () => {
  const k = Number(carat.value);
  if (shopRate.value.trim()) overrides.set(k, shopRate.value);
  else overrides.delete(k);
  refresh();
});
stoneBasis.addEventListener("change", () => {
  touched.delete("stoneRate");
  refresh();
});

function showFieldError(input, error) {
  byId(input.name + "-error").textContent = error;
  input.setAttribute("aria-invalid", String(Boolean(error)));
  input.closest(".field").classList.toggle("invalid", Boolean(error));
}

function refresh(announce = true) {
  const emb = embellishments.read();
  stoneBasis.value = "total";
  byId("stoneWeight").value = emb.weight === null ? "" : weightDecimal(emb.weight);
  byId("stone").value = emb.amount === null ? "" : amountDecimal(emb.amount);
  const rateBasedStones = stoneBasis.value !== "total";
  byId("stone-manual-field").hidden = rateBasedStones;
  byId("stone").disabled = rateBasedStones;
  byId("stone-rate-field").hidden = !rateBasedStones;
  byId("stoneRate").disabled = !rateBasedStones;
  byId("stoneRate").required = rateBasedStones;
  byId("stone-result").hidden = !rateBasedStones;
  const stoneUnit = stoneBasis.value === "carat" ? "ct" : "g";
  byId("stone-rate-unit").textContent = "₹ / " + stoneUnit;
  byId("stoneRate-unit").textContent = "Rupees per " + (stoneBasis.value === "carat" ? "carat." : "gram.");
  const values = {};
  const errors = [];
  for (const input of inputs) {
    if (input.disabled) {
      showFieldError(input, "");
      continue;
    }
    const result = readField(input.name, input.value);
    values[input.name] = result.value;
    let error = result.error;
    if (result.value === null && !error && touched.has(input.name) && input.required) {
      if (input.name === "rate") error = "Enter the gold rate.";
      else if (input.name === "stoneRate") error = "Enter the diamond/stone rate.";
      else if (scannedNetOnly === null) error = "Enter the gross weight.";
    }
    showFieldError(input, error);
    if (error) errors.push(error);
  }

  values.stoneWeight = emb.weight;
  values.stone = emb.amount;
  errors.push(...emb.errors.map(e => `Embellishment ${e.index + 1}: ${e.message}`));
  const net = netGoldWeight(values.gross, values.stoneWeight);
  if (net.error) net.error = net.error.replace("Stone weight", "Total embellishment weight");
  if (net.error) {
    showFieldError(byId("stoneWeight"), net.error);
    errors.push(net.error);
  }
  values.weight = scannedNetOnly?.value ?? net.value;
  byId("weight").value = values.weight === null ? "—" : weightDecimal(values.weight);
  byId("weight-hint").textContent = scannedNetOnly === null
    ? "Gross weight − total embellishment weight" : "Net weight from an older tag. Enter the measured weights for a new label.";
  let stoneFormula = emb.errors.length ? "Check the embellishment rows above." : emb.items.length ? emb.items.map(row => (row.name || row.type) + ": " + money(row.amount)).join(" + ") : "No embellishments";
  if (rateBasedStones) {
    values.stone = scannedNetOnly === null ? stoneCharge(values.stoneWeight, values.stoneRate, stoneBasis.value) : null;
    if (scannedNetOnly !== null) {
      stoneFormula = "Enter gross and stone weights in grams before using a stone rate.";
      errors.push(stoneFormula);
    } else if (values.stone === null) {
      stoneFormula = stoneBasis.value === "carat"
        ? "1 ct = 0.2 g. Enter the stone rate and check the Dia/Stone weight in grams above."
        : "Enter the stone rate per gram and check the Dia/Stone weight above.";
    } else {
      const grams = weightDecimal(values.stoneWeight) + " g";
      const carats = quantity(values.stoneWeight * 5n, "stoneWeight") + " ct";
      stoneFormula = stoneBasis.value === "carat"
        ? grams + " = " + carats + " · " + carats + " × " + money(values.stoneRate) + "/ct"
        : grams + " × " + money(values.stoneRate) + "/g";
      byId("stone").value = formatEntry("stone", amountDecimal(values.stone));
    }
  }
  byId("stone-calculation").textContent = stoneFormula;
  byId("stone-formula").textContent = stoneFormula;
  values.rate = applyCarat(values.rate, errors);
  const amounts = calculate(values);
  for (const node of outputs) {
    const formatted = money(amounts[node.dataset.amount]);
    node.textContent = formatted;
    if (node.classList.contains("figure")) node.style.setProperty("--characters", formatted.length);
  }
  byId("gold-formula").textContent = amounts.gold === null
    ? "Gold rate × net gold weight"
    : carat.value + "K at " + money(values.rate) + "/g × " + quantity(values.weight, "weight") + " g";
  byId("making-formula").textContent = amounts.makingFee === null
    ? "Making % × gold value"
    : quantity(values.making, "making") + "% of " + money(amounts.gold);
  byId("tax-formula").textContent = amounts.tax === null
    ? "GST % × subtotal"
    : quantity(values.gst, "gst") + "% of " + money(amounts.subtotal);
  clearTimeout(announcement);
  if (announce) {
    const message = errors[0] || (amounts.bill === null
      ? (rateBasedStones && values.stoneRate === null ? "Enter the diamond/stone rate to see the full price." : "Enter a gold rate and the piece’s gross weight to see the price.")
      : "Bill with GST " + money(amounts.bill) + ". Price before GST " + money(amounts.subtotal) + ".");
    announcement = setTimeout(() => { status.textContent = message; }, 350);
  }
  return { values, amounts, errors };
}

for (const input of inputs) {
  input.closest(".entry").addEventListener("click", () => input.focus());
  input.addEventListener("input", () => {
    if (input.name === "gross" || input.name === "stoneWeight") scannedNetOnly = null;
    refresh();
  });
  input.addEventListener("focus", () => {
    const { decimal, error } = readField(input.name, input.value);
    if (!error && decimal && input.value !== decimal) input.value = decimal;
    input.select();
  });
  input.addEventListener("blur", () => {
    touched.add(input.name);
    const { decimal, error } = readField(input.name, input.value);
    if (!error) input.value = formatEntry(input.name, decimal);
    refresh();
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    const activeInputs = inputs.filter(field => !field.disabled);
    const index = activeInputs.indexOf(input);
    if (input.name === "rate") carat.focus();
    else if (index + 1 < activeInputs.length) activeInputs[index + 1].focus();
    else input.blur();
  });
}
form.addEventListener("submit", event => event.preventDefault());
form.addEventListener("input", () => { tagNotice.textContent = ""; });
form.addEventListener("change", () => { tagNotice.textContent = ""; });

setupScanner((code, source) => {
  // Validate the entire tag before replacing any values from a previous piece.
  const item = decodeItem(code, supportedCarats);
  identity.load(item);
  embellishments.load(item);
  stoneBasis.value = item.stoneBasis || "total";
  byId("stoneRate").value = formatEntry("stoneRate", item.stoneRate || "");
  touched.delete("stoneRate");
  carat.value = item.carat;
  shopRate.value = overrides.get(Number(item.carat)) || "";
  scannedNetOnly = item.gross === undefined ? readField("weight", item.weight) : null;
  for (const key of itemFields) byId(key).value = formatEntry(key, item[key] ?? "");
  refresh();
  tagNotice.dataset.error = "false";
  const label = source === "sample" ? "Sample tag scanned" : "Tag scanned";
  tagNotice.textContent = label + " · " + item.carat + "K · " + item.weight + " g net";
}, code => {
  const item = decodeItem(code, supportedCarats);
  const grade = Number(item.carat);
  const rate = overrides.has(grade) ? readField("rate", overrides.get(grade)).value
    : caratRate(readField("rate", byId("rate").value).value, grade);
  const values = Object.fromEntries(legacyFields.map(key => [key, readField(key, item[key]).value]));
  const totals = calculate({ ...values, rate });
  return estimateDetails(item, rate, values, totals);
});

function estimateDetails(item, rate, values, totals) {
  const rows = [["Purity", item.carat + "K"], ["HUID", item.huid || "—"]];
  if (item.gross !== undefined) {
    rows.push(["Gross weight", item.gross + " g"]);
    for (const material of labelDetails(item).materials) {
      rows.push([material.label, material.weight + " · " + material.lines[1]]);
    }
  }
  rows.push(["Net gold weight", item.weight + " g"], ["Gold rate", rate === null ? "Enter a rate in the calculator" : money(rate) + "/g"],
    ["Gold value", money(totals.gold)], ["Making (" + item.making + "%)", money(totals.makingFee)],
    ["Embellishment value", money(values.stone)], ["Price before GST", money(totals.subtotal)], ["GST (" + item.gst + "%)", money(totals.tax)],
    ["Bill with GST", money(totals.bill)]);
  return { name: item.name || "Jewellery", rows };
}

const openEstimate = setupEstimate();
byId("open-estimate").disabled = false;
byId("open-estimate").addEventListener("click", () => {
  const {values, amounts, errors} = refresh(false);
  const huid = readHuid(byId("huid").value);
  if (errors.length || amounts.bill === null || huid.error) {
    const field = form.querySelector('[aria-invalid="true"],input:required:placeholder-shown');
    if (field) field.focus();
    tagNotice.dataset.error = "true";
    tagNotice.textContent = huid.error || errors[0] || "Enter the gold rate and gross weight to create an estimate.";
    tagNotice.scrollIntoView({block:"nearest"});
    return;
  }
  const item = {name:byId("item-name").value.trim(), huid:huid.value, carat:carat.value,
    weight:weightDecimal(values.weight), making:quantity(values.making,"making"), gst:quantity(values.gst,"gst")};
  if (scannedNetOnly === null) {
    item.gross = weightDecimal(values.gross);
    item.embellishments = embellishments.rows();
  }
  openEstimate(estimateDetails(item, values.rate, values, amounts));
});

setupMaker(() => {
  const details = identity.forTag();
  const keys = scannedNetOnly === null ? itemFields : legacyFields;
  const fields = Object.fromEntries(keys.map(key => [key, key === "weight" ? scannedNetOnly.decimal : byId(key).value]));
  let detailed;
  try { detailed = validatedRows(embellishments.rows()); }
  catch(error) { error.field = "add-embellishment"; throw error; }
  if (scannedNetOnly === null) { fields.stoneWeight = detailed.weight; fields.stone = detailed.amount; }
  const item = { ...itemFromFields({ ...fields, carat: carat.value, stoneBasis: "total" }, supportedCarats), ...details };
  if (scannedNetOnly === null) item.embellishments = detailed.rows;
  return item;
}, error => {
  tagNotice.dataset.error = "true";
  tagNotice.textContent = error.message;
  if (error.field) byId(error.field).focus();
});

toggle.addEventListener("click", () => {
  breakdown.hidden = !breakdown.hidden;
  toggle.setAttribute("aria-expanded", String(!breakdown.hidden));
});

byId("reset").addEventListener("click", () => {
  form.reset();
  identity.load();
  embellishments.load({stoneWeight:"0.500",stone:"2500"});
  scannedNetOnly = null;
  tagNotice.textContent = "";
  overrides.clear();
  touched.clear();
  refresh(false);
  status.textContent = "Example values restored. Bill with GST " + document.querySelector(".bill .figure").textContent + ".";
});

refresh(false);
byId("open-scanner").disabled = false;
byId("open-maker").disabled = false;
byId("open-continuous").disabled = false;

// Quick actions share the same scanner and tag-maker flow on every screen size.
for (const button of document.querySelectorAll('[data-trigger]')) {
  button.addEventListener('click', () => byId(button.dataset.trigger).click());
  button.disabled = false;
}
