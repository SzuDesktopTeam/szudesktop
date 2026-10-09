import sys, numpy as np
from PIL import Image
from sim import *
gs=sys.argv[1].split(','); out=sys.argv[2]
files=['clip_scene_lake_s13.f0060.png','clip_scene_bookshop_s14.f0060.png','clip_scene_terrace_s15.f0060.png']
rows=[]
for f in files:
    a=np.asarray(Image.open(FOOT+f).convert('RGB')).astype(np.float32)/255
    tiles=[Image.fromarray((chain(a,GRADES[g])*255+0.5).astype(np.uint8)).resize((640,360),Image.LANCZOS) for g in gs]
    row=Image.new('RGB',(640*len(gs),360)); [row.paste(t,(640*i,0)) for i,t in enumerate(tiles)]; rows.append(row)
sheet=Image.new('RGB',(640*len(gs),360*len(rows)))
for i,r in enumerate(rows): sheet.paste(r,(0,360*i))
sheet.save(out)
