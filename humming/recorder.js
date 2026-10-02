(function (root) {
  'use strict';
  // Audio stays in this page. A new recording replaces only the previous audio.
  function mount({ onStart, onConvert }) {
    const el = id => document.getElementById(id);
    const start = el('recordBtn'), stop = el('recordStopBtn');
    const convert = el('convertBtn'), audio = el('originalAudio');
    const status = el('recordStatus'), error = el('recordError');
    let stream, recorder, blob, url, timer, deadline, started;
    let busy = false, disposed = false, generation = 0;
    const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      root.MediaRecorder && (root.AudioContext || root.webkitAudioContext));
    function release() {
      clearInterval(timer); clearTimeout(deadline);
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    function controls() {
      start.disabled = !supported || busy;
      stop.disabled = !recorder || recorder.state !== 'recording';
      convert.disabled = busy || !blob || !onConvert;
      audio.controls = !busy;
    }
    function message(e) {
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'マイクが許可されませんでした。ブラウザのサイト設定から許可してください。';
      if (e.name === 'NotFoundError') return 'マイクが見つかりません。接続を確認してください。';
      if (e.name === 'NotReadableError') return 'マイクを使えません。他のアプリで使用していないか確認してください。';
      return '録音できませんでした。マイクの接続とブラウザの設定を確認してください。';
    }
    function stopRecording() {
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
        release();
        status.textContent = '録音を準備中…';
        controls();
      }
    }
    start.addEventListener('click', async () => {
      if (busy || !supported) return;
      busy = true; error.textContent = ''; audio.pause(); onStart();
      status.textContent = 'マイクの許可を待っています…'; controls();
      const token = ++generation;
      try {
        const incoming = await navigator.mediaDevices.getUserMedia({audio: {
          channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false
        }});
        if (disposed || token !== generation) { incoming.getTracks().forEach(t => t.stop()); return; }
        stream = incoming;
        const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
          .find(type => root.MediaRecorder.isTypeSupported(type));
        recorder = new root.MediaRecorder(stream, mimeType ? {mimeType} : {});
        const chunks = []; let failed = false;
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => {
          failed = true; error.textContent = '録音中にエラーが起きました。もう一度録音してください。';
          stopRecording(); release(); busy = false; controls();
        };
        recorder.onstop = () => {
          release();
          if (disposed || token !== generation) return;
          const recorded = new Blob(chunks, {type: recorder.mimeType});
          if (!failed && recorded.size) {
            blob = recorded;
            if (url) URL.revokeObjectURL(url);
            url = URL.createObjectURL(blob); audio.src = url; audio.hidden = false;
            status.textContent = '録音できました。原音を聞いてから変換できます。';
          } else if (!failed) {
            error.textContent = '録音データが空です。少し長めに録音してください。';
          }
          busy = false; controls();
        };
        recorder.start(); started = performance.now();
        const tick = () => {
          const seconds = Math.min(30, Math.floor((performance.now() - started) / 1000));
          status.textContent = `録音中 00:${String(seconds).padStart(2, '0')} / 00:30`;
          if (seconds >= 30) stopRecording();
        };
        tick(); timer = setInterval(tick, 200); deadline = setTimeout(stopRecording, 30000);
        stream.getAudioTracks().forEach(track => track.addEventListener('ended', stopRecording));
        controls();
      } catch (e) {
        release(); busy = false; error.textContent = message(e); status.textContent = ''; controls();
      }
    });
    stop.addEventListener('click', stopRecording);
    audio.addEventListener('play', onStart);
    convert.addEventListener('click', async () => {
      if (busy || !blob) return;
      busy = true; audio.pause(); onStart(); controls(); error.textContent = '';
      status.textContent = '音程を解析しています…';
      let ctx;
      try {
        ctx = new (root.AudioContext || root.webkitAudioContext)();
        await ctx.resume();
        const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
        if (!buffer.length) throw new Error('empty');
        const count = await onConvert(buffer);
        status.textContent = `${count}個の音符に変換しました。ピアノロールで修正できます。`;
      } catch (e) {
        error.textContent = e.message === 'no-pitch'
          ? '音程をほとんど検出できませんでした。静かな場所で、1音ずつ少し長めに歌ってください。'
          : e.message === 'editor-changed'
            ? '解析中に音符が編集されたため、置き換えを中止しました。変換をもう一度押してください。'
            : '録音音声を変換できませんでした。もう一度録音してください。';
        status.textContent = '';
      } finally {
        if (ctx) await ctx.close().catch(() => {});
        busy = false; controls();
      }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopRecording(); });
    root.addEventListener('pagehide', event => {
      disposed = true; generation++; stopRecording(); release(); audio.pause();
      if (url && !event.persisted) URL.revokeObjectURL(url);
    });
    root.addEventListener('pageshow', () => { disposed = false; busy = false; controls(); });
    if (!supported) error.textContent = 'この環境ではマイク録音を利用できません。対応ブラウザでHTTPSまたはlocalhostから開いてください。';
    controls();
    return { pause: () => audio.pause() };
  }
  root.HummingRecorder = { mount };
})(window);
