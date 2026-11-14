import { netGoldWeight, readField, weightDecimal, stoneCharge, amountDecimal } from "../price.mjs";
import { nameError, readHuid } from "../huid/identity.mjs";

import { validatedRows } from "../embellishments/model.mjs";

const typeCodes = {diamond:"D",stone:"S",pearl:"P",other:"O"};
const basisCodes = {total:"T",carat:"C",gram:"G"};
const escapeText = text => encodeURIComponent(text).replaceAll("~", "%7E");

const charges = ["making", "stone", "gst"];
export const legacyFields = ["weight", ...charges];
export const itemFields = ["gross", "stoneWeight", ...charges];
const names = {
  gross: "Gross weight", stoneWeight: "Dia/Stone weight", weight: "Net gold weight",
  making: "Making charge", stone: "Stone value", gst: "GST", stoneRate: "Diamond/stone rate"
};

export class TagError extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}

// OGJ1 has only net grams. OGJ2 stores both measurements and derives net on read.
export function itemFromFields(fields, supportedCarats) {
  if (!supportedCarats.has(fields.carat)) throw new TagError("Choose a supported gold carat.", "carat");
  const item = { carat: fields.carat };
  const measured = "gross" in fields || "stoneWeight" in fields;
  const stoneBasis = fields.stoneBasis ?? "total";
  if (!["total", "carat", "gram"].includes(stoneBasis)) throw new TagError("Choose how to price the stones.", "stone-basis");
  const rateBased = stoneBasis !== "total";
  if (rateBased && !measured) throw new TagError("Enter gross and stone weights before using a stone rate.", "stoneWeight");
  const keys = measured ? itemFields : legacyFields;
  const values = {};
  for (const key of rateBased ? [...keys.filter(key => key !== "stone"), "stoneRate"] : keys) {
    const raw = fields[key];
    if (typeof raw !== "string" || raw.length > 48) throw new TagError("Check the " + names[key] + " field.", key);
    const { value, decimal, error } = readField(key, raw);
    if (value === null || decimal.length > 32) {
      throw new TagError(names[key] + " — " + (error || "Enter a valid value."), key);
    }
    values[key] = value;
    item[key] = decimal || "0";
  }
  if (measured) {
    const net = netGoldWeight(values.gross, values.stoneWeight);
    if (net.error) throw new TagError(net.error, "stoneWeight");
    item.weight = weightDecimal(net.value);
  }
  if (rateBased) {
    item.stoneBasis = stoneBasis;
    item.stone = amountDecimal(stoneCharge(values.stoneWeight, values.stoneRate, stoneBasis));
  }
  return item;
}

export function encodeItem(item) {
  if (item.embellishments) {
    if (nameError(item.name || "")) throw new TagError("Enter the item name to create a tag.", "item-name");
    const {rows} = validatedRows(item.embellishments);
    const packed = rows.map(r => [typeCodes[r.type] + (r.unit === "ct" ? "C" : "G") + basisCodes[r.basis] + r.weight,
      r.price, ...(r.name ? [escapeText(r.name)] : [])].join(",")).join("~");
    return ["OGJ5",item.carat,item.gross,item.making,item.gst,escapeText(item.name),item.huid || "",packed].join(":");
  }
  if (item.stoneBasis === "carat" || item.stoneBasis === "gram") {
    if (nameError(item.name || "")) throw new TagError("Enter the item name to create a tag.", "item-name");
    return ["OGJ4", item.carat, item.gross, item.stoneWeight, item.making, item.gst,
      item.stoneBasis === "carat" ? "c" : "g", item.stoneRate, encodeURIComponent(item.name), item.huid || ""].join(":");
  }
  const measured = "gross" in item;
  const keys = measured ? itemFields : legacyFields;
  const values = [item.carat, ...keys.map(key => item[key])];
  if (item.name) {
    return ["OGJ3", measured ? "2" : "1", ...values, encodeURIComponent(item.name), item.huid || ""].join(":");
  }
  return [measured ? "OGJ2" : "OGJ1", ...values].join(":");
}

function readIdentity(rawName, rawHuid) {
  let name;
  try { name = decodeURIComponent(rawName || ""); } catch { throw new TagError("The item name is damaged."); }
  if (nameError(name) || typeof rawHuid !== "string") throw new TagError("The item details are incomplete or damaged.");
  const huid = readHuid(rawHuid);
  if (huid.error) throw new TagError(huid.error);
  return { name: name.trim(), huid: huid.value };
}

const encodedDecimal = value => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) && value.length <= 32;

export function decodeItem(raw, supportedCarats) {
  if (typeof raw !== "string" || raw.length > 2048) throw new TagError("Scan a jewellery tag made with Create tag.");
  // Some handheld readers prepend an AIM symbology identifier.
  const code = raw.trim().replace(/^\][CQ]\d/, "");
  let [version, ...parts] = code.split(":");
  if (version === "OGJ5") {
    const [carat,gross,making,gst,name,huid,packed] = parts;
    if (parts.length !== 7 || ![gross,making,gst].every(encodedDecimal)) throw new TagError("The embellishment tag is incomplete or damaged.");
    const identity = readIdentity(name,huid);
    try {
      const rows = packed === "" ? [] : packed.split("~").map(record => {
        const fields = record.split(","), header = fields[0];
        if (fields.length < 2 || fields.length > 3 || !/^[DSPO][GC][TCG]/.test(header) || !encodedDecimal(header.slice(3)) || !encodedDecimal(fields[1])) throw new Error("Invalid embellishment row.");
        return {type:Object.keys(typeCodes).find(k=>typeCodes[k] === header[0]),unit:header[1] === "C" ? "ct" : "g",
          basis:Object.keys(basisCodes).find(k=>basisCodes[k] === header[2]),weight:header.slice(3),price:fields[1],name:decodeURIComponent(fields[2] || "")};
      });
      const detail = validatedRows(rows);
      return {...itemFromFields({carat,gross,making,gst,stoneWeight:detail.weight,stone:detail.amount},supportedCarats),...identity,embellishments:detail.rows};
    } catch(error) { throw new TagError("The embellishment data is invalid: " + error.message); }
  }
  // Rate-based tags store the rate and its unit; recompute the total from weight.
  if (version === "OGJ4") {
    const [carat, gross, stoneWeight, making, gst, basis, stoneRate, name, huid] = parts;
    if (parts.length !== 9 || !["c", "g"].includes(basis) || ![gross, stoneWeight, making, gst, stoneRate].every(encodedDecimal)) {
      throw new TagError("The stone pricing data is incomplete or damaged.");
    }
    const identity = readIdentity(name, huid);
    return { ...itemFromFields({ carat, gross, stoneWeight, making, gst, stoneRate,
      stoneBasis: basis === "c" ? "carat" : "gram" }, supportedCarats), ...identity };
  }
  let identity = {};
  if (version === "OGJ3") {
    const basis = parts.shift();
    if (basis !== "1" && basis !== "2") throw new TagError("The weight data is incomplete or damaged.");
    version = "OGJ" + basis;
    const rawHuid = parts.pop();
    const rawName = parts.pop();
    identity = readIdentity(rawName, rawHuid);
  }
  const [carat, ...numbers] = parts;
  if (version !== "OGJ1" && version !== "OGJ2") throw new TagError("This code uses a different tag format. Scan a tag made with Create tag.");
  const keys = version === "OGJ2" ? itemFields : legacyFields;
  if (numbers.length !== keys.length || !numbers.every(encodedDecimal)) {
    throw new TagError("The item data is incomplete or damaged. Scan the full code again.");
  }
  const fields = Object.fromEntries(keys.map((key, i) => [key, numbers[i]]));
  return { ...itemFromFields({ ...fields, carat }, supportedCarats), ...identity };
}
