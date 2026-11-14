import {wrapLabelLine,paginateMaterials} from './label-details.mjs';

// All measurements are millimetres inside the centred 48 mm printable area.
// The paper is 58 mm wide; its 5 mm side margins are not sent to the head.
export function rectangleLayout(details, measure, heightMM = 25) {
  if (!Number.isInteger(heightMM) || heightMM < 20 || heightMM > 100) {
    throw new Error('Enter the height of one sticker, from 20 to 100 mm (without the gap).');
  }
  const identity = [details.identity[0], details.identity[1]+' · '+details.identity[5],
    details.identity[2]+' · '+details.identity[4], details.identity[3]]
    .flatMap(line => wrapLabelLine(line,measure,29));
  const leading = 1.875, identityY = 8;
  const materialsY = Math.max(19.5, identityY + (identity.length-1)*leading + 4);
  const capacity = Math.floor((heightMM - 1 - materialsY) / leading) + 1;
  if (capacity < 1) throw new Error('The item details need a taller sticker. Increase Label height or shorten the item name.');
  // Keep the weight and selected rate together, without dropping any materials.
  const materials = details.materials.map(material => ({lines:[material.lines.join(' · ')]}));
  const pages = paginateMaterials(materials,measure,46,capacity);
  return {identity,identityY,leading,materialsY,pages};
}
