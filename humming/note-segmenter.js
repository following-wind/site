(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HummingSegmenter = api;
})(globalThis, function () {
  'use strict';
  const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const round = value => Math.round(value * 1000) / 1000;
  // Preserve evidence for manual editing. There is no minimum note duration,
  // debounce, semitone hysteresis, general median filter or gap filling.
  const SETTINGS = Object.freeze({confidence:.85, silenceRms:.008,
    spikeSeconds:.031, spikeSemitones:5, spikeConfidence:.95,
    onsetValleyRatio:.35, onsetRiseRatio:2.5});
  let lastDiagnostics = null;
  const copy = value => JSON.parse(JSON.stringify(value));
  const contiguous = (a,b) => Math.abs(b.time-a.time-a.duration) <= .001;
  function runNotes(frames) {
    const out=[];
    for(let i=0;i<frames.length;i++) {
      const f=frames[i];
      if(f.midi===null)continue;
      const midi=Math.round(f.midi),last=out.at(-1);
      if(last && last.endIndex===i-1 && last.midi===midi && !f.onset && contiguous(frames[i-1],f)) {
        last.duration=f.time+f.duration-last.start;last.endIndex=i;
      } else out.push({midi,start:f.time,duration:f.duration,endIndex:i});
    }
    return out.map(n=>({midi:n.midi,start:round(n.start),duration:round(n.duration)}));
  }
  function counts(notes) {
    return {count:notes.length,under50ms:notes.filter(n=>n.duration<.05).length,
      under100ms:notes.filter(n=>n.duration<.1).length,under150ms:notes.filter(n=>n.duration<.15).length};
  }
  // API without options retains the original evidence-preserving behaviour.
  // UI explicitly chooses a slider profile. Only absorption time changes.
  function settingsForDetail(value) {
    const position=Math.max(0,Math.min(100,Number(value)||0));
    return {absorptionSeconds:position<=50?position/50*.18:.18+(position-50)/50*.12};
  }
  function absorbTransitions(frames, seconds) {
    // Gradual passes ensure higher smoothing also includes smaller repairs.
    for(let threshold=.06;threshold<seconds-1e-8;threshold+=.03)absorbPass(frames,threshold);
    absorbPass(frames,seconds);
  }
  function absorbPass(frames, seconds) {
    if(seconds<=0)return;
    // Work separately between hard gaps and amplitude reattacks.
    let begin=0;
    while(begin<frames.length){
      if(frames[begin].midi===null){begin++;continue;}
      let end=begin+1;
      while(end<frames.length&&frames[end].midi!==null&&!frames[end].onset&&contiguous(frames[end-1],frames[end]))end++;
      const runs=[];
      for(let i=begin;i<end;i++){
        const midi=Math.round(frames[i].midi),last=runs.at(-1);
        if(last&&last.midi===midi){last.end=i+1;last.duration+=frames[i].duration;}
        else runs.push({begin:i,end:i+1,midi,duration:frames[i].duration});
      }
      // Short runs may join an original stable neighbour; corrections cannot
      // cascade through a chain of short intentional notes.
      for(let r=0;r<runs.length;r++){
        const run=runs[r];if(run.duration>=seconds-1e-8)continue;
        const neighbours=[runs[r-1],runs[r+1]].filter(n=>n&&n.duration>=seconds-1e-8);
        neighbours.sort((a,b)=>Math.abs(a.midi-run.midi)-Math.abs(b.midi-run.midi)||b.duration-a.duration);
        if(neighbours.length)for(let i=run.begin;i<run.end;i++)frames[i].midi=neighbours[0].midi;
      }
      begin=end;
    }
  }
  function segmentNotes(track, {absorptionSeconds=0}={}) {
    if(!Number.isFinite(absorptionSeconds)||absorptionSeconds<0||absorptionSeconds>.3)throw new RangeError('Invalid absorption time');
    const rawPitchTrack=track.map(f=>{
      const rawMidi=Number.isFinite(f.freq)&&f.freq>0?69+12*Math.log2(f.freq/440):null;
      const silence=Number.isFinite(f.rms)&&f.rms<SETTINGS.silenceRms;
      const voiced=!silence&&rawMidi!==null&&f.confidence>=SETTINGS.confidence;
      return {...f,rawMidi,midi:voiced?rawMidi:null,boundary:voiced?null:silence?'silence':'uncertain'};
    });
    const cleanedPitchTrack=rawPitchTrack.map(f=>({...f,onset:false}));
    const corrections=[];
    // Only an isolated, less reliable large jump between two confident identical
    // pitches is repaired. Decisions read the original track, never cascade.
    for(let i=1;i<rawPitchTrack.length-1;i++) {
      const left=rawPitchTrack[i-1],f=rawPitchTrack[i],right=rawPitchTrack[i+1];
      if([left,f,right].some(x=>x.midi===null)||!contiguous(left,f)||!contiguous(f,right))continue;
      if(f.duration>SETTINGS.spikeSeconds||f.confidence>=SETTINGS.spikeConfidence ||
          left.confidence<SETTINGS.spikeConfidence||right.confidence<SETTINGS.spikeConfidence)continue;
      if(Math.round(left.midi)!==Math.round(right.midi)||Math.abs(left.midi-right.midi)>.3 ||
          Math.abs(f.midi-left.midi)<SETTINGS.spikeSemitones||Math.abs(f.midi-right.midi)<SETTINGS.spikeSemitones)continue;
      cleanedPitchTrack[i].midi=(left.midi+right.midi)/2;
      corrections.push({time:f.time,duration:f.duration,fromMidi:f.midi,toMidi:cleanedPitchTrack[i].midi,reason:'isolated-low-confidence-jump'});
    }
    const rearticulations=[];
    // A clear amplitude valley followed by renewed energy can mark another
    // attack at the same pitch even if it never fell below the silence floor.
    for(let i=2;i<cleanedPitchTrack.length-1;i++) {
      const before=cleanedPitchTrack[i-2],valley=cleanedPitchTrack[i-1];
      const current=cleanedPitchTrack[i],next=cleanedPitchTrack[i+1];
      const group=[before,valley,current,next];
      if(group.some(f=>f.midi===null||!Number.isFinite(f.rms)) ||
          !contiguous(before,valley)||!contiguous(valley,current)||!contiguous(current,next))continue;
      if(group.some(f=>Math.round(f.midi)!==Math.round(current.midi)))continue;
      if(valley.rms<=before.rms*SETTINGS.onsetValleyRatio &&
          current.rms>=valley.rms*SETTINGS.onsetRiseRatio &&
          next.rms>=current.rms*.5 && current.rms>=before.rms*.5) {
        current.onset=true;
        rearticulations.push({time:round(current.time),midi:Math.round(current.midi),valleyRms:valley.rms,rms:current.rms});
      }
    }
    absorbTransitions(cleanedPitchTrack,absorptionSeconds);
    const notes=runNotes(cleanedPitchTrack).map(n=>({note:names[n.midi%12]+(Math.floor(n.midi/12)-1),...n}));
    const rawNotes=runNotes(rawPitchTrack);
    // Keep the existing diagnostic fields. 'smoothed' now means only the narrow
    // spike correction above; no pitch contour is flattened by a moving median.
    lastDiagnostics={settings:{...SETTINGS,absorptionSeconds},rawPitchTrack,smoothedPitchTrack:copy(cleanedPitchTrack),
      cleanedPitchTrack,rawNotes,smoothedNotes:notes.map(({midi,start,duration})=>({midi,start,duration})),
      notes:copy(notes),corrections,rearticulations,bridgedFrames:0,
      summary:{raw:counts(rawNotes),smoothed:counts(notes),notes:counts(notes)}};
    return notes;
  }
  function getLastDiagnostics(){return copy(lastDiagnostics);}
  return {segmentNotes,getLastDiagnostics,settingsForDetail};
});
