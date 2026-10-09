import sys, glob, os
from PIL import Image, ImageDraw
# usage: sheet.py out.png cols tile_w file1 file2 ...
out=sys.argv[1]; cols=int(sys.argv[2]); tw=int(sys.argv[3]); files=sys.argv[4:]
ims=[Image.open(f).convert('RGB') for f in files]
w,h=ims[0].size; th=int(h*tw/w)
rows=(len(ims)+cols-1)//cols
s=Image.new('RGB',(cols*tw,rows*(th+18)),'black')
d=ImageDraw.Draw(s)
for i,(im,f) in enumerate(zip(ims,files)):
    x=(i%cols)*tw; y=(i//cols)*(th+18)
    s.paste(im.resize((tw,th),Image.LANCZOS),(x,y+18))
    d.text((x+4,y+3),os.path.basename(f),fill='white')
s.save(out)
