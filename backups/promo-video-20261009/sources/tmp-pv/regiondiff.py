#!/opt/miniconda3/bin/python3
"""Successive-frame mean abs diff in a crop of the final cut over a frame range (exact decode)."""
import os, subprocess, sys, json
import numpy as np
ROOT='/Users/alakazan/workplace/szudesktop-promo'
CD=f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV={**os.environ,'DYLD_LIBRARY_PATH':CD}
cut,a,b,x,y,w,h=sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),*map(int,sys.argv[4:8])
src=f'{ROOT}/out/szudesktop-promo-{cut}.mp4'
n=b-a+1
p=subprocess.Popen([f'{CD}/ffmpeg','-v','error','-ss',f'{max(0,(a-0.3)/60):.5f}','-i',src,'-frames:v',str(n),'-vf',f'crop={w}:{h}:{x}:{y},scale={w//4}:{h//4}:flags=area,format=gray','-f','image2pipe','-c:v','rawvideo','-pix_fmt','gray','-'],stdout=subprocess.PIPE,env=ENV)
ww,hh=w//4,h//4
fr=[]
while True:
    buf=p.stdout.read(ww*hh)
    if len(buf)<ww*hh: break
    fr.append(np.frombuffer(buf,np.uint8).reshape(hh,ww).astype(np.float32))
d=[float(np.abs(fr[i]-fr[i-1]).mean()) for i in range(1,len(fr))]
print(cut,a,b,'n',len(fr))
for i in range(0,len(d),12): print('  ',a+1+i,' '.join(f'{v:5.2f}' for v in d[i:i+12]))
