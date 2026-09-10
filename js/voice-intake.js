/* voice-intake.js — spoken patient intake for the new-patient form.
 *
 * The assistant asks one question, waits for the answer, fills that field, and
 * moves on. Nothing is saved: every value lands in the form highlighted, for the
 * doctor to read back and correct before pressing save.
 *
 * Values are parsed here, in code — not by a language model. A misheard albumin
 * that a model "tidies up" into a plausible number is exactly the failure this
 * platform cannot afford, so a spoken answer either parses or is re-asked.
 */
(function (global) {
  'use strict';

  var UNITS = { zero:0, oh:0, o:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7,
    eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15,
    sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
  var TENS = { twenty:20, thirty:30, forty:40, fourty:40, fifty:50, sixty:60,
    seventy:70, eighty:80, ninety:90 };

  // "fifty five point seven" -> 55.7 ; "one twenty" -> 120 ; "3.5" -> 3.5
  function parseSpokenNumber(text) {
    if (text == null) return null;
    var t = String(text).toLowerCase().replace(/[,%]/g, ' ').trim();

    var digits = t.match(/-?\d+(?:\.\d+)?/);
    if (digits && /^\s*-?\d/.test(t.replace(/^(about|around|roughly|approximately)\s+/, ''))) {
      return parseFloat(digits[0]);
    }

    var parts = t.split(/(?:^|\s+)point\s+|(?:^|\s+)decimal\s+/);
    var whole = parts[0].trim() ? _words(parts[0]) : 0;
    if (whole === null) { return digits ? parseFloat(digits[0]) : null; }
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
      else if (toks.length) break;      // trailing words such as "kilos"
    }
    if (!toks.length) return null;

    // Clinicians say heights and weights colloquially: "one fifty eight" is 158,
    // not 150 and not 1 then 58. unit(1-9) + tens [+ unit] is that shape.
    if (toks[0].t === 'unit' && toks[0].v >= 1 && toks[0].v <= 9 &&
        toks[1] && toks[1].t === 'ten') {
      var n = toks[0].v * 100 + toks[1].v;
      if (toks[2] && toks[2].t === 'unit' && toks[2].v < 10) n += toks[2].v;
      return n;
    }

    var total = 0, cur = 0;
    toks.forEach(function (tk) {
      if (tk.t === 'unit' || tk.t === 'ten' || tk.t === 'num') cur += tk.v;
      else if (tk.t === 'hundred') cur = (cur || 1) * 100;
      else if (tk.t === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
    });
    return total + cur;
  }

  // Record numbers are dictated digit by digit with spoken separators:
  // "ten four two six slash twenty six" is 10426/26, not a sentence.
  function parseSpokenId(text) {
    var t = String(text || '').toLowerCase()
      .replace(/\b(forward\s+)?slash\b/g, ' / ')
      .replace(/\bstroke\b/g, ' / ')
      .replace(/\b(dash|hyphen|minus)\b/g, ' - ')
      .replace(/\b(dot|point)\b/g, ' . ');
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
      out.push(w.toUpperCase());          // some record numbers carry letters
    }
    return out.join('');
  }

  function matchOption(text, options) {
    var t = String(text || '').toLowerCase();
    var best = null, bestLen = 0;
    options.forEach(function (o) {
      (o.match || [o.value]).forEach(function (k) {
        var kk = String(k).toLowerCase();
        if (t.indexOf(kk) >= 0 && kk.length > bestLen) { best = o.value; bestLen = kk.length; }
      });
    });
    return best;
  }

  // ── the interview ─────────────────────────────────────────────────────────
  var SCRIPT = [
    { id: 'patientName', ask: "What is the patient's name?", type: 'text' },
    { id: 'uhic',        ask: 'What is the U-H-I-C number?', type: 'id', optional: true },
    { id: 'age',         ask: 'Age?',        type: 'number', min: 0,  max: 120 },
    { id: 'sex',         ask: 'Male or female?', type: 'option',
      options: [{ value: 'Male', match: ['male', 'man', 'gentleman'] },
                { value: 'Female', match: ['female', 'woman', 'lady'] }] },
    { id: 'weight',      ask: 'Current weight in kilograms?', type: 'number', min: 20, max: 250 },
    { id: 'height',      ask: 'Height in centimetres?',       type: 'number', min: 50, max: 250 },
    { id: 'cancerInput', ask: 'What is the diagnosis?', type: 'text' },
    { id: 'regimenInput',ask: 'Which treatment regimen?', type: 'text', optional: true },
    { id: 'cancerStage', ask: 'What stage?', type: 'option', optional: true,
      options: [{ value: 'Stage I', match: ['stage one', 'stage 1', 'stage i '] },
                { value: 'Stage II', match: ['stage two', 'stage 2'] },
                { value: 'Stage III', match: ['stage three', 'stage 3'] },
                { value: 'Stage IV', match: ['stage four', 'stage 4'] },
                { value: 'Recurrent', match: ['recurrent', 'recurrence'] }] },
    { id: 'feedingMethod', ask: 'How is the patient feeding?', type: 'option',
      options: [
        { value: 'Oral Feeding (Normal Diet)', match: ['oral', 'normal diet', 'by mouth'] },
        { value: 'Enteral Feeding - Nasogastric Tube (NG)', match: ['nasogastric', 'n g tube', 'ng tube'] },
        { value: 'Enteral Feeding - PEG Tube', match: ['peg'] },
        { value: 'Enteral Feeding - Jejunostomy (J-Tube)', match: ['jejunostomy', 'j tube'] },
        { value: 'Parenteral Nutrition (TPN)', match: ['parenteral', 't p n', 'tpn'] },
        { value: 'Combination Feeding (Oral + Enteral)', match: ['oral and enteral', 'combination oral'] },
        { value: 'Combination Feeding (Enteral + Parenteral)', match: ['enteral and parenteral'] }] },
    { id: 'ecogStatus',  ask: 'E-COG performance status, zero to four?', type: 'number', min: 0, max: 4 },
    { id: 'reducedFoodIntake', ask: 'Roughly what percentage of normal intake is the patient eating?',
      type: 'number', min: 0, max: 100, optional: true },
    { id: 'albumin',     ask: 'Albumin?',    type: 'number', min: 1, max: 6,   optional: true },
    { id: 'crp',         ask: 'C-R-P?',      type: 'number', min: 0, max: 400, optional: true },
    { id: 'creatinine',  ask: 'Creatinine?', type: 'number', min: 0.1, max: 15, optional: true },
    { id: 'urea',        ask: 'Urea?',       type: 'number', min: 2, max: 300, optional: true },
    { id: 'hemoglobin',  ask: 'Haemoglobin?',type: 'number', min: 2, max: 25,  optional: true }
  ];

  var SKIP = /\b(skip|next|pass|don'?t know|do not know|not available|no idea|leave it)\b/i;
  var STOP = /\b(stop|cancel|that'?s all|finish|enough|quit|exit)\b/i;
  var REPEAT = /\b(repeat|say again|pardon|come again|again please)\b/i;
  var BACK = /\b(go back|previous|back one)\b/i;

  var _running = false, _i = 0, _filled = 0, _ui = null;

  function _set(id, value) {
    var el = document.getElementById(id);
    if (!el) return false;
    el.value = value;
    el.classList.add('ai-filled');
    setTimeout(function () { el.classList.remove('ai-filled'); }, 2500);
    // Let the form's own validation, scoring and derived fields run.
    ['input', 'change'].forEach(function (ev) {
      try { el.dispatchEvent(new Event(ev, { bubbles: true })); } catch (e) {}
    });
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    return true;
  }

  function _say(msg) { if (_ui && _ui.say) _ui.say(msg); }
  function _status(msg) { if (_ui && _ui.status) _ui.status(msg); }

  async function start(ui) {
    if (_running) return;
    var ok = await GqVoice.available();
    if (!ok) { _ui = ui; _say('Voice is not available here — please type the details.'); return; }
    _running = true; _i = 0; _filled = 0; _ui = ui;
    _say('Starting voice intake. Say “skip” to leave a field blank, or “stop” to finish.');
    await GqVoice.speak('Starting voice intake. Say skip to leave a field blank, or stop to finish.');
    await _step();
  }

  function stop(quiet) {
    _running = false;
    GqVoice.cancel();
    if (!quiet) {
      var m = _filled
        ? ('Voice intake finished — ' + _filled + ' field' + (_filled === 1 ? '' : 's')
           + ' filled. Please check them before saving.')
        : 'Voice intake stopped.';
      _say(m);
      GqVoice.speak(_filled ? ('Filled ' + _filled + ' fields. Please check them before saving.')
                            : 'Stopped.');
    }
    if (_ui && _ui.done) _ui.done();
  }

  async function _step() {
    if (!_running) return;
    if (_i >= SCRIPT.length) return stop();
    var q = SCRIPT[_i];
    _say('❓ ' + q.ask);
    await GqVoice.speak(q.ask);
    if (!_running) return;

    var heard = '';
    try {
      heard = await GqVoice.listen({
        quietMs: 1500,
        maxMs: 20000,
        onStatus: function (s) { _status(s === 'listening' ? 'Listening…' : 'Transcribing…'); },
        onLevel: function (rms, on) { _status('Listening  ' + GqVoice.levelBar(rms, on)); }
      });
    } catch (e) {
      _say('⚠️ ' + e.message);
      return stop(true);
    }
    if (!_running) return;
    _status('');

    if (!heard) {
      _say('…nothing heard. Repeating the question.');
      return _step();
    }
    _say('🗣 ' + heard);

    if (STOP.test(heard)) return stop();
    if (REPEAT.test(heard)) return _step();
    if (BACK.test(heard)) { _i = Math.max(0, _i - 1); return _step(); }
    if (SKIP.test(heard)) { _i++; return _step(); }

    var value = null;
    if (q.type === 'number') {
      value = parseSpokenNumber(heard);
      if (value === null) {
        _say('I could not read a number in that. Please say just the number, or say skip.');
        await GqVoice.speak('I could not read a number. Please say just the number, or say skip.');
        return _step();
      }
      if ((q.min != null && value < q.min) || (q.max != null && value > q.max)) {
        // Out of range is far more likely to be a mishearing than a real value.
        var warn = 'I heard ' + value + ', which is outside the expected range for '
                 + q.id + '. Please say it again, or say skip.';
        _say('⚠️ ' + warn);
        await GqVoice.speak(warn);
        return _step();
      }
    } else if (q.type === 'option') {
      value = matchOption(heard, q.options);
      if (value === null) {
        _say('I did not match that to one of the options. Please say it again, or say skip.');
        await GqVoice.speak('I did not catch which option. Please say it again, or say skip.');
        return _step();
      }
    } else if (q.type === 'id') {
      value = parseSpokenId(heard);
      if (!value) { _i++; return _step(); }
    } else {
      value = heard.replace(/\.$/, '').trim();
      if (!value) { _i++; return _step(); }
    }

    if (_set(q.id, value)) { _filled++; _say('✓ ' + q.id + ': ' + value); }
    else _say('⚠️ Field ' + q.id + ' is not on this form — skipping.');
    _i++;
    return _step();
  }

  global.VoiceIntake = {
    start: start, stop: stop,
    isRunning: function () { return _running; },
    // exported for testing
    parseSpokenNumber: parseSpokenNumber, parseSpokenId: parseSpokenId,
    matchOption: matchOption, SCRIPT: SCRIPT
  };
})(window);
