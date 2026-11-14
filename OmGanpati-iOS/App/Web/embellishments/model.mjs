import { readField, stoneCharge, weightDecimal, amountDecimal } from '../price.mjs';
export const types = {diamond:'Diamond', stone:'Stone', pearl:'Pearl', other:'Other'};
export const MAX_ROWS = 8;
// A unit change selects its matching rate. Convert existing unit rates instead
// of reinterpreting a per-carat price as a per-gram price (or a total as a rate).
export function pricingForUnit(row, unit) {
  if (!['g','ct'].includes(unit)) throw new Error('Choose grams or carats.');
  const basis = unit === 'ct' ? 'carat' : 'gram';
  if (row.basis === basis) return {basis, price:row.price};
  if (row.basis === 'total') return {basis, price:''};
  const rate = readField('stoneRate',row.price);
  if (rate.value === null) return {basis, price:''};
  return {basis, price:amountDecimal(basis === 'gram' ? rate.value * 5n : (rate.value + 2n) / 5n)};
}
export function summarize(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new Error('Use up to 8 embellishment rows.');
  let weight = 0n, amount = 0n;
  const items = [], errors = [];
  rows.forEach((row, index) => {
    const fail = message => { errors.push({index, message}); };
    if (!row || !Object.hasOwn(types,row.type) || !['g','ct'].includes(row.unit) || !['total','gram','carat'].includes(row.basis)) { fail('Choose a valid type, weight unit and pricing method.');return; }
    if (typeof row.name !== 'string' || row.name.length > 16 || /[\x00-\x1f]/.test(row.name)) { fail('Use a description up to 16 characters.');return; }
    if (typeof row.weight !== 'string' || row.weight.length > 24 || typeof row.price !== 'string' || row.price.length > 24) { fail('Check the weight and price.');return; }
    if (!row.weight.trim()) { fail('Enter this material’s weight (or 0 if it has no weight).');return; }
    if (row.unit === 'ct' && /g\s*$/i.test(row.weight)) { fail('Enter carats, or select grams as the weight unit.');return; }
    const w = readField('stoneWeight',row.weight), p = readField(row.basis === 'total' ? 'stone' : 'stoneRate',row.price);
    if (w.value === null) { fail(w.error || 'Enter the weight.'); return; }
    if (row.unit === 'ct' && w.value % 5n !== 0n) { fail('Use carat weight in steps of 0.0005 ct (or enter grams).');return; }
    const grams = row.unit === 'ct' ? w.value / 5n : w.value;
    const value = p.value === null ? null : row.basis === 'total' ? p.value : stoneCharge(grams,p.value,row.basis);
    weight += grams;
    if (value === null) fail(p.error || 'Enter the rate, or use Enter total.');
    else amount += value;
    items.push({...row, name:row.name.trim(), weight:w.decimal || '0', price:p.decimal || '0', grams, amount:value});
  });
  const weightValid = items.length === rows.length;
  return {weight:weightValid ? weight : null, amount:errors.length ? null : amount, items, errors};
}
export function validatedRows(rows) {
  const result = summarize(rows);
  if (result.errors.length) throw new Error(`Embellishment ${result.errors[0].index + 1}: ${result.errors[0].message}`);
  return {rows:result.items.map(({type,name,weight,unit,basis,price})=>({type,name,weight,unit,basis,price})), weight:weightDecimal(result.weight), amount:amountDecimal(result.amount)};
}
export function legacyRows(item) {
  if (item.embellishments) return item.embellishments;
  if (Number(item.stoneWeight || 0) === 0 && Number(item.stone || 0) === 0 && !item.stoneBasis) return [];
  return [{type:'stone',name:'',weight:item.stoneWeight || '0',unit:'g',basis:item.stoneBasis || 'total',price:item.stoneBasis ? item.stoneRate : item.stone || '0'}];
}
