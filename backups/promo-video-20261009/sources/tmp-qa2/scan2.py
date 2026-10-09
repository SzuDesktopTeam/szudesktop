#!/opt/miniconda3/bin/python3
import subprocess, sys, json, os
import numpy as np
CD='/Users/alakazan/workplace/szudesktop-promo/video/node_modules/@remotion/compositor-darwin-arm64'
ENV={**os.environ,'DYLD_LIBRARY_PATH':CD}
cut=sys.argv[1]
src=f'/Users/alakazan/workplace/szudesktop-promo/out/szudesktop-promo-{cut}.mp4'
pr=json.loads(subprocess.check_output([CD+'/ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',src],env=ENV))
W,H=pr['streams'][0]['width'],pr['streams'][0]['height']
w=160 if W>H else 90; h=round(H*w/W)
p=subprocess.Popen([CD+'/ffmpeg','-v','error','-i',src,'-vf',f'scale={w}:{h}:flags=area','-f','image2pipe','-c:v','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,env=ENV)
fr=[]
while True:
    b=p.stdout.read(w*h*3)
    if len(b)<w*h*3: break
    fr.append(np.frombuffer(b,np.uint8).reshape(h,w,3))
fr=np.stack(fr)
np.save(f'/tmp/qa2/proxy_{cut}.npy',fr)
n=len(fr)
f32=lambda i: fr[i].astype(np.float32)
d=lambda a,b: float(np.abs(f32(a)-f32(b)).mean())
lum=fr.astype(np.float32).mean(axis=(1,2,3))
print(cut,n,'frames')
print('black-ish frames (mean<12):',[ (i,round(i/60,3),round(float(lum[i]),1)) for i in range(n) if lum[i]<12])
print('white-ish frames (mean>225):',[ (i,round(i/60,3),round(float(lum[i]),1)) for i in range(n) if lum[i]>225])
res=[]
for k in (2,3):
    for i in range(k,n-k):
        a=d(i,i-k); c=d(i,i+k); e=d(i-k,i+k)
        s=min(a,c)-e
        if s>6: res.append((round(s,1),i,round(i/60,3),k,round(a,1),round(c,1),round(e,1)))
res.sort(reverse=True)
seen=set()
print('run-glitch candidates (score, frame, sec, k, d(i-k), d(i+k), d(i-k,i+k)):')
for r in res[:80]:
    if (r[1]) in seen: continue
    seen.add(r[1]); print(' ',r)
