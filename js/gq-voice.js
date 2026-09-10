/* gq-voice.js — shared speech core.
 *
 * One recorder, one end-of-speech detector, one transcription call, used by any
 * page that needs voice. Patient-Profile still carries its own copy of this
 * logic; that duplication is what let the recipe-shape bug drift between files,
 * so new callers use this and Patient-Profile should be migrated onto it.
 *
 *   await GqVoice.available()            -> true if the server can transcribe
 *   await GqVoice.listen({ ... })        -> resolves with the transcript
 *   await GqVoice.speak('text')          -> resolves when it has finished speaking
 *   GqVoice.cancel()                     -> stop listening/speaking now
 */
(function (global) {
  'use strict';

  var _engine = null;          // 'server' | 'browser' | 'none'
  var _rec = null, _stream = null, _chunks = [], _vad = null, _maxTimer = null;
  var _listening = false, _speaking = false, _abort = false;

  function _api() {
    return (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
  }
  function _token() {
    var u = (typeof auth !== 'undefined' && auth.getCurrentUser) ? auth.getCurrentUser() : null;
    return (u && u.token) ? 'Bearer ' + u.token : '';
  }
  function _canRecord() {
    return !!(global.navigator && navigator.mediaDevices &&
              navigator.mediaDevices.getUserMedia && global.MediaRecorder);
  }

  function available() {
    if (_engine !== null) return Promise.resolve(_engine === 'server');
    if (!_canRecord()) { _engine = 'none'; return Promise.resolve(false); }
    return fetch(_api() + '/api/speech-status', { headers: { Authorization: _token() } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { _engine = (d && d.available) ? 'server' : 'none'; return _engine === 'server'; })
      .catch(function () { _engine = 'none'; return false; });
  }

  // ── end-of-speech detection ────────────────────────────────────────────────
  // Thresholds are derived from the room, not fixed: a soft voice in a quiet
  // clinic never crosses a fixed bar, and a thinking pause falls below it.
  function _watch(stream, opts, onDone, onLevel) {
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx || !stream) return null;
    var ctx = new Ctx();
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    var src = ctx.createMediaStreamSource(stream);
    var an = ctx.createAnalyser(); an.fftSize = 2048;
    src.connect(an);
    var buf = new Uint8Array(an.fftSize);

    var CAL = 400,
        QUIET = opts.quietMs || 1500,
        MIN_SPEECH = 500,
        NOSPEECH = opts.noSpeechMs || 7000;
    var started = Date.now(), last = started, dead = false, timer = null;
    var fSum = 0, fN = 0, floor = null, on = 0.012, off = 0.007;
    var spokeMs = 0, quietSince = null;

    function cleanup() {
      if (dead) return;
      dead = true;
      if (timer) { clearTimeout(timer); timer = null; }
      try { src.disconnect(); } catch (e) {}
      try { if (ctx.state !== 'closed') ctx.close(); } catch (e) {}
    }
    function tick() {
      if (dead) return;
      an.getByteTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
      var rms = Math.sqrt(sum / buf.length), now = Date.now(), dt = now - last;
      last = now;

      if (floor === null) {
        fSum += rms; fN++;
        if (now - started >= CAL) {
          floor = fN ? fSum / fN : 0;
          // Was floor*3.0 / 0.012, which a normal speaking voice on a laptop mic
          // often never reached — so the turn only ended on the no-speech timeout
          // and it felt like it was ignoring you unless you shouted.
          on  = Math.max(0.006, floor * 2.0);
          off = Math.max(0.0035, floor * 1.3);
        }
        if (onLevel) onLevel(rms, on);
        timer = setTimeout(tick, 80);
        return;
      }
      // Adapt downward: if nothing has crossed the bar yet but the level is
      // consistently above the room, the bar is simply set too high for this mic.
      if (spokeMs === 0 && rms > floor * 1.5 && now - started > 1200) {
        on  = Math.max(0.005, Math.min(on, rms * 0.75));
        off = Math.max(0.003, on * 0.6);
      }
      if (rms > on) { spokeMs += dt; quietSince = null; }
      else if (rms < off) {
        if (spokeMs >= MIN_SPEECH) {
          if (quietSince === null) quietSince = now;
          else if (now - quietSince > QUIET) { cleanup(); return onDone(true); }
        }
      } else { quietSince = null; }
      if (spokeMs < MIN_SPEECH && now - started > NOSPEECH) { cleanup(); return onDone(false); }
      if (onLevel) onLevel(rms, on);
      timer = setTimeout(tick, 80);
    }
    tick();
    return { cancel: cleanup };
  }

  function _release() {
    if (_vad) { try { _vad.cancel(); } catch (e) {} _vad = null; }
    if (_maxTimer) { clearTimeout(_maxTimer); _maxTimer = null; }
    if (_stream) {
      try { _stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      _stream = null;
    }
    _listening = false;
  }

  function _transcribe(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onloadend = function () { resolve(String(fr.result).split(',')[1] || ''); };
      fr.readAsDataURL(blob);
    }).then(function (b64) {
      return fetch(_api() + '/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: _token() },
        body: JSON.stringify({ audio: b64, mimeType: blob.type, language: 'en-IN' })
      });
    }).then(function (res) {
      return res.clone().json().catch(function () { return null; }).then(function (body) {
        if (!body) {
          // HTML here is nginx or a proxy answering, not the application.
          return res.text().catch(function () { return ''; }).then(function (t) {
            throw new Error(/^\s*<(!doctype|html)/i.test(t)
              ? ('Server rejected the recording (HTTP ' + res.status + ')'
                 + (res.status === 413 ? ' — too long, try a shorter answer.' : '.'))
              : ('Unexpected reply from the server (HTTP ' + res.status + ').'));
          });
        }
        if (!res.ok) throw new Error(body.detail || body.error || 'Transcription failed');
        return (body.transcript || '').trim();
      });
    });
  }

  /* listen({ quietMs, maxMs, onLevel, onStatus }) -> Promise<string> */
  function listen(opts) {
    opts = opts || {};
    _abort = false;
    return available().then(function (ok) {
      if (!ok) throw new Error('Speech is not available on this account or browser.');
      // autoGainControl is the single biggest win for a quiet speaker: the browser
      // lifts a soft voice to a usable level before we ever see it, so the doctor
      // does not have to raise their voice for the level detector to notice them.
      return navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          noiseSuppression: true,
          echoCancellation: true
        }
      }).catch(function () {
        return navigator.mediaDevices.getUserMedia({ audio: true });   // older browsers
      });
    }).then(function (stream) {
      _stream = stream;
      var mime = '';
      ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].some(function (m) {
        if (MediaRecorder.isTypeSupported(m)) { mime = m; return true; }
        return false;
      });
      var o = { audioBitsPerSecond: 24000 };
      if (mime) o.mimeType = mime;
      _rec = new MediaRecorder(stream, o);
      _chunks = [];

      return new Promise(function (resolve, reject) {
        _rec.ondataavailable = function (e) { if (e.data && e.data.size) _chunks.push(e.data); };
        _rec.onstop = function () {
          _release();
          if (_abort) return resolve('');
          var blob = new Blob(_chunks, { type: _rec.mimeType || 'audio/webm' });
          if (!blob.size) return resolve('');
          if (opts.onStatus) opts.onStatus('transcribing');
          _transcribe(blob).then(resolve, reject);
        };
        _rec.start();
        _listening = true;
        if (opts.onStatus) opts.onStatus('listening');
        _vad = _watch(stream, opts, function () { stop(); }, opts.onLevel);
        _maxTimer = setTimeout(function () { if (_listening) stop(); }, opts.maxMs || 45000);
      });
    });
  }

  function stop() {
    if (_rec && _rec.state === 'recording') { try { _rec.stop(); } catch (e) {} return; }
    _release();
  }

  function speak(text) {
    return new Promise(function (resolve) {
      if (!text || !global.speechSynthesis || !global.SpeechSynthesisUtterance) return resolve();
      try {
        global.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-IN'; u.rate = 1.02;
        _speaking = true;
        u.onend = function () { _speaking = false; resolve(); };
        u.onerror = function () { _speaking = false; resolve(); };   // never stall the caller
        global.speechSynthesis.speak(u);
      } catch (e) { _speaking = false; resolve(); }
    });
  }

  function cancel() {
    _abort = true;
    try { if (global.speechSynthesis) global.speechSynthesis.cancel(); } catch (e) {}
    _speaking = false;
    stop();
  }

  function levelBar(rms, on) {
    var ref = Math.max((on || 0.012) * 3, 0.05);
    var n = Math.max(0, Math.min(5, Math.round((rms / ref) * 5)));
    return '▁▂▄▆█'.slice(0, n) + '·'.repeat(5 - n);
  }

  global.GqVoice = {
    available: available, listen: listen, stop: stop, speak: speak,
    cancel: cancel, levelBar: levelBar,
    isListening: function () { return _listening; },
    isSpeaking: function () { return _speaking; }
  };
})(window);
