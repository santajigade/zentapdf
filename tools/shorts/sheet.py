import sys
from PIL import Image
vs=[int(x) for x in sys.argv[1].split(',')]; ts=sys.argv[2].split(',')
W=Image.new('RGB',(len(ts)*270,len(vs)*480),'gray')
for r,v in enumerate(vs):
  for i,t in enumerate(ts): W.paste(Image.open(f'/tmp/sn/v{v}-{t}.png').resize((270,480)),(i*270,r*480))
W.save('/tmp/sheet.png')
