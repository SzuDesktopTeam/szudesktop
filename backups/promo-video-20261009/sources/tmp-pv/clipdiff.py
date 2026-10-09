#!/opt/miniconda3/bin/python3
import os, subprocess, sys, json
import numpy as np
CD='/Users/alakazan/workplace/szudesktop-promo/video/node_modules/@remotion/compositor-darwin-arm64'
ENV={**os.environ,'DYLD_LIBRARY_PATH':CD}
src=sys.argv[1]
pr=json.loads(subprocess.check_output([f'{CD}/ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',src],env=ENV))
W,H=pr['streams'][0]['width'],pr['streams'][0]['height']
w,h=W//4,H//4
p=subprocess.Popen([f'{CD}/ffmpeg','-v','error','-i',src,'-vf',f'scale={w}:{h}:flags=area,format=gray','-f','image2pipe','-c:v','rawvideo','-pix_fmt','gray','-'],stdout=subprocess.PIPE,env=ENV)
fr=[]
while True:
    b=p.stdout.read(w*h)
    if len(b)<w*h: break
    fr.append(np.frombuffer(b,np.uint8).reshape(h,w).astype(np.float32))
# global shift estimate via phase correlation on the upper half (background)
def shift(a,b):
    A=np.fft.fft2(a-a.mean()); B=np.fft.fft2(b-b.mean())
    R=A*np.conj(B); R/=np.abs(R)+1e-9
    r=np.fft.ifft2(R).real
    y,x=np.unravel_index(np.argmax(r),r.shape)
    if y>r.shape[0]//2: y-=r.shape[0]
    if x>r.shape[1]//2: x-=r.shape[1]
    return x,y
d=[float(np.abs(fr[i]-fr[i-1]).mean()) for i in range(1,len(fr))]
print(os.path.basename(src),len(fr),'frames; diff min/med/max',round(min(d),2),round(float(np.median(d)),2),round(max(d),2))
print(' first 30 diffs:',' '.join(f'{x:.2f}' for x in d[:30]))
dups=[i for i,x in enumerate(d) if x<0.05]
print(' near-duplicate successive frames:',len(dups),dups[:20])
