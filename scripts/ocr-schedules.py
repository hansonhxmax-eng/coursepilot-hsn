"""OCR PDF schedule snapshots locally. Requires PyMuPDF and the tesseract CLI.
No HTTP requests, institutional login, or review scraping are performed.
"""
import argparse,json,subprocess,os,concurrent.futures
from pathlib import Path
import fitz
ap=argparse.ArgumentParser();ap.add_argument('--input-dir',default='public/schedules');ap.add_argument('--work-dir',default='/tmp/coursepilot-schedules');ap.add_argument('--workers',type=int,default=3);args=ap.parse_args()
root=Path(args.work_dir).resolve();root.mkdir(parents=True,exist_ok=True)
files=[{'name':p.stem,'path':str(p.resolve())} for p in sorted(Path(args.input_dir).glob('*.pdf'))]
if not files:ap.error('No PDF inputs found.')
(root/'files.json').write_text(json.dumps(files,indent=2))
jobs=[]
for f in files:
 with fitz.open(f['path']) as d:jobs.extend((f['name'],f['path'],i) for i in range(len(d)))
def work(job):
 name,path,i=job;base=root/f'{name}-{i+1:02d}'
 with fitz.open(path) as doc:doc[i].get_pixmap(matrix=fitz.Matrix(2,2)).save(str(base)+'.png')
 env=os.environ.copy();env['OMP_THREAD_LIMIT']='1'
 subprocess.run(['tesseract',str(base)+'.png',str(base),'-l','eng','--psm','6','tsv','txt'],check=True,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 return name,i+1
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(args.workers,4))) as pool:
 for n,result in enumerate(pool.map(work,jobs),1):
  if n%10==0 or n==len(jobs):print(f'OCR {n}/{len(jobs)} pages',flush=True)
print('Manifest:',root/'files.json')
