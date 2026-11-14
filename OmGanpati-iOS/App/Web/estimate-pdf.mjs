import { PDFDocument } from "./estimate-vendor/pdf-lib.mjs";

const width = 420, height = 595, margin = 30;
const ink = "#252039", plum = "#342744", gold = "#d3ae72", muted = "#645e69";
const sans = "Arial, sans-serif", serif = "Georgia, serif";

function pageCanvas(createCanvas) {
  const canvas = createCanvas();
  canvas.width = width * 3;
  canvas.height = height * 3;
  const ctx = canvas.getContext("2d");
  ctx.scale(3, 3);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return {ctx, canvas};
}

function write(ctx, value, x, y, font, color = ink, align = "left", limit = width - 2 * margin) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(String(value).replaceAll("₹", "Rs. "), x, y, limit);
}

function rule(ctx, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(margin, y, width - 2 * margin, 0.65);
}

export async function makeEstimatePDF({name, date, rows, title, disclaimer}, createCanvas = () => document.createElement("canvas")) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Om Ganpati Jewellers · " + name + " · " + title);
  pdf.setAuthor("Om Ganpati Jewellers, Sunam");
  const images = [];
  // Keep all three totals on the same page.
  const details = rows.slice(0,-3), totals = rows.slice(-3);
  const groups = [];
  while (details.length > 11) groups.push(details.splice(0,11));
  groups.push(details);
  for (const [index, lines] of groups.entries()) {
    const {ctx, canvas} = pageCanvas(createCanvas);
    ctx.fillStyle = plum;
    ctx.fillRect(0, 0, width, 98);
    ctx.fillStyle = gold;
    ctx.fillRect(0, 96, width, 2);
    // A small faceted diamond above the store location.
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [a,b] of [[[349,36],[356,28]],[[356,28],[371,28]],[[371,28],[378,36]],[[378,36],[363.5,52]],[[363.5,52],[349,36]],[[349,36],[378,36]],[[357,36],[363.5,52]],[[370,36],[363.5,52]]]) {
      ctx.moveTo(...a); ctx.lineTo(...b);
    }
    ctx.stroke();
    write(ctx,"Om Ganpati Jewellers",margin,51,"27px "+serif,"#ffffff","left",300);
    write(ctx,"SUNAM  ·  PUNJAB",margin,74,"bold 9px "+sans,gold);
    write(ctx,title,margin,127,"bold 10px "+sans,muted);
    write(ctx,date,width-margin,127,"9px "+sans,muted,"right",190);
    write(ctx,name,margin,164,"bold 24px "+serif);
    rule(ctx,180,gold);
    let y = 203;
    for (const [label,value] of lines) {
      write(ctx,label,margin,y,"10px "+sans,muted,"left",150);
      write(ctx,value,width-margin,y,"bold 10px "+sans,ink,"right",201);
      rule(ctx,y+8,"#e8e3e8");
      y += 21;
    }
    if (index === groups.length-1) {
      y += 10;
      for (const [label,value] of totals.slice(0,-1)) {
        write(ctx,label,margin,y,"11px "+sans);
        write(ctx,value,width-margin,y,"bold 11px "+sans,ink,"right",200);
        y += 22;
      }
      ctx.fillStyle=plum;
      ctx.fillRect(margin,y-10,width-2*margin,35);
      write(ctx,totals.at(-1)[0],margin+12,y+12,"bold 12px "+sans,"#ffffff");
      write(ctx,totals.at(-1)[1],width-margin-12,y+13,"bold 16px "+sans,"#ffffff","right",144);
    }
    write(ctx,disclaimer[0],margin,539,"bold 9px "+sans,muted);
    write(ctx,disclaimer[1],margin,552,"9px "+sans,muted);
    rule(ctx,560,gold);
    write(ctx,"Om Ganpati Jewellers  ·  Sunam",margin,574,"10px "+serif,muted);
    write(ctx,(index+1)+" / "+groups.length,width-margin,574,"9px "+sans,muted,"right");
    const image = canvas.toDataURL("image/png");
    images.push(image);
    const embedded = await pdf.embedPng(image);
    pdf.addPage([width,height]).drawImage(embedded,{x:0,y:0,width,height});
  }
  return {bytes:await pdf.save(), images};
}
