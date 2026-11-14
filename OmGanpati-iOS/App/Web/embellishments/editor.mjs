import { summarize, types, MAX_ROWS, legacyRows, pricingForUnit } from './model.mjs';
import {money,weightDecimal} from '../price.mjs';
const byId=id=>document.getElementById(id);
export function setupEmbellishments(changed) {
  const list=byId('embellishment-list'), add=byId('add-embellishment');
  let serial=0;
  function values() { return [...list.children].map(card=>Object.fromEntries([...card.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value]))); }
  function append(row) {
    const id=++serial, card=document.createElement('section');card.className='embellishment-card';card.id='emb-'+id;
    card.innerHTML=`<div class="emb-heading"><strong></strong><button type="button" class="text-action emb-remove">Remove</button></div>
      <div class="emb-grid">
        <label>Type<select data-field="type">${Object.entries(types).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>
        <label><span class="emb-label-title">Description <small>optional</small></span><input data-field="name" maxlength="16" placeholder="e.g. Ruby / Polki"></label>
        <label>Weight<input data-field="weight" inputmode="decimal" maxlength="24" placeholder="0"></label>
        <label>Weight unit<select data-field="unit"><option value="g">Grams (g)</option><option value="ct">Carats (ct)</option></select></label>
        <label>Price by<select data-field="basis"><option value="total">Enter total</option><option value="carat">Rate per carat</option><option value="gram">Rate per gram</option></select></label>
        <label><span class="emb-price-label">Total value (₹)</span><input data-field="price" inputmode="decimal" maxlength="24" placeholder="0"></label>
      </div><p class="emb-unit-hint">Weight unit selects the matching rate. You can also choose Enter total.</p><p class="emb-error" role="status"></p><div class="emb-row-total"><span class="emb-grams"></span><strong class="emb-value"></strong></div>`;
    for(const input of card.querySelectorAll('[data-field]')) {
      input.value=row[input.dataset.field] ?? '';
      input.id=`emb-${id}-${input.dataset.field}`;
      input.closest('label').htmlFor=input.id;
      input.setAttribute('aria-describedby',`emb-${id}-error`);
    }
    card.querySelector('.emb-error').id=`emb-${id}-error`;
    card.querySelector('.emb-remove').addEventListener('click',()=>{card.remove();changed();add.focus();});
    list.append(card);
  }
  function renderTotals() {
    const result=summarize(values());
    [...list.children].forEach((card,i)=>{
      const raw=values()[i], own=summarize([raw]), error=own.errors[0]?.message || '';
      const title=`${i+1}. ${types[raw.type]}`;
      card.setAttribute('aria-label',`Embellishment ${i+1}`);
      card.querySelector('.emb-heading strong').textContent=title;
      card.querySelector('.emb-remove').setAttribute('aria-label',`Remove embellishment ${i+1}`);
      card.querySelector('.emb-error').textContent=error;
      card.classList.toggle('invalid',!!error);
      card.querySelector('.emb-price-label').textContent=raw.basis==='total'?'Total value (₹)':raw.basis==='carat'?'Rate (₹ / ct)':'Rate (₹ / g)';
      card.querySelector('.emb-grams').textContent=own.weight===null?'Check weight':weightDecimal(own.weight)+' g deducted';
      card.querySelector('.emb-value').textContent=money(own.amount);
    });
    byId('embellishment-empty').hidden=list.children.length>0;
    byId('embellishment-weight').textContent=result.weight===null?'—':weightDecimal(result.weight)+' g';
    byId('embellishment-value').textContent=money(result.amount);
    add.disabled=list.children.length>=MAX_ROWS;
    return result;
  }
  list.addEventListener('input',event=>{if(event.target.dataset.field !== 'unit') changed();});
  list.addEventListener('change',event=>{
    if(event.target.dataset.field === 'unit') {
      const card=event.target.closest('.embellishment-card');
      const row=Object.fromEntries([...card.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value]));
      const next=pricingForUnit(row,row.unit);
      card.querySelector('[data-field=basis]').value=next.basis;
      card.querySelector('[data-field=price]').value=next.price;
    }
    changed();
  });
  add.addEventListener('click',()=>{append({type:'diamond',name:'',weight:'',unit:'ct',basis:'carat',price:''});changed();list.lastElementChild.querySelector('[data-field=weight]').focus();});
  function load(item) { list.replaceChildren();for(const row of legacyRows(item))append(row);renderTotals(); }
  load({stoneWeight:'0.500',stone:'2500'});
  return {read:renderTotals, rows:values, load, focus(){list.querySelector('input')?.focus();}};
}
