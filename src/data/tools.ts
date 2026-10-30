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
  {
    slug: 'remove-pages', name: 'Remove Pages', category: 'organise', icon: 'trash', live: true,
    short: 'Delete unwanted pages from a PDF in a few clicks.',
    title: 'Remove Pages from PDF – Delete PDF Pages Free Online',
    metaDescription: 'Delete pages from a PDF online for free. See page thumbnails, click the pages to remove and download the new PDF. No upload, no sign-up, no watermark.',
    intro: 'Remove Pages lets you delete unwanted pages from a PDF. See every page as a thumbnail, click the ones you do not need and download a clean new PDF — all in your browser, so your document stays private.',
    howToName: 'How to remove pages from a PDF',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'Click the pages you want to delete, or type pages such as 2, 5-7 and press "Select".',
      'Click "Remove pages".',
      'Click "Download PDF" to save the new file.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Can I delete several pages at once?', a: 'Yes. Click as many pages as you like, or type ranges such as 1-3, 8, 10-12 to select them all in one go.' },
      { q: 'Is my original PDF changed?', a: 'No. Your original file is never changed. You download a new copy without the removed pages.' },
      { q: 'Will the remaining pages lose quality?', a: 'No. Pages are copied exactly as they are, so text, links and images stay the same.' },
      common.freeFaq,
    ],
    related: ['extract-pages', 'split-pdf', 'reorder-pdf-pages', 'merge-pdf'],
    accept: 'application/pdf,.pdf',
  },
  {
    slug: 'extract-pages', name: 'Extract Pages', category: 'organise', icon: 'extract', live: true,
    short: 'Pick the pages you need and save them as a new PDF.',
    title: 'Extract Pages from PDF – Save Selected PDF Pages Free',
    metaDescription: 'Extract pages from a PDF online for free. Select the pages you need with thumbnails or page ranges and save them as a new PDF. Private – files stay on your device.',
    intro: 'Extract Pages creates a new PDF that contains only the pages you choose. Select pages by clicking their thumbnails or by typing page ranges — your PDF is processed privately in your browser.',
    howToName: 'How to extract pages from a PDF',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'Click the pages you want to keep, or type pages such as 1-3, 9 and press "Select".',
      'Click "Extract pages".',
      'Click "Download PDF" to save your new PDF.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'What is the difference between Extract and Split?', a: 'Extract makes one new PDF from the pages you pick. Split PDF can create several separate files at once, for example one per range or one per page.' },
      { q: 'In what order are the pages saved?', a: 'Extracted pages keep their original order. To change the order, use our Reorder Pages tool afterwards.' },
      { q: 'Can I extract pages from a large PDF?', a: 'Yes. Files with hundreds of pages work fine on a computer; very large files may be slow on older phones.' },
      common.freeFaq,
    ],
    related: ['split-pdf', 'remove-pages', 'merge-pdf', 'pdf-to-jpg'],
    accept: 'application/pdf,.pdf',
  },
  {
    slug: 'reorder-pdf-pages', name: 'Reorder Pages', category: 'organise', icon: 'reorder', live: true,
    short: 'Drag and drop page thumbnails to change the page order.',
    title: 'Reorder PDF Pages – Rearrange PDF Pages Free Online',
    metaDescription: 'Rearrange PDF pages online for free. Drag and drop page thumbnails into the right order, or reverse the whole PDF. No upload – your file stays on your device.',
    intro: 'Reorder Pages lets you rearrange the pages of a PDF by dragging their thumbnails into a new order. You can also move pages with arrow buttons or reverse the whole document — all inside your browser.',
    howToName: 'How to reorder PDF pages',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'Drag the page thumbnails into the order you want, or use the ← → buttons on each page.',
      'Click "Reverse order" if you need the pages back to front.',
      'Click "Save new order" and then "Download PDF".',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Does drag and drop work on phones?', a: 'On phones and tablets, use the ← and → buttons under each page to move it. Drag and drop works on computers.' },
      { q: 'Can I reverse the order of all pages?', a: 'Yes. Click "Reverse order" to flip the whole document, for example after scanning pages back to front.' },
      { q: 'Will links and bookmarks still work?', a: 'Page content, including links on the page, is kept. Bookmarks (the outline panel) are not copied to the new file.' },
      common.freeFaq,
    ],
    related: ['merge-pdf', 'rotate-pdf', 'remove-pages', 'extract-pages'],
    accept: 'application/pdf,.pdf',
  },
  {
    slug: 'rotate-pdf', name: 'Rotate PDF', category: 'organise', icon: 'rotate', live: true,
    short: 'Rotate all or selected PDF pages and save the result.',
    title: 'Rotate PDF – Rotate PDF Pages Permanently Free Online',
    metaDescription: 'Rotate PDF pages online for free. Turn all pages or single pages 90° left or right and save them permanently. Fast, private and processed in your browser.',
    intro: 'Rotate PDF turns sideways or upside-down pages the right way up and saves the change permanently. Rotate every page at once or fix single pages — your PDF never leaves your device.',
    howToName: 'How to rotate a PDF',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'Click "Rotate all left/right", or use the ⟲ ⟳ buttons under single pages.',
      'Check the thumbnails until every page looks right.',
      'Click "Rotate PDF" and then "Download PDF".',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Is the rotation saved permanently?', a: 'Yes. The new PDF opens with the pages turned the way you set them, in every PDF reader.' },
      { q: 'Can I rotate only some pages?', a: 'Yes. Use the buttons under each page to rotate just that page, for example a single landscape table in a portrait report.' },
      { q: 'Does rotating reduce quality?', a: 'No. Rotation only changes how the page is displayed; the content is not re-compressed.' },
      common.freeFaq,
    ],
    related: ['reorder-pdf-pages', 'merge-pdf', 'split-pdf', 'rotate-image'],
    accept: 'application/pdf,.pdf',
  },
  {
    slug: 'add-blank-page', name: 'Add Blank Page', category: 'organise', icon: 'plus', live: true,
    short: 'Insert blank pages anywhere in a PDF.',
    title: 'Add Blank Page to PDF – Insert Empty Pages Free Online',
    metaDescription: 'Insert blank pages into a PDF online for free. Add empty pages at the start, at the end or after any page – useful for printing and notes. No upload, no sign-up.',
    intro: 'Add Blank Page inserts empty pages anywhere in your PDF — at the start, at the end or after any page. It is handy for double-sided printing, notes or separating chapters, and it all happens in your browser.',
    howToName: 'How to add a blank page to a PDF',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'Click "+ Blank" under any page to insert an empty page after it, or use "+ Blank at start/end".',
      'Remove a blank page you added with its ✕ button if you change your mind.',
      'Click "Add blank pages" and then "Download PDF".',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'What size are the blank pages?', a: 'Each blank page has the same size as the page before it (or the first page, if added at the start), so the document prints evenly.' },
      { q: 'Why add blank pages?', a: 'For double-sided printing (so chapters start on the right-hand page), to leave room for handwritten notes, or to separate sections.' },
      { q: 'Can I add many blank pages?', a: 'Yes. Add as many as you need anywhere in the document.' },
      common.freeFaq,
    ],
    related: ['merge-pdf', 'reorder-pdf-pages', 'remove-pages', 'split-pdf'],
    accept: 'application/pdf,.pdf',
  },
  // ---------- Edit ----------
  {
    slug: 'add-page-numbers', name: 'Add Page Numbers', category: 'edit', icon: 'hash', live: true,
    short: 'Number your PDF pages with your choice of position and style.',
    title: 'Add Page Numbers to PDF – Number PDF Pages Free Online',
    metaDescription: 'Add page numbers to a PDF online for free. Choose position, format (1, Page 1, 1 of 10), start number and font size, and skip the cover page. No upload needed.',
    intro: 'Add Page Numbers puts page numbers on every page of your PDF. Choose where they go, the style and the starting number, and see a live preview — all processed privately in your browser.',
    howToName: 'How to add page numbers to a PDF',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'Choose the position, format (1, Page 1 or 1 of 10), start number, size and colour.',
      'Tick "Skip first page" if your PDF has a cover page.',
      'Click "Add page numbers" and then "Download PDF".',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Can I start numbering from a number other than 1?', a: 'Yes. Type any number in "Start at" — useful when your PDF is part of a larger document.' },
      { q: 'Can I leave the cover page without a number?', a: 'Yes. Tick "Skip first page"; numbering then starts on page 2 with your start number.' },
      { q: 'Will the numbers cover my text?', a: 'Numbers are placed about 1 cm from the page edge. If your page has content there, choose a different position or a smaller size.' },
      common.freeFaq,
    ],
    related: ['add-watermark', 'merge-pdf', 'edit-pdf-metadata', 'split-pdf'],
    accept: 'application/pdf,.pdf',
  },
  {
    slug: 'add-watermark', name: 'Add Watermark', category: 'edit', icon: 'stamp', live: true,
    short: 'Stamp text or an image over your PDF pages.',
    title: 'Add Watermark to PDF – Text or Logo Watermark Free Online',
    metaDescription: 'Add a text or logo watermark to PDF files for free. Set the text, colour, size, angle and transparency with a live preview. Private – your PDF never leaves your device.',
    intro: 'Add Watermark stamps text such as CONFIDENTIAL or DRAFT, or your own logo, across every page of a PDF. Adjust colour, angle, size and transparency with a live preview — without uploading your document.',
    howToName: 'How to add a watermark to a PDF',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'Choose "Text" and type your watermark, or choose "Image / logo" and pick a picture.',
      'Set the size, colour, angle and opacity — the preview shows the result.',
      'Click "Add watermark" and then "Download PDF".',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Can I use my company logo as a watermark?', a: 'Yes. Choose "Image / logo" and select a PNG or JPG. PNG logos with a transparent background look best.' },
      { q: 'Can people remove the watermark?', a: 'The watermark becomes part of each page. It cannot be removed in normal PDF readers, although advanced PDF editors can edit page content.' },
      { q: 'Which languages can I use for text watermarks?', a: 'Text watermarks currently support English letters, numbers and common symbols. For other scripts, use an image watermark.' },
      common.freeFaq,
    ],
    related: ['add-page-numbers', 'protect-pdf', 'merge-pdf', 'flatten-pdf'],
    accept: 'application/pdf,.pdf',
  },
  { slug: 'sign-pdf', name: 'Add Text & Signature', category: 'edit', icon: 'pen', live: false, short: 'Type, draw or upload a signature and add text.' },
  {
    slug: 'crop-pdf', name: 'Crop PDF', category: 'edit', icon: 'crop', live: true,
    short: 'Trim the margins of PDF pages.',
    title: 'Crop PDF – Trim PDF Margins Free Online',
    metaDescription: 'Crop PDF pages online for free. Cut white margins from every page by setting millimetres for each edge, with a preview. Fast, private, no upload, no sign-up.',
    intro: 'Crop PDF trims the margins of every page in your PDF. Set how many millimetres to cut from the top, bottom, left and right, check the preview and download — all in your browser.',
    howToName: 'How to crop a PDF',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'Type how many millimetres to cut from the top, bottom, left and right.',
      'Check the dashed box on the preview of page 1.',
      'Click "Crop PDF" and then "Download PDF".',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Is the cropped content deleted?', a: 'The PDF page size is reduced so the trimmed area is no longer shown or printed. The hidden content may still exist inside the file, so do not rely on cropping to remove sensitive information.' },
      { q: 'Are all pages cropped the same way?', a: 'Yes. The same margins are removed from every page.' },
      { q: 'Why use Crop PDF?', a: 'To remove large white margins so pages are easier to read on a phone, or to cut away scanner borders.' },
      common.freeFaq,
    ],
    related: ['rotate-pdf', 'split-pdf', 'remove-pages', 'crop-image'],
    accept: 'application/pdf,.pdf',
  },
  {
    slug: 'flatten-pdf', name: 'Flatten PDF', category: 'edit', icon: 'layers', live: true,
    short: 'Make filled-in form fields part of the page so they can’t be changed.',
    title: 'Flatten PDF – Flatten PDF Form Fields Free Online',
    metaDescription: 'Flatten PDF forms online for free. Turn fillable fields into normal page content so answers cannot be edited. Fast and private – processed in your browser.',
    intro: 'Flatten PDF turns the fillable fields of a PDF form — text boxes, check boxes and drop-downs — into normal page content. The answers stay visible but can no longer be changed, which is ideal before sending a completed form.',
    howToName: 'How to flatten a PDF',
    steps: [
      'Fill in your PDF form and save it.',
      'Click "Choose PDF file" or drag and drop the filled PDF into the box.',
      'Click "Flatten PDF".',
      'Click "Download PDF" to save the flattened copy.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Why flatten a PDF form?', a: 'So nobody can change the answers after you send it, and so the form looks the same in every PDF reader and when printed.' },
      { q: 'Does it flatten comments and annotations?', a: 'This basic version flattens form fields. Comments and sticky notes are kept as they are.' },
      { q: 'My PDF has no form fields — what happens?', a: 'The tool tells you that no fields were found and saves the PDF unchanged.' },
      common.freeFaq,
    ],
    related: ['protect-pdf', 'add-watermark', 'merge-pdf', 'edit-pdf-metadata'],
    accept: 'application/pdf,.pdf',
  },
  {
    slug: 'edit-pdf-metadata', name: 'Edit Metadata', category: 'edit', icon: 'tag', live: true,
    short: 'Change the title, author, subject and keywords of a PDF.',
    title: 'Edit PDF Metadata – Change Title, Author & Keywords Free',
    metaDescription: 'Edit PDF metadata online for free. View and change the title, author, subject, keywords, creator and producer of a PDF. Private – nothing is uploaded.',
    intro: 'Edit Metadata lets you see and change the hidden information inside a PDF — title, author, subject, keywords, creator and producer. A good title helps the PDF show the right name in browsers and search engines.',
    howToName: 'How to edit PDF metadata',
    steps: [
      'Click "Choose PDF file" or drag and drop a PDF into the box.',
      'The current title, author, subject and keywords appear in the boxes.',
      'Change or clear any field you like.',
      'Click "Save metadata" and then "Download PDF".',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Why change PDF metadata?', a: 'The title is shown in browser tabs and search results, and the author and keywords help organise documents. You may also want to remove personal names before sharing a file.' },
      { q: 'How do I remove the author name?', a: 'Clear the Author box and click "Save metadata". The new PDF will have no author.' },
      { q: 'Does it change the PDF content?', a: 'No. Only the document information is changed; the pages stay exactly the same.' },
      common.freeFaq,
    ],
    related: ['add-page-numbers', 'flatten-pdf', 'merge-pdf', 'protect-pdf'],
    accept: 'application/pdf,.pdf',
  },
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
  {
    slug: 'resize-image', name: 'Resize Image', category: 'image', icon: 'resize', live: true,
    short: 'Change the width and height of JPG, PNG and WebP images in pixels or percent.',
    title: 'Resize Image – Change Image Size in Pixels Free Online',
    metaDescription: 'Resize images online for free. Set an exact width and height in pixels or scale by percent, keep proportions, and resize many images at once. No upload.',
    intro: 'Resize Image changes the width and height of your pictures in seconds. Type exact pixel sizes or scale by percent, keep the proportions, and resize many images at once — privately in your browser.',
    howToName: 'How to resize an image',
    steps: [
      'Click "Choose images" or drag and drop your pictures into the box.',
      'Choose "By pixels" and type a width and/or height, or choose "By percent".',
      'Leave "Keep proportions" ticked so the image is not stretched.',
      'Click "Resize" and download one image or all as a ZIP.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'How do I resize without stretching the image?', a: 'Keep "Keep proportions" ticked. The image is scaled to fit inside the width and height you type, so its shape never changes. You can also fill in only the width or only the height.' },
      { q: 'Can I resize many images at once?', a: 'Yes. Add as many images as you like — they are all resized with the same settings and you can download them together in a ZIP file.' },
      { q: 'Will resizing make my image blurry?', a: 'Making an image smaller keeps it sharp. Making it bigger than the original cannot add detail, so "Don’t enlarge small images" is on by default.' },
      common.freeFaq,
    ],
    related: ['compress-image', 'crop-image', 'convert-image', 'jpg-to-pdf'],
    accept: 'image/*',
  },
  {
    slug: 'crop-image', name: 'Crop Image', category: 'image', icon: 'crop', live: true,
    short: 'Cut out the part of a photo you need, with free or fixed aspect ratios.',
    title: 'Crop Image – Cut Photos Online Free (1:1, 16:9, 4:3)',
    metaDescription: 'Crop images online for free. Drag to select the area or use 1:1, 4:3 and 16:9 ratios for social media and passports. Fast, private, no upload, no sign-up.',
    intro: 'Crop Image lets you cut away unwanted edges and keep only the part of the picture you need. Drag the crop box or pick a ratio such as 1:1 or 16:9 — your photo is cropped in your browser and never uploaded.',
    howToName: 'How to crop an image',
    steps: [
      'Click "Choose image" or drag and drop a picture into the box.',
      'Pick a ratio (Free, 1:1, 4:3, 16:9…) if you need a fixed shape.',
      'Drag the box to move it and drag the round handle to resize it, or type exact pixel values.',
      'Click "Crop image" and then "Download image".',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Which ratio should I use for social media?', a: '1:1 (square) suits Instagram posts and profile photos, 16:9 suits YouTube thumbnails and wide banners, and 9:16 suits Stories, Reels and Shorts.' },
      { q: 'Can I crop to an exact size in pixels?', a: 'Yes. Type the Left, Top, Width and Height values below the image to set the crop area to the exact pixel.' },
      { q: 'Does cropping reduce the quality?', a: 'No. The pixels you keep are not resized. JPG and WebP images are saved at high quality (92%).' },
      common.freeFaq,
    ],
    related: ['resize-image', 'compress-image', 'rotate-image', 'convert-image'],
    accept: 'image/*',
  },
  {
    slug: 'convert-image', name: 'Convert Image', category: 'image', icon: 'convert', live: true,
    short: 'Convert images between JPG, PNG, WebP and AVIF.',
    title: 'Convert Image – JPG, PNG, WebP & AVIF Converter Free',
    metaDescription: 'Convert images to JPG, PNG, WebP or AVIF for free. Change PNG to JPG, WebP to JPG, JPG to WebP and more – many files at once, processed on your device.',
    intro: 'Convert Image changes your pictures to the format you need — JPG, PNG, WebP or AVIF. Convert WebP to JPG, PNG to JPG or JPG to WebP in bulk, right in your browser with nothing uploaded.',
    howToName: 'How to convert an image',
    steps: [
      'Click "Choose images" or drag and drop your pictures into the box.',
      'Choose the format you want: JPG, PNG, WebP or AVIF.',
      'Set the quality for JPG, WebP and AVIF (90% is a good default).',
      'Click "Convert" and download one image or all as a ZIP.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Which format should I choose?', a: 'JPG works everywhere and is best for photos. PNG is lossless and keeps transparency — good for logos and screenshots. WebP and AVIF make much smaller files for websites.' },
      { q: 'How do I convert WebP to JPG?', a: 'Add your WebP files, choose JPG and click Convert. Transparent areas become white, because JPG does not support transparency.' },
      { q: 'Why is AVIF or WebP greyed out?', a: 'Some browsers (mainly older Safari versions) cannot create these formats. Open ZentaPDF in Chrome or Edge to use them.' },
      common.freeFaq,
    ],
    related: ['compress-image', 'resize-image', 'jpg-to-pdf', 'image-to-base64'],
    accept: 'image/*',
  },
  {
    slug: 'rotate-image', name: 'Rotate & Flip Image', category: 'image', icon: 'rotate', live: true,
    short: 'Rotate images 90° or 180° and flip them horizontally or vertically.',
    title: 'Rotate Image – Rotate & Flip Photos Online Free',
    metaDescription: 'Rotate images 90 or 180 degrees and flip them horizontally or vertically online for free. Fix sideways photos in bulk – private, in your browser, no sign-up.',
    intro: 'Rotate Image fixes sideways and upside-down photos and lets you mirror pictures horizontally or vertically. See a live preview, apply it to many images at once and download — all without uploading anything.',
    howToName: 'How to rotate an image',
    steps: [
      'Click "Choose images" or drag and drop your pictures into the box.',
      'Click "Rotate left" or "Rotate right" until the preview looks right.',
      'Use "Flip horizontal" or "Flip vertical" to mirror the image if needed.',
      'Click "Rotate" and download one image or all as a ZIP.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'Can I rotate many photos at once?', a: 'Yes. The same rotation and flip are applied to every image you add, and you can download them all together in a ZIP.' },
      { q: 'What is the difference between rotate and flip?', a: 'Rotate turns the picture around its centre (like turning a sheet of paper). Flip makes a mirror image — horizontal flip swaps left and right, vertical flip swaps top and bottom.' },
      { q: 'Does rotating reduce quality?', a: 'PNG images stay lossless. JPG and WebP are saved again at high quality (92%), so the difference is not visible.' },
      common.freeFaq,
    ],
    related: ['crop-image', 'resize-image', 'convert-image', 'compress-image'],
    accept: 'image/*',
  },
  {
    slug: 'image-to-base64', name: 'Image to Base64', category: 'image', icon: 'code', live: true,
    short: 'Turn an image into a Base64 string, data URI, CSS or HTML code.',
    title: 'Image to Base64 – Convert Image to Base64 Online Free',
    metaDescription: 'Convert images to Base64 online for free. Get a data URI, plain Base64, CSS background or HTML img code and copy it in one click. Works offline in your browser.',
    intro: 'Image to Base64 converts a picture into Base64 text that you can paste straight into HTML, CSS, JSON or emails. Choose a data URI, plain Base64, a CSS rule or an HTML tag and copy it with one click.',
    howToName: 'How to convert an image to Base64',
    steps: [
      'Click "Choose image" or drag and drop a picture into the box.',
      'Choose the output: Data URI, Base64 only, CSS or HTML.',
      'Click "Copy to clipboard", or "Download .txt" for long results.',
      'Paste the code into your web page, stylesheet or app.',
    ],
    faqs: [
      common.privacyFaq,
      { q: 'What is a data URI?', a: 'A data URI puts the whole image inside a text link that starts with "data:image/…;base64,". Browsers can show it directly, without loading a separate image file.' },
      { q: 'When should I use Base64 images?', a: 'For small images such as icons, logos and email signatures. Base64 is about 33% larger than the original file, so large photos are better kept as normal files.' },
      { q: 'Which image formats are supported?', a: 'JPG, PNG, WebP, GIF, SVG, AVIF and any other image type your browser can open.' },
      common.freeFaq,
    ],
    related: ['convert-image', 'compress-image', 'resize-image', 'crop-image'],
    accept: 'image/*',
  },
];

export const toolBySlug = (slug: string) => tools.find((t) => t.slug === slug);
export const categoryById = (id: CategoryId) => categories.find((c) => c.id === id)!;
