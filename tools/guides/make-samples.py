# Sample files for guide screenshots (written to /tmp/gfiles). Usage: python3 tools/guides/make-samples.py
import os, random
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from PIL import Image, ImageDraw
D = '/tmp/gfiles'; os.makedirs(D, exist_ok=True)
W, H = A4
def doc(name, pages=3, blank=()):
    c = canvas.Canvas(f'{D}/{name}', pagesize=A4)
    for i in range(1, pages + 1):
        if i not in blank:
            c.setFillColorRGB(.1, .2, .6); c.setFont('Helvetica-Bold', 22); c.drawString(60, H - 80, f'Quotation page {i}')
            c.setFillColorRGB(0, 0, 0); c.setFont('Helvetica', 11)
            for k in range(18): c.drawString(60, H - 120 - k * 16, f'Item {k + 1}: flow meter with stainless steel housing and display')
            c.setStrokeColorRGB(.5, .5, .5)
            for r in range(6): c.line(60, H - 450 - r * 20, 520, H - 450 - r * 20)
            for x in (60, 220, 380, 520): c.line(x, H - 450, x, H - 550)
            c.setFillColorRGB(.9, .3, .1); c.rect(60, 80, 140, 60, fill=1, stroke=0)
        c.setFillColorRGB(0, 0, 0); c.setFont('Helvetica', 9); c.drawCentredString(W / 2, 30, str(i)); c.showPage()
    c.save()
doc('sample.pdf'); doc('long.pdf', 6, blank=(3,)); doc('a.pdf', 1); doc('b.pdf', 2)
for n, col in (('photo1.jpg', (40, 110, 200)), ('photo2.jpg', (200, 90, 40))):
    im = Image.new('RGB', (1600, 1200), col); d = ImageDraw.Draw(im); random.seed(n)
    for _ in range(300): x, y = random.randint(0, 1600), random.randint(0, 1200); d.ellipse((x, y, x + 40, y + 40), fill=tuple(random.randint(0, 255) for _ in range(3)))
    im.save(f'{D}/{n}', quality=92)
im = Image.new('RGB', (900, 300), 'white'); d = ImageDraw.Draw(im); d.line([(60, 200), (200, 80), (300, 220), (420, 90), (560, 210), (800, 120)], fill=(20, 40, 160), width=8); im.save(f'{D}/signature.jpg', quality=92)
frames = []
for k in range(12):
    im = Image.new('RGB', (480, 360), (245, 248, 255)); d = ImageDraw.Draw(im)
    x = 40 + k * 30; d.ellipse((x, 140, x + 80, 220), fill=(230, 90, 40)); d.rectangle((0, 300, 480, 360), fill=(40, 110, 200))
    frames.append(im)
frames[0].save(f'{D}/animation.gif', save_all=True, append_images=frames[1:], duration=100, loop=0)
# PDF with photos and a transparent logo (for Extract Images); no ASCII85 so images are stored like in most real PDFs
from reportlab import rl_config; rl_config.useA85 = 0
logo = Image.new('RGBA', (400, 400), (0, 0, 0, 0)); ImageDraw.Draw(logo).ellipse((20, 20, 380, 380), fill=(230, 90, 40, 255)); logo.save(f'{D}/logo.png')
c = canvas.Canvas(f'{D}/photos.pdf', pagesize=A4)
for i, n in enumerate(('photo1.jpg', 'photo2.jpg')):
    c.setFont('Helvetica-Bold', 22); c.drawString(60, H - 80, f'Product catalogue page {i + 1}')
    c.drawImage(f'{D}/{n}', 60, H - 480, 480, 360); c.drawImage(f'{D}/logo.png', 420, 60, 120, 120, mask='auto'); c.showPage()
c.save()
# US Letter document (for Change Page Size) and a fillable form (for PDF Form Filler)
from reportlab.lib.pagesizes import letter
c = canvas.Canvas(f'{D}/letter.pdf', pagesize=letter); LW, LH = letter
for i in (1, 2):
    c.setFillColorRGB(.1, .2, .6); c.setFont('Helvetica-Bold', 22); c.drawString(60, LH - 80, f'Project report page {i}')
    c.setFillColorRGB(0, 0, 0); c.setFont('Helvetica', 11)
    for k in range(20): c.drawString(60, LH - 120 - k * 16, f'Line {k + 1}: this page was made on US Letter paper (8.5 x 11 inches)')
    c.setFillColorRGB(.9, .3, .1); c.rect(60, 80, 140, 60, fill=1, stroke=0); c.showPage()
c.save()
c = canvas.Canvas(f'{D}/form.pdf', pagesize=A4); f = c.acroForm
c.setFont('Helvetica-Bold', 20); c.drawString(60, H - 70, 'Membership Application Form')
c.setFont('Helvetica', 11)
for k, (lab, nm) in enumerate((('Full name', 'name'), ('Date of birth', 'dob'), ('Mobile number', 'mobile'), ('Email', 'email'), ('City', 'city'))):
    y = H - 130 - k * 45; c.drawString(60, y + 6, lab); f.textfield(name=nm, x=200, y=y, width=300, height=22, borderColor=None, fillColor=None, forceBorder=True)
y = H - 370; c.drawString(60, y + 4, 'Membership type'); f.choice(name='plan', value='Yearly', options=['Monthly', 'Yearly', 'Life'], x=200, y=y, width=150, height=20, forceBorder=True)
y = H - 420; f.checkbox(name='agree', x=60, y=y, size=16, buttonStyle='check', forceBorder=True); c.drawString(85, y + 3, 'I agree to the rules of the club')
c.drawString(60, H - 470, 'Address'); f.textfield(name='address', x=200, y=H - 530, width=300, height=70, fieldFlags='multiline', forceBorder=True)
c.showPage(); c.save()
# Study notes with headings, a list and a table (for PDF to Markdown)
c = canvas.Canvas(f'{D}/notes.pdf', pagesize=A4)
c.setFont('Helvetica-Bold', 22); c.drawString(60, H - 80, 'Indian Rivers: Quick Notes')
c.setFont('Helvetica-Bold', 15); c.drawString(60, H - 125, 'Himalayan rivers')
c.setFont('Helvetica', 11)
for k, t in enumerate(('Fed by snow and rain, so they flow all year.', 'Examples: Ganga, Yamuna, Brahmaputra and Indus.', 'They form large plains as they move down.')):
    c.drawString(72, H - 150 - k * 18, '- ' + t)
c.setFont('Helvetica-Bold', 15); c.drawString(60, H - 225, 'Peninsular rivers')
c.setFont('Helvetica', 11); c.drawString(60, H - 248, 'Mostly fed by rain, so many carry less water in summer.')
rows = (('River', 'Flows into', 'Type'), ('Godavari', 'Bay of Bengal', 'East flowing'), ('Krishna', 'Bay of Bengal', 'East flowing'), ('Narmada', 'Arabian Sea', 'West flowing'))
y0 = H - 290
for r, row in enumerate(rows):
    c.setFont('Helvetica-Bold' if r == 0 else 'Helvetica', 11)
    for k, cell in enumerate(row): c.drawString(68 + k * 150, y0 - r * 22 - 15, cell)
c.setStrokeColorRGB(.4, .4, .4)
for r in range(len(rows) + 1): c.line(60, y0 - r * 22, 510, y0 - r * 22)
for x in (60, 210, 360, 510): c.line(x, y0, x, y0 - len(rows) * 22)
c.setFont('Helvetica', 9); c.drawCentredString(W / 2, 30, '1'); c.showPage(); c.save()
# Account statement with a name, email and phone number (for Redact PDF)
c = canvas.Canvas(f'{D}/statement.pdf', pagesize=A4)
c.setFillColorRGB(.1, .2, .6); c.setFont('Helvetica-Bold', 20); c.drawString(60, H - 70, 'Sample Account Statement')
c.setFillColorRGB(0, 0, 0); c.setFont('Helvetica', 11)
for k, t in enumerate(('Customer: Rahul Sharma', 'Account number: 1234 5678 9012', 'Email: rahul.sharma@example.com', 'Mobile: +91 98765 43210', 'Branch: Pune Main')):
    c.drawString(60, H - 110 - k * 18, t)
c.setFont('Helvetica-Bold', 11)
for k, t in enumerate(('Date', 'Details', 'Amount (Rs)')): c.drawString(60 + k * 160, H - 230, t)
c.setFont('Helvetica', 11)
for r, row in enumerate((('01-10-2026', 'Salary credit', '45,000.00'), ('05-10-2026', 'Electricity bill', '1,250.00'), ('12-10-2026', 'UPI to Rahul Sharma', '2,000.00'), ('20-10-2026', 'Mobile recharge', '299.00'))):
    for k, t in enumerate(row): c.drawString(60 + k * 160, H - 255 - r * 20, t)
c.showPage(); c.save()
print('samples in', D, sorted(os.listdir(D)))
