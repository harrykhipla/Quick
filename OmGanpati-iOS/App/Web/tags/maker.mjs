import {encodeItem} from './payload.mjs';
import {money,readField} from '../price.mjs';
import {writeSymbol} from './write-symbol.mjs';
import {stockLabels,rectangularLabels} from './stock-label.mjs';
import {labelDetails} from './label-details.mjs';
import {setupPrinter} from '../printing/panel.mjs';
import {rasterizeLabel} from '../printing/label-command.mjs';

const byId=id=>document.getElementById(id);
export function setupMaker(getItem,reportError) {
  const dialog=byId('make-dialog'),preview=byId('tag-preview'),paper=byId('tag-print-sheet');
  const save=byId('save-tag'),print=byId('browser-print-tag'),feedback=byId('make-feedback');
  const pageSelect=byId('tag-page'),pageControl=byId('tag-page-control');
  const heightInput=byId('label-height');
  try {const saved=Number(localStorage.getItem('ogj-rectangle-height'));if(Number.isInteger(saved)&&saved>=20&&saved<=100)heightInput.value=String(saved);} catch {}
  const pageStyle=document.createElement('style');document.head.append(pageStyle);
  let item,revision=0,imageURLs=[],printable=false,format='rectangle',heightMM=25;
  const makeLabels=(symbol,px)=>format==='rectangle'?rectangularLabels(symbol,item,heightMM,px):stockLabels(symbol,item,px);
  const printer=setupPrinter(async reverse=>{
    const symbol=await writeSymbol(encodeItem(item),'label');
    const labels=await makeLabels(symbol,8);
    return Promise.all(labels.map(label=>rasterizeLabel(label.blob,{format,reverse})));
  },busy=>{
    dialog.querySelector('.format-picker').disabled=busy;
    heightInput.disabled=busy;
    print.disabled=busy || !printable;
  });
  function releaseImages() {
    imageURLs.forEach(url=>URL.revokeObjectURL(url));imageURLs=[];
    paper.replaceChildren();pageControl.hidden=true;
  }
  function selectPage() {
    const index=Number(pageSelect.value) || 0;
    preview.src=imageURLs[index];
    preview.alt=['label','rectangle'].includes(format) ? `Jewellery label ${index+1} of ${imageURLs.length}: individual embellishment weights and selected prices` : `${format==='qr'?'QR':'Code 128'} tag for ${item.carat}K, ${item.weight} grams`;
    save.href=imageURLs[index];
    save.download=`OmGanpati-${item.carat}K-${item.weight}g-${format==='rectangle'?`58x${heightMM}mm-horizontal`:format==='label'?'100x15mm':format==='qr'?'QR':'Code128'}${imageURLs.length>1?'-'+(index+1)+'-of-'+imageURLs.length:''}.png`;
  }
  pageSelect.addEventListener('change',selectPage);
  async function render() {
    const run=++revision;
    format=dialog.querySelector('input[name=tag-format]:checked').value;
    const isStock=['label','rectangle'].includes(format),measured=item.gross!==undefined;
    heightMM=Number(heightInput.value);
    byId('rectangle-size').hidden=format!=='rectangle';
    pageStyle.textContent='';
    save.removeAttribute('href');save.setAttribute('aria-disabled','true');
    releaseImages();printable=false;print.disabled=true;printer.setReady(false);printer.setLayout(format);
    document.body.classList.remove('printing-tag');preview.hidden=true;
    feedback.dataset.error='false';feedback.textContent='Preparing your tag…';
    byId('tag-item').textContent=item.name+' · '+item.carat+'K';
    byId('tag-weights').textContent=(measured?'Gross '+item.gross+' g · Less '+item.stoneWeight+' g · ':'')+'Net '+item.weight+' g';
    byId('tag-charges').textContent='Making '+item.making+'% · Embellishments '+money(readField('stone',item.stone).value)+' · GST '+item.gst+'%';
    byId('tag-embellishments').textContent='';
    if(isStock && !measured) {
      feedback.textContent='This older tag stores net weight only. Enter gross and embellishment weights in the calculator for a full label, or choose a code-only format.';return;
    }
    try {
      if(measured) byId('tag-embellishments').textContent=labelDetails(item).materials.map(material=>material.lines.join(' · ')).join('\n');
      const text=encodeItem(item);byId('label-data').textContent=text;
      const symbol=await writeSymbol(text,format);
      const labels=isStock?await makeLabels(symbol,40):[symbol];
      if(run!==revision || !dialog.open) return;
      if(isStock) pageStyle.textContent=`@page { size: ${labels[0].widthMM}mm ${labels[0].heightMM}mm; margin: 0; }`;
      if(format==='rectangle') {try {localStorage.setItem('ogj-rectangle-height',String(heightMM));} catch {}}
      imageURLs=labels.map(label=>URL.createObjectURL(label.blob));
      pageSelect.replaceChildren(...labels.map((_,i)=>new Option(`Label ${i+1} of ${labels.length}`,String(i))));
      pageControl.hidden=labels.length===1;
      selectPage();
      const sheets=labels.map((label,i)=>{
        const image=new Image();image.src=imageURLs[i];image.className='print-tag-page';
        image.style.setProperty('--symbol-width',label.widthMM+'mm');
        return image;
      });
      paper.replaceChildren(...sheets);
      await Promise.all([preview.decode(),...sheets.map(image=>image.decode())]);
      if(run!==revision || !dialog.open) return;
      preview.hidden=false;save.removeAttribute('aria-disabled');printable=true;print.disabled=false;
      const fits=labels.every(label=>label.thermalFits!==false);
      printer.setReady(isStock && fits,!fits?'This item has too much QR data for the small thermal label. Shorten descriptions or choose a larger QR code.':'');
      byId('print-tag').textContent=labels.length>1?`Print ${labels.length}-label set`:'Print tag';
      byId('printer-test').textContent=labels.length>1?`Test 1 set (${labels.length} labels)`:'Test one tag';
      document.body.classList.add('printing-tag');
      feedback.textContent=isStock ? (labels.length>1 ? `${labels.length} labels per set keep every embellishment readable. Each label repeats the item, total deduction and full QR data. Print sends the complete set; Save PNG saves the selected label. ` : 'Each embellishment shows its weight and selected rate or total. ')+(format==='rectangle'?`Horizontal · 58 × ${heightMM} mm. The shop details and QR stay together on each sticker.`:'100 × 15 mm; the fastening tail stays blank.') : 'Print at actual size, about '+Math.round(symbol.widthMM)+' × '+Math.round(symbol.heightMM)+' mm. '+(format==='linear'?'Choose QR for a smaller code.':'Keep the white border.');
    } catch(error) {
      if(run!==revision || !dialog.open) return;
      feedback.dataset.error='true';feedback.textContent=error.message || 'Could not prepare the tag. Try Create tag again.';
    }
  }
  byId('open-maker').addEventListener('click',()=>{
    try {item=getItem();} catch(error) {reportError(error);return;}
    dialog.showModal();printer.open();render();
  });
  dialog.querySelector('.format-picker').addEventListener('change',render);
  heightInput.addEventListener('input',render);
  print.addEventListener('click',()=>{if(!print.disabled) window.print();});
  dialog.addEventListener('close',()=>{
    if(dialog.open) return;
    printer.close();printable=false;printer.setReady(false);pageStyle.textContent='';
    revision++;releaseImages();document.body.classList.remove('printing-tag');
  });
}
