export type CategoryId = 'organise' | 'edit' | 'convert' | 'security' | 'image';

export interface Category {
  id: CategoryId;
  slug: string;
  name: string;
  title: string;
  description: string;
}

export interface Faq { q: string; a: string }

export interface Tool {
  slug: string;
  name: string;
  category: CategoryId;
  icon: string; // key in icons.ts
  short: string; // card text
  live: boolean;
  // SEO page content (live tools only)
  title?: string; // <title> & H1
  metaDescription?: string;
  intro?: string;
  howToName?: string;
  steps?: string[];
  faqs?: Faq[];
  related?: string[];
  accept?: string;
}

export const categories: Category[] = [
  { id: 'organise', slug: 'organise-pdf', name: 'Organise PDF', title: 'Organise PDF – Merge, Split & Reorder PDF Pages Free', description: 'Merge, split, reorder, rotate and remove PDF pages for free. Everything runs in your browser, so your files never leave your device.' },
  { id: 'edit', slug: 'edit-pdf', name: 'Edit PDF', title: 'Edit PDF – Add Page Numbers, Watermarks & Text Free', description: 'Add page numbers, watermarks, text and signatures to PDF files for free. Private, in-browser PDF editing with no sign-up.' },
  { id: 'convert', slug: 'convert-pdf', name: 'Convert PDF', title: 'Convert PDF – JPG to PDF, PDF to JPG & More Free', description: 'Convert JPG and PNG to PDF, PDF to images and extract text from PDF for free. Files are processed on your device, not uploaded.' },
  { id: 'security', slug: 'pdf-security', name: 'PDF Security', title: 'PDF Security – Protect & Unlock PDF Files Free', description: 'Add a password to a PDF or remove one you know, for free. Processing happens in your browser, so your documents stay private.' },
  { id: 'image', slug: 'image-tools', name: 'Image Tools', title: 'Image Tools – Compress, Resize & Convert Images Free', description: 'Compress, resize, crop and convert JPG, PNG and WebP images for free. Fast, private and processed right in your browser.' },
];

const common = {
  privacyFaq: { q: 'Are my files uploaded to a server?', a: 'No. ZentaPDF processes your files inside your own browser using JavaScript. Nothing is uploaded, so nobody else can see your documents — not even us.' },
  freeFaq: { q: 'Is it really free? Do you add a watermark?', a: 'Yes, it is completely free with no sign-up, no watermark and no daily limits. The site is supported by a few non-intrusive ads.' },
};

export const tools: Tool[] = [
  // ---------- Organise ----------
  {
    slug: 'merge-pdf', name: 'Merge PDF', category: 'organise', icon: 'merge', live: true,
    short: 'Combine several PDF files into one document, in the order you want.',
    title: 'Merge PDF – Combine PDF Files Free Online',
    metaDescription: 'Merge PDF files online for free. Combine multiple PDFs into one document in seconds – no upload, no sign-up, no watermark. Your files stay on your device.',
    intro: 'Merge PDF lets you combine two or more PDF files into a single document in the order you choose. It works entirely in your browser, so you can merge PDF files quickly and privately without uploading anything.',
    howToName: 'How to merge PDF files',
    steps: [
      'Click "Choose PDF files" or drag and drop your PDFs into the box.',
      'Arrange the files in the order you want using the up and down arrows.',
      'Click "Merge PDF" to combine them into one file.',
      'Click "Download" to save your merged PDF.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'How many PDF files can I merge at once?', a: 'There is no fixed limit. You can merge as many files as your device memory allows — usually dozens of files or several hundred pages on a normal computer or phone.' },
      { q: 'Will merging change the quality of my PDF?', a: 'No. Pages are copied exactly as they are, so text, images and fonts keep their original quality.' },
      { q: 'Can I merge password-protected PDFs?', a: 'Encrypted PDFs need to be unlocked first. Use our Unlock PDF tool (coming soon) with the password you know, then merge the files.' },
      common.freeFaq,
    ],
    related: ['split-pdf', 'jpg-to-pdf', 'pdf-to-jpg', 'compress-image'],
    accept: 'application/pdf,.pdf',
  },
  {
    slug: 'split-pdf', name: 'Split PDF', category: 'organise', icon: 'split', live: true,
    short: 'Split a PDF into separate files by page range or one file per page.',
    title: 'Split PDF – Separate PDF Pages Free Online',
    metaDescription: 'Split PDF files online for free. Extract page ranges or save every page as a separate PDF – fast, private and processed in your browser. No sign-up.',
    intro: 'Split PDF divides one PDF into smaller files. Choose your own page ranges or save every page as a separate PDF — all done in your browser, so your document stays private.',
    howToName: 'How to split a PDF',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'Choose "Split by ranges" and type the pages you want (for example 1-3, 5, 8-10), or choose "Every page".',
      'Click "Split PDF".',
      'Download a single PDF, or a ZIP file when there are several parts.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'How do I write page ranges?', a: 'Separate ranges with commas. "1-3, 5, 8-10" creates three files: pages 1 to 3, page 5, and pages 8 to 10. Each range becomes its own PDF.' },
      { q: 'Can I get every page as its own PDF?', a: 'Yes. Choose "Every page" and you will get one PDF per page, packed together in a ZIP file.' },
      { q: 'Does splitting reduce quality?', a: 'No. Pages are copied without re-compressing, so the quality stays exactly the same.' },
      common.freeFaq,
    ],
    related: ['merge-pdf', 'pdf-to-jpg', 'jpg-to-pdf', 'compress-image'],
    accept: 'application/pdf,.pdf',
  },
  { slug: 'remove-pages', name: 'Remove Pages', category: 'organise', icon: 'trash', live: false, short: 'Delete unwanted pages from a PDF.' },
  { slug: 'extract-pages', name: 'Extract Pages', category: 'organise', icon: 'extract', live: false, short: 'Pick pages and save them as a new PDF.' },
  { slug: 'reorder-pdf-pages', name: 'Reorder Pages', category: 'organise', icon: 'reorder', live: false, short: 'Drag and drop page thumbnails to change the order.' },
  { slug: 'rotate-pdf', name: 'Rotate PDF', category: 'organise', icon: 'rotate', live: false, short: 'Rotate all or selected PDF pages.' },
  { slug: 'add-blank-page', name: 'Add Blank Page', category: 'organise', icon: 'plus', live: false, short: 'Insert blank pages anywhere in a PDF.' },
  // ---------- Edit ----------
  { slug: 'add-page-numbers', name: 'Add Page Numbers', category: 'edit', icon: 'hash', live: false, short: 'Number your PDF pages with your choice of position and style.' },
  { slug: 'add-watermark', name: 'Add Watermark', category: 'edit', icon: 'stamp', live: false, short: 'Stamp text or an image over your PDF pages.' },
  { slug: 'sign-pdf', name: 'Add Text & Signature', category: 'edit', icon: 'pen', live: false, short: 'Type, draw or upload a signature and add text.' },
  { slug: 'crop-pdf', name: 'Crop PDF', category: 'edit', icon: 'crop', live: false, short: 'Trim the margins of PDF pages.' },
  { slug: 'flatten-pdf', name: 'Flatten PDF', category: 'edit', icon: 'layers', live: false, short: 'Make form fields and annotations part of the page.' },
  { slug: 'edit-pdf-metadata', name: 'Edit Metadata', category: 'edit', icon: 'tag', live: false, short: 'Change the title, author and keywords of a PDF.' },
  // ---------- Security ----------
  { slug: 'protect-pdf', name: 'Protect PDF', category: 'security', icon: 'lock', live: false, short: 'Add a password to a PDF.' },
  { slug: 'unlock-pdf', name: 'Unlock PDF', category: 'security', icon: 'unlock', live: false, short: 'Remove a PDF password you know.' },
  // ---------- Convert ----------
  {
    slug: 'jpg-to-pdf', name: 'JPG to PDF', category: 'convert', icon: 'imgToPdf', live: true,
    short: 'Turn JPG, PNG and WebP images into a PDF document.',
    title: 'JPG to PDF – Convert Images to PDF Free Online',
    metaDescription: 'Convert JPG, PNG and WebP images to PDF for free. Choose page size, orientation and margins. No upload, no sign-up – images stay on your device.',
    intro: 'JPG to PDF converts your photos and images into a PDF document in seconds. Add one or many images, set the page size and margins, and get a single PDF — all processed privately in your browser.',
    howToName: 'How to convert JPG to PDF',
    steps: [
      'Click "Choose images" or drag and drop JPG, PNG or WebP files into the box.',
      'Put the images in the right order with the up and down arrows.',
      'Choose the page size (fit to image, A4 or Letter), orientation and margin.',
      'Click "Convert to PDF" and then "Download".',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Which image formats are supported?', a: 'JPG/JPEG, PNG and WebP. Most other formats that your browser can open, such as GIF and BMP, also work.' },
      { q: 'Can I combine many images into one PDF?', a: 'Yes. Add all your images and they become one PDF, one image per page, in the order you set.' },
      { q: 'Will my photos lose quality?', a: 'JPG images are placed in the PDF without re-compressing, so they keep their original quality. Other formats are stored losslessly.' },
      common.freeFaq,
    ],
    related: ['pdf-to-jpg', 'merge-pdf', 'compress-image', 'split-pdf'],
    accept: 'image/*',
  },
  {
    slug: 'pdf-to-jpg', name: 'PDF to JPG', category: 'convert', icon: 'pdfToImg', live: true,
    short: 'Save every PDF page as a high-quality JPG or PNG image.',
    title: 'PDF to JPG – Convert PDF Pages to Images Free Online',
    metaDescription: 'Convert PDF to JPG or PNG images for free. Choose image quality and download one page or all pages as a ZIP. Private – your PDF never leaves your device.',
    intro: 'PDF to JPG turns each page of your PDF into a sharp JPG or PNG image. Pick the quality you need and download single pages or all of them in a ZIP — without uploading your PDF anywhere.',
    howToName: 'How to convert PDF to JPG',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'Choose the image format (JPG or PNG) and quality (normal, high or very high).',
      'Click "Convert to images".',
      'Download single pages, or all pages at once as a ZIP file.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'What quality should I choose?', a: '"Normal" (about 100 DPI) is good for screens and sharing. "High" (150 DPI) suits most documents. "Very high" (300 DPI) is best for printing but makes bigger files.' },
      { q: 'JPG or PNG – which is better?', a: 'JPG gives smaller files and is best for photos and scanned pages. PNG is lossless and keeps text and line drawings perfectly crisp.' },
      { q: 'Can I convert a PDF with many pages?', a: 'Yes. All pages are converted one after another and you can download them together as a ZIP. Very large PDFs at "Very high" quality may need a computer rather than a phone.' },
      common.freeFaq,
    ],
    related: ['jpg-to-pdf', 'split-pdf', 'compress-image', 'merge-pdf'],
    accept: 'application/pdf,.pdf',
  },
  { slug: 'images-to-pdf', name: 'Images to PDF', category: 'convert', icon: 'images', live: false, short: 'Combine many images into a single PDF.' },
  { slug: 'pdf-to-text', name: 'PDF to Text', category: 'convert', icon: 'text', live: false, short: 'Extract the text from a PDF.' },
  { slug: 'compress-pdf', name: 'Compress PDF (basic)', category: 'convert', icon: 'compress', live: false, short: 'Make a PDF smaller by shrinking its images.' },
  // ---------- Image ----------
  {
    slug: 'compress-image', name: 'Compress Image', category: 'image', icon: 'compress', live: true,
    short: 'Make JPG, PNG and WebP images smaller without visible quality loss.',
    title: 'Compress Image – Reduce JPG, PNG & WebP Size Free Online',
    metaDescription: 'Compress images online for free. Reduce JPG, PNG and WebP file size by up to 80% with adjustable quality. No upload – images are compressed on your device.',
    intro: 'Compress Image reduces the file size of your JPG, PNG and WebP pictures while keeping them looking sharp. Choose the quality and maximum width, compress many images at once, and download them instantly — nothing is uploaded.',
    howToName: 'How to compress an image',
    steps: [
      'Click "Choose images" or drag and drop your pictures into the box.',
      'Set the quality (75% is a good balance) and, if you like, a maximum width.',
      'Pick the output format: keep the original, JPG or WebP.',
      'Click "Compress", check the new sizes, then download one image or all as a ZIP.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'How much smaller will my images get?', a: 'Photos usually shrink by 50–80% at 75% quality with no visible difference. Reducing the maximum width saves even more.' },
      { q: 'Which format gives the smallest files?', a: 'WebP is usually 25–35% smaller than JPG at the same quality and works in all modern browsers. Use JPG when you need maximum compatibility.' },
      { q: 'Why is my PNG not much smaller?', a: 'PNG is a lossless format, so quality settings do not apply to it. Convert it to JPG or WebP, or reduce its width, to make it much smaller.' },
      { q: 'Is photo information (EXIF) kept?', a: 'No. Compression removes hidden data such as camera details and GPS location, which also protects your privacy.' },
      common.freeFaq,
    ],
    related: ['jpg-to-pdf', 'pdf-to-jpg', 'merge-pdf', 'split-pdf'],
    accept: 'image/*',
  },
  { slug: 'resize-image', name: 'Resize Image', category: 'image', icon: 'resize', live: false, short: 'Change image width and height in pixels or percent.' },
  { slug: 'crop-image', name: 'Crop Image', category: 'image', icon: 'crop', live: false, short: 'Cut out the part of an image you need.' },
  { slug: 'convert-image', name: 'Convert Image', category: 'image', icon: 'convert', live: false, short: 'Convert between JPG, PNG, WebP and AVIF.' },
  { slug: 'rotate-image', name: 'Rotate & Flip Image', category: 'image', icon: 'rotate', live: false, short: 'Rotate or mirror images.' },
  { slug: 'image-to-base64', name: 'Image to Base64', category: 'image', icon: 'code', live: false, short: 'Turn an image into a Base64 text string.' },
];

export const toolBySlug = (slug: string) => tools.find((t) => t.slug === slug);
export const categoryById = (id: CategoryId) => categories.find((c) => c.id === id)!;
