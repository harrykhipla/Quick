import {summarize,legacyRows,types} from '../embellishments/model.mjs';
import {readField,money,weightDecimal,netGoldWeight} from '../price.mjs';

const compactWeight = n => weightDecimal(n).replace(/\.?0+$/, '');

export function labelDetails(item) {
  const summary=summarize(legacyRows(item));
  if(summary.errors.length) throw new Error(summary.errors[0].message);
  const gross=readField('gross',item.gross).value;
  const net=netGoldWeight(gross,summary.weight);
  if(net.value === null || net.error) throw new Error(net.error || 'Check the gross weight.');
  const materials=summary.items.map(row=>{
    const label=types[row.type]+(row.name ? ' ('+row.name+')' : '');
    const showCarats=row.type === 'diamond' || row.unit === 'ct';
    const grams=(showCarats ? weightDecimal(row.grams) : compactWeight(row.grams))+'g';
    const carats=compactWeight(row.grams*5n)+'ct';
    // Print the selected price and basis for every material. A rate is not the
    // extended row total, and a manual total must never become an inferred rate.
    const price=readField(row.basis === 'total' ? 'stone' : 'stoneRate',row.price).value;
    const pricing=money(price)+(row.basis === 'carat' ? '/ct' : row.basis === 'gram' ? '/g' : ' total');
    const weight=showCarats ? carats+' / '+grams : grams;
    return {label,weight,price,basis:row.basis,lines:[label+': '+weight,pricing]};
  });
  return {
    identity:['Item: '+item.name,'Purity: '+item.carat+'K','Gross: '+compactWeight(gross)+'g',
      'Less: '+compactWeight(summary.weight)+'g','Net: '+compactWeight(net.value)+'g','HUID: '+(item.huid || '—')],
    materials,
    deduction:weightDecimal(summary.weight),net:weightDecimal(net.value)
  };
}

// Wrap without ellipsis or horizontal compression; the renderer supplies its
// real font metrics. Whole material blocks stay together on continuation labels.
export function wrapLabelLine(text,measure,width) {
  const lines=[];
  let line='';
  for(const word of text.split(/\s+/)) {
    const candidate=line ? line+' '+word : word;
    if(measure(candidate)<=width) {line=candidate;continue;}
    if(line) {lines.push(line);line='';}
    for(const char of word) {
      if(measure(line+char)>width && line) {lines.push(line);line='';}
      line+=char;
    }
  }
  if(line.trim()) lines.push(line.trim());
  return lines.map(line=>line.trim());
}

export function paginateMaterials(materials,measure,width,capacity=7) {
  const pages=[[]];
  for(const material of materials) {
    const lines=material.lines.flatMap(line=>wrapLabelLine(line,measure,width));
    if(lines.length>capacity) throw new Error('Shorten this embellishment description so it fits the label.');
    let page=pages.at(-1);
    if(page.length+lines.length>capacity) {page=[];pages.push(page);}
    page.push(...lines);
  }
  return pages;
}
