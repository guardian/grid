"use strict";
window.renderSearchSummary = function(h, charts) {
  const {rs,base,baseRecords,find,format,esc,href,pair,state} = h;
  const {linked,lane,axis} = charts;
  const DATA=window.KupuaDashboardData, MODEL=window.KupuaSearchModel;
  const finite=n=>typeof n==="number"&&Number.isFinite(n);
  const names={PP1:"Home · pinned query → home top",PP2:"Sort field · no focus",PP3:"Sort field · preserve focus",PP4:"Sort direction · preserve focus",PP5:"Free-to-use filter",PP8:"Warm query · after debounce",PP9:"Remove final CQL chip",JA3:"Metadata query · colour model",JB2:"Include subject facet",JB3:"Exclude colour-profile facet",PP7:"Track click · seek",PP7b:"Drag release · seek",PP7c:"Track click · buffer",JB4:"Track click · indexed",PP11:"Back · deep focused anchor",JA1:"Initial results · buffer",JB1:"Initial results · indexed"};
  const phaseNames={dt_visual_settled_ms:"Stable visual completion",dt_first_visible_frame_ms:"First visible frame",dt_store_ready_ms:"Store ready",dt_ack_ms:"Acknowledgement",dt_status_ms:"Optional status · correlation limited"};
  const phases=state.searchPhase;
  const get=(r,key)=>r?MODEL.value(r,key):null;
  const counterpart=r=>r&&baseRecords.find(b=>b.scenario===r.scenario);
  const outcomeText=r=>{
    if(!r)return "Record absent";
    const o=MODEL.outcomes(r);
    if(!Number.isInteger(o.healthy)||!Number.isInteger(o.degraded)||!Number.isInteger(o.total))return o.reason;
    return `${o.healthy}/${o.total} healthy${/PP[34]$/.test(r.scenario)?` · ${o.degraded}/${o.total} degraded`:""}`;
  };
  function outcomes(r,baseline=false) {
    return linked(r,/^PP[34]$/.test(r?.scenario)&&"degradedCount" in r.raw?"degradedCount":"sampleCount",outcomeText(r),baseline);
  }
  function delta(r,key,unit="ms") {
    if(!r||!base)return "";
    const p=pair(r,key),a=get(r,key),b=p.ok?get(p.b,key):null;
    if(!p.ok||!finite(a)||!finite(b))return `<a class="delta-mini muted" href="${esc(href(r,key))}" title="${esc(p.ok?MODEL.reason(r,key):p.reason)}">Δ C−B —</a>`;
    const d=a-b,relative=b===0?null:100*d/Math.abs(b),sign=n=>n>0?"+":"";
    return `<a class="delta-mini" href="${esc(href(r,key))}">Δ C−B ${sign(d)}${format(d,unit)}${relative===null?' (% n/a · zero baseline)':` (${sign(relative)}${format(relative,"%")})`}</a>`;
  }
  function number(r,key,unit="",baseline=false) {
    const n=get(r,key);
    return finite(n)||typeof n==="boolean"?linked(r,key,format(n,unit),baseline):`<span class="search-unavailable">${linked(r,key,"Unavailable",baseline)} <small>${esc(r?MODEL.reason(r,key):"Record absent")}</small></span>`;
  }
  function pairedBars(r,key,{unit="ms",reference=null}={}) {
    const p=r&&base?pair(r,key):null;
    const before=p?.ok?p.b:null,tail=r?MODEL.tail(r,key):null,oldTail=before?MODEL.tail(before,key):null;
    const values=[get(r,key),tail?.value,get(before,key),oldTail?.value,reference].filter(finite);
    const max=Math.max(1,...values)*1.1;
    const options={max,unit,caption:"Saved median",reference,get:record=>get(record,key),getMax:record=>MODEL.tail(record,key)?.value??null,maxField:tail?.field||key,maxStatistic:r?.family==="density"?"p95":null,showMax:true};
    return lane(r,key,options)+(before?lane(before,key,{...options,baseline:true,maxField:oldTail?.field||key}):"")+delta(r,key,unit);
  }
  function grade(r) {
    const o=r&&MODEL.outcomes(r);
    if(!r||!DATA.validity(r)||r.raw.supported===false)return '<span class="engineering-grade unknown">Unrated</span>';
    if(o.degraded>0)return '<span class="engineering-grade bad">Degraded outcomes</span>';
    if(!["PP3","PP7"].includes(r.scenario))return '<span class="muted">No grade policy</span>';
    if(!finite(get(r,phases))||!finite(get(r,"dt_visual_settled_ms")))return '<span class="engineering-grade unknown">Unrated</span>';
    const a=h.assess(r,r.scenario==="PP3"?"search":"seek");
    return `<span class="engineering-grade ${a.cls}" title="${esc(a.why)}">${esc(a.label)}</span>`;
  }
  function guards(r) {
    if(!r)return "";
    const keys=["anchorDriftPx","focusDriftPx","focusVisible","targetVisible"].filter(key=>key in r.raw);
    return keys.length?`<small class="search-guards">${keys.map(key=>`${esc({anchorDriftPx:"Anchor",focusDriftPx:"Focus",focusVisible:"Focus visible",targetVisible:"Target visible"}[key])}: ${number(r,key,/Px$/.test(key)?"px":"")}`).join(" · ")}</small>`:"";
  }
  function rows(ids) {
    return ids.map(id=>({id,r:find(id)})).filter(({r})=>!r||state.searchRegime==="all"||r.raw.resultRegime===state.searchRegime);
  }
  function actionTable(ids,label,seeking=false) {
    const selected=rows(ids);
    return `<div class="engineering-table-wrap" role="region" tabindex="0" aria-label="${esc(label)}"><table class="engineering-table search-action-table"><thead><tr><th scope="col">Action / recorded regime</th><th scope="col">${esc(phaseNames[phases])} · median / p95 · ms</th><th scope="col">Outcomes & preservation</th><th scope="col">${seeking?"Requested / achieved position":"Settlement assessment · provisional"}</th></tr></thead><tbody>${selected.map(({id,r})=>{
      const before=counterpart(r);
      return `<tr id="search-record-${esc(id)}"><th scope="row">${linked(r,phases,names[id]||id)}<small>${esc(id)} · ${esc(r?.raw.resultRegime||"Regime not recorded")}${r?` · r${esc(r.raw.scenarioRevision??"unknown")}`:""}</small></th><td>${pairedBars(r,phases)}</td><td>C ${outcomes(r)}${before?`<small>B ${outcomes(before,true)}</small>`:base?'<small>Baseline record absent · no substitution</small>':""}${guards(r)}</td><td>${seeking?`${number(r,"requestedRatio","fraction")} → ${number(r,"achievedRatio","fraction")}<small>Recorded ratios, not pixel displacement</small>${grade(r)}`:grade(r)}</td></tr>`;
    }).join("")||'<tr><td colspan="4">No records in this selected regime; no other regime substituted.</td></tr>'}</tbody></table></div>`;
  }
  function support(ids,label,fields) {
    return `<div class="engineering-table-wrap" tabindex="0" role="region" aria-label="${esc(label)}"><table class="engineering-table search-support-table"><thead><tr><th scope="col">Complementary record</th>${fields.map(([key,title])=>`<th scope="col">${esc(title)}</th>`).join("")}</tr></thead><tbody>${ids.map(id=>{const r=find(id);return `<tr><th scope="row">${linked(r,r?.primary,id)}<small>${esc(r?.title||"Record absent")} · independent observation</small></th>${fields.map(([key,title,unit])=>`<td>${key==="cls"?linked(r,key,"Raw shift evidence · support unverified"):number(r,key,unit||"")}${guards(r)&&key==="p95Frame"?guards(r):""}${base&&r&&key!=="cls"?delta(r,key,unit||""):""}</td>`).join("")}</tr>`;}).join("")}</tbody></table></div>`;
  }
  function startup() {
    return `<section class="engineering-panel" id="search-startup" tabindex="-1" aria-label="Startup and initial results"><div class="panel-heading"><h2>Startup & initial results</h2><span>Navigation epoch clock · not in-document action time</span></div><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Startup clocks"><table class="engineering-table search-startup-table"><thead><tr><th scope="col">Startup / regime</th><th scope="col">Store ready · ms</th><th scope="col">First visible frame · ms</th><th scope="col">Stable visual completion · ms</th></tr></thead><tbody>${["JA1","JB1"].map(id=>{const r=find(id);return `<tr><th scope="row">${linked(r,"dt_visual_settled_ms",names[id])}<small>${esc(id)} · ${outcomeText(r)}</small>${base&&!counterpart(r)?'<small>B: long responsiveness absent</small>':""}</th>${["dt_store_ready_ms","dt_first_visible_frame_ms","dt_visual_settled_ms"].map(key=>`<td>${pairedBars(r,key)}</td>`).join("")}</tr>`;}).join("")}</tbody></table></div><details class="panel-method"><summary>Clock assumptions & complementary P1 navigation/rendering evidence</summary><p>JA1/JB1 use controller wall-clock navigation start and browser epoch lifecycle/geometry; cross-process alignment is assumed, not calibrated. Store, visible and settled clocks overlap. These are not a decoded-media or paint completion promise.</p>${support(["P1"],"Initial navigation milestones",[["responseEndMs","Response end","ms"],["domContentLoadedMs","DOMContentLoaded","ms"],["firstContentfulPaintMs","First contentful paint","ms"]])}${support(["P1"],"Initial rendering frames and shifts",[["p95Frame","Frame p95","ms"],["maxFrame","Maximum frame","ms"],["cls","Recorded shift sum",""]])}<p>P1 navigation milestones and frame observation have separate boundaries from JA1/JB1; never add or pool them. Unsupported shift/LoAF capture is not certified by these historical values. Full saved P1 fields remain inspectable.</p></details></section>`;
  }
  function actions() {
    return `<section class="engineering-panel" id="search-actions" tabindex="-1" aria-label="Queries filters Home and sorting"><div class="panel-heading"><h2>Queries, filters, Home & sorting</h2><span>Healthy-only PP3/PP4 timings stay beside all outcomes</span></div><div class="search-controls" aria-label="Local action controls"><label for="search-phase">Action phase<select id="search-phase" data-search-control="searchPhase">${Object.entries(phaseNames).map(([key,text])=>`<option value="${key}"${phases===key?" selected":""}>${esc(text)}</option>`).join("")}</select></label><label for="search-regime">Action / seek regime<select id="search-regime" data-search-control="searchRegime">${["all","buffer","indexed","seek"].map(key=>`<option value="${key}"${state.searchRegime===key?" selected":""}>${key==="all"?"All recorded regimes":key}</option>`).join("")}</select></label></div>${actionTable(["PP1","PP2","PP3","PP4","PP5","PP8","PP9","JA3","JB2","JB3"],"Query and sort action evidence")}<p class="note">${phases==="dt_status_ms"?"Optional status correlation is not established; missing is not instantaneous feedback. ":""}PP8 starts after debounce, not the first keystroke. Phase times overlap; no stacked total. Grades shown only where an existing provisional rule applies.</p><details class="panel-method"><summary>Action clocks, degradation, diagnostics & complementary rendering</summary><p>Acknowledgement is synchronous action acknowledgement, not visible feedback. Optional banner correlation remains unresolved for focused sorting. Accepted PP3/PP4 degradation is lost preservation, never healthy completion; its observations add no healthy timings. Store/request diagnostics and JB2 matched controls have attribution limits and are not additional foreground completions.</p>${support(["P6","P9"],"Sort rendering and preservation",[["p95Frame","Frame p95","ms"],["maxFrame","Maximum frame","ms"],["domChurn","DOM mutations",""]])}<p>${["JB2"].map(id=>{const r=find(id);return ["matched_control_first_visible_ms","matched_control_settled_ms","fetchDuration","seekTime"].map(key=>linked(r,key,`${id} · ${key}`)).join(" · ");}).join("")}. These are saved diagnostics only; route presence does not prove action ownership/freshness.</p></details></section>`;
  }
  function endpoints(r,key,baseline=false) {
    if(!r)return "Record absent";
    const p=DATA.population(r,key);
    if(["invalid","unsupported","absent"].includes(p.state))return linked(r,key,`${p.state}: ${MODEL.reason(r,key)}`,baseline);
    if(!Number.isInteger(p.available)||!Number.isInteger(p.unavailable)||p.available+p.unavailable!==p.total)return linked(r,key,"Contributor population unavailable",baseline);
    return linked(r,key,`${p.available}/${p.total} available · ${p.unavailable}/${p.total} unavailable`,baseline);
  }
  function seeking() {
    return `<section class="engineering-panel" id="search-seeking" tabindex="-1" aria-label="Arbitrary position navigation"><div class="panel-heading"><h2>Arbitrary-position navigation</h2><span>Click / drag-release · buffer / indexed / seek contracts stay distinct</span></div>${actionTable(["PP7","PP7b","PP7c","JB4"],"Click drag and regime navigation",true)}<div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Density seek placement and decoded readiness"><table class="engineering-table"><thead><tr><th scope="col">Density seek · separate observation</th><th scope="col">Placement · ms</th><th scope="col">Decoded media ready · ms</th><th scope="col">Media outcomes</th></tr></thead><tbody>${["grid","justified"].map(d=>{const r=find(`D5-${d}`),before=counterpart(r);return `<tr><th scope="row">${linked(r,"placementMs",`D5 · ${d}`)}<small>Recorded ${esc(r?.raw.resultRegime||"unknown")} regime</small></th><td>${pairedBars(r,"placementMs")}</td><td>${pairedBars(r,"mediaReadyMs")}</td><td>C ${endpoints(r,"mediaReadyMs")}${before?`<small>B ${endpoints(before,"mediaReadyMs",true)}</small>`:""}</td></tr>`;}).join("")}</tbody></table></div><details class="panel-method"><summary>Landing tolerances, separate media clocks & rendering controls</summary><p>PP7/PP7b seek landing is approximate (0.15 ratio tolerance); PP7c buffer and JB4 indexed use their own 0.05 contract. Ratios are not signed pixel preservation. D5 dispatch-to-placement and dispatch-to-decoded-media clocks overlap and must not be added. Loaded/stable responsiveness is not explicit decode or paint.</p>${support(["P3","P3b","P7"],"Seek rendering evidence",[["p95Frame","Frame p95","ms"],["maxFrame","Maximum frame","ms"],["frameCount","Frames",""]])}</details></section>`;
  }
  function restore() {
    const r=find("PP11");
    return `<section class="engineering-panel" id="search-restore" tabindex="-1" aria-label="History and position preservation"><div class="panel-heading"><h2>History & position restoration</h2><span>Back to original deep focused anchor</span></div>${actionTable(["PP11"],"History restoration evidence")}<p class="note">${r?"Saved drift is a signed guard, not a universal no-movement guarantee.":"History observation absent from this checkpoint."} Chip-removal preservation belongs to ${h.searchRecordLink("PP9","PP9 in Queries / filters")}; its observation is not counted twice.</p><details class="panel-method"><summary>Preservation coverage</summary><p>PP9/PP11 computed drift zeros are legitimate observations but do not establish displaced-anchor detector sensitivity (U18 remains open). Visibility is shown only when actually saved; no missing guard becomes true. Search/sort rendering guards are complementary to the responsiveness clocks.</p></details></section>`;
  }
  function signedPair(r,key,baseline=false,extent=1) {
    const n=get(r,key),tail=r?MODEL.tail(r,key):null;
    if(!finite(n))return `<div class="search-paired-value">${number(r,key,"ms",baseline)}</div>`;
    const left=n<0?50-50*Math.abs(n)/extent:50;
    return `<div class="search-signed"><div class="guard-track"><span class="guard-zero" aria-hidden="true"></span><a class="guard-displacement ${baseline?"baseline-guard":""}" style="left:${left}%;width:${Math.max(.4,50*Math.abs(n)/extent)}%" href="${esc(href(r,key,baseline))}" aria-label="${esc(`${baseline?"Baseline":"Current"} recorded paired delta ${format(n,"ms")}`)}" data-paired-field="${key}" data-paired-value="${n}" data-baseline="${baseline}"></a></div><strong>${linked(r,key,format(n,"ms"),baseline)}</strong>${finite(tail?.value)?`<small>${esc(tail.label)} ${linked(r,tail.field,format(tail.value,"ms"),baseline,"", "p95")}</small>`:""}</div>`;
  }
  function censor(r,key) {
    const tail=r?MODEL.tail(r,key):null;
    return `${number(r,key)} / ${finite(tail?.value)?linked(r,tail.field,format(tail.value),false,"","p95"):"Unavailable"}`;
  }
  function refresh() {
    const clockFields=[["Data","data publication","DataReadyMs"],["Placement","placement","PlacementMs"],["Media","decoded media","MediaReadyMs"]];
    return `<section class="engineering-panel" id="search-refresh" tabindex="-1" aria-label="Search refresh under media load"><div class="panel-heading"><h2>Search refresh under media load</h2><span>D11 · same query · 80ms latency / 4Mibit/s · recorded paired differences</span></div><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Quiet busy and recorded within repetition paired evidence"><table class="engineering-table search-refresh-table"><thead><tr><th scope="col">Density / clock</th><th scope="col">Quiet · median / p95 · ms</th><th scope="col">Busy · median / p95 · ms</th><th scope="col">Recorded busy − quiet · ms</th><th scope="col">Paired contributors / censoring</th></tr></thead><tbody>${["grid","justified"].flatMap(d=>clockFields.map(([part,label,arm])=>{
      const r=find(`D11-${d}`),before=counterpart(r),key=`refresh${part}DeltaMs`,p=r&&base?pair(r,key):null;
      const values=[get(r,key),p?.ok?get(p.b,key):null].filter(finite).map(Math.abs),extent=Math.max(1,...values)*1.1;
      const counts=(record,baseline=false)=>{const o=MODEL.refreshOutcomes(record,key);return linked(record,key,Number.isInteger(o.available)&&Number.isInteger(o.total)?`${o.available}/${o.total} paired contributors · ${o.unavailable}/${o.total} unavailable · ${o.reason}`:o.reason,baseline);};
      return `<tr><th scope="row">${linked(r,key,`${d} · ${label}`)}<small>D11 · ${esc(r?.raw.resultRegime||"unknown")}</small></th><td>${pairedBars(r,`quiet${arm}`)}</td><td>${pairedBars(r,`busy${arm}`)}</td><td>C ${signedPair(r,key,false,extent)}${p?.ok?`B ${signedPair(p.b,key,true,extent)}`:""}${delta(r,key)}</td><td>C ${r?counts(r):"Record absent"}${before?`<small>B ${counts(before,true)}</small>`:""}<small>Isolation censor (median / p95): ${censor(r,"refreshComparisonCensored")}</small>${part==="Media"?`<small>Media censor median / p95 · quiet: ${censor(r,"quietMediaCensored")} · busy: ${censor(r,"busyMediaCensored")}</small>`:""}</td></tr>`;
    })).join("")}</tbody></table></div><p class="note">Paired values are saved busy−quiet differences within repetitions, not differences of aggregate arm medians. Δ C−B compares that saved field across checkpoints.</p><details class="panel-method"><summary>Isolation, endpoints, requests & limitations</summary><p>Drained/active arms share restored source and constrained priming; arm order alternates. Invalid traffic isolation withholds the paired conclusion, not necessarily each arm's independent clock. Decoded endpoints can be censored independently of data/placement pairing. Partial fields keep contributors but no full-population timing. Request overlap does not isolate image causality; source/content/cache differ. D11's sampled-not-latched foreground limitation remains.</p><p>${["grid","justified"].map(d=>{const r=find(`D11-${d}`);return ["quietMediaPendingAtDispatch","busyMediaPendingAtDispatch","quietDataPendingAtDispatch","busyDataPendingAtDispatch"].map(key=>linked(r,key,`${d} · ${key}`)).join(" · ");}).join(" · ")}</p></details></section>`;
  }
  function background() {
    const r=find("PP10"),before=counterpart(r);
    return `<section class="engineering-panel" id="search-background" tabindex="-1" aria-label="Background map publication"><div class="panel-heading"><h2>Background diagnostics · position map</h2><span>PP10 · not foreground responsiveness · no grade</span></div><div class="engineering-table-wrap" tabindex="0" role="region" aria-label="Background publication evidence"><table class="engineering-table search-background-table"><thead><tr><th scope="col">Diagnostic</th><th scope="col">Map publication · median / p95 · ms</th><th scope="col">Map entries</th><th scope="col">Coverage</th></tr></thead><tbody><tr><th scope="row">${linked(r,"dt_store_ready_ms","PP10 · background publication")}<small>Fixed indexed context</small></th><td>${pairedBars(r,"dt_store_ready_ms")}</td><td>C ${number(r,"mapEntryCount")}${before?`<small>B ${number(before,"mapEntryCount","",true)}</small>`:""}</td><td>${r&&DATA.validity(r)&&r.raw.supported!==false?linked(r,"sampleCount",`n=${r.raw.sampleCount} publication observations`):linked(r,"sampleCount",r?MODEL.reason(r,"dt_store_ready_ms"):"Record absent")}<small>Foreground visible / settled phases inapplicable, not zero.</small></td></tr></tbody></table></div></section>`;
  }
  return `<div class="engineering-overview search-summary" role="region" aria-label="Search and Navigation summary"><div class="image-summary-toolbar"><span class="pill">${rs.filter(r=>r.area==="search").length} Search & Navigation records available</span><span class="pill">${h.cp.synthetic?"Synthetic fixtures · not observed":"Canonical aggregates · independent clocks"}</span>${h.overviewLink}${h.historyLink}<div class="image-group-links" aria-label="Search groups">${[["startup","Startup"],["actions","Queries / sorting"],["seeking","Seeking"],["restore","History / preservation"],["refresh","Refresh under load"],["background","Background"]].map(([g,t])=>h.searchGroupLink(g,t)).join("")}</div></div><div class="overview-key"><span><i class="legend-current"></i> C · saved median</span>${base?'<span><i class="legend-baseline"></i> B · eligible baseline median</span><span>Δ C−B · descriptive only</span>':""}<span><i class="legend-maximum"></i> Recorded p95 / qualifying observed maximum</span><span>${h.rules} · thresholds not approved</span></div>${startup()}${actions()}${seeking()}${restore()}${refresh()}${background()}<details class="panel-method"><summary>Shared coverage and measurement limits</summary><p>No clocks are added, pooled or treated as independent repetitions. Median/p95 and contributor populations come from saved aggregates. Healthy-only PP3/PP4 timing never replaces current degraded outcomes. Missing long baseline stays absent; incompatible revisions keep current values and withhold comparison. Invalid/unsupported captures keep reasons and raw evidence, not numerical grades or substituted metrics. Paint/decode/geometry and unresolved status/store attribution remain distinct. Related density transitions belong to ${h.scrollSummaryLink}; detail/traversal belong to ${h.imageSummaryLink}. No campaign or producer correctness is certified by this presentation.</p></details></div>`;
};
