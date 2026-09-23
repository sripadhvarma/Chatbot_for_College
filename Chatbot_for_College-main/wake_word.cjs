/*
 * "Hey MRDU" wake-word matching helpers.
 *
 * Shared between the browser (coll.html) and Node unit tests.
 *
 * Deliberately NOT an unlimited fuzzy matcher - matching is a controlled
 * combination of: text normalization, an explicit alias table, bounded
 * Levenshtein similarity and strict word-position checks.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MRDUWake = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WAKE_WORD = 'hey mrdu';
  var MRDU_TARGET = 'mrdu';
  var CANONICAL_NAME = 'Malla Reddy Deemed University';

  // Allowed "hey"-like tokens (pronunciations / speech-recognition variants).
  var HEY_ALIASES = ['hey', 'hay', 'hei', 'ay', 'aye', 'eh', 'he'];

  // MRDU => canonical letter tokens. Any unmapped token terminates / voids a match.
  // Broad map used for WAKE-WORD DETECTION ONLY (context-gated by the leading "hey").
  var MRDU_ALIAS_MAP = {
    // whole word
    mrdu: 'mrdu', mardu: 'mrdu', merdu: 'mrdu', murdu: 'mrdu',
    merdoo: 'mrdu', mradu: 'mrdu',
    // common ASR misrecognitions of "MRDU" (broad, wake detection only)
    maladi: 'mrdu', malladi: 'mrdu', maldi: 'mrdu', mardi: 'mrdu',
    // slurred first syllable(s)
    mr: 'mr', maar: 'mr', mar: 'mr', mer: 'mr', mur: 'mr',
    // single letters and letter names
    m: 'm', em: 'm',
    r: 'r', ar: 'r', are: 'r',
    d: 'd', dee: 'd', de: 'd', di: 'd',
    u: 'u', you: 'u', ew: 'u', yew: 'u', eu: 'u',
    du: 'du', do: 'du', dhu: 'du', doo: 'du',
    rdu: 'rdu'
  };

  // Whole-word forms that are UNAMBIGUOUS phonetic references to MRDU and are
  // safe to silently rewrite to the canonical name inside a question. "maldi"
  // / "mardi" are intentionally excluded here (e.g. "Mardi Gras") so unrelated
  // references are never rewritten. Spelled-out "Malla Reddy College" etc. are
  // also never rewritten - only garbled ASR variants - in normalizeVoiceQuestion.
  var NORMALIZE_WHOLE_MRDU = {
    mrdu: true, mardu: true, murdu: true, merdu: true, merdoo: true,
    mradu: true, maladi: true, malladi: true
  };

  // Tokens allowed to reassemble the letter form of MRDU inside a question.
  var NORMALIZE_LETTER_MAP = {
    m: 'm', em: 'm',
    r: 'r', ar: 'r', are: 'r',
    d: 'd', dee: 'd', de: 'd', di: 'd',
    u: 'u', you: 'u', ew: 'u', yew: 'u', eu: 'u',
    du: 'du', do: 'du', dhu: 'du', doo: 'du',
    rdu: 'rdu',
    mr: 'mr', maar: 'mr', mar: 'mr', mer: 'mr', mur: 'mr'
  };

  // Institution words that naturally follow the entity mention and belong to it.
  var TRAILING_ENTITY_WORDS = { university: true, college: true };

  // Pure ASR filler tokens removed during voice-question normalization.
  var FILLER_TOKENS = { um: true, uh: true, er: true, hmm: true, mm: true, eh: true, ah: true, like: true };

  /**
   * Lowercase, strip punctuation/separators, normalize whitespace and
   * letter-by-letter forms. Examples:
   *   "Hey, M R D U!"  -> "hey m r d u"
   *   "Hey-MRDU"       -> "hey mrdu"
   */
  function normalizeWakeText(text) {
    return (typeof text === 'string' ? text : '')
      .toLowerCase()
      .replace(
        /[.,;:!?()"'`\[\]{}<>@#$%^&*_+=\\|~/\u2013\u2014\u2018\u2019\u201C\u201D\u00b7\u2022-]+/g,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function levenshtein(a, b) {
    var m = a.length;
    var n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    var prev = [];
    var curr = [];
    var j, i;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      curr[0] = i;
      for (j = 1; j <= n; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      var tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[n];
  }

  function isHeyToken(token) {
    if (!token) return false;
    if (HEY_ALIASES.indexOf(token) !== -1) return true;
    if (token.length < 2 || token.length > 4) return false;
    return levenshtein(token, 'hey') <= 1;
  }

  /**
   * True when `seq` is a controlled phonetic variant of "mrdu":
   * starts with "m", ends with "u" or "d", length 3-5, edit distance <= 1.
   */
  function isMrduVariant(seq) {
    if (typeof seq !== 'string') return false;
    if (seq.length < 3 || seq.length > 5) return false;
    if (seq.charAt(0) !== 'm') return false;
    var last = seq.charAt(seq.length - 1);
    if (last !== 'u' && last !== 'd') return false;
    return levenshtein(seq, MRDU_TARGET) <= 1;
  }

  /**
   * Consumes tokens from `start` that map to MRDU letters (max 4 tokens),
   * then any trailing institution word ("university", "college") as part of
   * the entity mention. Returns the total number of tokens consumed when the
   * canonical form is a valid MRDU variant, otherwise 0.
   */
  function parseMrduSpan(tokens, start) {
    var letters = '';
    var count = 0;
    var i = start;
    while (i < tokens.length && count < 4) {
      var mapped = MRDU_ALIAS_MAP[tokens[i]];
      if (mapped === undefined) break;
      letters += mapped;
      count++;
      i++;
    }
    if (count === 0) return 0;
    if (!isMrduVariant(letters)) return 0;
    // "Hey MRDU university what courses..." -> "university" belongs to the entity.
    while (i < tokens.length && TRAILING_ENTITY_WORDS[tokens[i]] && count < 5) {
      count++;
      i++;
    }
    return count;
  }

  /**
   * Returns { question } when the transcript starts with a clear
   * "hey" + close MRDU combination near the beginning, otherwise null.
   * `question` is whatever follows the wake phrase ("" when nothing follows).
   */
  function matchWakeTranscript(text) {
    var norm = normalizeWakeText(text);
    if (!norm) return null;

    var tokens = norm.split(' ');

    // "hey" must appear within the first two tokens.
    var limit = Math.min(tokens.length, 2);
    for (var i = 0; i < limit; i++) {
      if (!isHeyToken(tokens[i])) continue;
      var span = parseMrduSpan(tokens, i + 1);
      if (span === 0) continue;
      var question = tokens.slice(i + 1 + span).join(' ').trim();
      return { question: question };
    }
    return null;
  }

  /**
   * Evaluates one SpeechRecognition result for wake-word activation.
   *
   * `result` is { isFinal: boolean, transcripts: string[] } where transcripts
   * are the (up to N) alternative transcripts of that result object.
   *
   * Returns:
   *   { matched:false }                          no wake phrase
   *   { matched:true, final:false, interim:true }wake phrase seen but result is
   *                                              only interim - NEVER submit yet
   *   { matched:true, final:true, question }     final result; safe to act on
   *
   * The same-sentence question is only ever returned for a FINAL result, so an
   * interim wake+question transcript is never submitted.
   */
  function evaluateWakeMatchResult(result) {
    if (!result) return { matched: false };
    var transcripts = Array.isArray(result.transcripts) ? result.transcripts : [];
    var sawInterim = false;
    for (var i = 0; i < transcripts.length; i++) {
      var m = matchWakeTranscript(transcripts[i]);
      if (!m) continue;
      if (result.isFinal === true) {
        return { matched: true, final: true, question: m.question };
      }
      sawInterim = true;
    }
    return sawInterim
      ? { matched: true, final: false, interim: true, question: '' }
      : { matched: false };
  }

  /**
   * True when the transcript is real speech and not obvious background noise.
   * Rejects empty / punctuation-only / repeated-char / repeated-token / filler
   * garbage while allowing short but valid answers (yes, no, CSE, ECE, B.Tech...).
   */
  function isMeaningfulTranscript(text) {
    if (!text) return false;
    var t = normalizeWakeText(text);
    if (!t) return false;
    if (!/[a-z0-9]/.test(t)) return false; // punctuation/symbols only
    if (/^(.)\1{3,}$/.test(t)) return false; // aaaa / uuuuu
    var tokens = t.split(' ');
    if (tokens.length >= 3) {
      var allSame = true;
      for (var i = 1; i < tokens.length; i++) {
        if (tokens[i] !== tokens[0]) { allSame = false; break; }
      }
      if (allSame && tokens[0].length <= 6) return false; // "blah blah blah"
    }
    if (tokens.length <= 3 && FILLER_TOKENS[t]) return false; // "uh", "hmm"
    return true;
  }

  /**
   * Silently normalizes a voice-derived question:
   *   1. strips a leading wake phrase if one was accidentally captured;
   *   2. removes pure ASR filler tokens;
   *   3. rewrites unambiguous MRDU transcription variants (mardu, maladi,
   *      m r d u, ...) to "Malla Reddy Deemed University".
   * Never rewrites unrelated references such as spelled-out "Malla Reddy
   * College" or ambiguous forms like "mardi". Non-voice (typed) messages are
   * not routed through this function.
   */
  function normalizeVoiceQuestion(question) {
    var text = typeof question === 'string' ? question : '';
    if (!text.trim()) return '';
    // (1) defensive wake-phrase strip
    var m = matchWakeTranscript(text);
    var body = (m && m.question) ? m.question : text;
    var tokens = body.trim().split(/\s+/);
    var out = [];
    var i = 0;
    while (i < tokens.length) {
      var token = tokens[i];
      var lower = token.toLowerCase();
      if (FILLER_TOKENS[lower]) { i++; continue; }
      // (3a) whole-word unambiguous variant
      if (NORMALIZE_WHOLE_MRDU[lower]) {
        out.push(CANONICAL_NAME);
        i++;
        // absorb a trailing "university"/"college" into the rewritten entity
        var nt = i < tokens.length ? tokens[i].toLowerCase() : null;
        if (nt && TRAILING_ENTITY_WORDS[nt]) i++;
        continue;
      }
      // (3b) spelled-out letter form ("m r d u")
      var letters = '';
      var count = 0;
      var j = i;
      while (j < tokens.length && count < 4) {
        var mapped = NORMALIZE_LETTER_MAP[tokens[j].toLowerCase()];
        if (mapped === undefined) break;
        letters += mapped;
        count++;
        j++;
      }
      if (count > 0 && isMrduVariant(letters)) {
        out.push(CANONICAL_NAME);
        i = j;
        nt = i < tokens.length ? tokens[i].toLowerCase() : null;
        if (nt && TRAILING_ENTITY_WORDS[nt]) i++;
        continue;
      }
      out.push(token);
      i++;
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Guards the "Voice Assistant stays active indefinitely until OFF" invariant.
   * The client must keep listening after every completed turn unless the user
   * explicitly turned the assistant off. Kept pure so the loop can be tested.
   */
  function shouldContinueVoiceSession(state) {
    return !!(state && state.wakeWordActive === true);
  }

  return {
    WAKE_WORD: WAKE_WORD,
    CANONICAL_NAME: CANONICAL_NAME,
    normalizeWakeText: normalizeWakeText,
    levenshtein: levenshtein,
    isHeyToken: isHeyToken,
    isMrduVariant: isMrduVariant,
    matchWakeTranscript: matchWakeTranscript,
    evaluateWakeMatchResult: evaluateWakeMatchResult,
    isMeaningfulTranscript: isMeaningfulTranscript,
    normalizeVoiceQuestion: normalizeVoiceQuestion,
    shouldContinueVoiceSession: shouldContinueVoiceSession
  };
});