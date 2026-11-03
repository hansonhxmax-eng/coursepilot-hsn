"""Convert local OCR TSVs into provenance-aware schedule snapshots.
Run OCR separately with Tesseract. This script never contacts SIS or USTSpace.
"""
import csv,json,re,hashlib,collections,argparse
from datetime import date
from pathlib import Path
MONTHS={m:i+1 for i,m in enumerate(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'])}
DAYS={'Mo':0,'Tu':1,'We':2,'Th':3,'Fr':4,'Sa':5,'Su':6}
TIME=re.compile(r'((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)\s*)+)\s*(\d{1,2}:\d{2}\s*[AP]M)\s*[-–—]\s*(\d{1,2}:\d{2}\s*[AP]M)',re.I)
DATE=re.compile(r'(\d{1,2})-([A-Z]{3})-(\d{4})')
def minute(t):
 m=re.fullmatch(r'(\d{1,2}):(\d{2})(AM|PM)',re.sub(r'\s','',t).upper())
 if not m:return None
 h,n,a=m.groups();h=int(h);n=int(n)
 if not 1<=h<=12 or not 0<=n<60:return None
 return h%12*60+n+(720 if a=='PM' else 0)
def sessions(raw):
 text=re.sub(r'-\s+(?=\d{4})','-',raw)
 text=re.sub(r'(?<=\d)\s*:\s*(?=\d)',':',text)
 found=[];issues=[]
 for match in TIME.finditer(text):
  start,end=minute(match[2]),minute(match[3]);daytext=match[1]
  if start is None or end is None or end<=start:
   issues.append('Invalid time interval');continue
  before=text[:match.start()];dates=DATE.findall(before)
  bounds=None
  if len(dates)==1:issues.append('Unclear date interval')
  if len(dates)>=2:
   a,b=dates[-2:]
   try:
    def iso(d):return date(int(d[2]),MONTHS[d[1].upper()],int(d[0])).isoformat()
    bounds=[iso(a),iso(b)]
    if bounds[1]<bounds[0]:issues.append('Invalid date interval');continue
   except (ValueError,KeyError):issues.append('Unclear date interval');continue
  # OCR may omit letters from a weekday token (e.g. WeFr -> Wer). Do not
  # accept a suffix of a malformed token as a verified weekday sequence.
  prefix=text[:match.start()]
  if prefix and prefix[-1].isalpha():issues.append('Unclear weekday token');continue
  for token in re.findall(r'Mo|Tu|We|Th|Fr|Sa|Su',daytext,re.I):
   day=DAYS[token.title()]
   row={'day':day,'start':start,'end':end,'dateStart':bounds[0] if bounds else None,'dateEnd':bounds[1] if bounds else None}
   if row not in found:found.append(row)
 if re.search(r'\bTBA\b|\bTBC\b',text,re.I):issues.append('Time to be arranged')
 all_times=re.findall(r'\d{1,2}:\d{2}\s*[AP]M',text,re.I)
 if len(all_times)>sum(2 for _ in TIME.finditer(text)):issues.append('Unparsed time text')
 if not found:issues.append('No readable scheduled meeting')
 return found,sorted(set(issues))
def lines(path):
 groups=collections.OrderedDict()
 with path.open() as f:
  for row in csv.DictReader(f,delimiter='\t'):
   if row['level']!='5' or not row['text'].strip():continue
   for k in ['left','top','width','height']:row[k]=int(row[k])
   row['conf']=float(row['conf']);groups.setdefault((row['block_num'],row['par_num'],row['line_num']),[]).append(row)
 return [sorted(v,key=lambda w:w['left']) for v in groups.values()]
def integer(words):
 if not words:return None
 s=''.join(w['text'] for w in words).strip().replace('O','0').replace('o','0')
 s=re.sub(r'[«»°=+()\s]','',s)
 if not re.fullmatch(r'-?\d{1,4}',s):return None
 n=int(s)
 return n if -100<=n<=3000 else None
def clean_section(s):
 s=s.upper().replace(' ','')
 s=s.replace('O','0').replace('I','1').replace('!','1')
 if re.fullmatch(r'(?:LA|LB|L|T|R)T',s):s=s[:-1]+'1'
 if re.fullmatch(r'7\d+',s):s='T'+s[1:]
 if s in ['LT','L?']:s='L1'
 return s

def build(root,files):
 courses=[];all_sections=[];source_meta=[];unparsed=[]
 corrections=json.loads((Path(__file__).parent/'schedule-corrections.json').read_text())
 for source in files:
  dept=source['name'];current=None;section=None;columns=None;headers=[]
  tsvs=sorted(root.glob(dept+'-[0-9][0-9].tsv'))
  for page,path in enumerate(tsvs,1):
   for ws in lines(path):
    text=' '.join(w['text'] for w in ws)
    match=re.match(rf'^{dept}\s+(\S+)\s*[-–—]\s*(.+)',text)
    if match:
     tail=match[2];unit=re.search(r'\((\d+(?:\.\d+)?)\s*units?\)',tail,re.I)
     title=tail[:unit.start()].strip() if unit else tail
     title=re.sub(r'\bAl\b','AI',title)
     code=match[1].upper().replace('!','I').replace('|','I')
     current={'id':dept+code,'department':dept,'code':dept+' '+code,'title':title,'credits':float(unit[1]) if unit else None,'term':'2026-27 Fall','tags':sorted(set(re.findall(r'CC\s*(2[256])',tail,re.I))),'commonCore2026':bool(re.search(r'CC\s*26',tail,re.I)),'domain':None,'attendance':None,'quizzes':None,'group':None,'rating':None,'workload':None,'sections':[],'sourceFile':dept+'.pdf','sourcePages':[page],'sourceHeader':text,'issues':[]}
     if not re.fullmatch(r'\d{4}[A-Z]?',code):current['issues'].append('Course code needs visual verification')
     if unit is None:current['issues'].append('Credits/title may continue on next line')
     courses.append(current);headers.append(text);section=None;continue
    if 'Section' in text and ('Quota' in text or 'Enrol' in text):
     def x(regex,default):return next((w['left'] for w in ws if re.fullmatch(regex,w['text'],re.I)),default)
     date=x('Date',184);room=x('Room',369);inst=x('Instructor',527)
     quota=x('Quota',836);enrol=x('Enrol',891);avail=x('Avail',939);wait=x('Wait',987);remarks=x('Remarks',1033)
     ta=next((w['left'] for w in ws if w['left']>inst+70 and w['left']<quota and ('TA' in w['text'].upper() or 'GTA' in w['text'].upper())),int((inst+quota)/2))
     columns=[date,room,inst,ta,quota,enrol,avail,wait,remarks]
     continue
    if current is None or columns is None:continue
    if re.search(r'class information on this page|^2026-27|^ACCT AESF|^CHEM CHMS|^DSAA DSCT|^ENVS |^MASS |^MSDM |^SHSS ',text):continue
    # First column contains a section label and/or its class number.
    left=' '.join(w['text'] for w in ws if w['left']<columns[0]-15).replace('|',' ').strip()
    sec=re.match(r'^([A-Za-z0-9!?|]+)\s*(?:\(\s*(\d{4,5})\s*\))?$',left)
    label=clean_section(sec[1]) if sec else None
    # Never use room capacities, continuation class IDs or navigation links as rows.
    if label and (re.fullmatch(r'(?:L[A-B]?|T|R|LAB)[0-9A-Z]+',label) or (sec[2] and re.fullmatch(r'\d{1,2}',label))):
     classid=sec[2];label_match=re.fullmatch(r'(?:L[A-B]?|T|R|LAB)(\d+)[A-Z]?',label)
     known=bool(label_match and int(label_match[1])>0)
     kind='lab' if label.startswith(('LA','LB')) else 'lecture' if label.startswith('L') else 'tutorial' if label.startswith('T') else 'recitation' if label.startswith('R') else 'unknown'
     section={'id':current['id']+'-'+label+(('-'+classid) if classid else ''),'label':label,'classNumber':classid,'kind':kind,'rawTimeParts':[],'rawRoomParts':[],'rawInstructorParts':[],'sessions':[],'quota':None,'enrolled':None,'seats':None,'waitlist':None,'numericStatus':'unreadable','sourceFile':dept+'.pdf','sourcePages':[page],'issues':[]}
     if not known:section['issues'].append('Unclear section label')
     current['sections'].append(section);all_sections.append(section)
     numeric=[]
     for a,b in zip(columns[4:8],columns[5:9]):numeric.append(integer([w for w in ws if a-15<=w['left']<b-15]))
     q,e,a,w=numeric
     if all(n is not None for n in numeric) and q>=0 and e>=0 and w>=0 and q-e==a:
      section.update(quota=q,enrolled=e,seats=a,waitlist=w,numericStatus='ocr-consistent')
     else:section['issues'].append('Seat counts incomplete or inconsistent; not treated as current availability')
    if section:
     if page not in section['sourcePages']:section['sourcePages'].append(page)
     if page not in current['sourcePages']:current['sourcePages'].append(page)
     if not section['classNumber']:
      cid=re.fullmatch(r'\((\d{4,5})\)',left)
      if cid:section['classNumber']=cid[1]
     for key,a,b in [('rawTimeParts',columns[0],columns[1]),('rawRoomParts',columns[1],columns[2]),('rawInstructorParts',columns[2],columns[3])]:
      part=' '.join(w['text'] for w in ws if a-15<=w['left']<b-15)
      if part:section[key].append(part)
  raw=Path(source['path']).read_bytes()
  source_meta.append({'department':dept,'file':dept+'.pdf','pages':len(tsvs),'originalSha256':hashlib.sha256(raw).hexdigest(),'capturedAt':None,'uploadedOn':'2026-11-03','courseHeaders':len(headers)})
 for c in courses:
  original_id=c['id']
  for s in c['sections']:
   checked=corrections['sectionLabels'].get(c['id']+':'+str(s['classNumber']))
   if checked:
    s['label']=checked
    s['kind']='lab' if checked.startswith(('LA','LB')) else 'lecture' if checked.startswith('L') else 'tutorial' if checked.startswith('T') else 'recitation'
    s['issues']=[x for x in s['issues'] if x!='Unclear section label']
    s['verifiedFields']=['label']
   if c['id']=='AISC1000A' and s['classNumber'] and 3010<=int(s['classNumber'])<=3025:
    s['label']=f"LA{int(s['classNumber'])-3009:02d}"
    s['issues']=[x for x in s['issues'] if x!='Unclear section label']
    s['verifiedFields']=['label']
   s['classNumber']=corrections.get('sectionClassNumbers',{}).get(c['id']+':'+str(s['classNumber']),s['classNumber'])
   s['id']=c['id']+'-'+s['label']+'-'+(s['classNumber'] or str(c['sections'].index(s)+1))
   s['rawTime']=' '.join(s.pop('rawTimeParts'));s['room']=' '.join(s.pop('rawRoomParts'));s['instructor']=' '.join(s.pop('rawInstructorParts'))
   s['sessions'],issues=sessions(s['rawTime']);s['issues']+=issues
   s['scheduleReadable']=bool(s['sessions']) and not issues and 'Unclear section label' not in s['issues'] and s['kind']!='unknown' and not c['issues']
  checked_code=corrections.get('courseCodesBySource',{}).get(c['sourceFile']+':'+str(c['sourcePages'][0])+':'+c['id']) or corrections['courseCodes'].get(c['id'])
  if checked_code:
   c['id']=checked_code;c['code']=checked_code[:4]+' '+checked_code[4:]
   c['issues']=[x for x in c['issues'] if x!='Course code needs visual verification'];c['verifiedFields']=['code']
   for section in c['sections']:
    section['id']=section['id'].replace(original_id+'-',checked_code+'-',1)
    if not [i for i in section['issues'] if i!='Seat counts incomplete or inconsistent; not treated as current availability'] and section['sessions'] and section['kind']!='unknown':section['scheduleReadable']=True
  if not c['sections']:c['issues'].append('No section rows recognized')
 counts={'sources':len(files),'pages':sum(s['pages'] for s in source_meta),'courses':len(courses),'sections':len(all_sections),'readableSections':sum(s['scheduleReadable'] for s in all_sections),'consistentSeatSections':sum(s['numericStatus']=='ocr-consistent' for s in all_sections),'commonCoreTaggedCourses':sum(c['commonCore2026'] for c in courses)}
 return {'schemaVersion':1,'term':'2026-27 Fall','mode':'uploaded-pdf-snapshot','capturedAt':None,'uploadedOn':'2026-11-03','notice':'OCR transcription of user-uploaded schedule screenshots, not a live SIS connection. Capture date and current availability are unknown. Verify original PDFs, section pairing, eligibility and current SIS before enrolling. Attendance, quizzes, group work and reviews are not supplied.','sources':source_meta,'counts':counts,'courses':courses}
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--ocr-dir',default='/tmp/coursepilot-schedules');ap.add_argument('--manifest',default='/tmp/coursepilot-schedule-files.json');ap.add_argument('--output',default='src/schedules/uploaded.json');args=ap.parse_args()
 data=build(Path(args.ocr_dir),json.load(open(args.manifest)));Path(args.output).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print(json.dumps(data['counts'],indent=2))
 for s in data['sources']:print(s['department'],s['courseHeaders'])
