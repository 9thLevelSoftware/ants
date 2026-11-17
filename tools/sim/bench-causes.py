#!/usr/bin/env python3
"""Nest-bench brood losses and adult deaths by cause, before vs after (colony-life round 4).

    python3 tools/sim/bench-causes.py AFTER_DIR BEFORE_DIR

Reads the bench-nest-*.md files (brood and deaths lines) of runs present in both."""
import glob, os, re, statistics, sys

def load(d):
    out={}
    for f in glob.glob(os.path.join(d,'bench-nest-*.md')):
        k=os.path.basename(f)[len('bench-nest-'):-3]
        t=open(f).read()
        m=re.search(r'^- brood: laid (\d+), hatched (\d+), pupated (\d+), eclosed (\d+); losses ([^;]*);',t,re.M)
        w=re.search(r'workers (\d+) -> (\d+)',t)
        dm=re.search(r'^- deaths: (.*)$',t,re.M)
        losses={}
        for part in m.group(5).split(', '):
            if ' ' in part:
                c,n=part.rsplit(' ',1); losses[c]=int(n)
        deaths={}
        if dm:
            for part in dm.group(1).split(', '):
                if ' ' in part: c,n=part.rsplit(' ',1); deaths[c]=int(n)
        out[k]=dict(laid=int(m.group(1)),ecl=int(m.group(4)),w0=int(w.group(1)),w1=int(w.group(2)),losses=losses,deaths=deaths)
    return out
a=load(sys.argv[1]); b=load(sys.argv[2])
keys=sorted(set(a)&set(b))
def agg(d,ks):
    tot={}
    for k in ks:
        for c,n in d[k]['losses'].items():
            key=c.split(':')[1]; tot[key]=tot.get(key,0)+n
    return tot
def dagg(d,ks):
    tot={}
    for k in ks:
        for c,n in d[k]['deaths'].items(): tot[c]=tot.get(c,0)+n
    return tot
print('runs in both:',len(keys))
for name,d in (('before',b),('after',a)):
    print(name,'laid',sum(d[k]['laid'] for k in keys),'eclosed',sum(d[k]['ecl'] for k in keys),'median eclosed',statistics.median([d[k]['ecl'] for k in keys]),
      'workers w0->w1 sum',sum(d[k]['w0'] for k in keys),'->',sum(d[k]['w1'] for k in keys),'median net',statistics.median([d[k]['w1']-d[k]['w0'] for k in keys]),
      'held',sum(1 for k in keys if d[k]['w1']>=d[k]['w0']))
    print('  brood losses by cause',dict(sorted(agg(d,keys).items(),key=lambda x:-x[1])))
    print('  hygiene median',statistics.median([sum(n for c,n in d[k]['losses'].items() if c.endswith('hygiene')) for k in keys]))
    print('  adult deaths',dict(sorted(dagg(d,keys).items(),key=lambda x:-x[1])))
for k in keys:
    print(k,'before ecl',b[k]['ecl'],'w',b[k]['w0'],'->',b[k]['w1'],'hyg',sum(n for c,n in b[k]['losses'].items() if c.endswith('hygiene')),'| after ecl',a[k]['ecl'],'w',a[k]['w0'],'->',a[k]['w1'],'hyg',sum(n for c,n in a[k]['losses'].items() if c.endswith('hygiene')))
