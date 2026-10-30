import { PDFDocument } from '../../node_modules/pdf-lib/cjs/index.js';
import fs from 'fs';
const D='/home/claude/testfiles/';
const d = await PDFDocument.create();
for (let i=0;i<6;i++){ const img=await d.embedJpg(fs.readFileSync(D+`noise${i}.jpg`)); const p=d.addPage([595,842]); p.drawImage(img,{x:20,y:20,width:555,height:555}); }
fs.writeFileSync(D+'big60mb.pdf', await d.save());
