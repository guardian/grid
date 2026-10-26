"use strict";
(() => {
  const DATA = window.KupuaDashboardData;
  const {records, entries, checkpoints} = DATA.build({audit:window.__AUDIT_LOG__,perceived:window.__PERCEIVED_LOG__,density:window.__DENSITY_LOG__},[...DATA.definitions,...DATA.campaignDefinitions(window.__CAMPAIGN_LOG__)]);
  let allHistory = null;
  const ASSESSMENT = window.ASSESSMENT;
  const $ = id => document.getElementById(id);
  document.addEventListener("keydown", event => {
    if(event.key === "Tab") document.documentElement.dataset.keyboardFocus = "true";
    if(!["ArrowLeft","ArrowRight"].includes(event.key) || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if(!["scroll","search"].includes(state?.view) || state.evidence || state.scenario || window.getSelection()?.toString()) return;
    if(event.target.closest?.('input,select,textarea,button,a,summary,[contenteditable],[role="slider"],[tabindex="0"]')) return;
    const historyMode = state.mode === "history";
    const step = event.key === "ArrowRight" ? 1 : -1;
    if(state.view === "search"){
      const bounds = $("search-actions")?.getBoundingClientRect();
      const phase = $("search-phase");
      if(historyMode || state.group && state.group !== "actions" || !bounds || bounds.bottom <= 0 || bounds.top >= innerHeight || !phase?.options.length) return;
      const next = phase.options[(phase.selectedIndex + step + phase.options.length) % phase.options.length];
      event.preventDefault();
      location.hash = url({searchPhase:next.value,group:"actions",evidence:"",metric:"",scenario:"",side:""});
      return;
    }
    if(!historyMode){
      const bounds = $("scroll-browsing")?.getBoundingClientRect();
      if(state.group && state.group !== "browsing" || !bounds || bounds.bottom <= 0 || bounds.top >= innerHeight) return;
    }
    const direction = document.querySelector(historyMode ? '[data-h="dir"]' : '#scroll-direction');
    const phase = document.querySelector(historyMode ? '[data-h="phase"]' : '#scroll-phase');
    if(!direction || !phase) return;
    const directions = direction.disabled ? ["forward"] : [...direction.options].map(option => option.value);
    const scenes = directions.flatMap(value => [...phase.options]
      .filter(option => option.value !== "reversal" || value === "backward")
      .map(option => ({direction:value,phase:option.value})));
    const index = scenes.findIndex(scene => scene.direction === (direction.disabled ? "forward" : direction.value) && scene.phase === phase.value);
    const next = scenes[index < 0 ? step > 0 ? 0 : scenes.length - 1 : (index + step + scenes.length) % scenes.length];
    if(!next) return;
    event.preventDefault();
    if(historyMode){
      const params = new URLSearchParams(location.hash.slice(1));
      params.delete("h.data");
      params.set("h.dir",next.direction);
      params.set("h.phase",next.phase);
      location.hash = `#${params}`;
    } else location.hash = url({...next,group:"browsing",evidence:"",metric:"",scenario:"",side:""});
  });
  document.addEventListener("pointerdown", () => {
    delete document.documentElement.dataset.keyboardFocus;
  }, true);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const format = (value, unit = "") => value === undefined ? "Absent" : value === null ? "Null · unavailable" : typeof value === "boolean" ? String(value) : finite(value) ? `${value.toLocaleString("en-GB",{maximumFractionDigits:unit==="fraction"?5:2})}${unit ? ` ${unit}` : ""}` : esc(typeof value==="object"?JSON.stringify(value):value);
  const cpRecords = cp => cp.members.flatMap(id => entries[id].records.map(id => records[id]));
  const find = (cp, scenario) => cpRecords(cp).find(r => r.scenario === scenario);
  const value = DATA.measure;
  const stat = DATA.statistic;
  let state;
  const evidenceValue=(r,field)=>(r?.area==="scroll"||r?.area==="search"&&r.family==="density")&&state.statistic==="p95"?window.KupuaScrollModel.value(r,field,"p95"):value(r,field);
  const sections = {overview:"Overview",search:"Search & Navigation",scroll:"Scrolling & Layout",images:"Image Workflows",rules:"Rules"};
  const workflowViews = ["search","scroll","images"];
  function readState() {
    const p = new URLSearchParams(location.hash.slice(1));
    const cold = !p.has("checkpoint") && !p.has("baseline");
    const campaigns = (window.__CAMPAIGN_LOG__?.entries ?? [])
      .filter(campaign => checkpoints[`campaign:${campaign.campaignId}`])
      .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)));
    const defaultCheckpoint = cold && campaigns[0] ? `campaign:${campaigns[0].campaignId}` : "recorded";
    const defaultBaseline = cold && campaigns[1] ? `campaign:${campaigns[1].campaignId}` : "none";
    return {cp:checkpoints[p.get("checkpoint")] && p.get("checkpoint")!=="legacy" ? p.get("checkpoint") : defaultCheckpoint,base:checkpoints[p.get("baseline")] ? p.get("baseline") : defaultBaseline,view:sections[p.get("view")] ? p.get("view") : "overview",mode:p.get("mode")==="history"&&workflowViews.includes(p.get("view"))?"history":"",evidence:p.get("evidence") || "",metric:p.get("metric") || "",scenario:p.get("scenario") || "",side:p.get("side")==="baseline"?"baseline":"",group:["detail","traversal","return","selection","browsing","recovery","layout","maintenance","startup","actions","seeking","restore","refresh","background"].includes(p.get("group"))?p.get("group"):"",
      density:["all","grid","justified","table"].includes(p.get("density"))?p.get("density"):"all",
      direction:p.get("direction")==="backward"?"backward":"forward",phase:["early","middle","late","reversal"].includes(p.get("phase"))?p.get("phase"):"middle",
      workload:p.get("workload")==="constrained"?"constrained":"ordinary",statistic:p.get("statistic")==="p95"?"p95":"median",
      searchPhase:["dt_store_ready_ms","dt_first_visible_frame_ms","dt_visual_settled_ms","dt_ack_ms","dt_status_ms"].includes(p.get("searchPhase"))?p.get("searchPhase"):"dt_visual_settled_ms",
      searchRegime:["all","buffer","indexed","seek"].includes(p.get("searchRegime"))?p.get("searchRegime"):"all"};
  }
  // Links default to Compare; only the mode toggle, workflow nav and selectors keep History.
  function url(patch = {}) {
    const next={...state,mode:"",...patch},route=DATA.route(next);
    if(next.mode!=="history")return route;
    const kept=[...new URLSearchParams(location.hash.slice(1))].filter(([key])=>/^(h|c|b)\./.test(key));
    return kept.length?`${route}&${new URLSearchParams(kept)}`:route;
  }
  const historyLink = view => link("History",{view,mode:"history",evidence:"",metric:"",scenario:"",side:"",group:""});
  function modeToggle() {
    const tab=(mode,text)=>`<a href="${esc(url({mode,evidence:"",metric:"",scenario:"",side:"",group:""}))}"${state.mode===mode?' aria-current="page"':""}>${text}</a>`;
    return `<nav class="mode-toggle" aria-label="${esc(sections[state.view])} views">${tab("","Compare")}${tab("history","History")}</nav>`;
  }
  const link = (text, patch, cls = "") => `<a class="${cls}" href="${esc(url(patch))}">${esc(text)}</a>`;
  const imageGroup = r => r.workflow==="Traversal"?"traversal":r.workflow==="Fullscreen return"?"return":r.workflow==="Selection & panels"?"selection":"detail";
  const scrollGroup = r => /^D8-/.test(r.scenario)?"recovery":/^D7-/.test(r.scenario)?"maintenance":/^(D[346]-|P4|P11|P16|PP6)/.test(r.scenario)?"layout":"browsing";
  const scrollContext = () => ["browsing","recovery","layout","maintenance"].includes(state.group);
  const searchContext = () => ["startup","actions","seeking","restore","refresh","background"].includes(state.group);
  const searchGroup = r => window.KupuaSearchModel.group(r);
  const baselineEvidence = () => state.side==="baseline";
  const evidenceCheckpoint = () => checkpoints[baselineEvidence()?state.base:state.cp];
  const go = (r, text, metric = "") => r ? link(text,{view:r.area,evidence:r.id,scenario:r.scenario,metric,group:scrollContext()||searchContext()?state.group:r.area==="scroll"?scrollGroup(r):r.area==="search"?searchGroup(r):r.area==="images"?imageGroup(r):""}) : `<span class="muted">No record in this checkpoint</span>`;
  const grade = (label, cls) => `<strong class="grade ${cls}">${label}</strong>`;
  function environmentPair(cp, base) {
    if(!base) return {ok:false,reason:"No baseline selected. Current experience can still be assessed; change cannot."};
    if(cp === base) return {ok:false,reason:"Same checkpoint selected twice. This is not a change comparison."};
    if(cp.synthetic !== base.synthetic) return {ok:false,reason:"Blocked: recorded and synthetic checkpoints are not comparable evidence."};
    const result=window.KupuaPerfComparison.compare(cp,base);
    return {ok:result.compatible,reason:result.reason};
  }
  function recordPair(r, base, current=checkpoints[state.cp], field=r.primary) {
    const pair=environmentPair(current,base);
    if(!pair.ok) {
      const b=base && find(base,r.scenario);
      const mismatch=b && r.raw.scenarioRevision!==b.raw.scenarioRevision;
      return {...pair,reason:pair.reason+(mismatch?` Record revisions also differ: r${r.raw.scenarioRevision} / r${b.raw.scenarioRevision}. No cross-revision series.`:"")};
    }
    const b=find(base,r.scenario);
    if(!b) return {ok:false,reason:"Baseline profile did not include this observation. No substitution from another checkpoint."};
    return DATA.recordPair(r,b,entries[r.entry],entries[b.entry],field);
  }
  const selectedPair = (r,field=r.primary) => baselineEvidence()
    ? recordPair(r,checkpoints[state.cp],checkpoints[state.base],field)
    : recordPair(r,checkpoints[state.base],checkpoints[state.cp],field);
  function currentChange(r) {
    if(baselineEvidence()) {
      const current=find(checkpoints[state.cp],r.scenario);
      if(!current)return '<div class="comparison">Current checkpoint has no matching record. No comparison or substitution.</div>';
      r={...current,primary:r.primary,unit:r.unit};
    }
    const base=checkpoints[state.base];
    const pair=recordPair(r,base);
    if(!pair.ok)return `<div class="comparison"><strong>Change: unavailable.</strong> ${esc(pair.reason)}</div>`;
    const a=evidenceValue(r,r.primary),b=evidenceValue(pair.b,r.primary);
    if(!finite(a)||!finite(b)) return `<div class="comparison"><strong>No timing delta.</strong> One or both selected endpoints have unavailable latency; no successful result is substituted. ${esc(pair.reason)}</div>`;
    const current=ASSESSMENT.completion(r), before=ASSESSMENT.completion(pair.b);
    const counts=current&&before?` Qualifying outcomes: ${current.ready}/${current.total} current versus ${before.ready}/${before.total} baseline; unavailable/degraded counts remain separate.`:"";
    return `<div class="comparison"><strong>${r.unit==="ms"?"Available-timing difference":"Selected difference"}:</strong> ${format(b,r.unit)} → ${format(a,r.unit)} (${a-b>0?"+":""}${format(a-b,r.unit)}).${esc(counts)} ${esc(pair.reason)}${r.scenario.startsWith("P14") ? " Landing-clock limitation still applies." : ""}</div>`;
  }
  function outcome(r) {
    const x=r.raw;
    if(!DATA.validity(r))return "Invalid capture or inconsistent outcome counts; no timing assessment.";
    if(x.supported===false)return "Unsupported measurement. Saved fields remain raw evidence, not verified completion or healthy-zero outcomes.";
    if(r.scenario.startsWith("P14")) {
      const c=ASSESSMENT.completion(r);
      const horizon=x.scenarioRevision===2?"5,000 ms historical observation horizon":x.scenarioRevision===3?"15,000 ms observation horizon":"Observation horizon unavailable for this revision";
      return `${c?`${c.ready}/${c.total} final landings completed · ${c.unavailable}/${c.total} censored`:"Completion counts unavailable · historical outcomes not recorded"} · ${horizon}. Completion is not within-cadence responsiveness.`;
    }
    if(r.scenario==="P13c") {
      const c=ASSESSMENT.completion(r);
      if(!c)return `Completion counts unavailable · historical outcomes not recorded. Saved boundary: ${r.boundary}. Observation horizon not recorded.`;
      return `${c.ready}/${c.total} decoded/stable · ${c.unavailable}/${c.total} incomplete/censored · ${format(x.detailImageFailedCount)} observed image errors (subset of incomplete, not an extra count) · ${format(x.detailObservationLimitMs,"ms")} horizon.`;
    }
    if(/^D11-/.test(r.scenario)) {
      const key=/^refresh(?:Data|Placement|Media)DeltaMs$/.test(r.primary)?r.primary:"refreshMediaDeltaMs",o=window.KupuaSearchModel.refreshOutcomes(r,key);
      return `${o.available===null?o.reason:`${o.available}/${o.total} paired contributors · ${o.unavailable}/${o.total} unavailable. ${o.reason}`} Recorded within-repetition pairing, not an arm-median subtraction. Media censoring is separate from isolation.`;
    }
    if(/^D5-/.test(r.scenario)) {
      const p=DATA.population(r,"mediaReadyMs");
      return `${p.available??"Unknown"}/${p.total??"unknown"} decoded-media contributors; ${p.unavailable??"unknown"} unavailable. Placement and media readiness share a start; no stopped-recovery clock applies.`;
    }
    if(r.scenario==="PP10")return "Background position-map publication in fixed indexed context. Foreground visible/settled phases and user-action grades are inapplicable, not instantaneous.";
    if(r.scenario.startsWith("D")) {
      if(x.supported===false)return "Unsupported observer · 0 samples · latency unavailable. No success, failure or healthy-zero rate can be calculated.";
      const m=x.metrics.stopMediaReadyMs;
      if(!m)return `${x.sampleCount} observations; this record has no stopped-media endpoint. See field-specific availability.`;
      return `${m.sampleCount}/${x.sampleCount} media endpoints available · ${m.unavailableCount}/${x.sampleCount} unavailable/censored · 4,000ms horizon. ${m.median===null && m.sampleCount>0 ? "Partial completion: aggregate latency intentionally unavailable." : ""}`;
    }
    if(finite(x.degradedCount)){const counts=DATA.completion(r);return `${counts.ready}/${counts.total} healthy · ${counts.unavailable}/${counts.total} degraded · ${finite(value(r,"dt_visual_settled_ms"))?`${format(value(r,"dt_visual_settled_ms"),"ms")} healthy-only settlement median`:"healthy-settlement latency unavailable"}. Publication does not make degraded outcomes healthy.`;}
    if(r.scenario==="JB5" && "anchorDriftPx" in x)return `${x.sampleCount} synthetic observations · target visible: ${x.targetVisible} · anchor displacement ${format(x.anchorDriftPx,"px")}. ${x.targetVisible===false?"Target preservation failed.":"Visibility does not erase signed displacement."}`;
    return `${x.sampleCount} published observations · timing availability does not certify every application guard.`;
  }
  function assess(r, type) {
    if(!r || r.raw.supported===false || !DATA.validity(r))return {label:"Unrated",cls:"unknown",why:"Required evidence is absent, unsupported or invalid."};
    if(!["P13c","P14a","P14b","P14c","P14d","PP3","PP7","JA2"].includes(r.scenario))return {label:"Unrated",cls:"unknown",why:"No action-grade rule applies to this record. Inspect its own fields and boundaries."};
    if(type==="traversal")return ASSESSMENT.traversalGrade(r);
    if(r.raw.degradedCount || r.raw.landingCensoredCount || r.raw.detailImageCensoredCount) return {label:"Adverse outcome",cls:"bad",why:"Completion loss overrides a successful-only timing grade."};
    const gradingField=["PP3","PP7","JA2"].includes(r.scenario)?"dt_visual_settled_ms":r.primary;
    const n=value(r,gradingField), max=DATA.tailLabel(r,"dt_visual_settled_p95_ms")==="Observed maximum"?value(r,"dt_visual_settled_p95_ms"):null;
    if(!finite(n))return {label:"Unrated",cls:"unknown",why:"No successful timing available."};
    const limit=type==="seek" ? 2000 : type==="detail" ? 2000 : 1500;
    const painful=n>limit*2 || (finite(max)&&max>limit*2);
    return {label:painful?"Far outside proposed band":n>limit?"Outside proposed band":"Meets proposed band",cls:"unknown",why:`${format(n,"ms")} median${finite(max)?`, ${format(max,"ms")} observed maximum`:""}; provisional ${format(limit,"ms")} median expectation${finite(max)?`, maximum ≤${format(limit*2,"ms")}`:"; tail not imported"}.`};
  }
  function evidenceConfidence(r) {
    const confidence=ASSESSMENT.confidence(r);
    return `<span class="confidence"><strong>Evidence confidence: ${esc(confidence.label)}.</strong> ${esc(confidence.note)}</span>`;
  }
  function overview(cp, imageSummary=false, scrollSummary=false, searchSummary=false) {
    const densityEntry=checkpoint=>checkpoint?.members.map(id=>entries[id]).find(entry=>entry.family==="density");
    return window.renderEngineeringOverview({
      trend:(r,key,valueOf)=>DATA.trend(allHistory??=DATA.buildAll({audit:window.__AUDIT_LOG__,perceived:window.__PERCEIVED_LOG__,density:window.__DENSITY_LOG__}),r,key,valueOf),
      historyHref:view=>url({view,mode:"history",evidence:"",metric:"",scenario:"",side:"",group:""}),
      historyLink:historyLink(state.view),
      cp, rs:cpRecords(cp), base:checkpoints[state.base], baseRecords:checkpoints[state.base]?cpRecords(checkpoints[state.base]):[], read:value, stat, format, esc, imageSummary, scrollSummary, searchSummary, state,
      densityEntry:densityEntry(cp),baselineDensityEntry:densityEntry(checkpoints[state.base]),
      scrollGroupLink:(group,text)=>link(text,{view:"scroll",evidence:"",metric:"",scenario:"",side:"",group}),
      searchGroupLink:(group,text)=>link(text,{view:"search",evidence:"",metric:"",scenario:"",side:"",group}),
      searchRecordLink:(scenario,text)=>link(text,{view:"search",evidence:"",metric:"",scenario:"",side:"",group:"actions"}),
      scrollSummaryLink:link("Scrolling & Layout",{view:"scroll",evidence:"",metric:"",scenario:"",side:"",group:""}),
      imageSummaryLink:link("Image Workflows",{view:"images",evidence:"",metric:"",scenario:"",side:"",group:""}),
      find:id=>find(cp,id), assess, population:DATA.population, pair:(r,field)=>recordPair(r,checkpoints[state.base],cp,field),
      href:(r,metric,baseline=false,statistic=null)=>url({view:r.area,evidence:r.id,scenario:r.scenario,metric,side:baseline?"baseline":"",statistic:statistic||(scrollSummary?state.statistic:"median"),group:searchSummary?searchGroup(r):scrollSummary?scrollGroup(r):r.area==="scroll"?scrollGroup(r):r.area==="search"?searchGroup(r):r.area==="images"?imageGroup(r):""}),
      summaryLink:(group,text)=>link(text,{view:"images",evidence:"",metric:"",scenario:"",side:"",group}),
      groupLink:(group,text)=>link(text,{view:"images",evidence:"",metric:"",scenario:"",side:"",group}),
      overviewLink:link("Overview",{view:"overview",evidence:"",metric:"",scenario:"",side:"",group:""}),
      rules:link("Provisional action grades",{view:"rules",evidence:"",metric:"",scenario:"",side:"",group:""})
    });
  }
  const metricNames={detailImageReadyMs:["Returned media decoded & stable","ms"],detailMetadataReadyMs:["Metadata ready","ms"],detailLookupMs:["Singleton response","ms"],detailObservationLimitMs:["Observation horizon (not latency)","ms"],detailImageReadyCount:["Ready count","of 4"],detailImageCensoredCount:["Incomplete/censored count","of 4"],detailImageFailedCount:["Image errors (subset of incomplete)","of 4"],mediaResourceReusedCount:["Exact warmed URL reused","of 4"],mediaResourceNotReusedCount:["Exact warmed URL not reused","of 4"],mediaResourceReuseUnknownCount:["URL reuse evidence unavailable","of 4"],landingRenderMs:["Limited eventual landing load","ms"],renderedCount:["Loaded within cadence (median count)","images"],renderedTotal:["Images requested per observation","images"],landingRenderedCount:["Final landing completion count","of 4"],landingCensoredCount:["Final landing censored count","of 4"],landingAlreadyRendered:["Legacy already-rendered indicator (U1 limited)",""],cadenceMs:["Input cadence","ms"],dt_visual_settled_ms:["Visual settlement median","ms"],dt_visual_settled_p95_ms:["Visual settlement p95 / observed maximum","ms"],dt_store_ready_ms:["Store ready (separate phase)","ms"],middleFrameP95Ms:["Middle step · frame-p95","ms"],middlePendingVisibleRatioMean:["Middle step · pending visible slots","fraction"],middleAchievedResultsPerSecond:["Middle step · achieved rate","results/s"],middleRequestedResultsPerSecond:["Middle step · requested rate","results/s"],middleBufferEdgeBlockedMs:["Middle step · blocked input","ms"],middleDrivenDurationMs:["Middle step · driven duration","ms"],stopMediaReadyMs:["Stopped-cohort decoded media","ms"],stopMediaCensored:["Stopped media censor flag","0/1"],stopDataReadyMs:["Stopped-cohort data ready","ms"],stopDataCensored:["Stopped data censor flag","0/1"],postReadyCohortStable:["Post-ready cohort stable","0/1"],healthyCount:["Healthy outcomes","of 4"],degradedCount:["Degraded outcomes","of 4"],anchorDriftPx:["Signed anchor displacement","px"],targetVisible:["Target visible after return","boolean"],paintMs:["Paint observation","ms"],supported:["Observer supported","boolean"]};
  function evidenceRows(r) {
    return [...new Set([...Object.keys(r.raw).filter(key=>key!=="metrics"),...Object.keys(r.raw.metrics||{}),...(state.metric?[state.metric]:[])])];
  }
  function table(r) {
    const rows=evidenceRows(r);
    return `<div class="table-wrap" role="region" aria-label="Exact evidence table; scroll horizontally on small screens" tabindex="0"><table><caption>Canonical observation · selected fields, not reconstructed repetitions</caption><thead><tr><th scope="col">Measurement / stable link</th><th scope="col">${baselineEvidence()?"Selected baseline":"Current"}</th><th scope="col">${baselineEvidence()?"Current counterpart":"Baseline"}</th><th scope="col">Samples & qualification</th></tr></thead><tbody>${rows.map(k=>{
      const pair=selectedPair(r,k),m=r.raw.metrics?.[k],[name,storedUnit]=k==="dt_visual_settled_p95_ms"?["Visual settlement p95","ms"]:metricNames[k]||[k,""];
      const population=DATA.population(r,k),counts=ASSESSMENT.completion(r);
      const unit=storedUnit==="of 4"?`of ${counts?.total??r.raw.sampleCount}`:storedUnit;
      const beforeCounts=pair.b&&ASSESSMENT.completion(pair.b);
      const baselineUnit=storedUnit==="of 4"&&pair.b?`of ${beforeCounts?.total??pair.b.raw.sampleCount}`:unit;
      const qualification=`${population.state} · ${population.available??"unknown"} field contributors / ${population.total??"unknown"} outcomes; ${population.unavailable??"not recorded"} unavailable. ${/renderedCount|renderedTotal/.test(k)?"Per-observation count summary, not independent image trials.":""}`;
      const sourceValue=Object.prototype.hasOwnProperty.call(r.raw.metrics||{},k)?DATA.read(r,k):r.raw[k];
      return `<tr id="metric-${esc(k)}" class="${state.metric===k?"selected":""}"><th scope="row" tabindex="-1">${go(r,name,k)}<br><code>${esc(k)}</code></th><td>${format(sourceValue,unit)}</td><td>${pair.ok?format(value(pair.b,k),baselineUnit):`Not comparable: ${esc(pair.reason)}`}</td><td>${esc(qualification)}${m?` ${DATA.tailLabel(r,k)} ${format(m.p95,unit)}.`:""}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }
  function chart(r) {
    if(r.raw.supported===false || !DATA.validity(r))return '<div class="empty">No numeric chart: unsupported or invalid capture. Raw fields remain inspectable.</div>';
    if(r.scenario.startsWith("P14")) {
      const evidence=ASSESSMENT.traversalEvidence(r);
      if(!evidence.usable)return `<div class="empty">No numeric cadence chart: ${esc(evidence.reason)}.</div>`;
      return `<figure class="bars" aria-label="Within-cadence loaded images"><figcaption>Kept up with input · ${r.raw.cadenceMs}ms between actions</figcaption><div class="bar-row"><span>Median loaded</span><div class="track" aria-hidden="true"><div class="bar ${baselineEvidence()?"baseline":""}" style="width:${evidence.percentage}%"></div></div><strong>${evidence.loaded} / ${evidence.total}</strong></div><p class="note">A count summary across ${r.raw.sampleCount} observations, not a sequence of which images loaded. This load check is neither explicit decode nor paint.</p></figure>`;
    }
    if(r.family==="density"&&/^refresh(?:Data|Placement|Media)DeltaMs$/.test(r.primary)) {
      const pair=selectedPair(r),points=[{record:r,label:baselineEvidence()?"Selected baseline":"Current"},...(pair.ok?[{record:pair.b,label:baselineEvidence()?"Current":"Baseline"}]:[])].map(p=>({...p,v:evidenceValue(p.record,r.primary)})).filter(p=>finite(p.v));
      if(!points.length)return '<div class="empty">Paired value unavailable; no arm-median subtraction or alternate field substituted. Inspect censor/population evidence below.</div>';
      const extent=Math.max(1,...points.map(p=>Math.abs(p.v)));
      return `<figure aria-label="Recorded signed within-repetition paired delta"><figcaption>Saved busy − quiet · signed paired delta, not subtraction of arm medians</figcaption>${points.map(p=>`<div class="signed-axis" aria-hidden="true"><span class="negative" style="${p.v>0?"left:50%;right:auto;":""}width:${50*Math.abs(p.v)/extent}%"></span></div><p>${esc(p.label)}: ${format(p.v,"ms")}</p>`).join("")}</figure>`;
    }
    if(r.unit==="px" && finite(evidenceValue(r,r.primary))) {
      const drift=evidenceValue(r,r.primary),extent=Math.max(20,Math.abs(drift));
      const visible=r.raw.targetVisible??r.raw.focusVisible;
      return `<figure aria-label="Signed displacement, ${format(drift,"px")}"><figcaption>Displacement retains its sign and magnitude</figcaption><div class="signed-axis" aria-hidden="true"><span class="negative" style="${drift>0?"left:50%;right:auto;":""}width:${50*Math.abs(drift)/extent}%"></span></div><div class="axis-labels"><span>−${extent}px</span><strong>${format(drift,"px")} observed</strong><span>0</span><span>+${extent}px</span></div><p class="note">Target visible=${format(visible)}. ${visible===false?"False visibility is an adverse outcome, not an empty chart.":"Visibility does not erase displacement."}</p></figure>`;
    }
    const pair=selectedPair(r);
    const current=evidenceValue(r,r.primary);
    if(!finite(current))return `<div class="empty"><strong>No latency bar.</strong><p>The endpoint is ${r.raw.supported===false?"unsupported":"unavailable"}. Plotting zero or the observation deadline would invent a measurement.</p></div>`;
    const points=[{label:baselineEvidence()?"Selected baseline":"Current",v:current,baseline:baselineEvidence()},...(pair.ok&&finite(evidenceValue(pair.b,r.primary))?[{label:baselineEvidence()?"Current":"Baseline",v:evidenceValue(pair.b,r.primary),baseline:!baselineEvidence()}]:[])];
    const max=Math.max(...points.map(p=>p.v),1);
    return `<figure class="bars" aria-label="${esc(metricNames[r.primary]?.[0]||r.primary)}"><figcaption>${esc(metricNames[r.primary]?.[0]||r.primary)}</figcaption>${points.map(p=>`<div class="bar-row"><span>${p.label}</span><div class="track" aria-hidden="true"><div class="bar ${p.baseline?"baseline":""}" style="width:${100*p.v/max}%"></div></div><strong>${format(p.v,r.unit)}</strong></div>`).join("")}<p class="note">Zero-based bars within this metric only; no continuous history across contracts. Exact values and availability are in the table.</p></figure>`;
  }
  function recordView(r) {
    if(["scroll","search"].includes(r.area)&&state.metric) {
      const metric=state.metric;
      const unit=/Ms$|^p95Frame$|_ms$/.test(metric)?"ms":/Px$/.test(metric)?"px":/Ratio|Fraction/.test(metric)?"fraction":/ResultsPerSecond$/.test(metric)?"results/s":"";
      r={...r,primary:metric,unit};
    }
    const entry=entries[r.entry];
    const a=assess(records[r.id]||r,r.scenario.startsWith("P14")?"traversal":r.scenario==="PP7"?"seek":r.area==="images"?"detail":"search");
    const x=r.raw;
    let measures=`<div class="measure"><strong>${DATA.population(r,r.primary).state==="absent"?"Absent · unavailable":format(evidenceValue(r,r.primary),r.unit)}</strong><span>${r.area==="scroll"||r.family==="density"?`${state.statistic==="p95"?"p95":"Median"} · `:""}${esc(metricNames[r.primary]?.[0]||r.primary)}</span></div>`;
    if(r.scenario.startsWith("P14")) {
      const evidence=ASSESSMENT.traversalEvidence(r);
      measures=`<div class="measure">${evidence.usable?`<strong>${evidence.loaded} / ${evidence.total}</strong><span>median loaded within cadence</span>`:`<strong>Unavailable</strong><span>${esc(evidence.reason)}</span>`}</div>${measures}`;
    }
    if(r.scenario==="P13c")measures+=`<div class="measure"><strong>${format(value(r,"detailMetadataReadyMs"),"ms")}</strong><span>metadata ready · not additive</span></div>`;
    if(r.scenario==="JA2")measures+=`<div class="measure"><strong>${format(value(r,"dt_visual_settled_p95_ms"),"ms")}</strong><span>${DATA.tailLabel(r,"dt_visual_settled_p95_ms")} · ${DATA.population(r,"dt_visual_settled_p95_ms").available??"unknown"} contributors</span></div>`;
    return `<article class="evidence" aria-labelledby="evidence-title"><div class="evidence-head"><div class="eyebrow">${r.synthetic?"Synthetic example · not observed":"Recorded public aggregate"} · ${esc(r.scenario)} · revision ${x.scenarioRevision}</div><h3 id="evidence-title" tabindex="-1">${esc(r.title)}</h3><p>${r.scenario.startsWith("P14")?"Keeping up is not the same as catching up.":r.scenario==="P13c"?"Metadata can be ready while the full image is not.":esc(r.workflow)}</p>${evidenceConfidence(r)}${r.area!=="scroll"&&r.scenario!=="JB5"&&r.scenario!=="PP10"&&(r.area!=="search"||r.primary==="dt_visual_settled_ms")?`<div class="record-assessment">${grade(a.label,a.cls)} ${link("Provisional rules",{view:"rules",evidence:"",metric:"",scenario:""})}<details><summary>Contributors</summary><p class="note">${esc(a.why)}</p></details></div>`:""}</div>
      <div class="measures">${measures}</div><div class="outcomes"><strong>Application outcome</strong><p>${esc(outcome(r))}</p></div>
      ${chart(r)}${currentChange(r)}
      <div class="callout"><strong>Measurement boundary & limits</strong><p>${esc(r.boundary)}</p><p class="note">${esc(r.limit)}</p></div>
      <h4>Exact supporting evidence</h4><p class="note">Every field has a stable link. Reload and Back retain checkpoint, baseline, workflow and selected field. On narrow screens, scroll the table sideways (focus its border to use arrow keys). Values are rounded for reading; exact imported precision is retained below.</p>${table(r)}
      <details><summary>Identity, contract & provenance</summary><dl><dt>Stable observation ID</dt><dd><code>${esc(r.id)}</code></dd><dt>Owning family entry</dt><dd><code>${esc(r.entry)}</code></dd><dt>Explicit membership</dt><dd>Named by the selected checkpoint, never inferred from labels or latest-family entries.</dd><dt>Record coverage</dt><dd>${evidenceCheckpoint().completed}/${evidenceCheckpoint().planned} expected records present. Publication is not application health or independent capture certification.</dd><dt>Measurement validity</dt><dd>${!DATA.validity(r)?"Invalid capture/counts.":r.raw.supported===false?"Unsupported; no numeric assessment.":"Published aggregate; not independently revalidated. Known producer limitations remain."}</dd><dt>Source</dt><dd><a href="${entry.source}">${esc(entry.family)} public history</a> → ${esc(entry.timestamp)} → ${esc(entry.sourceCollection)}[${esc(r.scenario)}]. Source fingerprint ${esc(entry.sourceFingerprint)}; untracked contents not covered.</dd></dl><pre class="raw-evidence"><code>${esc(JSON.stringify(Object.fromEntries(Object.entries(entry.sourceRecord).filter(([key])=>key!==entry.sourceCollection)),null,2))}</code></pre></details>
      <details><summary>Complete canonical record (machine precision)</summary><pre class="raw-evidence"><code>${esc(JSON.stringify(x,null,2))}</code></pre><p class="note">Unmodified saved record. No observations or fields reconstructed.</p></details>
    </article>`;
  }
  function workflow(cp) {
    const area=state.view;
    if(area==="images"&&!state.evidence&&!state.scenario)return overview(cp,true);
    if(area==="scroll"&&!state.evidence&&!state.scenario)return overview(cp,false,true);
    if(area==="search"&&!state.evidence&&!state.scenario)return overview(cp,false,false,true);
    const owner=evidenceCheckpoint();
    const rs=owner?cpRecords(owner).filter(r=>r.area===area):[];
    const requested=state.evidence ? records[state.evidence] : null;
    const selected=state.evidence ? (requested&&rs.some(r=>r.id===requested.id)?requested:null) : (state.scenario?rs.find(r=>r.scenario===state.scenario):rs.find(r=>r.scenario==="P14b")||rs[0]);
    if(selected && !state.evidence) {
      state.evidence=selected.id;
      state.scenario=selected.scenario;
      history.replaceState(null,"",url());
    }
    const groups=area==="images"?["Detail entry","Traversal","Fullscreen return","Selection & panels"]:[...new Set(rs.map(record=>record.workflow))];
    const returnGroup=selected?imageGroup(selected):state.group;
    const backToSummary=searchContext()||area==="search"&&!scrollContext()?`<div class="image-evidence-context">${link("← Search & Navigation summary",{view:"search",evidence:"",scenario:"",metric:"",side:"",group:searchContext()?state.group:selected?searchGroup(selected):"actions"})}<span class="pill">Inspecting ${baselineEvidence()?"B · baseline":"C · current"} observation</span><span>Comparison direction: C − B</span></div>`:area==="scroll"||scrollContext()?`<div class="image-evidence-context">${link("← Scrolling & Layout summary",{view:"scroll",evidence:"",scenario:"",metric:"",side:"",group:scrollContext()?state.group:selected?scrollGroup(selected):"browsing"})}<span class="pill">Inspecting ${baselineEvidence()?"B · baseline":"C · current"} observation</span><span>Comparison direction: C − B</span></div>`:area==="images"?`<div class="image-evidence-context">${link("← Image Workflows summary",{view:"images",evidence:"",scenario:"",metric:"",side:"",group:returnGroup})}<span class="pill">Inspecting ${baselineEvidence()?"B · baseline":"C · current"} observation${owner?` · ${esc(owner.name)}`:" · unavailable"}</span><span>Comparison direction: C − B</span></div>`:"";
    return `${backToSummary}<div class="workflow-layout"><aside aria-label="Workflow observations"><ul class="workflow-menu">${groups.map(g=>`<li><strong>${g}</strong>${rs.filter(r=>r.workflow===g).map(r=>`<p><a href="${esc(url({evidence:r.id,scenario:r.scenario,metric:"",group:scrollContext()||searchContext()?state.group:area==="scroll"?scrollGroup(r):area==="search"?searchGroup(r):area==="images"?imageGroup(r):""}))}" aria-current="${r.id===selected?.id}">${esc(r.title)}</a><small>${r.synthetic?"Synthetic":"Recorded"} · ${r.raw.scenarioRevision==null?"Revision unavailable":`r${esc(r.raw.scenarioRevision)}`}</small></p>`).join("")||"<small>No record in this checkpoint. Unrated.</small>"}</li>`).join("")}</ul></aside>${selected?recordView(selected):`<section class="empty"><h3>Evidence unavailable in this checkpoint</h3><p>The selected observation is missing, outside this checkpoint or excluded by the profile. No older successful record is substituted.</p><p><code>${esc(state.evidence||state.scenario)}</code></p>${link("Return to checkpoint overview",{view:"overview",evidence:"",scenario:"",metric:"",side:""})}</section>`}</div>`;
  }
  function rules() {
    return `<h2>Judgements, not a universal score</h2><p class="lede">Order investigation by adverse outcomes and unmet expectations, never by unrelated milliseconds.</p><div class="columns"><section><h3>Interpretation rules</h3><ol class="decision-list"><li><strong>Eligibility first.</strong> Missing, unsupported or invalid evidence is unrated. Published campaigns and valid measurements can still contain bad application outcomes. Do not let unrated appear better than painful.</li><li><strong>Outcomes before speed.</strong> Any reported degradation/censoring receives “Adverse outcome”; no completed-only timing can cancel it. Counts and denominators are always adjacent.</li><li><strong>Response bands are unapproved.</strong> Sampled sort: median ≤1,500ms and observed max ≤3,000ms. Seek/detail: median ≤2,000ms and observed max ≤4,000ms. Above the median target: “Outside proposed band”; median or maximum beyond twice the median target: “Far outside proposed band”. These are demonstrations for the measured action only, not user-satisfaction grades. If no maximum is imported, explicitly withhold tail reassurance. These bands need user validation, not numerical polish.</li><li><strong>Traversal is cadence-relative.</strong> ≥80% median loaded within cadence: “Meets proposed band”; 50–79%: “Below proposed band”; &lt;50%: “Far below proposed band”. Each cadence/direction is its own condition. Eventual load never repairs the cadence grade. Thresholds provisional; loaded is not decoded or painted.</li><li><strong>Scrolling retains distinct dimensions.</strong> Reuse the existing pressure-reference v1 bands: delivered demand ≥80%, pending slots ≤20%, blocked input ≤5%, frame-p95 ≤33.4ms. These are diagnostic expectations, not satisfaction targets. Show worst/outlier evidence beside medians. Overview's forward-step assessments are not full workflow indices.</li><li><strong>Keep existing density indices, do not counterfeit them.</strong> North-star v1 uses weakest normalized components across both directions/all phases with validity gates. Progress includes readiness and blocking; smoothness uses 60Hz and severe intervals; sampled stability uses retained readiness/geometry. Overview's sampled forward step does not supply a full index. Scrolling & Layout separately reuses the complete saved density v1 inputs and gates; missing or invalid components leave an index unavailable. Separate picture availability makes that contribution visible without redefining v1.</li><li><strong>Preservation is not a speed score.</strong> Show signed displacement and any false target-visibility guard separately. A 1px tolerance is a proposal only; all nonzero signed values remain inspectable. Unsupported paint is unrelated to an application target being invisible.</li><li><strong>Change is a second axis.</strong> Show a descriptive delta only for compatible environments AND contracts with available endpoints. No significance claim, percent speedup trophy or cross-contract trend line. No approved regression noise band exists yet.</li></ol></section><aside class="coverage"><h3>Limits that cannot be designed away</h3><ul><li>Four repetitions: p95 is the maximum of those repetitions, not a population tail.</li><li>The recorded setup is a laptop development app using the TEST API and canonical images. Hosted-build parity is not established.</li><li>P14 U1/U2 clocks/resource/cache limitations persist.</li><li>P13c decoded/stable, JA2 loaded/stable and P14 loaded are distinct boundaries.</li><li>Uncontrolled cache, non-identical content and incomplete source fingerprints prevent causal delivery claims.</li><li>A complete narrow profile cannot outrank omitted difficult workflows.</li></ul><a href="README.md">Dashboard reference</a></aside></div>`;
  }
  function provenance(cp,base,pair) {
    const display=v=>v==null?"Unknown · absent or not shared by all entries":esc(typeof v==="object"?JSON.stringify(v):v);
    const rows=[...new Set([...Object.keys(cp.environment),...Object.keys(base?.environment||{})])].map(k=>`<tr><th scope="row">${esc(k)}</th><td>${display(cp.environment[k])}</td><td>${base?display(base.environment[k]):"—"}</td></tr>`).join("");
    return `<p>${esc(pair.reason)}</p><p class="note">${esc(cp.note)}${base?` Baseline: ${esc(base.note)}`:""} Only topology/delivery may differ; dataMode may not. Environment eligibility is followed by field/record contract guards. Source differences do not establish isolated interventions.</p><div class="table-wrap" role="region" aria-label="Environment differences" tabindex="0"><table><caption>Recorded environment</caption><thead><tr><th>Field</th><th>Current</th><th>Baseline</th></tr></thead><tbody>${rows}</tbody></table></div><h3>Explicit family membership</h3>${[cp,...(base?[base]:[])].map(c=>`<details><summary>${esc(c.name)} · ${c.members.length} named entries</summary><ul>${c.members.map(id=>`<li><code>${esc(id)}</code> · ${entries[id].records.length} records</li>`).join("")}${(c.absentFamilies||[]).map(item=>`<li class="watch">${esc(item)} explicitly absent; no substitute entry.</li>`).join("")}${c.missing.map(item=>`<li class="bad">${esc(item)}</li>`).join("")}</ul></details>`).join("")}`;
  }
  function render(focus = false) {
    const active=document.activeElement?.id;
    const trustOpen=$("trust").open;
    state=readState();
    const explicitEvidence=Boolean(state.evidence || state.metric);
    const cp=checkpoints[state.cp],base=checkpoints[state.base],pair=environmentPair(cp,base);
    $("checkpoint").value=state.cp;$("baseline").value=state.base;
    const api=cp.environment.dataMode==="direct-es"?"Direct Elasticsearch":cp.environment.apiTopology==="deployed-test"?"TEST API":cp.environment.apiTopology==="local"?"Local API":"API unknown";
    const delivery=cp.environment.mediaDelivery==="canonical"?"canonical images":cp.environment.mediaDelivery==="proxy"?"proxied images":"image delivery unknown";
    const sampleCounts=[...new Set(cpRecords(cp).map(r=>r.raw.sampleCount).filter(n=>n>0))].join(" / ");
    $("context").innerHTML=`<div class="context-badges"><span class="pill ${cp.synthetic?"synthetic":""}">${cp.synthetic?"SYNTHETIC · not observed":"Recorded"}</span><span class="pill">Laptop app · ${api} · ${delivery}</span><span class="pill">${cpRecords(cp).length} records / ${cp.planned} ${cp.synthetic?"fixture":"campaign"} scenarios</span><details class="sample-note"><summary>n=${sampleCounts||"unavailable"}</summary><p>Observations per measured scenario, not independent image trials. Unsupported measurements have no samples. Successful-only timings may use fewer contributors; see row counts. Recorded p95 at n=4 is the observed maximum, not a population tail. Fixtures contain aggregates, not individual samples.</p></details><span class="pill">Paint unmeasured</span><button type="button" class="pill ${base&&!pair.ok?"watch":""}" id="comparison-details" aria-controls="pair-details" aria-expanded="${!$("pair-details").hidden}" title="${esc(pair.reason)}">${base?pair.ok?"Pair eligible · contract checks apply":"Pair blocked":"Current only"}</button></div>`;
    const included=checkpoint=>cpRecords(checkpoint).length;
    const absence=checkpoint=>(checkpoint.absentFamilies||[]).length?` · ${(checkpoint.absentFamilies||[]).join(", ")} absent`:"";
    if(base)$("context").querySelector(".context-badges").insertAdjacentHTML("beforeend",`<span class="pill baseline-coverage">B: ${included(base)} included records${esc(absence(base))}</span>`);
    if(cp.absentFamilies?.length)$("context").querySelector(".context-badges").insertAdjacentHTML("beforeend",`<span class="pill watch">C: ${esc(cp.absentFamilies.join(", "))} explicitly absent</span>`);
    const sourceDiffers=base&&cp.members.some(id=>{
      const current=entries[id],baseline=base.members.map(id=>entries[id]).find(entry=>entry.family===current.family&&entry.kind===current.kind);
      return baseline&&current.sourceFingerprint&&baseline.sourceFingerprint&&current.sourceFingerprint!==baseline.sourceFingerprint;
    });
    if(sourceDiffers)$("context").querySelector(".context-badges").insertAdjacentHTML("beforeend",'<span class="pill">Source fingerprints differ · content/cache uncontrolled</span>');
    $("pair-reason").textContent=pair.reason+(base?` C: ${included(cp)} included records. B: ${included(base)} included records${absence(base)}. ${base.note}`:"");
    if(cp.missing.length)$("context").insertAdjacentHTML("beforeend",`<p class="note bad">Checkpoint membership incomplete or unexpected: ${cp.missing.map(esc).join(" · ")}</p>`);
    $("comparison-details").onclick=()=>{
      const panel=$("pair-details");
      panel.hidden=!panel.hidden;
      $("comparison-details").setAttribute("aria-expanded",String(!panel.hidden));
    };
    $("provenance").innerHTML=provenance(cp,base,pair);$("trust").open=trustOpen;
    $("navigation").innerHTML=Object.entries(sections).map(([key,name])=>`<a href="${esc(url({view:key,mode:workflowViews.includes(key)?state.mode:"",evidence:"",metric:"",scenario:"",side:"",group:""}))}" ${state.view===key?'aria-current="page"':""}>${name}</a>`).join("");
    document.querySelector(".engineering-header").classList.toggle("history-mode",state.mode==="history");
    if(state.mode==="history"){
      $("main").innerHTML=`${modeToggle()}<div id="history-root"></div>`;
      window.KupuaHistory.render($("history-root"));
      document.title=`${sections[state.view]} · History${window.KupuaHistory.synthetic()?" · SYNTHETIC":""} · Kupua performance`;
      const scene=state.view==="scroll"?` ${document.querySelector('[data-h="dir"]')?.selectedOptions[0]?.textContent}. ${document.querySelector('[data-h="phase"]')?.selectedOptions[0]?.textContent}.`:"";
      $("announcement").textContent=`${sections[state.view]} history.${scene}`;
      return;
    }
    $("main").innerHTML=state.view==="overview"?overview(cp):state.view==="rules"?rules():`${modeToggle()}${workflow(cp)}`;
    document.title=`${sections[state.view]} · ${cp.name} · Kupua performance`;
    $("announcement").textContent=`${sections[state.view]}. ${cp.name}. ${pair.ok?"Environment eligible; check record contract.":pair.reason}`;
    if(state.view==="scroll"&&!state.evidence) $("announcement").textContent+=` ${$("scroll-direction")?.selectedOptions[0]?.textContent}. ${$("scroll-phase")?.selectedOptions[0]?.textContent}.`;
    if(state.view==="search"&&!state.evidence&&$("search-phase")) $("announcement").textContent+=` ${$("search-phase").selectedOptions[0]?.textContent}.`;
    const summaryGroup=["images","scroll","search"].includes(state.view)&&!state.evidence&&!state.scenario&&state.group;
    if(focus || state.metric || state.evidence || summaryGroup) requestAnimationFrame(()=>{
      if(["checkpoint","baseline"].includes(active)||(active?.startsWith("scroll-")||active?.startsWith("search-"))&&$(active)?.matches("select")){ $(active).focus(); return; }
      if(summaryGroup){
        const section=document.getElementById(`${state.view==="scroll"?"scroll":state.view==="search"?"search":"image"}-${summaryGroup}`);
        if(section){if(section.tagName==="DETAILS")section.open=true;section.focus({preventScroll:true});section.scrollIntoView({block:"start"});}
        return;
      }
      if(!explicitEvidence){
        $("main").focus({preventScroll:true});
        return;
      }
      const row=state.metric?document.getElementById(`metric-${state.metric}`):null;
      const target=row?.querySelector("th") || $("evidence-title") || $("main");
      target.focus({preventScroll:true});
      (row||target).scrollIntoView({block:"start"});
    });
  }
  for(const [key,c] of Object.entries(checkpoints))if(key!=="legacy")$("checkpoint").add(new Option(c.name,key));
  $("baseline").add(new Option("No baseline · current experience only","none"));
  for(const [key,c] of Object.entries(checkpoints))$("baseline").add(new Option(c.name,key));
  $("checkpoint").addEventListener("change",e=>{
    const cp=checkpoints[baselineEvidence()?state.base:e.target.value];
    const old=records[state.evidence];
    const scenario=old?.scenario||state.scenario;
    const replacement=scenario&&cp?find(cp,scenario):null;
    location.hash=url({cp:e.target.value,mode:state.mode,evidence:replacement?.id||"",scenario,metric:replacement?state.metric:""});
  });
  $("baseline").addEventListener("change",e=>{
    const patch={base:e.target.value,mode:state.mode};
    if(baselineEvidence()){
      const scenario=records[state.evidence]?.scenario||state.scenario;
      const owner=checkpoints[e.target.value];
      const replacement=owner&&scenario?find(owner,scenario):null;
      Object.assign(patch,{evidence:replacement?.id||"",scenario,metric:replacement?state.metric:""});
    }
    location.hash=url(patch);
  });
  $("skip").addEventListener("click",e=>{e.preventDefault();$("main").focus();$("main").scrollIntoView();});
  document.addEventListener("change",event=>{
    const searchKey=event.target.dataset.searchControl;
    if(searchKey){location.hash=url({[searchKey]:event.target.value,group:"actions",evidence:"",metric:"",scenario:"",side:""});return;}
    const key=event.target.dataset.scrollControl;
    if(key)location.hash=url({[key]:event.target.value,group:"browsing",evidence:"",metric:"",scenario:"",side:""});
  });
  document.addEventListener("click",event=>{
    const anchor=event.target.closest("a[href^='#']");
    if(anchor&&anchor.getAttribute("href")===location.hash&&!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();render(true);}
  });
  window.addEventListener("hashchange",()=>render(true));
  render();
  window.PROTOTYPE={environmentPair,recordPair,assess,cpRecords,value};
})();
