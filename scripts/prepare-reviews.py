"""Prepare anonymous, course-specific reviews from a local collector export.

Raw exports stay outside the site. Only complete term/rating/comment blocks are
included; course-wide letter ratings remain separate from individual ratings.
"""
import argparse, collections, hashlib, json, re
from datetime import datetime
from pathlib import Path

DIMENSIONS = ('content', 'teaching', 'grading', 'workload')
GRADE = r'([A-E][+-]?)'
RATINGS = r'CONTENT\s+'+GRADE+r'\s+TEACHING\s+'+GRADE+r'\s+GRADING\s+'+GRADE+r'\s+WORKLOAD\s+'+GRADE
HEADER = re.compile(r'(?m)^(\d{4}-\d{2}\s+(?:Fall|Spring|Summer|Winter))\s*\n\s*Instructor\(s\):\s*([^\n]*)\n\s*'+RATINGS)
FOOTER = re.compile(r'(?m)^By .+ on ([A-Z][a-z]{2} \d{1,2}, \d{4})\s*$')
AGGREGATE = re.compile(r'(\d+) Reviews?\s+'+RATINGS+r'\s+(?:Write|Edit) Review')
TOPICS = [
 ('practice','Practice and revision',r'practi[cs]e|problem sets?|past papers?|pastpaper|操題|操题|刷题|刷題|練習|练习|复习|複習',
  'If you learn best through regular practice, compare the study methods and time commitments described in the reviews.',
  'Review mistakes and key concepts each week. Attempt problems independently, then try different question types to check your understanding.'),
 ('exams','Exams and grading',r'\bexam\b|\bexams\b|mid.?term|\bfinal\b|考试|考試|期中|期末',
  'Check the current exam formats and assessment weights, and consider how the exam schedule fits with your other courses.',
  'Confirm the exam scope and format early. Practise under timed conditions and focus on understanding rather than memorising answers.'),
 ('projects','Assignments and projects',r'assignments?|projects?|homework|作业|作業|專題|专题|大作业|大作業',
  'Map assignments and projects across the semester before combining this course with other demanding courses.',
  'Break each task into milestones, prepare an early draft, and leave time for feedback and revisions.'),
 ('groups','Group work',r'group.?mates?|group work|group project|team.?mates?|小组|小組|组员|組員|組隊|组队',
  'If group work matters to your choice, read recent reviews for the same instructor and confirm the current grouping arrangements.',
  'Agree on responsibilities, deadlines, and checkpoints at the start. Check progress together regularly.'),
 ('foundations','Background and prerequisites',r'prerequisit|background|beginner|prior knowledge|基础|基礎|零基础|零基礎|入门|入門',
  'Compare the prerequisites with your own background. A course described as easy by another student may not suit your preparation.',
  'Try introductory problems before the course starts and address unfamiliar concepts early to avoid falling behind.'),
 ('coding','Programming and debugging',r'programming|\bcode\b|\bcoding\b|debug|python|\bc\+\+|编程|程式|写代码|寫代碼',
  'If you have limited programming experience, allow time for writing and debugging code when planning your workload.',
  'Run and modify examples yourself, write small tests for your programs, and keep notes on debugging.'),
 ('participation','Class participation',r'attendance|participation|pop quiz|出勤|签到|簽到|考勤|课堂参与|課堂參與',
  'Check the current participation and attendance requirements. Experiences from previous semesters may not reflect this semester\'s rules.',
  'Confirm participation marks and attendance rules at the start, and add class activities and submission deadlines to your calendar.'),
 ('reading','Reading, writing and presentations',r'reading|readings|essays?|presentations?|阅读|閱讀|论文|論文|汇报|匯報',
  'If you are taking other courses with substantial reading or presentations, compare their deadlines before finalising your course combination.',
  'Note the arguments and evidence as you read. Outline essays and presentations first, then check clarity and citations.'),
]

def clean(text):
 text = re.sub(r'(?m)^By .+ on [A-Z][a-z]{2} \d{1,2}, \d{4}.*$', '', text)
 text = re.sub(r'(?i)(?<![\w.+-])[\w.+-]+@[\w.-]+\.[a-z]{2,}', '[Email hidden]', text)
 text = re.sub(r'(?im)^.*(?:access[_ -]?token|refresh[_ -]?token|authorization|cookie|password)\s*[:=].*$', '', text)
 text = re.sub(r'(?im)^\s*Read More\s*$', '', text)
 text = re.split(r'(?im)^\s*\d+ ATTACHMENTS?\s*$', text)[0]
 return re.sub(r'\n{3,}', '\n\n', text).strip()

def parse_reviews(text):
 headers = list(HEADER.finditer(text)); result = {}; discarded = 0
 for i, header in enumerate(headers):
  block = text[header.end():headers[i+1].start() if i+1<len(headers) else len(text)]
  footer = FOOTER.search(block)
  if not footer: discarded += 1; continue
  body = block[:footer.start()]
  labels = list(re.finditer(r'(?m)^(CONTENT|TEACHING|GRADING|WORKLOAD)\s*$', body))
  if [m[1] for m in labels] != ['CONTENT','TEACHING','GRADING','WORKLOAD']:
   discarded += 1; continue
  sections = {}
  for j, label in enumerate(labels):
   value = clean(body[label.end():labels[j+1].start() if j+1<len(labels) else len(body)])
   if value.lower() in ('no comment','n/a','na','nil','none','-'):value=''
   sections[label[1].lower()] = value
  if not any(sections.values()):discarded += 1; continue
  term,instructor,*grades=header.groups()
  instructor=clean(instructor)
  if instructor in ('Not Specified','N/A'):instructor=''
  ratings=dict(zip(DIMENSIONS,grades))
  identity=json.dumps([term,instructor,ratings,{k:re.sub(r'\s+',' ',v) for k,v in sections.items()}],ensure_ascii=False,sort_keys=True)
  key=hashlib.sha256(identity.encode()).hexdigest()[:16]
  useful=re.match(r'\s*(\d+) of (\d+) (?:people|person) found this helpful\.',block[footer.end():])
  row={'id':key,'term':term,'instructor':instructor,'ratings':ratings,'sections':sections,
       'date':datetime.strptime(footer[1],'%b %d, %Y').date().isoformat(),
       'helpful':int(useful[1]) if useful else 0}
  if key not in result or row['helpful']>result[key]['helpful']:result[key]=row
 return sorted(result.values(),key=lambda r:(r['date'],r['id']),reverse=True),len(headers),discarded

def analyze(reviews):
 themes=[]
 for key,label,pattern,selection,study in TOPICS:
  hits=[r for r in reviews if re.search(pattern,' '.join(r['sections'].values()),re.I)]
  if not hits:continue
  evidence=[]
  for r in sorted(hits,key=lambda r:r['helpful'],reverse=True):
   for value in r['sections'].values():
    sentences=re.split(r'(?<=[.!?。！？])\s+|\n+',value)
    sentence=next((s.strip() for s in sentences if re.search(pattern,s,re.I) and 12<=len(s.strip())<=380),None)
    if sentence:
     evidence.append({'reviewId':r['id'],'quote':sentence});break
   if len(evidence)==2:break
  themes.append({'id':key,'label':label,'mentions':len(hits),'selection':selection,'study':study,'evidence':evidence})
 themes.sort(key=lambda t:t['mentions'],reverse=True)
 return {'themes':themes,'terms':len({r['term'] for r in reviews}),
         'instructors':len({r['instructor'] for r in reviews if r['instructor']}),
         'latestTerm':max((r['term'] for r in reviews),default=''),
         'distributions':{key:dict(collections.Counter(r['ratings'][key] for r in reviews)) for key in DIMENSIONS}}

def prepare(payload,catalog):
 allowed={c['id'] for c in catalog['courses']}; seen=set(); result={}; stats=collections.Counter()
 for row in payload['courses']:
  code=row['courseCode']
  if code not in allowed or code in seen:raise ValueError('Unknown or duplicate course code: '+code)
  seen.add(code)
  if row['status']!='captured':continue
  if not row.get('sourceUrl','').rstrip('/').endswith('/'+code):raise ValueError('Course URL mismatch: '+code)
  text=row['text'];reviews,headers,discarded=parse_reviews(text)
  aggregates=list(AGGREGATE.finditer(text));aggregate=aggregates[-1] if aggregates else None
  scores=dict(zip(DIMENSIONS,aggregate.groups()[1:])) if aggregate else {}
  result[code]={'courseCode':code,'updatedAt':row['capturedAt'],'ratings':scores,
                'ratingCount':int(aggregate[1]) if aggregate else None,
                'reviewCount':len(reviews),'analysis':analyze(reviews),'reviews':reviews}
  stats.update({'courses':1,'reviews':len(reviews),'headers':headers,'discardedBlocks':discarded,'duplicateBlocks':headers-discarded-len(reviews),'ratingCourses':bool(scores)})
 return result,dict(stats)

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('input');ap.add_argument('--output-dir',default='public/reviews');ap.add_argument('--index',default='src/reviews/catalog.json');args=ap.parse_args()
 payload=json.loads(Path(args.input).read_text());catalog=json.loads(Path('src/schedules/uploaded.json').read_text())
 result,stats=prepare(payload,catalog);root=Path(args.output_dir);root.mkdir(parents=True,exist_ok=True)
 for code,value in result.items():
  (root/(code+'.json')).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
 content_version=hashlib.sha256(json.dumps(result,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:16]
 index={'contentVersion':content_version,'updatedAt':payload['capturedAt'],'processedCourses':len(payload['courses']),'stats':stats,
        'courses':{code:{k:value[k] for k in ('reviewCount','ratings','ratingCount')} for code,value in result.items()}}
 path=Path(args.index);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(stats,ensure_ascii=False));print('Anonymous review data written to',root)

if __name__=='__main__':main()
