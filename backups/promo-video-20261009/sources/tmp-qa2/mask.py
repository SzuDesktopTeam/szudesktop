import sys, os
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0,'/tmp/qa2')
cut,out=sys.argv[1],sys.argv[2]; frames=[int(a) for a in sys.argv[3:]]
ROOT='/Users/alakazan/workplace/szudesktop-promo'
def path(n):
    d=f'{ROOT}/work/qa/dense/{cut}/f{n:05d}.jpg'
    c=f'/tmp/qa2/cache/{cut}/f{n:05d}.png'
    return c if os.path.exists(c) else d
targets=np.array([[0x3F,0x36,0x29],[0x48,0x2A,0x15]],dtype=np.int16)
tiles=[]
for n in frames:
    im=Image.open(path(n)).convert('RGB'); a=np.asarray(im).astype(np.int16)
    m=np.zeros(a.shape[:2],bool)
    for t in targets: m|=(np.abs(a-t)<=7).all(axis=2)
    b=a.copy().astype(np.uint8); b[m]=[255,0,255]
    t=Image.fromarray(b); w=640 if t.width>t.height else 300
    t=t.resize((w,round(t.height*w/t.width))); d=ImageDraw.Draw(t)
    d.rectangle((0,0,230,22),fill=(0,0,0)); d.text((4,4),f'f{n} {n/60:.3f}s {m.mean()*100:.1f}%',fill=(255,255,0)); tiles.append(t)
cols=3 if tiles[0].width>tiles[0].height else 6
W=tiles[0].width; H=max(t.height for t in tiles); rows=(len(tiles)+cols-1)//cols
sheet=Image.new('RGB',(cols*(W+4),rows*(H+4)),(20,20,20))
for k,t in enumerate(tiles): sheet.paste(t,((k%cols)*(W+4),(k//cols)*(H+4)))
sheet.save(out,quality=85); print(out)
