#!/opt/miniconda3/bin/python3
import os, subprocess, sys, json
import numpy as np
ROOT='/Users/alakazan/workplace/szudesktop-promo'
CD=f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV={**os.environ,'DYLD_LIBRARY_PATH':CD}
cut=sys.argv[1]; top=int(sys.argv[2]) if len(sys.argv)>2 else 40
src=f'{ROOT}/out/szudesktop-promo-{cut}.mp4'
pr=json.loads(subprocess.check_output([f'{CD}/ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',src],env=ENV))
W,H=pr['streams'][0]['width'],pr['streams'][0]['height']
w=160 if W>H else 90; h=round(H*w/W)
p=subprocess.Popen([f'{CD}/ffmpeg','-v','error','-i',src,'-vf',f'scale={w}:{h}:flags=area','-f','image2pipe','-c:v','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,env=ENV)
fr=[]
while True:
    b=p.stdout.read(w*h*3)
    if len(b)<w*h*3: break
    fr.append(np.frombuffer(b,np.uint8).reshape(h,w,3).astype(np.float32))
d=lambda a,b: float(np.abs(fr[a]-fr[b]).mean())
sc=[]
for i in range(1,len(fr)-1):
    a,b,c=d(i-1,i),d(i,i+1),d(i-1,i+1)
    sc.append((min(a,b)-c,i,a,b,c))
sc.sort(reverse=True)
print(cut,len(fr))
for s,i,a,b,c in sc[:top]:
    if s<1.0: break
    print(f'  frame {i:5d} {i/60:7.3f}s score {s:6.2f} d(prev)={a:6.2f} d(next)={b:6.2f} d(prev,next)={c:6.2f}')
