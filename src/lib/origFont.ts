// Write new text with a font that is already embedded in the PDF, so edited text looks exactly like the original.
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFRawStream, PDFRef, PDFPage, decodePDFRawStream } from 'pdf-lib';

const N = (s: string) => PDFName.of(s);
const look = (doc: PDFDocument, o: any) => (o instanceof PDFRef ? doc.context.lookup(o) : o);
const num = (o: any) => (o instanceof PDFNumber ? o.asNumber() : undefined);
// Adobe glyph names → Unicode (Latin, punctuation, symbols)
const AGL: Record<string, number> = {"A":65,"AE":198,"AEacute":508,"Aacute":193,"Abreve":258,"Acircumflex":194,"Adieresis":196,"Agrave":192,"Amacron":256,"Aogonek":260,"Aring":197,"Aringacute":506,"Atilde":195,"B":66,"C":67,"Cacute":262,"Ccaron":268,"Ccedilla":199,"Ccircumflex":264,"Cdotaccent":266,"D":68,"Dcaron":270,"Dcroat":272,"Delta":8710,"E":69,"Eacute":201,"Ebreve":276,"Ecaron":282,"Ecircumflex":202,"Edieresis":203,"Edotaccent":278,"Egrave":200,"Emacron":274,"Eng":330,"Eogonek":280,"Eth":208,"Euro":8364,"F":70,"G":71,"Gbreve":286,"Gcaron":486,"Gcircumflex":284,"Gdotaccent":288,"H":72,"Hbar":294,"Hcircumflex":292,"I":73,"IJ":306,"Iacute":205,"Ibreve":300,"Icircumflex":206,"Idieresis":207,"Idotaccent":304,"Ifraktur":8465,"Igrave":204,"Imacron":298,"Iogonek":302,"Itilde":296,"J":74,"Jcircumflex":308,"K":75,"L":76,"Lacute":313,"Lcaron":317,"Ldot":319,"Lslash":321,"M":77,"N":78,"Nacute":323,"Ncaron":327,"Ntilde":209,"O":79,"OE":338,"Oacute":211,"Obreve":334,"Ocircumflex":212,"Odieresis":214,"Ograve":210,"Ohorn":416,"Ohungarumlaut":336,"Omacron":332,"Omega":8486,"Oslash":216,"Oslashacute":510,"Otilde":213,"P":80,"Q":81,"R":82,"Racute":340,"Rcaron":344,"Rfraktur":8476,"S":83,"Sacute":346,"Scaron":352,"Scedilla":350,"Scircumflex":348,"T":84,"Tbar":358,"Tcaron":356,"Thorn":222,"U":85,"Uacute":218,"Ubreve":364,"Ucircumflex":219,"Udieresis":220,"Ugrave":217,"Uhorn":431,"Uhungarumlaut":368,"Umacron":362,"Uogonek":370,"Uring":366,"Utilde":360,"V":86,"W":87,"Wcircumflex":372,"X":88,"Y":89,"Yacute":221,"Ycircumflex":374,"Ydieresis":376,"Z":90,"Zacute":377,"Zcaron":381,"Zdotaccent":379,"a":97,"aacute":225,"abreve":259,"acircumflex":226,"acute":180,"adieresis":228,"ae":230,"aeacute":509,"agrave":224,"aleph":8501,"amacron":257,"ampersand":38,"angle":8736,"aogonek":261,"approxequal":8776,"aring":229,"aringacute":507,"arrowboth":8596,"arrowdblboth":8660,"arrowdbldown":8659,"arrowdblleft":8656,"arrowdblright":8658,"arrowdblup":8657,"arrowdown":8595,"arrowleft":8592,"arrowright":8594,"arrowup":8593,"arrowupdn":8597,"arrowupdnbse":8616,"asciicircum":94,"asciitilde":126,"asterisk":42,"asteriskmath":8727,"at":64,"atilde":227,"b":98,"backslash":92,"bar":124,"braceleft":123,"braceright":125,"bracketleft":91,"bracketright":93,"brokenbar":166,"bullet":8226,"c":99,"cacute":263,"carriagereturn":8629,"ccaron":269,"ccedilla":231,"ccircumflex":265,"cdotaccent":267,"cedilla":184,"cent":162,"circlemultiply":8855,"circleplus":8853,"colon":58,"colonmonetary":8353,"comma":44,"congruent":8773,"copyright":169,"currency":164,"d":100,"dagger":8224,"daggerdbl":8225,"dcaron":271,"dcroat":273,"degree":176,"dieresis":168,"divide":247,"dollar":36,"dong":8363,"dotlessi":305,"dotmath":8901,"e":101,"eacute":233,"ebreve":277,"ecaron":283,"ecircumflex":234,"edieresis":235,"edotaccent":279,"egrave":232,"eight":56,"element":8712,"ellipsis":8230,"emacron":275,"emdash":8212,"emptyset":8709,"endash":8211,"eng":331,"eogonek":281,"equal":61,"equivalence":8801,"estimated":8494,"eth":240,"exclam":33,"exclamdbl":8252,"exclamdown":161,"existential":8707,"f":102,"figuredash":8210,"five":53,"fiveeighths":8541,"florin":402,"four":52,"fraction":8260,"franc":8355,"g":103,"gbreve":287,"gcaron":487,"gcircumflex":285,"gdotaccent":289,"germandbls":223,"gradient":8711,"grave":96,"greater":62,"greaterequal":8805,"guillemotleft":171,"guillemotright":187,"guilsinglleft":8249,"guilsinglright":8250,"h":104,"hbar":295,"hcircumflex":293,"hyphen":45,"i":105,"iacute":237,"ibreve":301,"icircumflex":238,"idieresis":239,"igrave":236,"ij":307,"imacron":299,"infinity":8734,"integral":8747,"intersection":8745,"iogonek":303,"itilde":297,"j":106,"jcircumflex":309,"k":107,"kgreenlandic":312,"l":108,"lacute":314,"lcaron":318,"ldot":320,"less":60,"lessequal":8804,"lira":8356,"logicaland":8743,"logicalnot":172,"logicalor":8744,"longs":383,"lslash":322,"m":109,"macron":175,"minus":8722,"minute":8242,"mu":181,"multiply":215,"n":110,"nacute":324,"napostrophe":329,"ncaron":328,"nine":57,"notelement":8713,"notequal":8800,"notsubset":8836,"ntilde":241,"numbersign":35,"o":111,"oacute":243,"obreve":335,"ocircumflex":244,"odieresis":246,"oe":339,"ograve":242,"ohorn":417,"ohungarumlaut":337,"omacron":333,"one":49,"onedotenleader":8228,"oneeighth":8539,"onehalf":189,"onequarter":188,"onethird":8531,"ordfeminine":170,"ordmasculine":186,"orthogonal":8735,"oslash":248,"oslashacute":511,"otilde":245,"p":112,"paragraph":182,"parenleft":40,"parenright":41,"partialdiff":8706,"percent":37,"period":46,"periodcentered":183,"perpendicular":8869,"perthousand":8240,"peseta":8359,"plus":43,"plusminus":177,"prescription":8478,"product":8719,"propersubset":8834,"propersuperset":8835,"proportional":8733,"q":113,"question":63,"questiondown":191,"quotedbl":34,"quotedblbase":8222,"quotedblleft":8220,"quotedblright":8221,"quoteleft":8216,"quotereversed":8219,"quoteright":8217,"quotesinglbase":8218,"quotesingle":39,"r":114,"racute":341,"radical":8730,"rcaron":345,"reflexsubset":8838,"reflexsuperset":8839,"registered":174,"s":115,"sacute":347,"scaron":353,"scedilla":351,"scircumflex":349,"second":8243,"section":167,"semicolon":59,"seven":55,"seveneighths":8542,"similar":8764,"six":54,"slash":47,"space":32,"sterling":163,"suchthat":8715,"summation":8721,"t":116,"tbar":359,"tcaron":357,"therefore":8756,"thorn":254,"three":51,"threeeighths":8540,"threequarters":190,"trademark":8482,"two":50,"twodotenleader":8229,"twothirds":8532,"u":117,"uacute":250,"ubreve":365,"ucircumflex":251,"udieresis":252,"ugrave":249,"uhorn":432,"uhungarumlaut":369,"umacron":363,"underscore":95,"underscoredbl":8215,"union":8746,"universal":8704,"uogonek":371,"uring":367,"utilde":361,"v":118,"w":119,"wcircumflex":373,"weierstrass":8472,"x":120,"y":121,"yacute":253,"ycircumflex":375,"ydieresis":255,"yen":165,"z":122,"zacute":378,"zcaron":382,"zdotaccent":380,"zero":48};
const WIN_HI: Record<number, number> = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x2c6, 0x89: 0x2030, 0x8a: 0x160, 0x8b: 0x2039, 0x8c: 0x152, 0x8e: 0x17d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x2dc, 0x99: 0x2122, 0x9a: 0x161, 0x9b: 0x203a, 0x9c: 0x153, 0x9e: 0x17e, 0x9f: 0x178 };

export type Encoder = { key: PDFName; encode: (ch: string) => { hex: string; w: number } | null; space: number };

/** Read a ToUnicode CMap: code (hex string) ↔ Unicode text. */
function parseToUnicode(src: string): Map<string, string> {
  const m = new Map<string, string>();
  const hexToStr = (h: string) => { let s = ''; for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return s; };
  for (const blk of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const r of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) m.set(r[1].toLowerCase(), hexToStr(r[2]));
  for (const blk of src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const r of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(r[1], 16), hi = parseInt(r[2], 16), len = r[1].length;
      if (hi - lo > 5000) continue;
      if (r[3].startsWith('[')) { const list = [...r[3].matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => x[1]); for (let c = lo; c <= hi; c++) if (list[c - lo]) m.set(c.toString(16).padStart(len, '0'), hexToStr(list[c - lo])); }
      else { const base = r[3].slice(1, -1); const start = parseInt(base.slice(-4), 16); const pre = hexToStr(base.slice(0, -4)); for (let c = lo; c <= hi; c++) m.set(c.toString(16).padStart(len, '0'), pre + String.fromCharCode(start + c - lo)); }
    }
  }
  return m;
}

/** All fonts on a page (and inside its forms), by key. */
function pageFonts(doc: PDFDocument, page: PDFPage): [PDFName, PDFDict][] {
  const out: [PDFName, PDFDict][] = [];
  const res = page.node.Resources();
  const fd = look(doc, res?.get(N('Font'))) as PDFDict | undefined;
  if (fd instanceof PDFDict) for (const [k, v] of fd.entries()) { const f = look(doc, v); if (f instanceof PDFDict) out.push([k, f]); }
  return out;
}

/** An encoder for the page font whose name matches, or null if it can't be reused. */
export function originalFont(doc: PDFDocument, page: PDFPage, baseName: string): Encoder | null {
  const strip = (s: string) => s.replace(/^\/?[A-Z]{6}\+/, '').replace(/^\//, '');
  const want = strip(baseName);
  const hit = pageFonts(doc, page).find(([, f]) => strip(String(f.get(N('BaseFont')) ?? '')) === want);
  if (!hit) return null;
  const [key, f] = hit;
  const sub = f.get(N('Subtype'));
  if (sub === N('Type3')) return null;
  const tu = look(doc, f.get(N('ToUnicode')));
  const map = tu instanceof PDFRawStream ? parseToUnicode(new TextDecoder('latin1').decode(decodePDFRawStream(tu).decode())) : new Map<string, string>();
  const rev = new Map<string, string>(); // unicode → code
  for (const [code, u] of map) if (u.length === 1 && !rev.has(u)) rev.set(u, code);
  const widths = new Map<string, number>();
  if (sub === N('Type0')) {
    const enc = f.get(N('Encoding'));
    if (enc !== N('Identity-H')) return null;
    if (!map.size) return null;
    const desc = look(doc, (look(doc, f.get(N('DescendantFonts'))) as PDFArray)?.get(0)) as PDFDict;
    const dw = num(desc?.get(N('DW'))) ?? 1000;
    const W = look(doc, desc?.get(N('W'))) as PDFArray | undefined;
    const cw = new Map<number, number>();
    if (W instanceof PDFArray) {
      const a = W.asArray().map((x) => look(doc, x));
      for (let i = 0; i < a.length;) {
        const c1 = num(a[i]); if (c1 === undefined) break;
        if (a[i + 1] instanceof PDFArray) { (a[i + 1] as PDFArray).asArray().forEach((w, k) => cw.set(c1 + k, num(look(doc, w)) ?? dw)); i += 2; }
        else { const c2 = num(a[i + 1]) ?? c1, w = num(a[i + 2]) ?? dw; for (let c = c1; c <= c2 && c - c1 < 20000; c++) cw.set(c, w); i += 3; }
      }
    }
    for (const [u, code] of rev) widths.set(u, cw.get(parseInt(code, 16)) ?? dw);
    const sp = rev.get(' ');
    return { key, space: (sp ? widths.get(' ')! : 250) / 1000, encode: (ch) => { const c = rev.get(ch); return c ? { hex: c.padStart(4, '0'), w: (widths.get(ch) ?? dw) / 1000 } : null; } };
  }
  // simple fonts (Type1, TrueType): one byte per character
  const first = num(f.get(N('FirstChar'))) ?? 0;
  const ws = (look(doc, f.get(N('Widths'))) as PDFArray | undefined)?.asArray().map((x) => num(look(doc, x)) ?? 0);
  if (!ws) return null;
  const byCode = new Map<number, string>();
  if (map.size) for (const [code, u] of map) { if (code.length <= 2) byCode.set(parseInt(code, 16), u); }
  else {
    // no ToUnicode: use the encoding (WinAnsi with Differences)
    for (let c = 32; c < 256; c++) { const u = c >= 0x80 && c <= 0x9f ? WIN_HI[c] : c; if (u) byCode.set(c, String.fromCharCode(u)); }
    const enc = look(doc, f.get(N('Encoding')));
    const diff = enc instanceof PDFDict ? (look(doc, enc.get(N('Differences'))) as PDFArray | undefined) : undefined;
    if (diff) { let c = 0; for (const x of diff.asArray()) { const v = look(doc, x); if (v instanceof PDFNumber) c = v.asNumber(); else if (v instanceof PDFName) { const u = AGL[v.asString().slice(1)]; if (u) byCode.set(c, String.fromCharCode(u)); else byCode.delete(c); c++; } } }
  }
  const back = new Map<string, number>();
  for (const [c, u] of byCode) { const w = ws[c - first]; if (w && w > 0 && !back.has(u)) back.set(u, c); } // glyphs with no width are not in a subset font
  if (!back.size) return null;
  const sp = back.get(' ');
  return { key, space: sp !== undefined ? ws[sp - first] / 1000 : 0.25, encode: (ch) => { const c = back.get(ch); return c === undefined ? null : { hex: c.toString(16).padStart(2, '0'), w: ws[c - first] / 1000 }; } };
}
