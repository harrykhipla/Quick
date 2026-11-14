import {labelDetails,wrapLabelLine,paginateMaterials} from './label-details.mjs';
import {rectangleLayout} from './rectangle-layout.mjs';

const logo = new Image();
logo.src = new URL('./bis-mark.png',import.meta.url).href;

export async function stockLabels(symbol,item,px=40) {
  const qrDots=Math.floor(14*px/symbol.modules);
  if(px===8 && qrDots<2) throw new Error('The QR data is too long for a readable 14 mm thermal code. Shorten descriptions or use a larger QR code.');
  const details=labelDetails(item), qr=new Image(), url=URL.createObjectURL(symbol.blob);
  try {
    qr.src=url;
    await Promise.all([qr.decode(),logo.decode()]);
    const canvas=document.createElement('canvas');
    canvas.width=100*px;canvas.height=15*px;
    const ctx=canvas.getContext('2d');ctx.scale(px,px);
    ctx.font='1.5px Arial, sans-serif';
    const measure=text=>ctx.measureText(text).width;
    const identity=details.identity.flatMap(line=>wrapLabelLine(line,measure,15.8));
    if(identity.length>8) throw new Error('Shorten the item name so the item, weights and HUID fit the label.');
    const materialPages=paginateMaterials(details.materials,measure,18.1);
    const pages=[];
    for(let page=0;page<materialPages.length;page++) {
      ctx.fillStyle='#fff';ctx.fillRect(0,0,100,15);
      ctx.fillStyle='#000';ctx.textAlign='center';
      ctx.drawImage(logo,7.7,0.9,5,5*logo.height/logo.width);
      ctx.font='bold 1.85px Georgia, serif';
      ctx.fillText('Om Ganpati',10.2,8.1);
      ctx.fillText('Jewellers',10.2,10.4);
      ctx.font='bold 1.7px Arial, sans-serif';ctx.fillText('Sunam',10.2,13);
      ctx.textAlign='left';ctx.font='1.5px Arial, sans-serif';
      identity.forEach((line,i)=>ctx.fillText(line,17,1.8+i*1.7));
      ctx.imageSmoothingEnabled=false;
      const qrSize=px===8 ? qrDots*symbol.modules/px : 14;
      const qrX=px===8 ? Math.round((33.5+(14-qrSize)/2)*px)/px : 33.5;
      const qrY=px===8 ? Math.round((0.5+(14-qrSize)/2)*px)/px : 0.5;
      ctx.drawImage(qr,qrX,qrY,qrSize,qrSize);
      ctx.font='bold 1.4px Arial, sans-serif';
      ctx.fillText(materialPages.length>1 ? `Materials ${page+1}/${materialPages.length}` : 'Embellishments',48.2,1.65);
      ctx.font='1.5px Arial, sans-serif';
      const lines=materialPages[page].length ? materialPages[page] : ['None'];
      lines.forEach((line,i)=>ctx.fillText(line,48.2,3.5+i*1.7));
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('Could not export the label.');
      pages.push({blob,widthMM:100,heightMM:15,thermalFits:Math.floor(112/symbol.modules)>=2,error:''});
    }
    return pages;
  } finally {URL.revokeObjectURL(url);}
}

export async function rectangularLabels(symbol,item,heightMM=25,px=40) {
  const details=labelDetails(item),canvas=document.createElement('canvas');
  canvas.width=58*px;canvas.height=heightMM*px;
  const ctx=canvas.getContext('2d');ctx.scale(px,px);
  ctx.font='1.625px Arial, sans-serif';
  const layout=rectangleLayout(details,text=>ctx.measureText(text).width,heightMM);
  const qrDots=Math.floor(16*8/symbol.modules);
  if(px===8 && qrDots<2) throw new Error('The QR data is too long for this label. Shorten descriptions or choose a larger QR code.');
  const qr=new Image(),url=URL.createObjectURL(symbol.blob),pages=[];
  try {
    qr.src=url;await Promise.all([qr.decode(),logo.decode()]);
    for(let page=0;page<layout.pages.length;page++) {
      ctx.fillStyle='#fff';ctx.fillRect(0,0,58,heightMM);
      ctx.save();ctx.translate(5,0); // physical paper margins, cropped for Bluetooth
      ctx.fillStyle='#000';ctx.textAlign='left';
      ctx.drawImage(logo,1,1,4,4*logo.height/logo.width);
      ctx.font='bold 1.625px Arial, sans-serif';ctx.fillText('Om Ganpati Jewellers',6,2.875);
      ctx.font='1.5px Arial, sans-serif';ctx.fillText('Sunam',6,5);
      ctx.font='1.625px Arial, sans-serif';
      layout.identity.forEach((line,i)=>ctx.fillText(line,1,layout.identityY+i*layout.leading));
      ctx.imageSmoothingEnabled=false;
      const size=px===8 ? qrDots*symbol.modules/8 : 16;
      const x=px===8 ? Math.round((31+(16-size)/2)*8)/8 : 31;
      const y=px===8 ? Math.round((1+(16-size)/2)*8)/8 : 1;
      ctx.drawImage(qr,x,y,size,size);
      ctx.font='bold 1.375px Arial, sans-serif';
      ctx.fillText(layout.pages.length>1?`Embellishments · ${page+1}/${layout.pages.length}`:'Embellishments',1,layout.materialsY-2);
      ctx.font='1.625px Arial, sans-serif';
      const lines=layout.pages[page].length?layout.pages[page]:['None'];
      lines.forEach((line,i)=>ctx.fillText(line,1,layout.materialsY+i*layout.leading));
      ctx.restore();
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('Could not export the label.');
      pages.push({blob,widthMM:58,heightMM,thermalFits:qrDots>=2});
    }
    return pages;
  } finally {URL.revokeObjectURL(url);}
}
