import test from 'node:test';
import assert from 'node:assert/strict';
import webSearchDecision from './Chatbot_for_College-main/web_search_decision.cjs';

const { shouldSearchWeb, normalizeQueryText } = webSearchDecision;

function assertSearch(text, label) {
  assert.equal(shouldSearchWeb(text), true, `should auto-search: "${text}" ${label || ''}`);
}

function assertNoSearch(text, label) {
  assert.equal(shouldSearchWeb(text), false, `should NOT auto-search: "${text}" ${label || ''}`);
}

test('normalizeQueryText is case-insensitive and punctuation-safe', () => {
  assert.equal(normalizeQueryText('B.Tech'), 'b tech');
  assert.equal(normalizeQueryText('cut-off'), 'cut off');
  assert.equal(normalizeQueryText('  WHAT? Courses!!  '), 'what courses');
  assert.equal(normalizeQueryText(''), '');
  assert.equal(normalizeQueryText(null), '');
});

test('current placement statistics trigger search', () => {
  assertSearch('What are the current placement statistics?', 'placement stats');
  assertSearch('Tell me about the latest placement report', 'latest placements');
  assertSearch('What was the highest package this year?', 'highest package');
  assertSearch('who are the top recruiters?', 'recruiters');
  assertSearch('How many offers did MRDU get?', 'offers');
});

test('current course / programme questions trigger search', () => {
  assertSearch('What are the current courses offered?', 'current courses');
  assertSearch('What B.Tech programmes are available?', 'B.Tech programmes');
  assertSearch('List all programmes offered right now', 'programmes now');
  assertSearch('What are the latest specializations?', 'latest specializations');
});

test('current admission / fee questions trigger search', () => {
  assertSearch('What is the current admission process?', 'current admission');
  assertSearch('What are the eligibility criteria?', 'eligibility');
  assertSearch('Tell me the current fee structure', 'current fee structure');
  assertSearch('What is the current cutoff?', 'cutoff');
});

test('stable factual / conversational questions do NOT trigger search', () => {
  assertNoSearch('Hello', 'hello');
  assertNoSearch('How are you?', 'how are you');
  assertNoSearch('What is the university address?', 'address');
  assertNoSearch('Thank you', 'thanks');
  assertNoSearch('What can you do?', 'what can you do');
  assertNoSearch('', 'empty');
  assertNoSearch('   ', 'whitespace');
});

test('pure greetings with no topic never search, even with topic-adjacent words', () => {
  assertNoSearch('Hi', 'hi');
  assertNoSearch('Good morning', 'good morning');
});

test('greeting that immediately asks a factual current question still searches', () => {
  assertSearch('Hi, what is the highest package?', 'hi + package');
  assertSearch('Hello, what courses are offered now?', 'hello + current courses');
});

test('word-boundary safety: unrelated words do not accidentally match topics', () => {
  assertNoSearch('Where can I get coffee?', 'coffee != related');
  assertNoSearch('Tell me about the museum process', 'museum != admission');
  assertNoSearch('Geese live in groups', 'geese != package');
});