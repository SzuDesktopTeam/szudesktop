import numpy as np, wave, sys
def load(p):
    w=wave.open(p); n=w.getnframes(); sr=w.getframerate(); ch=w.getnchannels()
    a=np.frombuffer(w.readframes(n),np.int16).astype(np.float32).reshape(-1,ch)/32768
    return a,sr
for cut,dur in (('16x9',60),('9x16',30)):
    a,sr=load(f'/tmp/qa2/audio_{cut}.wav')
    m=a.mean(axis=1)
    print(cut,'len %.3f s'%(len(a)/sr),'peak %.2f dBFS'%(20*np.log10(np.abs(a).max()+1e-12)))
    def rms(t0,t1):
        s=a[int(t0*sr):int(t1*sr)]
        return 20*np.log10(np.sqrt((s**2).mean())+1e-12)
    # end envelope: 100ms windows from dur-3.5
    print(' end RMS (100ms windows):')
    t=dur-3.5
    row=[]
    while t<dur-0.0001:
        row.append('%.1f:%.1f'%(t,rms(t,min(dur,t+0.1)))); t+=0.1
    print('  '+' '.join(row))
    # 50ms peak RMS at points
    pts=[0.94,20.69,30.94,49.78,52.5,58.125] if cut=='16x9' else [0.94,11.25,15.94,26.25,29.06]
    for p in pts:
        best=max(rms(p+d,p+d+0.05) for d in np.arange(-0.1,0.15,0.005))
        print('  50ms max RMS near %.2f: %.1f dB'%(p,best))
    # loudest 50ms windows overall
    win=int(0.05*sr); hop=int(0.01*sr)
    vals=[(20*np.log10(np.sqrt((a[i:i+win]**2).mean())+1e-12),i/sr) for i in range(0,len(a)-win,hop)]
    vals.sort(reverse=True)
    out=[];
    for v,tt in vals:
        if all(abs(tt-o[1])>0.3 for o in out): out.append((v,tt))
        if len(out)>=8: break
    print('  top 50ms windows:',' '.join('%.2fs:%.1f'%(tt,v) for v,tt in out))
