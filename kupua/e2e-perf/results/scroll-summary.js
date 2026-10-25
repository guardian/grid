"use strict";
window.renderScrollSummary = function(h, charts) {
  const {rs,base,baseRecords,find,esc,format,href,pair,state} = h;
  const {linked,lane,axis} = charts;
  const DATA=window.KupuaDashboardData, MODEL=window.KupuaScrollModel;
  const finite=n=>typeof n==="number"&&Number.isFinite(n);
  const names={grid:"Grid",justified:"Justified",table:"Table"};
  const densities=state.density==="all"?Object.keys(names):[state.density];
  const phaseNames={early:"Gentle · 30 results/s",middle:"Reference · 100 results/s",late:"Stress · 200 results/s",reversal:"Reversal · original 100 results/s calibration"};
  const statistic=state.statistic, statName=statistic==="p95"?"p95 of observations":"Median of observations";
  const get=(r,key)=>r?MODEL.value(r,key,statistic):null;
  const field=MODEL.field;
  const phase=state.phase;
  const browsingPrefix=state.workload==="constrained"?"D8":state.direction==="backward"?"D2":"D1";
  const browsing=densities.map(d=>find(`${browsingPrefix}-${d}`));
  const workloadLabel=state.workload==="constrained"?"Constrained · forward · 80ms / 4Mibit/s":`Ordinary · ${state.direction}`;
  const selectedPhaseAvailable=phase!=="reversal"||browsingPrefix==="D2";
  const measuredRecords=rs.filter(r=>r.area==="scroll");
  function control(key,label,options) {
    if(key==="direction"&&state.workload==="constrained")return '<label for="scroll-direction">Direction<select id="scroll-direction" disabled aria-label="Direction · D8 is forward only"><option>Forward only · D8</option></select></label>';
    return `<label for="scroll-${key}">${label}<select id="scroll-${key}" data-scroll-control="${key}">${options.map(([v,text])=>`<option value="${v}"${state[key]===v?" selected":""}>${text}</option>`).join("")}</select></label>`;
  }
  function delta(r,key,factor=1,unit="") {
    if(!base||!r)return "";
    const p=pair(r,key),a=get(r,key),b=p.ok?get(p.b,key):null;
    if(!p.ok||!finite(a)||!finite(b))return `<a class="delta-mini muted" href="${esc(href(r,key))}" title="${esc(p.ok?"Unavailable endpoint or field population":p.reason)}">Δ —</a>`;
    const n=(a-b)*factor,relative=b===0?null:100*(a-b)/Math.abs(b);
    const signed=v=>`${v>0?"+":""}${format(v)}`;
    return `<a class="delta-mini" href="${esc(href(r,key))}">Δ ${signed(n)} ${unit==="%"?"pp":esc(unit)} (${relative===null?"% n/a · zero baseline":`${signed(relative)}%`})</a>`;
  }
  function numeric(r,key,unit="",baseline=false) {
    const n=get(r,key);
    return finite(n)||typeof n==="boolean"?linked(r,key,format(n,unit),baseline):`<span class="muted">${linked(r,key,"Unavailable",baseline)} <small>${esc(r?MODEL.reason(r,key):"record absent")}</small></span>`;
  }
  function mini(r,key,unit="",factor=1,reference=null,referenceField=null) {
    const p=r&&base?pair(r,key):null;
    const values=[get(r,key),p?.ok?get(p.b,key):null].filter(finite).map(n=>Math.abs(n*factor));
    const max=Math.max(reference??0,...values,1)*1.12;
    const options={max,unit,get:record=>{const n=get(record,key);return finite(n)?n*factor:null;},caption:`${statName} · ${key}`,statistic,reference,referenceField};
    return lane(r,key,options)+(p?.ok?lane(p.b,key,{...options,baseline:true}):"")+delta(r,key,factor,unit);
  }
  function metricPanel(title,key,unit,{factor=1,reference=null,referenceKey=null}={}) {
    const values=[reference??0,1];
    for(const r of browsing.filter(Boolean)) {
      const p=base&&pair(r,key);
      for(const candidate of [r,...(p?.ok?[p.b]:[])])if(finite(get(candidate,key)))values.push(get(candidate,key)*factor);
    }
    const max=unit==="%"?100:Math.max(...values)*1.12;
    return `<section class="metric-panel" aria-label="${esc(title)}"><div class="metric-heading"><h3>${esc(title)}</h3><span>${reference===null?esc(unit):`Ref ${format(reference,unit)}`}</span></div>${browsing.map((r,i)=>{
      const p=r&&base?pair(r,key):null;
      const options={max,unit,get:record=>{const n=get(record,key);return finite(n)?n*factor:null;},caption:statName,statistic,reference,referenceField:referenceKey};
      return `<div class="density-chart-row"><strong>${linked(r,key,names[densities[i]])}</strong><div>${selectedPhaseAvailable?lane(r,key,options)+(p?.ok?lane(p.b,key,{...options,baseline:true}):"")+delta(r,key,factor,unit):`<span class="missing-value">${linked(r,key,"Not recorded for this workload/direction")}</span>`}</div></div>`;
    }).join("")}<div class="density-axis">${axis(max,unit)}</div></section>`;
  }
  function indexTable() {
    const all=Object.keys(names).map(d=>MODEL.summarize(h.densityEntry,rs,d));
    const before=base?Object.keys(names).map(d=>MODEL.summarize(h.baselineDensityEntry,baseRecords,d)):[];
    function cell(summary,star,baseline=false) {
      const score=summary.scores[star],parts=summary.components[star]||[];
      const limit=parts.filter(p=>finite(p.fraction)).sort((a,b)=>a.fraction-b.fraction)[0];
      const absent=parts.find(p=>!finite(p.fraction));
      const target=finite(score)?limit:absent||limit;
      const r=target?.record||summary.journeys[0];
      const key=target?field(target.key,target.phase):r?.primary;
      const peers=all.filter(other=>summary.compatibility&&other.compatibility===summary.compatibility&&finite(other.scores[star]));
      const rank=!baseline&&peers.length>1&&finite(score)?1+peers.filter(other=>other.scores[star]>score).length:null;
      return `<div class="scroll-index-value" title="${esc(limit?.name||summary.reasons[star]||"Required evidence unavailable")}">${linked(r,key,finite(score)?`${baseline?"B ":""}${format(score)} / 100`:"Unavailable",baseline,"","median")}${rank?` <small>#${rank} of ${peers.length}</small>`:""}</div>${!finite(score)?`<small>${esc(summary.reasons[star]||"Required evidence unavailable")}${absent?` · ${esc(field(absent.key,absent.phase))}`:""}</small>`:""}`;
    }
    return `<section class="engineering-panel" id="scroll-indices" aria-label="Existing density indices"><div class="panel-heading"><h2>Ordinary browsing · density indices v1</h2><span>Both directions · all load phases + recorded reversal · independent indices</span></div><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Density indices and limiting components"><table class="engineering-table scroll-index-table"><thead><tr><th scope="col">Density</th><th scope="col">Useful progress</th><th scope="col">Smoothness · 60Hz reference</th><th scope="col">Sampled DOM stability</th></tr></thead><tbody>${all.map((summary,i)=>`<tr><th scope="row">${names[summary.density]}</th>${["progress","smoothness","stability"].map(star=>{
      const old=before[i];
      const comparable=old&&summary.compatibility&&old.compatibility===summary.compatibility&&[...(summary.components[star]||[])].every(c=>pair(c.record,field(c.key,c.phase)).ok);
      const difference=comparable&&finite(summary.scores[star])&&finite(old.scores[star])?summary.scores[star]-old.scores[star]:null;
      return `<td>${cell(summary,star)}${comparable?`<div class="scroll-index-baseline">${cell(old,star,true)}${finite(difference)?`<small>Δ ${difference>0?"+":""}${format(difference)} index points (C − B)</small>`:""}</div>`:base?'<small class="muted">Baseline index unavailable or incompatible</small>':""}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div><details class="panel-method"><summary>Index rules, contributors & unavailable inputs</summary><p>Existing v1 weakest-component formulas, not new grades or satisfaction percentages. Progress combines achieved/requested rate, ready slots and unblocked input; smoothness combines a 16.67ms frame reference with intervals at most 50ms; stability combines retained readiness and geometry beyond 1px. Matching complete populations and all capture gates are required. Censored recovery withholds progress ranking. Paint is unmeasured. Indices always cover the whole ordinary journey; local controls below do not change their scope.</p>${all.map(s=>`<details><summary>${names[s.density]} · exact index components</summary>${Object.entries(s.components).map(([star,parts])=>`<p><strong>${esc(star)}</strong>: ${parts.map(p=>linked(p.record,field(p.key,p.phase),`${p.name}: ${finite(p.fraction)?format(Math.min(1,p.fraction)*100,"%"):"unavailable"}`,false,"","median")).join(" · ")}</p>`).join("")}</details>`).join("")}</details></section>`;
  }
  function outcomes(r,key,baseline=false) {
    if(!r)return "Record absent";
    const pop=DATA.population(r,key);
    if(["invalid","unsupported"].includes(pop.state))return linked(r,key,`${pop.state} · raw outcomes unassessed`,baseline);
    if(!Number.isInteger(pop.available)||!Number.isInteger(pop.unavailable)||pop.available+pop.unavailable!==pop.total)return linked(r,key,"Outcome population unavailable",baseline);
    return linked(r,key,`${pop.available}/${pop.total} complete · ${pop.unavailable}/${pop.total} unavailable${pop.available>0&&pop.unavailable>0?" · partial":""}`,baseline);
  }
  function recoveryGroup(title,prefixes,note) {
    const current=prefixes.flatMap(prefix=>densities.map(d=>({r:find(`${prefix}-${d}`),d,prefix})));
    return `<section class="engineering-panel" aria-label="${esc(title)}"><div class="panel-heading"><h3>${esc(title)}</h3><span>${esc(note)}</span></div><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="${esc(title)} evidence"><table class="engineering-table scroll-recovery-table"><thead><tr><th scope="col">Density / direction</th><th scope="col">Data ready · ms</th><th scope="col">Decoded media ready · ms</th><th scope="col">Media outcomes / cohort</th></tr></thead><tbody>${current.map(({r,d,prefix})=>{
      const p=r&&base?pair(r,"stopMediaReadyMs"):null;
      const before=baseRecords.find(record=>record.scenario===`${prefix}-${d}`);
      return `<tr><th scope="row">${linked(r,"stopMediaReadyMs",`${names[d]} · ${prefix==="D2"?"backward + reversal":"forward"}`)}<small>${r?esc(r.raw.resultRegime):"Record absent"}</small></th><td>${mini(r,"stopDataReadyMs","ms")}<small>C ${outcomes(r,"stopDataReadyMs")}</small>${before?`<small>B ${outcomes(before,"stopDataReadyMs",true)}</small>`:""}</td><td>${mini(r,"stopMediaReadyMs","ms")}</td><td><div>C ${outcomes(r,"stopMediaReadyMs")}</div>${before?`<div>B ${outcomes(before,"stopMediaReadyMs",true)}</div>${!p?.ok?`<small>Comparison withheld: ${esc(p?.reason||"Current record absent")}. Baseline outcomes describe that observation only.</small>`:""}`:""}<small>${linked(r,"stopCohortChanged","Cohort changed")}: ${numeric(r,"stopCohortChanged")} · ${linked(r,"postReadyCohortStable","Post-ready stable")}: ${numeric(r,"postReadyCohortStable")}</small><small>Observation cap: ${numeric(r,"recoveryLimitMs","ms")} (not latency)</small></td></tr>`;
    }).join("")}</tbody></table></div></section>`;
  }
  function scalarRow(r,label,fields) {
    return `<tr><th scope="row">${linked(r,r?.primary,label)}<small>${r?`${esc(r.scenario)} · ${esc(r.raw.resultRegime??r.raw.density??"recorded conditions")}`:"Record absent"}</small></th>${fields.map(([key,unit])=>`<td>${numeric(r,key,unit)}${base&&r?(()=>{const p=pair(r,key);return p.ok?`<small>B ${numeric(p.b,key,unit,true)}</small>${delta(r,key,1,unit)}`:`<small class="muted">Δ unavailable · ${esc(p.reason)}</small>`;})():""}</td>`).join("")}</tr>`;
  }
  function layout() {
    const rows=[...densities.flatMap(d=>[...["D3","D6"].map(prefix=>({r:find(`${prefix}-${d}`),label:`${names[d]} · ${prefix==="D3"?"Table → image layout":"width reflow"}`}))])];
    const support=["P4a","P4b","P16a","P16b","PP6","PP6b","PP6c",...rs.filter(r=>/^P11b?@/.test(r.scenario)).map(r=>r.scenario)];
    return `<section class="engineering-panel" id="scroll-layout" tabindex="-1" aria-label="Transitions and reflow"><div class="panel-heading"><h2>Density transitions & reflow</h2><span>Renderer-warm transition · 1720 → 1100px reflow · separate clocks</span></div><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Transitions and reflow evidence"><table class="engineering-table"><thead><tr><th scope="col">Action</th><th scope="col">Placement · ms</th><th scope="col">Decoded media · ms</th><th scope="col">Media outcomes</th></tr></thead><tbody>${rows.map(({r,label})=>`<tr><th scope="row">${linked(r,"placementMs",label)}<small>${r?`${esc(r.scenario)} · ${esc(r.raw.resultRegime)}`:"Not measured for this density in the selected campaign"}</small></th><td>${mini(r,"placementMs","ms")}</td><td>${mini(r,"mediaReadyMs","ms")}</td><td>C ${outcomes(r,"mediaReadyMs")}${r&&base&&pair(r,"mediaReadyMs").ok?`<small>B ${outcomes(pair(r,"mediaReadyMs").b,"mediaReadyMs",true)}</small>`:""}</td></tr>`).join("")}</tbody></table></div><details class="panel-method"><summary>Additional transition clocks, signed geometry & width evidence</summary><p>P4/P11 frame probes, PP6 action phases and P16 changed-width observations have different clocks; they are not additional repetitions of D3/D6. P16 change detection is not two-frame stability. Unverified revisions refuse comparisons.</p><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Supporting layout records"><table class="engineering-table"><thead><tr><th scope="col">Record</th><th scope="col">Recorded primary clock / frames</th><th scope="col">Signed focus drift · px</th><th scope="col">Focus visible / width delta</th></tr></thead><tbody>${support.map(id=>{const r=find(id);return scalarRow(r,id,[[r?.primary||"p95Frame",r?.unit||""],["focusDriftPx","px"],[r&&"widthDeltaPx" in r.raw?"widthDeltaPx":"focusVisible",r&&"widthDeltaPx" in r.raw?"px":""]]);}).join("")}</tbody></table></div><p>${support.filter(id=>id.startsWith("PP6")).map(id=>{const r=find(id);return r?`${linked(r,"dt_first_visible_frame_ms",`${id} · visible`)} · ${linked(r,"dt_visual_settled_ms",`${id} · settled`)}`:"";}).join(" · ")}</p></details></section>`;
  }
  function maintenance() {
    return `<section class="engineering-panel" id="scroll-maintenance" tabindex="-1" aria-label="Window maintenance"><div class="panel-heading"><h2>Window maintenance</h2><span>Admission-band jump → real eviction · not steady scrolling</span></div><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Window maintenance evidence"><table class="engineering-table"><thead><tr><th scope="col">Density</th><th scope="col">Frame p95 · ms</th><th scope="col">Evictions</th><th scope="col">Prepends</th></tr></thead><tbody>${densities.map(d=>scalarRow(find(`D7-${d}`),names[d],[["frameP95Ms","ms"],["evictionCount",""],["prependCount",""]])).join("")}</tbody></table></div><p class="note">Table maintenance is not measured by this campaign. D7's known foreground-observation limitation remains; these tests do not repair its producer.</p></section>`;
  }
  const demandKey=field("requestedResultsPerSecond",phase);
  const demand=phase==="reversal"?100:({early:30,middle:100,late:200}[phase]);
  return `<div class="engineering-overview scroll-summary" role="region" aria-label="Scrolling and Layout summary"><div class="image-summary-toolbar"><span class="pill">${measuredRecords.length} Scrolling & Layout records available</span><span class="pill">Canonical aggregates · n by field</span>${h.overviewLink}${h.historyLink}<div class="image-group-links" aria-label="Scrolling groups">${[["browsing","Browsing"],["recovery","Stopped recovery"],["layout","Transitions / reflow"],["maintenance","Maintenance"]].map(([g,t])=>h.scrollGroupLink(g,t)).join("")}</div></div>
    <section class="engineering-panel" id="scroll-browsing" tabindex="-1" aria-label="Directional browsing"><div class="scroll-controls" aria-label="Local scrolling controls">${control("density","Density",[["all","All densities"],...Object.entries(names)])}${control("direction","Direction",[["forward","Forward"],["backward","Backward"]])}${control("workload","Workload",[["ordinary","Ordinary"],["constrained","Constrained · D8 forward"]])}${control("phase","Load phase",Object.entries(phaseNames))}${control("statistic","Statistic",[["median","Median of observations"],["p95","p95 of observations"]])}</div><div class="overview-key"><span><i class="legend-current"></i> C · ${statName}</span>${base?`<span><i class="legend-baseline"></i> B · eligible ${statName.toLowerCase()}</span><span>Δ C − B · descriptive, not delivery causation</span>`:""}</div><div class="panel-heading"><h2>Browsing · ${esc(workloadLabel)}</h2><span>${esc(phaseNames[phase])} · ${esc(statName)} · ${esc(browsing.filter(Boolean).map(r=>r.raw.resultRegime).filter((v,i,a)=>a.indexOf(v)===i).join(" / "))}</span></div>${!selectedPhaseAvailable?'<p class="note watch">Reversal is recorded only in ordinary backward D2. This selection is unavailable; no other phase is substituted.</p>':""}<div class="small-multiples">${metricPanel("Achieved results/s",field("achievedResultsPerSecond",phase),"results/s",{reference:demand,referenceKey:demandKey})}${metricPanel("Pending slots (%)",field("pendingVisibleRatioMean",phase),"%",{factor:100,reference:20})}${metricPanel("Frame p95 (ms)",field("frameP95Ms",phase),"ms",{reference:33.4})}</div><details class="panel-method"><summary>Useful progress, picture readiness, frames & sampled stability</summary><p>Sequential fixed demands, not independent capacity tests or physical trackpad certification. The reversal uses the original 100 results/s calibration. Frame-p95 is computed within each observation; the selected statistic summarizes those values. References are diagnostic bands, not new acceptance grades. Pending slots are count-based, not pending image area; DOM/load/decode are not paint.</p><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Browsing guards and stability evidence"><table class="engineering-table"><thead><tr><th scope="col">Density</th><th scope="col">Blocked input · ms</th><th scope="col">Retained displacement · px</th><th scope="col">Refill coverage / phase</th></tr></thead><tbody>${browsing.map((r,i)=>scalarRow(r,names[densities[i]],[[field("bufferEdgeBlockedMs",phase),"ms"],[phase==="reversal"?"reversalRetainedDisplacementMaxPx":"retainedDisplacementMaxPx","px"],["refillCoverageComplete",""]])).join("")}</tbody></table></div><p>${browsing.filter(Boolean).map(r=>`${linked(r,field("thumbnailVisibleWaitCompletedMaxMs",phase),`${r.scenario} · completed visible wait`)} · ${linked(r,field("thumbnailVisibleWaitCensoredCount",phase),"censored waits")} · ${linked(r,field("mediaRequestStarts",phase),"request cohorts")}`).join(" · ")}</p><p>Zero walls is valid; absent repeated publication is not proof of good supply. Geometry includes animation and cannot certify paint or attribute movement to a layout defect.</p></details></section>
    ${indexTable()}
    <section id="scroll-recovery" tabindex="-1" aria-label="Stopped recovery groups">${recoveryGroup("Ordinary stopped recovery",["D1","D2"],"Last motion stop · shared 4s observation cap")}${recoveryGroup("Constrained stopped recovery",["D8"],"80ms latency · 4Mibit/s download · forward")}</section>
    ${layout()}${maintenance()}
    <section class="engineering-panel" aria-label="Related workflow evidence"><div class="panel-heading"><h2>Supporting & related evidence</h2><span>One canonical observation · linked, not re-collected</span></div><p>${["P2","P8","P17"].map(id=>{const r=find(id);return linked(r,r?.primary,`${id} · browsing frame / direction guards`);}).join(" · ")}</p><p>Search-owned: ${["D5-grid","D5-justified","D11-grid","D11-justified"].map(id=>{const r=find(id);return linked(r,r?.primary,`${id} · ${id.startsWith("D5")?"seeking":"refresh / contention"}`);}).join(" · ")}. Image-owned: ${["D4-grid","D4-justified"].map(id=>{const r=find(id);return linked(r,r?.primary,`${id} · list return`);}).join(" · ")}.</p></section>
    <details class="panel-method"><summary>Coverage, outcomes & known measurement limits</summary><p>All values come from complete saved canonical records. No raw repetitions, confidence intervals or new histories are reconstructed. Field contributors, unsupported capture, invalid capture, partial endpoints and true zeros stay distinct. Partial recovery does not earn a full-population latency; deadlines never replace latency. D3/D6 placement and decoded-media clocks overlap and must not be added; stopped-data and stopped-media clocks likewise share a start. Paint remains unmeasured. D7 foreground and other documented producer limitations are not certified by dashboard tests. D9/D10 remain retired; this load ladder is not a 24-second steady workload. Baseline long responsiveness remains absent and source/content/cache differences remain uncontrolled.</p></details></div>`;
};
