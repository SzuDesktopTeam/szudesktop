#!/opt/miniconda3/bin/python3
import subprocess, sys, json, os
import numpy as np
ROOT='/Users/alakazan/workplace/szudesktop-promo'
CD=f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV={**os.environ,'DYLD_LIBRARY_PATH':CD}
cut=sys.argv[1]; thr=float(sys.argv[2]) if len(sys.argv)>2 else 0.03
src=f'{ROOT}/out/szudesktop-promo-{cut}.mp4'
pr=json.loads(subprocess.check_output([f'{CD}/ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',src],env=ENV))
W,H=pr['streams'][0]['width'],pr['streams'][0]['height']
w,h=W//8,H//8
p=subprocess.Popen([f'{CD}/ffmpeg','-v','error','-i',src,'-vf',f'scale={w}:{h}:flags=area','-f','image2pipe','-c:v','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,env=ENV)
targets=np.array([[0x3F,0x36,0x29],[0x48,0x2A,0x15]],dtype=np.int16)
i=0; worst=(0,-1); bad=[]
fr=[]
while True:
    buf=p.stdout.read(w*h*3)
    if len(buf)<w*h*3: break
    a=np.frombuffer(buf,np.uint8).reshape(h,w,3).astype(np.int16)
    m=np.zeros((h,w),bool)
    for t in targets: m|=(np.abs(a-t)<=7).all(axis=2)
    f=m.mean(); fr.append(f)
    if f>worst[0]: worst=(f,i)
    if f>thr: bad.append((i,i/60,f))
    i+=1
print(f'{cut}: {i} frames, worst {worst[0]:.3f} at {worst[1]} ({worst[1]/60:.3f}s); {len(bad)} frames over {thr}')
for b in bad: print('  frame %d %.3fs %.1f%%'%(b[0],b[1],b[2]*100))
np.save(f'/tmp/qa2/empty_{cut}.npy',np.array(fr))
