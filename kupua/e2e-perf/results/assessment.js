"use strict";
(() => {
  const finite = n => typeof n === "number" && Number.isFinite(n);
  const read = window.KupuaDashboardData.measure;
  const number = n => finite(n) ? n.toLocaleString("en-GB", {maximumFractionDigits:2}) : "unavailable";
  const densityName = r => ({grid:"Grid",justified:"Justified",table:"Table"}[r.raw.density] || r.raw.density);
  function completion(r) {
    return window.KupuaDashboardData.completion(r);
  }
  function traversalEvidence(r) {
    if(!r)return { usable:false, reason:"Not shown" };
    if(r.raw.supported===false)return { usable:false, reason:"Unsupported capture · raw evidence only" };
    if(!window.KupuaDashboardData.validity(r))return { usable:false, reason:"Invalid capture or counts · raw evidence only" };
    const loaded=read(r,"renderedCount"), total=read(r,"renderedTotal"), outcomes=completion(r);
    if(!(r.raw.sampleCount>0)||!finite(loaded)||!finite(total)||total<=0||loaded<0||loaded>total||!outcomes)
      return { usable:false, reason:"Required traversal evidence unavailable · raw evidence only" };
    return { usable:true, loaded, total, outcomes, percentage:100*loaded/total };
  }
  function traversalGrade(r) {
    const evidence=traversalEvidence(r);
    if(!evidence.usable)return {label:"Unrated",cls:"unknown",why:evidence.reason};
    if(evidence.outcomes.unavailable>0)return {label:"Adverse outcome",cls:"bad",why:"Completion loss overrides a successful-only timing grade."};
    const fraction=evidence.percentage/100;
    return {label:fraction>=.8?"Meets proposed band":fraction>=.5?"Below proposed band":"Far below proposed band",cls:"unknown",why:`${evidence.loaded}/${evidence.total} median loaded within cadence; unapproved expectation ≥80%, for this cadence and direction only.`};
  }
  function confidence(r) {
    if(!r)return {label:"Unrated",note:"No observation in this checkpoint."};
    if(!window.KupuaDashboardData.validity(r))return {label:"Invalid capture",note:"Raw fields retained; no numerical assessment or performance conclusion."};
    if(r.raw.supported===false)return {label:"Unsupported",note:"No numerical assessment; saved fields are raw evidence only."};
    if(r.synthetic)return {label:"Synthetic only",note:"Designed counterexample, not evidence about the app."};
    return {label:"Bounded evidence",note:`${r.raw.sampleCount} published observations; no population-tail or causal claim.${r.scenario.startsWith("P14")?" Eventual landing clock remains limited.":""}`};
  }
  function pressure(r) {
    const request=read(r,"middleRequestedResultsPerSecond"), rate=read(r,"middleAchievedResultsPerSecond");
    const duration=read(r,"middleDrivenDurationMs"), blocked=read(r,"middleBufferEdgeBlockedMs");
    const pending=read(r,"middlePendingVisibleRatioMean"), frame=read(r,"middleFrameP95Ms");
    return {
      movement:finite(rate)&&request>0&&finite(blocked)&&duration>0 ? rate/request>=.8 && blocked/duration<=.05 : null,
      pictures:finite(pending)&&read(r,"middleFailedCount")===0&&read(r,"middleMissingThumbnailAreaRatioMean")===0 ? pending<=.2 : null,
      frames:finite(frame) ? frame<=33.4 : null,
      rate,request,blocked,pending,frame
    };
  }
  function actionSummary(r) {
    if(!r)return "Not shown · unrated";
    const x=r.raw,c=completion(r);
    if(x.supported===false)return "Unsupported · no samples";
    if(r.scenario.startsWith("P14")) {
      const evidence=traversalEvidence(r);
      return evidence.usable?`${evidence.loaded}/${evidence.total} loaded within cadence; ${c.ready}/${c.total} eventual landings`:evidence.reason;
    }
    if(r.scenario==="JB5")return `${number(x.anchorDriftPx)}px displacement; target visible=${x.targetVisible}`;
    if(c?.unavailable)return `${c.ready}/${c.total} ${r.scenario==="PP3"?"healthy":"ready"}; ${c.unavailable}/${c.total} ${r.scenario==="PP3"?"degraded":"incomplete"}`;
    return `${number(read(r,r.primary))}${r.unit ? ` ${r.unit}` : ""}${c?`; ${c.ready}/${c.total} ready`:" median"}`;
  }
  function findings(rs) {
    const result=[];
    const add=(key,r,title,scope,caution,priority,metric,contributors=[r])=>result.push({key,r,title,scope,caution,priority,metric,contributors});
    const traversals=rs.filter(r=>r.scenario.startsWith("P14"));
    for(const r of traversals.filter(r=>!traversalEvidence(r).usable)) {
      add("traversal-unavailable",r,`${r.title}: unassessed`,traversalEvidence(r).reason,"No traversal percentage, outcome conclusion or performance priority is inferred. Inspect the retained raw observation.",null,"renderedCount");
    }
    const traversal=traversals.filter(r=>traversalEvidence(r).usable)
      .sort((a,b)=>(completion(b).unavailable/b.raw.sampleCount-completion(a).unavailable/a.raw.sampleCount) || (traversalEvidence(a).percentage-traversalEvidence(b).percentage))[0];
    if(traversal){
      const evidence=traversalEvidence(traversal),x=traversal.raw,c=evidence.outcomes,missing=evidence.total-evidence.loaded;
      const name=`${x.speed[0].toUpperCase()+x.speed.slice(1)} ${x.direction} traversal`;
      const title=c.unavailable>0?`${name}: ${c.ready}/${c.total} final landings completed`:`${name}: median ${x.renderedCount}/${x.renderedTotal} images loaded before the next navigation`;
      const scope=c.unavailable>0?`Separately, median ${x.renderedCount}/${x.renderedTotal} loaded before the next navigation · ${x.cadenceMs}ms cadence`:`${x.cadenceMs}ms cadence · ${x.sampleCount} observations · ${c.ready}/${c.total} final landings completed`;
      add("traversal",traversal,title,scope,"Loaded, not decoded or painted. Eventual landing is a separate, limited clock.",c.unavailable>0?100+20*c.unavailable/c.total:missing>0?60+missing/x.renderedTotal:0,c.unavailable>0?"landingRenderedCount":"renderedCount");
    }
    const recovery=rs.find(r=>r.scenario==="D8-table");
    if(recovery){
      const c=completion(recovery);
      add("recovery",recovery,`Table recovery: ${c.ready}/${c.total} ready within four seconds`,"After scrolling stops · constrained delivery · decoded images",c.unavailable ? `${c.unavailable}/${c.total} incomplete; ${read(recovery,"stopMediaReadyMs")===null?"latency unavailable, not four seconds":"timing describes completions only"}.` : "All sampled endpoints completed; this does not certify paint or other scrolling conditions.",c.unavailable>0?100+20*c.unavailable/c.total:0,"stopMediaReadyMs");
    }
    const scroll=rs.filter(r=>r.scenario.startsWith("D1-"));
    const measured=scroll.filter(r=>pressure(r).frames!==null),breaches=measured.filter(r=>!pressure(r).frames);
    if(measured.length){
      const ranked=[...measured].sort((a,b)=>pressure(b).frame-pressure(a).frame);
      const names=breaches.map(densityName).join(" / ");
      add("frames",ranked[0],breaches.length?`${names} scrolling missed the selected frame reference`:`${measured.length}/${scroll.length} shown layouts met the selected frame reference`,"Forward reference step · requested 100 results/s · frame-p95 median ≤33.4ms",`${measured.map(r=>`${densityName(r)} ${number(pressure(r).frame)}ms`).join(" · ")}. Not image readiness or input latency.${measured.length<scroll.length?" Some frame evidence is unavailable.":""}`,breaches.length?30:0,"middleFrameP95Ms",breaches.length?breaches:measured);
    }
    const movementBreaches=scroll.filter(r=>pressure(r).movement===false);
    if(movementBreaches.length){
      const r=movementBreaches[0];
      add("movement",r,`${movementBreaches.map(densityName).join(" / ")} missed the selected movement reference`,"Forward reference step · delivered demand ≥80% and blocked input ≤5%",`${movementBreaches.map(r=>`${densityName(r)} ${number(pressure(r).rate)}/${number(pressure(r).request)} results/s; ${number(pressure(r).blocked)}ms blocked`).join(" · ")}. Movement is not picture availability.`,35,"middleAchievedResultsPerSecond",movementBreaches);
    }
    const pictureBreaches=scroll.filter(r=>pressure(r).pictures===false || (finite(r.raw.metrics?.middlePendingVisibleRatioMean?.p95)&&r.raw.metrics.middlePendingVisibleRatioMean.p95>.2));
    if(pictureBreaches.length){
      const r=pictureBreaches[0];
      add("pictures",r,`${pictureBreaches.map(densityName).join(" / ")} had pending-picture observations above the selected reference`,"Forward reference step · pending visible slots · ≤20% reference",`${pictureBreaches.map(r=>`${densityName(r)} median ${number(pressure(r).pending*100)}%, observed max ${number(r.raw.metrics.middlePendingVisibleRatioMean.p95*100)}%`).join(" · ")}. Median success does not erase a bad repetition.`,25,"middlePendingVisibleRatioMean",pictureBreaches);
    }
    for(const r of rs){
      const x=r.raw,c=completion(r);
      if(r.scenario==="P13c" && c?.unavailable>0)add("detail",r,`Returned detail media: ${c.ready}/${c.total} ready, ${c.unavailable}/${c.total} incomplete`,"Nonresident metadata · returned full image · 15-second horizon",`${x.detailImageFailedCount} image errors, included in the incomplete count. Any available timing describes completed observations only.`,100+20*c.unavailable/c.total,"detailImageReadyCount");
      if(r.scenario==="PP3" && x.degradedCount>0)add("sort",r,`Focused sort: ${x.healthyCount}/${x.sampleCount} healthy, ${x.degradedCount}/${x.sampleCount} degraded`,"Sort around the focused image · accepted degradation",finite(read(r,r.primary))?`${number(read(r,r.primary))}ms describes healthy observations only.`:"No successful timing; do not substitute the baseline.",100+20*x.degradedCount/x.sampleCount,"degradedCount");
      if(r.scenario==="JB5" && (x.targetVisible===false || (finite(x.anchorDriftPx)&&x.anchorDriftPx!==0)))add("return",r,`Fullscreen return: ${number(x.anchorDriftPx)}px displacement; target ${x.targetVisible===false?"not visible":"visible"}`,"Signed anchor guard · fullscreen return","Visibility is an outcome; displacement tolerance still needs approval.",x.targetVisible===false?120:20,"anchorDriftPx");
    }
    return result.sort((a,b)=>(b.priority??-1)-(a.priority??-1));
  }
  window.ASSESSMENT={completion,traversalEvidence,traversalGrade,confidence,pressure,actionSummary,findings};
})();
