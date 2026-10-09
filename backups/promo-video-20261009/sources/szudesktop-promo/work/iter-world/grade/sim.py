import sys, numpy as np
from PIL import Image
FOOT='/Users/alakazan/workplace/szudesktop-promo/video/public/assets/footage/'
def sat(a,s):
    M=np.array([[0.213+0.787*s,0.715-0.715*s,0.072-0.072*s],[0.213-0.213*s,0.715+0.285*s,0.072-0.072*s],[0.213-0.213*s,0.715-0.715*s,0.072+0.928*s]])
    return np.clip(a@M.T,0,1)
def contrast(a,c): return np.clip((a-0.5)*c+0.5,0,1)
def bright(a,b): return np.clip(a*b,0,1)
def table(a,vals):
    vals=np.array(vals,float); n=len(vals)-1
    x=np.clip(a,0,1)*n; k=np.minimum(np.floor(x).astype(int),n-1); t=x-k
    return vals[k]*(1-t)+vals[k+1]*t
def chain(a,ops):
    for op in ops:
        if op[0]=='sat': a=sat(a,op[1])
        elif op[0]=='con': a=contrast(a,op[1])
        elif op[0]=='bri': a=bright(a,op[1])
        elif op[0]=='tab': a=table(a,op[1])
    return a
def Y(a): return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
GRADES={
 'cur':[('sat',1.15),('con',1.1)],
 'plan':[('sat',1.15),('con',1.18),('bri',0.96)],
 'lev54':[('sat',1.15),('bri',0.8794),('con',1.592)],
 'lev54s1':[('sat',1.05),('bri',0.8794),('con',1.592)],
}
if __name__=='__main__':
    names=sys.argv[1].split(',')
    files=['clip_scene_lake_s13.f0060.png','clip_scene_bookshop_s14.f0060.png','clip_scene_terrace_s15.f0060.png']
    for g in names:
        ops=GRADES[g]
        for f in files:
            a=np.asarray(Image.open(FOOT+f).convert('RGB')).astype(np.float32)/255
            o=chain(a,ops); y=Y(o)*255
            clipfrac=(o>=0.999).any(-1).mean()*100
            print(g, f.split('.')[0][11:], 'p1 %.0f p5 %.0f med %.0f p95 %.0f p99.9 %.0f max %.0f clip%% %.2f' % (*np.percentile(y,[1,5,50,95,99.9]), y.max(), clipfrac))
