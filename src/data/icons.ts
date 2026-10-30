// Simple 24x24 stroke icons (original). Each value is the inner SVG markup.
const doc = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>';
export const icons: Record<string, string> = {
  merge: '<path d="M8 3v5a4 4 0 0 0 4 4 4 4 0 0 1 4 4v5"/><path d="M16 3v5a4 4 0 0 1-4 4"/><path d="m5 6 3-3 3 3"/><path d="m13 6 3-3 3 3"/>',
  split: '<path d="M12 21v-7a4 4 0 0 0-4-4H4"/><path d="M12 14a4 4 0 0 1 4-4h4"/><path d="m7 7-3 3 3 3"/><path d="m17 7 3 3-3 3"/><path d="M12 3v4"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  extract: doc + '<path d="M12 11v6"/><path d="m9 14 3 3 3-3"/>',
  reorder: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/><path d="M17 4h3v3"/><path d="M7 20H4v-3"/><path d="M20 4l-5 5M4 20l5-5"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  plus: doc + '<path d="M12 11v6M9 14h6"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  stamp: '<path d="M5 20h14"/><path d="M7 16h10l1-4H6z"/><path d="M10 12V9a2 2 0 1 1 4 0v3"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  imgToPdf: '<rect x="3" y="4" width="10" height="9" rx="1"/><path d="m3 11 3-3 3 3"/><path d="M16 8h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-3"/><path d="M14 17h4"/>',
  pdfToImg: doc + '<circle cx="10" cy="13" r="1.5"/><path d="m7 19 4-4 2 2 2-2 2 2"/>',
  images: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/><path d="m3 16 4-4 4 4 2-2 4 4"/>',
  text: doc + '<path d="M9 13h6M9 17h4"/>',
  compress: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/>',
  resize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
  convert: '<path d="M4 7h13l-3-3"/><path d="M20 17H7l3 3"/>',
  code: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m14 4-4 16"/>',
  sign: '<path d="M3 17c2 0 3-6 5-6s1 5 3 5 2-3 4-3"/><path d="M3 21h18"/><path d="m16 4 4 4-6 6h-4v-4z"/>',
  editdoc: '<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M13 3v5h5"/><path d="M14 21v-2.5l5.5-5.5 2.5 2.5L16.5 21z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
};
export const icon = (name: string, size = 24) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.text}</svg>`;

// Solid tile colour per tool (original ZentaPDF palette)
const C = { red: '#e5484d', orange: '#f76b15', amber: '#e5a000', green: '#30a46c', teal: '#12a594', cyan: '#0797b9', blue: '#3e63dd', indigo: '#5b5bd6', violet: '#8e4ec6', pink: '#d6409f', slate: '#5b6475' };
export const toolColor: Record<string, string> = {
  'merge-pdf': C.red, 'split-pdf': C.orange, 'remove-pages': C.pink, 'extract-pages': C.teal, 'reorder-pdf-pages': C.violet, 'rotate-pdf': C.indigo, 'add-blank-page': C.slate,
  'edit-pdf': C.violet, 'sign-pdf': C.blue, 'add-page-numbers': C.indigo, 'add-watermark': C.pink, 'crop-pdf': C.teal, 'flatten-pdf': C.cyan, 'edit-pdf-metadata': C.slate,
  'protect-pdf': C.blue, 'unlock-pdf': C.cyan,
  'jpg-to-pdf': C.amber, 'pdf-to-jpg': C.amber, 'images-to-pdf': C.orange, 'pdf-to-text': C.slate, 'compress-pdf': C.green,
  'compress-image': C.green, 'resize-image': C.blue, 'crop-image': C.teal, 'convert-image': C.violet, 'rotate-image': C.indigo, 'image-to-base64': C.slate,
};
