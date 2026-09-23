import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import wake from './Chatbot_for_College-main/wake_word.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  WAKE_WORD,
  normalizeWakeText,
  levenshtein,
  isHeyToken,
  isMrduVariant,
  matchWakeTranscript,
  evaluateWakeMatchResult,
  isMeaningfulTranscript,
  normalizeVoiceQuestion,
  shouldContinueVoiceSession
} = wake;

function assertActivated(text, expectedQuestion, label) {
  const m = matchWakeTranscript(text);
  assert.ok(m, `${label} should activate: "${text}"`);
  if (expectedQuestion !== undefined) {
    assert.equal(m.question, expectedQuestion, `${label} question: "${text}"`);
  }
}

function assertIgnored(text, label) {
  const m = matchWakeTranscript(text);
  assert.equal(m, null, `${label} should be ignored: "${text}"`);
}

test('wake word constant', () => {
  assert.equal(WAKE_WORD, 'hey mrdu');
});

test('normalizeWakeText', () => {
  assert.equal(normalizeWakeText('Hey, M R D U!'), 'hey m r d u');
  assert.equal(normalizeWakeText('Hey-MRDU'), 'hey mrdu');
  assert.equal(normalizeWakeText('   HEY  ·  M·R·D·U   '), 'hey m r d u');
  assert.equal(normalizeWakeText('Hey M R D you'), 'hey m r d you');
  assert.equal(normalizeWakeText('hey, mrdu'), 'hey mrdu');
  assert.equal(normalizeWakeText(''), '');
});

test('levenshtein sanity', () => {
  assert.equal(levenshtein('mrdu', 'mrdu'), 0);
  assert.equal(levenshtein('mrd', 'mrdu'), 1);
  assert.equal(levenshtein('mrdo', 'mrdu'), 1);
  assert.equal(levenshtein('mr', 'mrdu'), 2);
  assert.equal(levenshtein('hello', 'hey'), 3);
});

test('isHeyToken', () => {
  for (const t of ['hey', 'hay', 'hei', 'ay', 'aye', 'eh', 'he']) {
    assert.equal(isHeyToken(t), true, `should accept "${t}"`);
  }
  for (const t of ['hello', 'hi', 'how', 'there', 'you']) {
    assert.equal(isHeyToken(t), false, `should reject "${t}"`);
  }
});

test('isMrduVariant', () => {
  for (const s of ['mrdu', 'mrd', 'mru', 'mrrdu']) {
    assert.equal(isMrduVariant(s), true, `should accept "${s}"`);
  }
  for (const s of ['mr', 'mrde', 'rdu', 'du', 'hello', 'xxxxx']) {
    assert.equal(isMrduVariant(s), false, `should reject "${s}"`);
  }
});

test('all reasonable wake phrases activate', () => {
  assertActivated('Hey MRDU', '', 'plain');
  assertActivated('Hey M R D U', '', 'spelled letters');
  assertActivated('Hey M R D you', '', 'u as you');
  assertActivated('Hey M R Do', '', 'do variant');
  assertActivated('Hey M R D', '', 'dropped u');
  assertActivated('Hey Mardu', '', 'mardu');
  assertActivated('Hey Mar Du', '', 'mar du');
  assertActivated('Hey Merdu', '', 'merdu');
  assertActivated('Hey Murdu', '', 'murdu');
  assertActivated('Hey MR D U', '', 'mr d u');
  assertActivated('Hey, M R D U!', '', 'punctuation');
  assertActivated('Hey-MRDU', '', 'hyphen');
  assertActivated('Hey M R Du', '', 'm r du');
  assertActivated('hey mr du', '', 'mr du');
});

test('false positives do not activate', () => {
  assertIgnored('Hello everyone', 'hello');
  assertIgnored('What is MRDU?', 'mrdu in a question');
  assertIgnored('Tell me about admissions', 'admissions');
  assertIgnored('How are you?', 'how are you');
  assertIgnored('M R D U University', 'no hey');
  assertIgnored('hello, my name is...', 'hello my name');
  assertIgnored('hey anyone there', 'unmapped token');
  assertIgnored('hey you are the best', 'too short canonical');
  assertIgnored('hey are you mrdu', 'stray r before mrdu');
  assertIgnored('hey what do you mean', 'unmapped what');
  assertIgnored('hey everyone university', 'unrelated institution word');
  assertIgnored('malla reddy college na', 'spelled-out institution, no hey');
});

test('same-sentence commands activate and extract the question', () => {
  assertActivated('Hey MRDU what are the admission requirements?', 'what are the admission requirements', 'admission q');
  assertActivated('Hey M R D U tell me about CSE.', 'tell me about cse', 'cse q');
  assertActivated('Hey Mardu where is the university located?', 'where is the university located', 'location q');
  assertActivated('hey m r d u what courses are available', 'what courses are available', 'courses q');
  assertActivated('Hey M R Do what\'s the fee?', 'what s the fee', 'fee q');
});

test('wake word alone yields an empty question (fresh question session)', () => {
  assertActivated('hey mrdu', '', 'solo');
  assertActivated('hey m r d', '', 'solo spelled-truncated');
});

test('trailing "university" after the wake word belongs to the entity, not the question', () => {
  assertActivated('hey mrdu university what courses are available', 'what courses are available', 'mrdu university q');
  assertActivated('hey m r d u university tell me about cse', 'tell me about cse', 'spelled + university q');
  assertActivated('Hey MRDU University', '', 'wake + university only');
  assertActivated('Hey Mardu university where is it', 'where is it', 'mardu university q');
});

test('ASR misrecognitions of MRDU activate the wake word', () => {
  assertActivated('Hey maladi what courses are available?', 'what courses are available', 'maladi');
  assertActivated('Hey malladi what courses are available?', 'what courses are available', 'malladi');
  assertActivated('Hey maldi what courses are available?', 'what courses are available', 'maldi');
  assertActivated('Hey mardi what courses are available?', 'what courses are available', 'mardi');
  assertActivated('hey maladi university what courses are available', 'what courses are available', 'maladi university');
});

test('interim wake transcripts are detected but NEVER submitted', () => {
  // Interim (non-final) wake+question results must not be acted on.
  const interim = evaluateWakeMatchResult({
    isFinal: false,
    transcripts: ['hey mrdu what courses are available']
  });
  assert.ok(interim.matched, 'interim wake word should be detected');
  assert.equal(interim.final, false, 'interim must not be final');
  assert.equal(interim.question, '', 'interim must not carry a question to submit');
});

test('final wake+question extraction strips the complete wake phrase', () => {
  const finals = [
    ['hey mrdu what courses are available', 'what courses are available'],
    ['hey maladi what courses are available', 'what courses are available'],
    ['hey m r d u tell me about cse', 'tell me about cse'],
    ['hey mrdu university what courses are available', 'what courses are available']
  ];
  for (const [transcript, expected] of finals) {
    const verdict = evaluateWakeMatchResult({ isFinal: true, transcripts: [transcript] });
    assert.ok(verdict.matched && verdict.final, `final should match: "${transcript}"`);
    assert.equal(verdict.question, expected, `final question extraction: "${transcript}"`);
    assert.ok(!/hey\b/i.test(verdict.question), `no "hey" in question: "${transcript}"`);
  }
});

test('maladi normalization', () => {
  assert.equal(
    normalizeVoiceQuestion('what courses are available at maladi'),
    'what courses are available at Malla Reddy Deemed University'
  );
  assert.equal(
    normalizeVoiceQuestion('what is the fee at malladi'),
    'what is the fee at Malla Reddy Deemed University'
  );
});

test('maladi university normalization', () => {
  assert.equal(
    normalizeVoiceQuestion('what courses are available at maladi university'),
    'what courses are available at Malla Reddy Deemed University'
  );
  assert.equal(
    normalizeVoiceQuestion('hey maladi university what courses are available'),
    'what courses are available'
  );
});

test('spelled-out institution references are not rewritten', () => {
  assert.equal(
    normalizeVoiceQuestion('is malla reddy college good for placements'),
    'is malla reddy college good for placements'
  );
  assert.equal(
    normalizeVoiceQuestion('where is malla reddy university located'),
    'where is malla reddy university located'
  );
});

test('unnormalized speech/garbage transcripts are rejected as meaningless', () => {
  for (const t of ['', '   ', '!!!', '???', 'aaaa', 'uuuuu', 'blah blah blah', 'hmm', 'uh']) {
    assert.equal(isMeaningfulTranscript(t), false, `should reject: "${t}"`);
  }
  for (const t of ['yes', 'no', 'CSE', 'ECE', 'B.Tech', 'M.Tech', 'what courses are available', 'tell me about cse']) {
    assert.equal(isMeaningfulTranscript(t), true, `should accept: "${t}"`);
  }
});

test('no corrective/interpretive response behavior in the system instruction', () => {
  const html = fs.readFileSync(
    path.join(__dirname, 'Chatbot_for_College-main', 'coll.html'),
    'utf8'
  );
  const instr = html.match(/const SYSTEM_INSTRUCTION = `([\s\S]*?)`;/)[1];
  // Guidance must exist and forbid corrective/interpretive phrasing.
  assert.match(instr, /silently normalize/i);
  assert.match(instr, /never tell the user/i);
  assert.match(instr, /It seems like/);
  assert.match(instr, /You might be referring to/);
  assert.match(instr, /Did you mean/);
  assert.match(instr, /There is no known/);
  assert.match(instr, /genuinely ambiguous/i);
  // The three campus-name variants must map to the same entity.
  assert.match(instr, /Malla Reddy University/);
  assert.match(instr, /Malla Reddy College/);
  assert.match(instr, /Malla Reddy Deemed University Hyderabad/);
});

test('voice assistant stays active across 3+ consecutive turns without OFF/ON', () => {
  // Simulate a long-lived session: each completed answer must leave the
  // assistant listening again; only an explicit OFF stops the loop.
  for (let turn = 0; turn < 6; turn++) {
    assert.equal(
      shouldContinueVoiceSession({ wakeWordActive: true }),
      true,
      `turn ${turn} should keep listening`
    );
  }
  assert.equal(shouldContinueVoiceSession({ wakeWordActive: false }), false, 'explicit OFF must stop');
  assert.equal(shouldContinueVoiceSession({}), false, 'missing state must stop');
});