(function (root) {
  'use strict';
  let lastDiagnostics = null;
  // Audio stays in this page. A new recording replaces only the previous audio.
  function mount({ onStart, onConvert }) {
    const el = id => document.getElementById(id);
    const start = el('recordBtn'), stop = el('recordStopBtn');
    const convert = el('convertBtn'), audio = el('originalAudio');
    const status = el('recordStatus'), error = el('recordError');
    let stream, recorder, blob, url, timer, deadline, started;
    let busy = false, disposed = false, generation = 0;
    let stopMonitor = null;
    const details = document.createElement('details');
    const summary = document.createElement('summary'), logView = document.createElement('pre');
    summary.textContent = '録音タイミングの診断（このページ内だけに保存）';
    logView.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';
    details.append(summary, logView);
    if (['localhost','127.0.0.1','[::1]'].includes(location.hostname) &&
        new URLSearchParams(location.search).get('record-diagnostics') === '1') error.after(details);
    let log = () => {};
    function beginDiagnostics() {
      const origin = performance.now();
      const diagnosis = {events:[],blobDurationSeconds:null,inputAudibleRanges:[]};
      lastDiagnostics = diagnosis;
      const record = (event, fields={}) => {
        diagnosis.events.push({event,ms:Math.round((performance.now()-origin)*10)/10,...fields});
        if (lastDiagnostics === diagnosis) logView.textContent = JSON.stringify(diagnosis,null,2);
      };
      record('start-click');
      return {diagnosis,record,origin};
    }
    function monitorInput(incoming, diagnosis, record, origin) {
      const Context = root.AudioContext || root.webkitAudioContext;
      if (!Context.prototype.createMediaStreamSource) return;
      let ctx, poll, source, ended=false;
      const finish = () => {
        if (ended) return;
        ended=true;clearInterval(poll);
        if(source)source.disconnect();
        if(ctx)ctx.close().catch(()=>{});
      };
      try {
        ctx=new Context();source=ctx.createMediaStreamSource(incoming);
        const analyser=ctx.createAnalyser();analyser.fftSize=1024;source.connect(analyser);
        const samples=new Float32Array(analyser.fftSize);
        ctx.resume().then(()=>{
          if(ended)return;
          record('input-monitor-ready',{sampleRate:ctx.sampleRate});
          let first=true;
          poll=setInterval(()=>{
            analyser.getFloatTimeDomainData(samples);
            const rms=Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);
            if(rms<.008)return;
            const ms=Math.round(performance.now()-origin),ranges=diagnosis.inputAudibleRanges,last=ranges.at(-1);
            if(last&&ms-last.endMs<=100)last.endMs=ms;
            else ranges.push({startMs:ms,endMs:ms});
            if(first){first=false;record('first-input-sound',{rms});}
          },50);
        }).catch(e=>{record('input-monitor-unavailable',{error:e.name});finish();});
      } catch(e) {record('input-monitor-unavailable',{error:e.name});finish();}
      return finish;
    }
    const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      root.MediaRecorder && (root.AudioContext || root.webkitAudioContext));
    function release() {
      clearInterval(timer); clearTimeout(deadline);
      if(stopMonitor){stopMonitor();stopMonitor=null;}
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
    function stopRecording(reason='automatic') {
      if (recorder && recorder.state === 'recording') {
        log('stop-call',{reason:typeof reason==='string'?reason:'track-ended'});
        recorder.stop();
        release();
        status.textContent = '録音データを準備中…';
        controls();
      }
    }
    start.addEventListener('click', async () => {
      if (busy || !supported) return;
      const {diagnosis,record,origin} = beginDiagnostics();log=record;
      busy = true; error.textContent = ''; audio.pause(); onStart();
      status.textContent = 'マイク準備中…「録音中」と表示されてから歌ってください。'; controls();
      const token = ++generation;
      try {
        record('getUserMedia-start');
        const incoming = await navigator.mediaDevices.getUserMedia({audio: {
          channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false
        }});
        record('getUserMedia-complete');
        if (disposed || token !== generation) { incoming.getTracks().forEach(t => t.stop()); return; }
        stream = incoming;
        stopMonitor=monitorInput(incoming,diagnosis,record,origin);
        for(const track of incoming.getAudioTracks()) {
          record('input-track',{muted:track.muted,readyState:track.readyState});
          track.addEventListener('mute',()=>record('input-muted'));
          track.addEventListener('unmute',()=>record('input-unmuted'));
        }
        const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
          .find(type => root.MediaRecorder.isTypeSupported(type));
        recorder = new root.MediaRecorder(stream, mimeType ? {mimeType} : {});
        const chunks = []; let failed = false;
        let dataEvents = 0;
        recorder.ondataavailable = event => {
          record(dataEvents++===0?'first-dataavailable':'dataavailable',{bytes:event.data.size});
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onstart = () => {
          record('recorder-onstart');
          if(disposed || token!==generation || recorder.state!=='recording')return;
          started=performance.now();
          record('recording-ui-and-timer');
          const tick = () => {
            const seconds = Math.min(30, Math.floor((performance.now() - started) / 1000));
            status.textContent = `録音中 00:${String(seconds).padStart(2, '0')} / 00:30`;
            if (seconds >= 30) stopRecording('deadline');
          };
          tick();timer=setInterval(tick,200);deadline=setTimeout(()=>stopRecording('deadline'),30000);
          controls();
        };
        recorder.onerror = () => {
          failed = true; error.textContent = '録音中にエラーが起きました。もう一度録音してください。';
          stopRecording(); release(); busy = false; controls();
        };
        recorder.onstop = () => {
          record('recorder-onstop');
          release();
          if (disposed || token !== generation) return;
          const recorded = new Blob(chunks, {type: recorder.mimeType});
          record('blob-complete',{bytes:recorded.size,chunks:chunks.length,mimeType:recorded.type});
          const Offline = root.OfflineAudioContext || root.webkitOfflineAudioContext;
          if (recorded.size && Offline) {
            // Decode a copy only for measuring duration. Never trim/change the original Blob.
            Promise.resolve().then(async () => {
              const ctx = new Offline(1,1,16000);
              const decoded = await ctx.decodeAudioData(await recorded.arrayBuffer());
              diagnosis.blobDurationSeconds = decoded.duration;
              const samples=decoded.getChannelData(0),hop=Math.round(decoded.sampleRate*.02),ranges=[];
              for(let offset=0;offset<samples.length;offset+=hop){
                const end=Math.min(samples.length,offset+hop);let power=0;
                for(let i=offset;i<end;i++)power+=samples[i]*samples[i];
                if(Math.sqrt(power/(end-offset))<.008)continue;
                const start=offset/decoded.sampleRate,last=ranges.at(-1);
                if(last&&start-last.end<=.061)last.end=end/decoded.sampleRate;
                else ranges.push({start,end:end/decoded.sampleRate});
              }
              diagnosis.blobAudibleRanges=ranges;
              record('blob-duration',{seconds:decoded.duration,sampleRate:decoded.sampleRate});
            }).catch(e=>record('blob-duration-unavailable',{error:e.name}));
          }
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
        record('recorder-start-call');
        recorder.start();
        stream.getAudioTracks().forEach(track => track.addEventListener('ended', stopRecording));
        controls();
      } catch (e) {
        release(); busy = false; error.textContent = message(e); status.textContent = ''; controls();
      }
    });
    stop.addEventListener('click', () => { log('stop-click');stopRecording('button'); });
    audio.addEventListener('play', onStart);
    audio.addEventListener('playing',()=>log('original-playing',{currentTime:audio.currentTime}));
    audio.addEventListener('seeked',()=>log('original-seeked',{currentTime:audio.currentTime}));
    audio.addEventListener('loadedmetadata',()=>log('original-metadata',{
      currentTime:audio.currentTime,duration:Number.isFinite(audio.duration)?audio.duration:null
    }));
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
  root.HummingRecorder = { mount, getLastDiagnostics: () => JSON.parse(JSON.stringify(lastDiagnostics)) };
})(window);
