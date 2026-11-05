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
print('samples in', D, sorted(os.listdir(D)))
