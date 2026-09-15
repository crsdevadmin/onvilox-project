/* voice-intake.js — voice for the new-patient intake.
 *
 * This deliberately does NOT implement an interview. The form already has one:
 * INTAKE_QUESTIONS is the canonical list of fields a nutrition plan cannot be
 * built without, askIntakeQuestion/handleIntakeAnswer run it, and
 * setIntakeValue records provenance and moves the "essential fields captured"
 * counter.
 *
 * An earlier version of this file carried its OWN question list and its own
 * idea of which fields were required — taken from the form's HTML `required`
 * attributes, which is a different and much smaller set. The result was that
 * creatinine, CRP, blood sugar, albumin, haemoglobin, intake % and the regimen
 * were never chased by voice even though the form marks them essential, and
 * voice-filled values bypassed setIntakeValue so they never counted towards
 * completeness. Two lists, one of them wrong.
 *
 * So: voice is an input channel for the existing flow, nothing more. Whatever
 * text mode asks, voice asks; whatever text mode accepts, voice accepts.
 */
(function (global) {
  'use strict';

  var UNITS = { zero:0, oh:0, o:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7,
    eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15,
    sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
  var TENS = { twenty:20, thirty:30, forty:40, fourty:40, fifty:50, sixty:60,
    seventy:70, eighty:80, ninety:90 };

  // "fifty five point seven" -> 55.7. Needed because a typed answer arrives as
  // digits and the form's parser expects that; speech does not.
  function parseSpokenNumber(text) {
    if (text == null) return null;
    var t = String(text).toLowerCase().replace(/[,%]/g, ' ').trim();
    var digits = t.match(/-?\d+(?:\.\d+)?/);
    if (digits && /^\s*-?\d/.test(t.replace(/^(about|around|roughly|approximately)\s+/, ''))) {
      return parseFloat(digits[0]);
    }
    var parts = t.split(/(?:^|\s+)point\s+|(?:^|\s+)decimal\s+/);
    var whole = parts[0].trim() ? _words(parts[0]) : 0;
    if (whole === null) return digits ? parseFloat(digits[0]) : null;
    if (parts.length > 1) {
      var frac = String(parts[1]).split(/\s+/).map(function (w) {
        if (/^\d$/.test(w)) return w;
        return (UNITS[w] !== undefined && UNITS[w] < 10) ? String(UNITS[w]) : null;
      });
      if (frac.length && frac.every(function (d) { return d !== null; })) {
        return parseFloat(whole + '.' + frac.join(''));
      }
    }
    return whole;
  }

  function _words(str) {
    var ws = String(str).toLowerCase().split(/[\s-]+/).filter(Boolean);
    var toks = [];
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i].replace(/[^a-z0-9]/g, '');
      if (!w) continue;
      if (/^\d+$/.test(w)) { toks.push({ t: 'num', v: parseInt(w, 10) }); continue; }
      if (UNITS[w] !== undefined) toks.push({ t: 'unit', v: UNITS[w] });
      else if (TENS[w] !== undefined) toks.push({ t: 'ten', v: TENS[w] });
      else if (w === 'hundred') toks.push({ t: 'hundred' });
      else if (w === 'thousand') toks.push({ t: 'thousand' });
      else if (w === 'and') continue;
      else if (toks.length) break;
    }
    if (!toks.length) return null;
    // Spoken three-digit values. Clinicians say "one fifty eight" for a height and
    // "one ten" for a blood sugar; summing the words gives 1+10 = 11 mg/dL, which
    // the form accepts without complaint. These shapes have to be read as digits.
    var lead = toks[0];
    if (lead.t === 'unit' && lead.v >= 1 && lead.v <= 9) {
      // "one fifty eight" -> 158
      if (toks[1] && toks[1].t === 'ten') {
        var n = lead.v * 100 + toks[1].v;
        if (toks[2] && toks[2].t === 'unit' && toks[2].v < 10) n += toks[2].v;
        return n;
      }
      // "one ten" -> 110
      if (toks[1] && toks[1].t === 'unit' && toks[1].v === 10 && !toks[2]) {
        return lead.v * 100 + 10;
      }
      // "one oh five" / "one two zero" -> 105 / 120
      if (toks.length === 3 && toks[1].t === 'unit' && toks[1].v < 10
          && toks[2].t === 'unit' && toks[2].v < 10) {
        return parseInt('' + lead.v + toks[1].v + toks[2].v, 10);
      }
    }
    var total = 0, cur = 0;
    toks.forEach(function (tk) {
      if (tk.t === 'unit' || tk.t === 'ten' || tk.t === 'num') cur += tk.v;
      else if (tk.t === 'hundred') cur = (cur || 1) * 100;
      else if (tk.t === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
    });
    return total + cur;
  }

  // "ten four two six slash twenty six" -> 10426/26
  function parseSpokenId(text) {
    var t = String(text || '').toLowerCase()
      .replace(/\b(forward\s+)?slash\b/g, ' / ').replace(/\bstroke\b/g, ' / ')
      .replace(/\b(dash|hyphen|minus)\b/g, ' - ').replace(/\b(dot|point)\b/g, ' . ');
    var ws = t.split(/\s+/).filter(Boolean), out = [];
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i].replace(/[^a-z0-9\/\-.]/g, '');
      if (!w) continue;
      if (/^[\/\-.]$/.test(w) || /^\d+$/.test(w)) { out.push(w); continue; }
      if (TENS[w] !== undefined) {
        var nxt = ws[i + 1] ? ws[i + 1].replace(/[^a-z]/g, '') : '';
        if (nxt && UNITS[nxt] !== undefined && UNITS[nxt] < 10) { out.push(String(TENS[w] + UNITS[nxt])); i++; }
        else out.push(String(TENS[w]));
        continue;
      }
      if (UNITS[w] !== undefined) { out.push(String(UNITS[w])); continue; }
      if (w === 'hundred' || w === 'thousand' || w === 'and') continue;
      out.push(w.toUpperCase());
    }
    return out.join('');
  }

  var STOP = /\b(stop|cancel|that'?s all|finish|enough|quit|exit)\b/i;
  var NA   = /\b(not available|no value|don'?t know|do not know|not applicable|skip)\b/i;

  var _running = false, _ui = null, _misses = 0, _lastMissField = null;

  function _say(m)    { if (_ui && _ui.say) _ui.say(m); }
  function _status(m) { if (_ui && _ui.status) _ui.status(m); }

  // _intake and INTAKE_QUESTIONS are declared with let/const at the top level of
  // the page's own <script>. Those are global *lexical* bindings: reachable by
  // bare name from another classic script, but NOT properties of window. Reading
  // them as global._intake silently yields undefined, which would leave voice
  // permanently in "free-style" mode and never answering a question.
  function _intakeState() {
    var s = (typeof _intake !== 'undefined') ? _intake : null;
    var qs = (typeof INTAKE_QUESTIONS !== 'undefined') ? INTAKE_QUESTIONS : null;
    var q = null;
    if (s && s.active && qs) {
      q = (typeof _nextUnanswered === 'function') ? _nextUnanswered() : qs[s.idx];
    }
    return { active: !!(s && (s.active || s.optional)), question: q };
  }

  // The last thing the assistant said, which is the question to read aloud.
  // The bubble also carries the question number and the reference range; both
  // belong on screen, neither is worth hearing before every single lab value.
  function _lastAiText() {
    var msgs = document.querySelectorAll('#chatMsgs .msg');
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (!/msg-ai/.test(msgs[i].className)) continue;
      var clone = msgs[i].cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll('.qnum, .qrange'), function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  function _norm(x) {
    return String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Questions backed by a picker need the EXACT option value. Text mode taps a
  // button; speech has to be matched to one. Without this the interview simply
  // re-asks for ever, which is where cancer type, regimen and feeding method
  // used to stall.
  function _matchOption(heard, opts) {
    var t = _norm(heard);
    if (!t) return null;
    var best = null, bestScore = 0;
    opts.forEach(function (o) {
      var label = _norm(o.l), value = _norm(o.v);
      [label, value].forEach(function (cand) {
        if (!cand) return;
        var score = 0;
        if (t === cand) score = 100;
        else if ((' ' + t + ' ').indexOf(' ' + cand + ' ') >= 0) score = 60 + cand.length;
        else if ((' ' + cand + ' ').indexOf(' ' + t + ' ') >= 0) score = 50 + t.length;
        else {
          // token overlap, so "head and neck" reaches "Head & Neck Cancer"
          var a = t.split(' ').filter(Boolean), bs = cand.split(' ').filter(Boolean);
          var hit = a.filter(function (w) { return w.length > 2 && bs.indexOf(w) >= 0; }).length;
          if (hit) score = 10 * hit + (hit === a.length ? 8 : 0);
        }
        if (score > bestScore) { bestScore = score; best = o.v; }
      });
    });
    return bestScore >= 20 ? best : null;
  }

  function _optionsOf(q) {
    try { return (typeof _optionsFor === 'function') ? _optionsFor(q) : null; }
    catch (e) { return null; }
  }

  // Speech gives words; a typed answer gives digits or an exact option. Convert
  // only what the question expects, so free text is never mangled.
  function _shape(heard, q) {
    if (!q) return heard;
    if (NA.test(heard)) return 'not available';
    var opts = _optionsOf(q);
    if (opts && opts.length) {
      var m = _matchOption(heard, opts);
      return m === null ? { unmatched: true, opts: opts } : m;
    }
    if (q.f === 'uhic') { var id = parseSpokenId(heard); return id || heard; }
    if (q.unit) {
      var n = parseSpokenNumber(heard);
      return (n === null) ? heard : String(n);
    }
    return heard;
  }

  var OPENER = 'Tell me about the patient — name, age, diagnosis, weight, height '
             + 'and any labs you have. I will ask for whatever is still missing.';

  async function start(ui) {
    if (_running) return;
    _ui = ui;
    var ok = await GqVoice.available();
    if (!ok) { _say('Voice is not available here — please type the details.'); return; }
    if (typeof sendChatMessage !== 'function') {
      _say('The assistant is not loaded on this page.'); return;
    }
    _running = true;
    _misses = 0; _lastMissField = null;

    var first = true, turns = 0;
    while (_running && turns < 40) {
      turns++;
      var st = _intakeState();

      if (first && !st.active) {
        _say('❓ ' + OPENER);
        await GqVoice.speak(OPENER);
      }
      first = false;
      if (!_running) break;

      var listening = st.active;   // an answer, versus the opening dictation
      var heard = '';
      try {
        heard = await GqVoice.listen({
          quietMs:    listening ? 1500 : 2800,
          maxMs:      listening ? 20000 : 60000,
          noSpeechMs: listening ? 6000 : 12000,
          onStatus: function (s) { _status(s === 'listening' ? 'Listening…' : 'Transcribing…'); },
          onLevel:  function (r, on) { _status('Listening  ' + GqVoice.levelBar(r, on)); }
        });
      } catch (e) { _status(''); _say('⚠️ ' + e.message); break; }
      _status('');
      if (!_running) break;

      if (!heard) {
        _say('…nothing heard.');
        await GqVoice.speak('I did not hear anything. Say it again, or press the button to stop.');
        continue;
      }
      if (STOP.test(heard) && st.active) { _say('🗣 ' + heard); break; }

      var value = _shape(heard, st.question);

      if (value && value.unmatched) {
        var qf = st.question ? st.question.f : '?';
        _misses = (_lastMissField === qf) ? _misses + 1 : 1;
        _lastMissField = qf;
        if (_misses >= 2) {
          var give = 'I could not match that to one of the options. Please tap the one you want on screen.';
          _say('⚠️ ' + give);
          await GqVoice.speak(give);
          break;
        }
        var names = value.opts.slice(0, 6).map(function (o) { return o.l; });
        var ask = 'I did not catch which one. Options are: ' + names.join(', ')
                + (value.opts.length > 6 ? ', and others on screen.' : '.');
        _say('⚠️ ' + ask);
        await GqVoice.speak(ask);
        continue;
      }
      _misses = 0; _lastMissField = null;

      var input = document.getElementById('chatInput');
      if (!input) break;
      input.value = value;
      try { await sendChatMessage(); } catch (e) { _say('⚠️ ' + e.message); break; }

      // Let the answer land and the next question render.
      await new Promise(function (r) { setTimeout(r, 600); });

      var after = _intakeState();
      var spoken = _lastAiText();
      if (spoken) await GqVoice.speak(spoken.slice(0, 300));

      // The interview started and has now finished: nothing left to ask.
      if (!after.active && !first && st.active) break;
    }

    stop();
  }

  function stop() {
    if (!_running) { if (_ui && _ui.done) _ui.done(); return; }
    _running = false;
    GqVoice.cancel();
    _status('');
    _say('Voice input stopped. Please check the form before saving.');
    if (_ui && _ui.done) _ui.done();
  }

  global.VoiceIntake = {
    start: start, startFreeStyle: start, stop: stop,
    isRunning: function () { return _running; },
    parseSpokenNumber: parseSpokenNumber, parseSpokenId: parseSpokenId
  };
})(window);
