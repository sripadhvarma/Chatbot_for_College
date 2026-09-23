/*
 * Relevant-question detector for automatic OpenRouter web search.
 *
 * Shared between the local Express backend (server.js) and Node unit tests.
 *
 * Deliberately narrow: web search is only activated for genuinely current,
 * specific, or externally verifiable/factual university questions. Pure
 * conversational requests (greetings, chit-chat, stable facts) return false
 * and are answered normally without a search.
 *
 * Matching is case-insensitive and punctuation-safe: the query is lowered
 * and non-alphanumeric characters are collapsed to single spaces before any
 * word/word-boundary checks ("B.Tech" -> "b tech", "cut-off" -> "cut off").
 */
'use strict';

function normalizeQueryText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Topics whose current, specific data would come from the web.
const CURRENT_TOPIC_WORDS = [
  // courses / programmes
  'programme', 'programmes', 'program', 'programs',
  'course', 'courses',
  'specialization', 'specializations',
  'specialisation', 'specialisations',
  'b tech', 'btech', 'm tech', 'mtech',
  'b sc', 'bsc', 'm sc', 'msc',
  'mba', 'bba', 'ug', 'pg',
  // admissions / eligibility / fees
  'admission', 'admissions', 'eligibility', 'elgibility',
  'fee', 'fees', 'fee structure', 'fee-structure',
  'scholarship', 'scholarships', 'cutoff', 'cut-off', 'cut off',
  'rank', 'ranking', 'intake', 'seat', 'seats',
  // placements / recruiters / packages
  'placement', 'placements', 'recruiter', 'recruiters',
  'package', 'packages', 'salary', 'salaries',
  'lpa', 'ctc', 'offer', 'offers',
  // faculty / contact / regulations / events
  'faculty', 'contact', 'phone', 'email',
  'notice', 'notices', 'event', 'events',
  'regulation', 'regulations', 'timetable', 'academic calendar',
  'hostel', 'hostels'
];

// Words/phrases that mark the request as asking for the latest version.
const CURRENT_TIME_WORDS = [
  'current', 'latest', 'recent', 'recently', 'today',
  'now', 'upcoming', 'ongoing', 'this year', 'this academic year'
];

// Pure conversational greetings must never trigger a search.
const CONVERSATIONAL_PATTERNS = [
  'hello', 'hi', 'hey', 'namaste', 'thanks', 'thank you',
  'how are you', 'how are you doing', 'whats up', "what's up", 'what s up',
  'good morning', 'good afternoon', 'good evening', 'good night',
  'who are you', 'what can you do', 'how can you help',
  'bye', 'goodbye', 'ok', 'okay'
];

function buildWordRegex(words) {
  const escaped = words.map((w) => w.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\s*'));
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}

// Hyphens/punctuation are already collapsed to spaces by normalizeQueryText,
// so words separated by "-" become space-separated alternatives.
const CURRENT_TOPIC_RE = buildWordRegex(CURRENT_TOPIC_WORDS);
const CURRENT_TIME_RE = buildWordRegex(CURRENT_TIME_WORDS);
const CONVERSATIONAL_RE = buildWordRegex(CONVERSATIONAL_PATTERNS);

/**
 * Decide whether a user question should enable OpenRouter web search.
 *
 * @param {string} text - raw question text (case/punctuation-insensitive).
 * @returns {boolean} true when the question asks for current/specific/factual
 *   information that should be looked up, false for stable/conversational asks.
 */
function shouldSearchWeb(text) {
  const t = normalizeQueryText(text);
  if (!t) return false;

  // A strict conversation opener should never silently trigger a search,
  // even if it happens to share a word with a real topic list.
  if (CONVERSATIONAL_RE.test(t)) {
    // ...unless the question is clearly a factual ask that merely starts
    // with a greeting ("Hi, what is the highest package?").
    const topicHit = CURRENT_TOPIC_RE.exec(t);
    const timeHit = CURRENT_TIME_RE.exec(t);
    return Boolean(topicHit || timeHit);
  }

  if (CURRENT_TIME_RE.test(t)) return true;
  return CURRENT_TOPIC_RE.test(t);
}

module.exports = {
  shouldSearchWeb,
  normalizeQueryText
};