"""Review preparation tests exercise attribution boundaries and anonymous output."""
import importlib.util,json,unittest
from pathlib import Path

root=Path(__file__).parents[1]
spec=importlib.util.spec_from_file_location('prepare_reviews',root/'scripts/prepare-reviews.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def review(body='Read the weekly exercises.\nEmail: learner@example.test'):
 return ('2025-26 Fall\nInstructor(s): TEST, Teacher\nCONTENT\nA\nTEACHING\nB\nGRADING\nC\nWORKLOAD\nD\n'
         'Mid-term Exam\nFinal Exam\nQuiz\nAssignment\nAttendance\nCONTENT\n'+body+
         '\nTEACHING\nClear explanations.\nGRADING\nNo Comment\nWORKLOAD\nWeekly assignments.\nRead More\n'
         '1 ATTACHMENT\nprivate-file.pdf\nBy OriginalStudentHandle on Nov 01, 2026\n3 of 4 people found this helpful.\n0\n')

class ReviewTests(unittest.TestCase):
 def test_separates_rating_sections_from_ui_tags_and_removes_author(self):
  rows,headers,discarded=m.parse_reviews(review())
  self.assertEqual((len(rows),headers,discarded),(1,1,0))
  text=json.dumps(rows,ensure_ascii=False)
  for private in ['OriginalStudentHandle','learner@example.test','private-file.pdf','Mid-term Exam','Attendance']:
   self.assertNotIn(private,text)
  self.assertEqual(rows[0]['ratings'],dict(content='A',teaching='B',grading='C',workload='D'))
  self.assertEqual(rows[0]['sections']['grading'],'')
  self.assertEqual(rows[0]['helpful'],3)
 def test_repeated_page_does_not_duplicate_a_review(self):
  rows,headers,_=m.parse_reviews(review()+review())
  self.assertEqual(headers,2);self.assertEqual(len(rows),1)
 def test_partial_leading_comment_is_not_assigned_to_next_review(self):
  rows,_,_=m.parse_reviews('partial missing header\nBy Somebody on Oct 01, 2026\n'+review())
  self.assertEqual(len(rows),1);self.assertNotIn('partial missing header',json.dumps(rows))
 def test_missing_footer_and_empty_bodies_are_not_published(self):
  self.assertFalse(m.parse_reviews(review().split('By Original')[0])[0])
  self.assertFalse(m.parse_reviews(review('No Comment').replace('Clear explanations.','No Comment').replace('Weekly assignments.','No Comment'))[0])
 def test_themes_count_reviews_once_and_reference_existing_evidence(self):
  rows,_,_=m.parse_reviews(review('Practice practice past papers.'))
  analysis=m.analyze(rows);topic=next(t for t in analysis['themes'] if t['id']=='practice')
  self.assertEqual(topic['mentions'],1);self.assertEqual(topic['evidence'][0]['reviewId'],rows[0]['id'])
 def test_course_mapping_and_aggregate_ratings_remain_separate(self):
  payload={'courses':[{'courseCode':'TEST1000','status':'captured','sourceUrl':'https://ust.space/review/TEST1000','capturedAt':'2026-11-03T14:30:00Z','text':review()+'99 Reviews\nCONTENT\nB+\nTEACHING\nA-\nGRADING\nB\nWORKLOAD\nC+\nWrite Review'}]}
  value,_=m.prepare(payload,{'courses':[{'id':'TEST1000'}]})
  self.assertEqual(value['TEST1000']['ratingCount'],99);self.assertEqual(value['TEST1000']['reviewCount'],1)
  self.assertEqual(value['TEST1000']['ratings']['content'],'B+')
  payload['courses'][0]['sourceUrl']='https://ust.space/review/OTHER1000'
  with self.assertRaises(ValueError):m.prepare(payload,{'courses':[{'id':'TEST1000'}]})
 def test_generated_courses_have_consistent_counts_and_no_author_footers(self):
  index=json.loads((root/'src/reviews/catalog.json').read_text());total=0
  for code,entry in index['courses'].items():
   path=root/'public/reviews'/f'{code}.json';text=path.read_text();data=json.loads(text)
   self.assertEqual(data['courseCode'],code);self.assertEqual(len(data['reviews']),entry['reviewCount'])
   self.assertEqual(len({r['id'] for r in data['reviews']}),len(data['reviews']))
   self.assertNotRegex(text,r'By [^\n]+ on [A-Z][a-z]{2} \d{1,2}, \d{4}')
   ids={r['id'] for r in data['reviews']}
   for topic in data['analysis']['themes']:
    self.assertLessEqual(topic['mentions'],len(ids))
    for item in topic['evidence']:self.assertIn(item['reviewId'],ids)
   total+=len(data['reviews'])
  self.assertEqual(total,index['stats']['reviews'])

if __name__=='__main__':unittest.main()
