#!/opt/miniconda3/bin/python3
import wave, sys
import numpy as np
f=sys.argv[1]; cut=sys.argv[2]
w=wave.open(f); SR=w.getframerate(); n=w.getnframes()
x=np.frombuffer(w.readframes(n),np.int16).reshape(-1,2).astype(np.float32)/32768
def rms(t0,dur):
    a=x[int(t0*SR):int((t0+dur)*SR)]
    return 20*np.log10(np.sqrt((a**2).mean())+1e-9)
def peak50(t,span=0.25):
    best=-200;bt=t
    for k in np.arange(t-0.02,t+span,0.005):
        v=rms(k,0.05)
        if v>best: best,bt=v,k
    return best,bt
pts={'16x9':[('open impact',0.9375),('DROP',20.625),('1024',30.0),('CLIMAX',30.9375),('online',45.0),('badge1',48.75),('badge2',49.21875),('badge3',49.6875),('end icon',52.5),('final hit',58.125)],
     '9x16':[('open impact',0.9375),('DROP',11.25),('1024',15.0),('CLIMAX',15.9375),('online',22.5),('badge1',24.375),('end icon',26.25),('final hit',28.125)]}[cut]
for name,t in pts:
    v,bt=peak50(t)
    pre=rms(t-0.06,0.05)
    print(f'{name:12s} t={t:7.4f}  max50ms {v:6.1f} dBFS at {bt:.3f}   (50ms before: {pre:6.1f})')
dur=len(x)/SR
# global top 50ms windows
vals=[(rms(t,0.05),t) for t in np.arange(0,dur-0.05,0.025)]
vals.sort(reverse=True)
seen=[]
for v,t in vals:
    if all(abs(t-s)>0.5 for s in seen):
        seen.append(t)
        print(f'  loud50 {t:7.3f}s {v:6.1f}')
    if len(seen)>=8: break
print('ending 100 ms RMS:')
t=dur-4.2
while t<dur-0.05:
    print(f'  {t:6.2f}s {rms(t,0.1):6.1f}')
    t+=0.2
