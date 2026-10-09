import numpy as np, wave
BEAT=60/128
def load(p):
    w=wave.open(p); n=w.getnframes(); sr=w.getframerate(); ch=w.getnchannels()
    a=np.frombuffer(w.readframes(n),np.int16).astype(np.float32).reshape(-1,ch)/32768
    return a.mean(axis=1),sr
for cut in ('16x9','9x16'):
    x,sr=load(f'/tmp/qa2/audio_{cut}.wav')
    hop=int(sr*0.005); win=2048
    frames=(len(x)-win)//hop
    wnd=np.hanning(win)
    mags=[]
    prev=None; flux=[]
    for i in range(frames):
        s=x[i*hop:i*hop+win]*wnd
        m=np.abs(np.fft.rfft(s))
        m=np.log1p(m*10)
        if prev is not None: flux.append(np.maximum(m-prev,0).sum())
        else: flux.append(0)
        prev=m
    flux=np.array(flux); t=(np.arange(len(flux))*hop+win/2)/sr
    # peak pick
    thr=np.percentile(flux,97)
    peaks=[i for i in range(2,len(flux)-2) if flux[i]>thr and flux[i]==flux[i-2:i+3].max()]
    offs=[]
    for i in peaks:
        g=round(t[i]/(BEAT/4))*(BEAT/4); offs.append((t[i]-g)*1000)
    offs=np.array(offs)
    print(cut,'strong onsets',len(peaks),'offset to 16th grid ms: median %.1f, p10 %.1f, p90 %.1f'%(np.median(offs),np.percentile(offs,10),np.percentile(offs,90)))
    # list strongest 15 onsets
    top=sorted(peaks,key=lambda i:-flux[i])[:15]
    print('  strongest:',' '.join('%.3f'%t[i] for i in sorted(top)))
