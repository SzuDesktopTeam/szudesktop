import sys, os
from PIL import Image, ImageDraw
out=sys.argv[1]; files=sys.argv[2:]
w=420
ims=[Image.open(f).convert('RGB') for f in files]
ims=[im.resize((w,round(im.height*w/im.width)),Image.LANCZOS) for im in ims]
h=ims[0].height
s=Image.new('RGB',(len(ims)*(w+6)+6,h+30),(40,34,26))
d=ImageDraw.Draw(s)
for i,(im,f) in enumerate(zip(ims,files)):
    x=6+i*(w+6); s.paste(im,(x,26)); d.text((x,6),os.path.basename(f),fill=(255,220,120))
s.save(out,quality=90)
