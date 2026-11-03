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
 ('practice','练习与复习',r'practi[cs]e|problem sets?|past papers?|pastpaper|操題|操题|刷题|刷題|練習|练习|复习|複習',
  '如果希望靠持续练习提升表现，可重点比较评价中提到的练习方式和时间投入。',
  '每周整理错题与概念，先独立完成练习，再用不同题型检验理解。'),
 ('exams','考试与评分',r'\bexam\b|\bexams\b|mid.?term|\bfinal\b|考试|考試|期中|期末',
  '选课前核对当期考试权重和题型，评估它与同学期其他课程的考试安排。',
  '尽早确认考试范围与题型，复习时做限时练习，不只背熟已有答案。'),
 ('projects','作业与项目',r'assignments?|projects?|homework|作业|作業|專題|专题|大作业|大作業',
  '把作业和项目放进整学期时间表，再决定是否与其他任务密集的课程同修。',
  '拿到任务后先拆分里程碑，尽早做出可检查的初稿，预留修改时间。'),
 ('groups','小组协作',r'group.?mates?|group work|group project|team.?mates?|小组|小組|组员|組員|組隊|组队',
  '如果在意小组合作体验，重点查看近期同教师评价，并确认当期的分组安排。',
  '开始合作时明确分工、交付日期和检查点，定期核对每个人的进度。'),
 ('foundations','基础与入门',r'prerequisit|background|beginner|prior knowledge|基础|基礎|零基础|零基礎|入门|入門',
  '先对照先修要求和自己的基础，避免只根据别人的“容易”就判断适合自己。',
  '开课前用入门题检查基础，不熟悉的概念及时补齐，避免越积越多。'),
 ('coding','编程与调试',r'programming|\bcode\b|\bcoding\b|debug|python|\bc\+\+|编程|程式|写代码|寫代碼',
  '如果编程经验较少，为实际写代码和调试留出时间，再评估同修负担。',
  '亲自运行并修改例子，为自己的程序编写小测试，保留调试记录。'),
 ('participation','课堂参与',r'attendance|participation|pop quiz|出勤|签到|簽到|考勤|课堂参与|課堂參與',
  '关注当期课堂参与和考勤说明；往届学生的经历不能直接代替本学期要求。',
  '开课时确认参与分与考勤规则，把课堂活动和提交期限记进日历。'),
 ('reading','阅读与表达',r'reading|readings|essays?|presentations?|阅读|閱讀|论文|論文|汇报|匯報',
  '如果本学期已有多门阅读或汇报课程，先比较各门课的交付时间再组合。',
  '读材料时记录论点和依据；写作或汇报先列提纲，再检查表达与引用。'),
]

def clean(text):
 text = re.sub(r'(?m)^By .+ on [A-Z][a-z]{2} \d{1,2}, \d{4}.*$', '', text)
 text = re.sub(r'(?i)(?<![\w.+-])[\w.+-]+@[\w.-]+\.[a-z]{2,}', '[邮箱已隐藏]', text)
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
 index={'updatedAt':payload['capturedAt'],'processedCourses':len(payload['courses']),'stats':stats,
        'courses':{code:{k:value[k] for k in ('reviewCount','ratings','ratingCount')} for code,value in result.items()}}
 path=Path(args.index);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(stats,ensure_ascii=False));print('Anonymous review data written to',root)

if __name__=='__main__':main()
