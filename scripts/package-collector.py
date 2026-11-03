"""Package the local-only collector; never include its session or output files."""
from pathlib import Path
import json,zipfile
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'src/schedules/uploaded.json').read_text())
codes={'schemaVersion':1,'term':data['term'],'courseCodes':[c['id'] for c in data['courses'] if not c['issues']],'excluded':[{'courseCode':c['id'],'reason':'; '.join(c['issues'])} for c in data['courses'] if c['issues']]}
(root/'tools/ustspace/coursepilot-course-codes.json').write_text(json.dumps(codes,indent=2)+'\n')
(root/'public/collector').mkdir(exist_ok=True)
with zipfile.ZipFile(root/'public/collector/CoursePilot-collector.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['collect.py','requirements.txt','README.md','coursepilot-course-codes.json','Start-Windows.bat']:
  z.write(root/'tools/ustspace'/name,Path('CoursePilot-collector')/name)
print('Packaged local collector:',len(codes['courseCodes']),'clear codes;',len(codes['excluded']),'excluded for verification.')
