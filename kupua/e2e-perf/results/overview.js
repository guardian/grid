"use strict";
window.renderEngineeringOverview = function(h) {
  const {cp,rs,base,read,stat,format,esc,find,assess,pair,href} = h;
  const finite = n => typeof n === "number" && Number.isFinite(n);
  const names = {grid:"Grid",justified:"Justified",table:"Table"};
  const count = r => r && window.ASSESSMENT.completion(r);
  const linked = (r,key,text,baseline=false,cls="",statistic=null) => r ? `<a class="${cls}" href="${esc(href(r,key,baseline,statistic))}">${esc(text)}</a>` : `<span class="muted">${esc(text)}</span>`;
  const nice = n => {
    if(!(n>0)) return 1;
    const power=10**Math.floor(Math.log10(n));
    return [1,1.25,1.5,2,2.5,4,5,8,10].find(x=>x*power>=n)*power;
  };
  const grade = (r,type) => {
    const a=assess(r,type), mapped={"Meets proposed band":["Meets","good"],"Below proposed band":["Watch","watch"],"Outside proposed band":["Watch","watch"],"Far below proposed band":["Weak","bad"],"Far outside proposed band":["Weak","bad"],"Adverse outcome":["Adverse","bad"]};
    const [label,cls]=mapped[a.label]||["Unrated","unknown"];
    return `<span class="engineering-grade ${cls}" title="${esc(a.why)}">${label}</span>`;
  };
  function reason(r,key) {
    if(!r)return h.imageSummary ? (cp.synthetic?"not included in this synthetic fixture":"record absent from this checkpoint") : "not in checkpoint";
    if(r.raw.supported===false)return "unsupported";
    if(!window.KupuaDashboardData.validity(r))return "invalid capture or counts";
    const m=stat(r,key),c=count(r);
    if(m && m.median===null)return `${m.sampleCount}/${r.raw.sampleCount} available${m.sampleCount?" · partial aggregate withheld":" · endpoint censored"}`;
    if(c && key===r.primary)return `${c.ready}/${c.total} ${r.scenario==="PP3"?"healthy":"complete"}; no timing`;
    return "not recorded";
  }
  function counts(r) {
    if(!r)return "— not shown";
    if(r.raw.supported===false)return "Unsupported · raw counts unassessed";
    if(!window.KupuaDashboardData.validity(r))return "Invalid capture · raw counts unassessed";
    const c=count(r);
    if(!c)return `n=${r.raw.sampleCount}`;
    const label=r.scenario==="PP3"?"healthy":"complete", adverse=r.scenario==="PP3"?"degraded":"censored";
    return `${c.ready}/${c.total} ${label} · ${c.unavailable} ${adverse}${r.raw.detailImageFailedCount?`; ${r.raw.detailImageFailedCount} error (subset)`:""}`;
  }
  function outcomeLinks(r,baseline=false) {
    if(r.raw.supported===false || !window.KupuaDashboardData.validity(r))return linked(r,r.primary,counts(r),baseline);
    const c=count(r);
    if(!c)return linked(r,r.primary,`n=${r.raw.sampleCount}`,baseline);
    const ready=r.scenario.startsWith("P14")?"landingRenderedCount":"detailImageReadyCount";
    const censored=r.scenario.startsWith("P14")?"landingCensoredCount":"detailImageCensoredCount";
    return `${linked(r,ready,`${c.ready}/${c.total} complete`,baseline)} · ${linked(r,censored,`${c.unavailable} censored`,baseline)}${r.raw.detailImageFailedCount?` · ${linked(r,"detailImageFailedCount",`${r.raw.detailImageFailedCount} error (subset)`,baseline)}`:""}`;
  }
  function deltas(r,key,get=record=>read(record,key),unit="ms",percentagePoints=false) {
    if(!base||!r)return "";
    const p=pair(r,key);
    if(!p.ok)return `<a class="delta-mini muted" href="${esc(href(r,key))}" title="${esc(p.reason)}" aria-label="${esc(`Delta unavailable: ${p.reason}`)}">Δ —</a>`;
    const current=get(r),before=get(p.b);
    if(!finite(current)||!finite(before))return `<a class="delta-mini muted" href="${esc(href(r,key))}">Δ — unavailable endpoint</a>`;
    const delta=current-before, relative=before!==0?100*delta/Math.abs(before):null;
    const sign=n=>n>0?"+":"";
    return `<a class="delta-mini" href="${esc(href(r,key))}">Δ ${sign(delta)}${format(delta,percentagePoints?"pp":unit)}${relative===null?' <span title="Percentage change is undefined for a zero baseline">(% n/a)</span>':` (${sign(relative)}${format(relative,"%")})`}</a>`;
  }
  function lane(r,key,options={}) {
    const {baseline=false,max=1,unit="",get=record=>read(record,key),getMax=()=>null,maxField=key,maxStatistic=null,statistic="median",reference=null,referenceField=null,caption="",showMax=false}=options;
    const usable=r&&r.raw.supported!==false&&window.KupuaDashboardData.validity(r);
    const n=usable?get(r):null, peak=usable?getMax(r):null;
    if(!finite(n))return `<div class="chart-lane ${baseline?"baseline-lane":""}"><span class="series-label" aria-label="${baseline?"Baseline":"Current"}">${baseline?"B":"C"}</span><span class="missing-value">${linked(r,key,"Unavailable",baseline)} <small>${esc(reason(r,key))}</small></span></div>`;
    const tailLabel=window.KupuaDashboardData.tailLabel(r,maxField);
    const description=`${r.title} · ${baseline?"baseline":"current"} · ${caption||key} ${format(n,unit)}${finite(peak)?`; ${tailLabel.toLowerCase()} ${format(peak,unit)}`:""}`;
    const ref=finite(reference)?`<a class="reference-mark" style="left:${100*reference/max}%" href="${esc(href(r,referenceField||key,baseline))}" title="${esc(referenceField?`Requested ${format(reference,unit)} · inspect demand`:`Diagnostic reference ${format(reference,unit)} · inspect measurement`)}" aria-label="${esc(`${r.title} ${referenceField?"requested":"diagnostic reference"} ${format(reference,unit)}; inspect evidence`)}"></a>`:"";
    return `<div class="chart-lane ${baseline?"baseline-lane":""}"><span class="series-label" aria-label="${baseline?"Baseline":"Current"}">${baseline?"B":"C"}</span><div class="plot-area">${ref}<a class="bar-mark ${n===0?"zero-mark":""}" style="width:${100*n/max}%" href="${esc(href(r,key,baseline,statistic))}" aria-label="${esc(description)}" title="${esc(description)}" data-metric="${key}" data-value="${n}" data-baseline="${baseline}"></a>${finite(peak)?`<a class="maximum-mark" style="left:${100*peak/max}%" href="${esc(href(r,maxField,baseline,maxStatistic))}" aria-label="${esc(`${r.title} ${baseline?"baseline":"current"} ${tailLabel.toLowerCase()} ${format(peak,unit)}`)}" title="${tailLabel}, not an individual sample" data-max="${peak}"></a>`:""}</div><span class="plot-values">${linked(r,key,format(n),baseline,"",statistic)}${showMax?` <small>/ ${finite(peak)?linked(r,maxField,format(peak),baseline,"",maxStatistic):"—"}</small>`:""}</span></div>`;
  }
  function pairLanes(r,key,options) {
    const p=r&&base?pair(r,key):null;
    return lane(r,key,options)+(p?.ok?lane(p.b,key,{...options,baseline:true}):"");
  }
  function scaleFor(records,key,get=record=>read(record,key),getMax=()=>null,min=1) {
    const numbers=[min];
    for(const r of records.filter(Boolean)){
      for(const v of [get(r),getMax(r)])if(finite(v))numbers.push(v);
      const p=base&&pair(r);
      if(p?.ok)for(const v of [get(p.b),getMax(p.b)])if(finite(v))numbers.push(v);
    }
    return nice(Math.max(...numbers));
  }
  const axis = (max,unit="") => `<div class="axis-lane"><span></span><div class="chart-axis"><span>0</span><span>${format(max/2)}</span><span>${format(max,unit)}</span></div><span></span></div>`;
  const densities=["grid","justified","table"];
  const scrolling=densities.map(d=>find(`D1-${d}`));
  function scrollChart(title,key,unit,{factor=1,fixedMax=null,reference=null,referenceField=null}={}) {
    const get=r=>finite(read(r,key))?read(r,key)*factor:null;
    const getMax=r=>finite(stat(r,key)?.p95)?stat(r,key).p95*factor:null;
    const max=fixedMax||scaleFor(scrolling,key,get,getMax,reference||1);
    return `<section class="metric-panel" aria-label="${title}"><div class="metric-heading"><h3>${title}</h3><span>${reference!==null?`${referenceField?"Demand":"Ref"} ${format(reference,unit)}`:""}</span></div><div class="plot-heading"><span>Density</span><span>Median / p95</span></div>${scrolling.map((r,i)=>`<div class="density-chart-row"><strong>${linked(r,key,names[densities[i]])}</strong><div>${pairLanes(r,key,{max,unit,get,getMax,maxStatistic:"p95",reference,referenceField,caption:title,showMax:true})}${deltas(r,key,get,unit,unit==="%")}</div></div>`).join("")}<div class="density-axis">${axis(max,unit)}</div></section>`;
  }
  function summary() {
    const traversalFindings=window.ASSESSMENT.findings(rs);
    const traversal=(traversalFindings.find(f=>f.key==="traversal-unavailable")||traversalFindings.find(f=>f.key==="traversal"))?.r;
    const traversalEvidence=window.ASSESSMENT.traversalEvidence(traversal);
    const frames=scrolling.filter(r=>r&&finite(read(r,"middleFrameP95Ms")));
    const worst=[...frames].sort((a,b)=>read(b,"middleFrameP95Ms")-read(a,"middleFrameP95Ms"))[0];
    const pressure=scrolling.filter(Boolean).map(r=>window.ASSESSMENT.pressure(r));
    const hasBreach=pressure.some(p=>[p.movement,p.pictures,p.frames].includes(false));
    const incomplete=pressure.some(p=>[p.movement,p.pictures,p.frames].includes(null));
    const scrollGrade=frames.length!==3||incomplete?'<span class="engineering-grade unknown">Partial / unrated</span>':`<span class="engineering-grade ${hasBreach?"bad":"good"}">${hasBreach?"Reference misses":"Meets step refs"}</span>`;
    const detailImage=find("P13c");
    const detailId=!detailImage||!finite(read(detailImage,"detailImageReadyMs"))||count(detailImage)?.unavailable>0?"P13c":find("JA2")?"JA2":"P13c";
    const cards=[
      {name:"Scrolling",r:worst,key:"middleFrameP95Ms",value:r=>read(r,"middleFrameP95Ms"),n:worst?format(read(worst,"middleFrameP95Ms"),"ms"):"—",note:worst?"highest layout median · frame p95":"not in profile",grade:scrollGrade},
      {name:"Traversal",r:traversal,key:"renderedCount",value:r=>{const e=window.ASSESSMENT.traversalEvidence(r);return e.usable?e.percentage:null;},n:traversalEvidence.usable?format(traversalEvidence.percentage,"%"):traversal?"Unavailable":"—",note:traversalEvidence.usable?`${traversalEvidence.loaded}/${traversalEvidence.total} loaded · ${traversal.raw.cadenceMs}ms ${traversal.raw.direction}`:traversalEvidence.reason,grade:grade(traversal,"traversal")},
      ...[["Search / sort","PP3","search"],["Seek","PP7","seek"],["Detail entry",detailId,"detail"]].map(([name,id,type])=>{const r=find(id);return {name,r,key:r?.primary||"",value:x=>read(x,x.primary),n:r?format(read(r,r.primary),"ms"):"—",note:r?.scenario==="JA2"?"loaded / stable median":r?.scenario==="P13c"?"decoded / stable median":"visual settlement median",grade:grade(r,type)};})
    ];
    const trendColour={"direct-es":"#56B4E9",local:"#E69F00","deployed-test":"#CC79A7"};
    const historyHref={Scrolling:"scroll",Traversal:"images","Search / sort":"search",Seek:"search","Detail entry":"images"};
    function spark(c) {
      const t=c.r&&h.trend?.(c.r,c.key,c.value);
      if(!t||t.values.length<=3)return "";
      const lo=Math.min(...t.values),hi=Math.max(...t.values),span=hi-lo||1;
      const points=t.values.map((v,i)=>`${(100*i/(t.values.length-1)).toFixed(1)},${(18-16*(v-lo)/span).toFixed(1)}`).join(" ");
      const topology=t.dataMode==="direct-es"?"direct-es":t.apiTopology;
      return `<a class="hero-trend" href="${esc(h.historyHref(historyHref[c.name]))}" aria-label="${esc(`${c.name} history: ${t.values.length} comparable ${topology} campaigns`)}"><svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${trendColour[topology]||"#9a9a9a"}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg></a>`;
    }
    return `<section class="workflow-strip" aria-label="Numerical workflow summary">${cards.map(c=>`<div class="workflow-number"><div><strong>${c.r?.area==="images"?h.summaryLink(c.r.scenario.startsWith("P14")?"traversal":"detail",c.name):c.name}</strong>${c.grade}</div><b class="${c.n==="Unavailable"?"stat-unavailable":""}">${linked(c.r,c.key,c.n)}</b>${spark(c)}<small>${esc(c.note)}${c.r&&!c.r.scenario.startsWith("D1")&&count(c.r)?.unavailable>0?` · ${c.r.scenario.startsWith("P14")?"final ":""}${esc(counts(c.r))}`:""}</small></div>`).join("")}</section>`;
  }
  function recovery() {
    const r=find("D8-table"),key="stopMediaReadyMs",p=r&&base?pair(r):null;
    const max=scaleFor([r],key,record=>read(record,key),record=>stat(record,key)?.p95,4000);
    return `<section class="engineering-panel recovery-panel" aria-label="Constrained recovery"><div class="panel-heading"><h2>Constrained stopped-media recovery</h2><span>Table · 4,000ms observation cap</span></div><div class="recovery-content"><div><strong>${linked(r,key,"Decoded readiness")}</strong><p class="outcome-numbers">${r?linked(r,"stopMediaCensored",counts(r)):"Not in profile"}</p>${p?.ok?`<small>B: ${linked(p.b,"stopMediaCensored",counts(p.b),true)}</small>`:""}</div><div>${pairLanes(r,key,{max,unit:"ms",getMax:record=>stat(record,key)?.p95,showMax:true,caption:"Recovery median"})}${deltas(r,key)}${axis(max,"ms")}</div></div></section>`;
  }
  function traversal(imageOnly=false) {
    const rows=["P14a","P14b","P14c","P14d"].map(id=>find(id));
    const labels=["Normal forward","Fast forward","Fast backward","Rapid forward"];
    const cadence=r=>{
      const evidence=window.ASSESSMENT.traversalEvidence(r);
      return evidence.usable?evidence.percentage:null;
    };
    const cadenceCount=r=>{
      const evidence=window.ASSESSMENT.traversalEvidence(r);
      return evidence.usable?`${evidence.loaded}/${evidence.total} loaded (median count)`:evidence.reason;
    };
    const landingMax=scaleFor(rows,"landingRenderMs");
    return `<section class="engineering-panel traversal-panel" ${imageOnly?'id="image-traversal" tabindex="-1" aria-label="Image traversal"':""}><div class="panel-heading"><h2>${imageOnly?"Traversal":h.summaryLink("traversal","Traversal")}</h2><span>Loaded ≠ decoded / painted · landing clock limited</span></div><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Traversal charts; scroll horizontally on narrow screens"><table class="engineering-table"><caption class="sr-only">Independent cadence readiness and eventual landing aggregates</caption><thead><tr><th scope="col">Action / cadence</th><th scope="col">Loaded within cadence (%)${axis(100,"%")}</th><th scope="col">Landing (ms)${axis(landingMax,"ms")}</th><th scope="col">Final outcomes</th><th scope="col">Grade</th></tr></thead><tbody>${rows.map((r,i)=>{const p=r&&base?pair(r):null;return `<tr><th scope="row">${linked(r,"renderedCount",labels[i])}<small>${r?`${r.raw.cadenceMs}ms · ${r.raw.direction}`:imageOnly?reason(r,"renderedCount"):"not in profile"}</small></th><td>${pairLanes(r,"renderedCount",{max:100,unit:"%",get:cadence,caption:"Loaded within cadence"})}<small>${r?linked(r,"renderedCount",cadenceCount(r)):"—"}${p?.ok?` · B ${linked(p.b,"renderedCount",cadenceCount(p.b),true)}`:""}</small>${deltas(r,"renderedCount",cadence,"%",true)}</td><td>${pairLanes(r,"landingRenderMs",{max:landingMax,unit:"ms",caption:"Completed-only landing median"})}${deltas(r,"landingRenderMs")}</td><td class="counts-cell">${r?(imageOnly?outcomeLinks(r):linked(r,"landingRenderedCount",counts(r))):"—"}${p?.ok?`<small>B: ${imageOnly?outcomeLinks(p.b,true):linked(p.b,"landingRenderedCount",counts(p.b),true)}</small>`:""}</td><td>${grade(r,"traversal")}</td></tr>`;}).join("")}</tbody></table></div><details class="panel-method"><summary>Landing timing & cache limits</summary><p>Landing observes final committed navigation after the last cadence, with a 15-second horizon. Completed-only latency is not pure post-stop waiting. First-readiness and resource/cache inference remain limited (U1/U2); no verified cache-hit or paint claim. No recorded landing maximum is imported.</p></details></section>`;
  }
  function actions(imageOnly=false) {
    const specs=[
      ["Focused sort","PP3","dt_visual_settled_ms","dt_visual_settled_p95_ms","Visual settlement","search"],
      ["Seek · middle click","PP7","dt_visual_settled_ms","dt_visual_settled_p95_ms","Visual settlement","seek"],
      ["Detail · lookup","P13c","detailLookupMs",null,"Singleton response",null],
      ["Detail · metadata","P13c","detailMetadataReadyMs",null,"Metadata ready",null],
      ["Detail · returned image","P13c","detailImageReadyMs",null,"Decoded / stable","detail"],
      ["Detail · double-click","JA2","dt_visual_settled_ms","dt_visual_settled_p95_ms","Loaded / stable, not decode","detail"]
    ].filter(([,id])=>!imageOnly || ["P13c","JA2"].includes(id));
    const values=[];
    for(const [,id,key,maxKey] of specs){const r=find(id);if(!r)continue;const p=base&&pair(r);for(const record of [r,...(p?.ok?[p.b]:[])])for(const k of [key,maxKey])if(k&&finite(read(record,k)))values.push(read(record,k));}
    const max=nice(Math.max(1,...values));
    return `<section class="engineering-panel" ${imageOnly?'id="image-detail" tabindex="-1" aria-label="Detail opening"':""}><div class="panel-heading"><h2>${imageOnly?"Detail opening":`Search, seek & ${h.summaryLink("detail","detail")}`}</h2><span>Independent clocks · not additive</span></div><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Action latency charts; scroll horizontally on narrow screens"><table class="engineering-table action-table"><caption class="sr-only">Median latency and recorded p95, by measured action</caption><thead><tr><th scope="col">Action / clock</th><th scope="col">Latency (ms) · median / p95${axis(max,"ms")}</th><th scope="col">Timing population</th><th scope="col">Grade</th></tr></thead><tbody>${specs.map(([name,id,key,maxKey,clock,type])=>{const r=find(id),p=r&&base?pair(r):null;const population=record=>key===record.primary?counts(record):`n=${record.raw.sampleCount} · metadata phase`;return `<tr><th scope="row">${linked(r,key,name)}<small>${clock}</small></th><td>${pairLanes(r,key,{max,unit:"ms",getMax:record=>maxKey?read(record,maxKey):null,maxField:maxKey||key,showMax:true,caption:`${name} median`})}${deltas(r,key)}</td><td class="counts-cell">${r?(imageOnly&&key===r.primary?outcomeLinks(r):linked(r,key,population(r))):`— ${imageOnly?reason(r,key):"not in profile"}`}${p?.ok?`<small>B: ${imageOnly&&key===p.b.primary?outcomeLinks(p.b,true):linked(p.b,key,population(p.b),true)}</small>`:""}${!maxKey?`<small>${imageOnly&&!r?"Maximum unavailable here":"Maximum not recorded"}</small>`:""}</td><td>${type?grade(r,type):'<span class="muted">Phase only</span>'}</td></tr>`;}).join("")}</tbody></table></div></section>`;
  }
  function guards() {
    const candidate=find("JB5"),r=candidate&&candidate.raw.supported!==false&&window.KupuaDashboardData.validity(candidate)&&"anchorDriftPx" in candidate.raw?candidate:null,paint=find("D7");
    return `<section class="guard-strip" aria-label="Guards and coverage"><strong>Return guard</strong> ${r?linked(r,"anchorDriftPx",`${format(r.raw.anchorDriftPx,"px")} · visible=${r.raw.targetVisible}`,false,r.raw.targetVisible===false?"bad":""):"— not shown"}<span><strong>Paint</strong> ${paint?linked(paint,"paintMs",paint.raw.supported===false?"Unsupported":"No timing"):"Unmeasured"}</span><span><strong>Stability index</strong> — not assessed here</span><span>Selection / panels — not charted here</span></section>`;
  }
  if(h.searchSummary) return window.renderSearchSummary(h,{linked,lane,axis,pairLanes,deltas,scaleFor});
  if(h.scrollSummary) return window.renderScrollSummary(h,{linked,lane,axis,pairLanes,deltas,scaleFor});
  if(h.imageSummary) return window.renderImageWorkflowSummary(h,{actions:()=>actions(true),traversal:()=>traversal(true),linked,lane,axis,pairLanes,deltas,scaleFor,counts,outcomeLinks});
  return `<div class="engineering-overview">${summary()}
    <div class="overview-key"><span><i class="legend-current"></i> C · Current median</span>${base?'<span><i class="legend-baseline"></i> B · Eligible baseline median</span>':""}<span><i class="legend-maximum"></i> p95 / qualifying maximum</span>${base?'<span>Δ current − baseline</span>':""}<span>${h.rules} · no full density indices</span></div>
    <section class="engineering-panel scrolling-panel"><div class="panel-heading"><h2>Scrolling · Grid / Justified / Table</h2><span>Forward · middle load step · 3s</span></div><div class="small-multiples">${scrollChart("Achieved results/s","middleAchievedResultsPerSecond","results/s",{reference:100,referenceField:"middleRequestedResultsPerSecond"})}${scrollChart("Pending (%)","middlePendingVisibleRatioMean","%",{factor:100,fixedMax:100,reference:20})}${scrollChart("Frame p95 (ms)","middleFrameP95Ms","ms",{reference:33.4})}</div></section>
    ${recovery()}${traversal()}${actions()}${guards()}
    <details class="panel-method"><summary>Aggregation, grades & coverage</summary><p>Bars are saved aggregate medians, not individual repetitions. Vertical marks show recorded p95, labelled maximum only where nearest-rank p95 is the maximum for that field's contributor count. Frame p95 is measured within each observation before aggregation; it is not the worst individual frame. Missing values remain gaps. Percentage changes against zero are undefined.</p><p>Action grades remain provisional: sort median ≤1,500ms, seek/detail ≤2,000ms; available observed maxima ≤twice those limits. Cadence ≥80% meets, 50–79% watch, below 50% weak. Degraded/censored outcomes override healthy-only timings. Scrolling uses existing diagnostic references, not full density indices. Field contributors and all-outcome counts are distinct.</p><p>${esc(cp.note)} Summary gaps, stability/paint and hosted-build evidence remain separate. Comparisons retain environment, capture and field/record restrictions; uncontrolled content/cache prevents delivery-causation claims.</p></details>
  </div>`;
};
