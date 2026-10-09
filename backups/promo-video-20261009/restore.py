#!/usr/bin/env python3
"""Extract and verify the selected video backup; requires Python 3.12+."""
import argparse, pathlib, tarfile, json, hashlib, shutil, os
p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('destination');a=p.parse_args()
dest=pathlib.Path(a.destination).resolve();dest.mkdir(parents=True,exist_ok=True)
if any(dest.iterdir()): raise SystemExit('Destination must be empty')
with tarfile.open(a.archive,'r:gz') as t: t.extractall(dest, filter='data')
m=json.loads((dest/'manifest.json').read_text())
for e in m['entries']:
 f=dest/e['archive_path']
 if e['type']=='file':
  if e.get('storage')=='duplicate_reference':
   f.unlink();shutil.copyfile(dest/e['duplicate_of'],f)
  h=hashlib.sha256()
  with f.open('rb') as r:
   for b in iter(lambda:r.read(1048576),b''):h.update(b)
  if h.hexdigest()!=e['sha256']:raise SystemExit('Hash mismatch: '+e['archive_path'])
  os.chmod(f,e['mode']);os.utime(f,ns=(e['mtime_ns'],e['mtime_ns']))
 elif e['type']=='symlink':
  if os.readlink(f)!=e.get('restore_target',e['target']):raise SystemExit('Symlink mismatch: '+e['archive_path'])
  os.utime(f,ns=(e['mtime_ns'],e['mtime_ns']),follow_symlinks=False)
for e in sorted(m['directories'],key=lambda e:e['archive_path'].count('/'),reverse=True):
 f=dest/e['archive_path'];os.chmod(f,e['mode']);os.utime(f,ns=(e['mtime_ns'],e['mtime_ns']))
print('Verified and restored',len(m['entries']),'entries to',dest)
