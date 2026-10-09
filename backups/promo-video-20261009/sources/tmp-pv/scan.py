#!/opt/miniconda3/bin/python3
"""Single pass over a cut at 1/8 scale: per-frame empty-stage share (#3F3629/#482A15 ±7),
mean luma, near-white share (all channels >= 225), mean abs diff to previous frame.
Writes CSV to /tmp/pv/scan_<tag>.csv"""
import os, subprocess, sys, json
import numpy as np
ROOT='/Users/alakazan/workplace/szudesktop-promo'
CD=f'{ROOT}/video/node_modules/@remotion/compositor-darwin-arm64'
ENV={**os.environ,'DYLD_LIBRARY_PATH':CD}
cut=sys.argv[1]
src=f'{ROOT}/out/szudesktop-promo-{cut}.mp4'
pr=json.loads(subprocess.check_output([f'{CD}/ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',src],env=ENV))
W,H=pr['streams'][0]['width'],pr['streams'][0]['height']
w,h=W//8,H//8
p=subprocess.Popen([f'{CD}/ffmpeg','-v','error','-i',src,'-vf',f'scale={w}:{h}:flags=area','-f','image2pipe','-c:v','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,env=ENV)
targets=np.array([[0x3F,0x36,0x29],[0x48,0x2A,0x15]],dtype=np.int16)
out=open(f'/tmp/pv/scan_{cut}.csv','w')
out.write('frame,t,empty,luma,white,diff\n')
prev=None;i=0
while True:
    buf=p.stdout.read(w*h*3)
    if len(buf)<w*h*3: break
    a=np.frombuffer(buf,np.uint8).reshape(h,w,3).astype(np.int16)
    m=np.zeros((h,w),bool)
    for t in targets: m|=(np.abs(a-t)<=7).all(axis=2)
    luma=(0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]).mean()
    white=((a>=225).all(axis=2)).mean()
    diff=float(np.abs(a-prev).mean()) if prev is not None else 0.0
    out.write(f'{i},{i/60:.3f},{m.mean():.4f},{luma:.2f},{white:.4f},{diff:.2f}\n')
    prev=a;i+=1
out.close()
print('done',cut,i)
