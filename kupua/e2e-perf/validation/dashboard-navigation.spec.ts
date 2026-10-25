import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const dashboards = ["audit", "perceived"] as const;

const experienceUrl = new URL("../results/Performance%20dashboard.html", import.meta.url);
type ExperienceCase = "healthy" | "mixed" | "degraded" | "censored" | "unsupported" | "missing" | "incompatible" | "invalid" | "density-invalid" | "guards-invalid" | "large" | "missing-family" | "zero-baseline" | "missing-endpoint" | "missing-pending" | "traversal-invalid" | "traversal-unsupported" | "traversal-zero" | "traversal-over-total" | "traversal-empty" | "scroll-phase-invalid" | "scroll-unsupported" | "scroll-partial" | "scroll-zero" | "scroll-missing-phase" | "scroll-incompatible" | "scroll-signed" | "search-invalid" | "search-unsupported" | "search-incompatible" | "search-missing-phase" | "search-signed" | "search-zero" | "search-d11-isolation" | "search-d11-media" | "search-d11-invalid" | "search-background" | "search-no-settlement";

async function loadExperience(page: Page, kind?: ExperienceCase) {
  const errors: string[] = [], remote: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await page.route(/^https?:/, route => route.abort());
  if (kind) {
    await page.addInitScript({ content: `
      const kind=${JSON.stringify(kind)};
      Object.defineProperty(window,"KupuaDashboardData",{configurable:true,set(api){
          Object.defineProperty(window,"KupuaDashboardData",{value:api,writable:true,configurable:true});
          const build=api.build;
          const histories={audit:window.__AUDIT_LOG__,perceived:window.__PERCEIVED_LOG__,density:window.__DENSITY_LOG__};
          const registry=[];
          for(const [index,id] of ["recorded","prior"].entries()) {
            const definition=JSON.parse(JSON.stringify(api.definitions[0]));
            Object.assign(definition,{id,name:"SYNTHETIC "+id,synthetic:true,note:"Synthetic validation, not observed history."});
            for(const member of definition.members) {
              const entry=JSON.parse(JSON.stringify(histories[member.family].entries.find(entry=>entry.timestamp===member.timestamp)));
              member.timestamp=entry.timestamp="2030-01-0"+(index+1)+"T12:00:00.000Z";
              entry.label="SYNTHETIC "+id;
              entry.environment.mediaDelivery=index?"proxy":"canonical";
              entry.runs=index?3:kind==="large"?40:5;
              const collection=member.family==="perceived"?entry.perceived:entry.metrics;
              for(const raw of Object.values(collection)) {
                raw.sampleCount=entry.runs;
                if("detailImageReadyCount" in raw) {raw.detailImageReadyCount=entry.runs;raw.detailImageCensoredCount=0;raw.detailImageFailedCount=0;}
                if("landingRenderedCount" in raw) {raw.landingRenderedCount=entry.runs;raw.landingCensoredCount=0;}
                if("degradedCount" in raw) raw.degradedCount=0;
                for(const metric of Object.values(raw.metrics||{})) {metric.sampleCount=entry.runs;metric.unavailableCount=0;}
              }
              if(collection["D8-table"]) {
                Object.assign(collection["D8-table"].metrics.stopMediaReadyMs,{median:800,p95:1000});
                Object.assign(collection["D8-table"].metrics.stopMediaCensored,{median:0,p95:0});
              }
              const detail=collection.P13c, traversal=collection.P14b, sort=collection.PP3;
              if(index===1 && kind==="zero-baseline" && detail) detail.detailImageReadyMs=0;
              if(index===0) {
                if(kind==="mixed") {
                  if(detail) {detail.detailImageReadyCount=2;detail.detailImageCensoredCount=3;detail.detailImageFailedCount=1;}
                  if(traversal) {traversal.landingRenderedCount=2;traversal.landingCensoredCount=3;}
                  if(sort) {sort.sampleCount=2;sort.degradedCount=3;}
                }
                if(kind==="degraded" && sort) {sort.sampleCount=0;sort.degradedCount=5;sort.dt_visual_settled_ms=null;sort.dt_visual_settled_p95_ms=null;}
                if(kind==="censored") {
                  if(detail) {detail.detailImageReadyCount=0;detail.detailImageCensoredCount=5;detail.detailImageReadyMs=null;}
                  if(traversal) {traversal.landingRenderedCount=0;traversal.landingCensoredCount=5;traversal.landingRenderMs=null;}
                }
                if(kind==="unsupported" && detail) detail.supported=false;
                if(kind==="invalid" && detail) detail.captureValid=false;
                if(kind==="traversal-invalid" && traversal) traversal.captureValid=false;
                if(kind==="traversal-unsupported" && traversal) traversal.supported=false;
                if(kind==="traversal-zero" && traversal) traversal.renderedCount=0;
                if(kind==="traversal-over-total" && traversal) traversal.renderedCount=16;
                if(kind==="traversal-empty" && traversal) Object.assign(traversal,{sampleCount:0,landingRenderedCount:0,landingCensoredCount:0,renderedCount:15});
                if(kind==="incompatible" && detail) detail.scenarioRevision=99;
                if(kind==="missing" && detail) delete collection.P13c;
                if(kind==="missing-endpoint" && detail) delete detail.detailImageReadyMs;
                if(kind==="missing-pending" && collection["D1-grid"]) delete collection["D1-grid"].metrics.middlePendingVisibleRatioMean;
                if(kind==="density-invalid" && collection["D1-grid"]) {
                  Object.assign(collection["D1-grid"].metrics.middleFrameP95Ms,{median:1,p95:1});
                  Object.assign(collection["D1-grid"].metrics.timingCaptureRevision,{median:1,p95:1});
                }
              }
              if(index===0) {
                const journey=collection["D1-grid"],recovery=collection["D8-table"];
                if(journey && kind==="scroll-phase-invalid") Object.assign(journey.metrics.earlyTrackingOverflow,{median:1,p95:1});
                if(journey && kind==="scroll-unsupported") journey.supported=false;
                if(journey && kind==="scroll-zero") Object.assign(journey.metrics.middlePendingVisibleRatioMean,{median:0,p95:0});
                if(journey && kind==="scroll-missing-phase") delete journey.metrics.lateFrameP95Ms;
                if(journey && kind==="scroll-incompatible") journey.contractKey="synthetic-incompatible";
                if(recovery && kind==="scroll-partial") {
                  Object.assign(recovery.metrics.stopMediaReadyMs,{median:null,p95:null,sampleCount:2,unavailableCount:3});
                  Object.assign(recovery.metrics.stopMediaCensored,{median:1,p95:1});
                }
                if(collection.P4a && kind==="scroll-signed") Object.assign(collection.P4a,{focusDriftPx:-12,focusVisible:false});
              }
              if(index===0) {
                const focused=collection.PP3, reverseSort=collection.PP4, refresh=collection['D11-grid'];
                if(focused && kind==='search-invalid') focused.captureValid=false;
                if(focused && kind==='search-unsupported') focused.supported=false;
                if(focused && kind==='search-incompatible') focused.scenarioRevision=99;
                if(focused && kind==='search-missing-phase') delete focused.dt_visual_settled_ms;
                if(focused && kind==='search-zero') Object.assign(focused,{dt_visual_settled_ms:0,dt_visual_settled_p95_ms:0});
                if(focused && kind==='search-no-settlement') Object.assign(focused,{dt_visual_settled_ms:null,dt_visual_settled_p95_ms:null});
                if(reverseSort && kind==='mixed') Object.assign(reverseSort,{sampleCount:2,degradedCount:3});
                if(reverseSort && kind==='degraded') Object.assign(reverseSort,{sampleCount:0,degradedCount:5});
                if(kind==='search-signed') {
                  if(collection.PP9) Object.assign(collection.PP9,{anchorDriftPx:-12,focusVisible:false});
                  if(collection.PP11) Object.assign(collection.PP11,{anchorDriftPx:0,targetVisible:false});
                }
                if(refresh && kind==='search-d11-isolation') Object.assign(refresh.metrics.refreshComparisonCensored,{median:0,p95:1});
                if(refresh && kind==='search-d11-invalid') refresh.captureValid=false;
                if(refresh && kind==='search-d11-media') Object.assign(refresh.metrics.busyMediaCensored,{median:0,p95:1});
                if(collection.PP10 && kind==='search-background') Object.assign(collection.PP10,{dt_visual_settled_ms:1,dt_visual_settled_p95_ms:1,dt_first_visible_frame_ms:1,dt_first_visible_frame_p95_ms:1});
              }
              if(collection.JB5) Object.assign(collection.JB5,{anchorDriftPx:index?0:-12,targetVisible:index?true:false});
              if(index===0 && kind==="guards-invalid" && collection.JB5) collection.JB5.captureValid=false;
              if(!(index===0 && kind==="missing-family" && member.family==="audit"))histories[member.family].entries.push(entry);
            }
            registry.push(definition);
          }
          const data=build(histories,registry);
          api.build=()=>data;
      }});
    ` });
  }
  await page.goto(`${experienceUrl.href}#checkpoint=recorded&baseline=none&view=overview`);
  await expect(page.getByRole("region", { name: "Numerical workflow summary" })).toBeVisible();
  return { errors, remote };
}

test('bounded corrections: real proxy Overview and revision-aware exact outcomes', async ({page}) => {
  const {errors,remote}=await loadExperience(page);
  await page.locator('#checkpoint').selectOption('proxy-baseline');
  await expect(page.locator('main')).toContainText('256');
  await expect(page.locator('#checkpoint')).toHaveValue('proxy-baseline');
  expect(errors).toEqual([]);expect(remote).toEqual([]);
});

test('campaign corrections: provenance, recovery tails and frame populations', async ({page}) => {
  const {errors,remote}=await loadExperience(page);
  const campaigns=JSON.parse(readFileSync(new URL('../results/campaign-log.json',import.meta.url),'utf8'));
  const campaign=`campaign:${campaigns.entries.at(-1).campaignId}`;
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`${experienceUrl.href}#checkpoint=${campaign}&baseline=recorded&view=scroll&workload=constrained`);
  await expect(page).toHaveTitle(/after rendering fixes/);
  await expect(page.locator('#comparison-details')).toHaveAttribute('title',/source fingerprints differ/);
  const recovery=page.getByRole('region',{name:'Constrained stopped recovery',exact:true});
  const justified=recovery.locator('tbody tr').filter({hasText:'Justified · forward'});
  await expect(justified).toContainText('Cohort changed: median 0 · observed maximum 1');
  await expect(justified).toContainText('3/4 complete · 1/4 unavailable · partial');
  const table=recovery.locator('tbody tr').filter({hasText:'Table · forward'});
  await table.getByText('Recovery cohort & request evidence',{exact:true}).click();
  await expect(table).toContainText('Request carry-in / pending: median 314.5');
  await expect(table).toContainText('median 172.5');
  await expect(page.locator('.scroll-summary')).toContainText('Baseline long responsiveness is included');
  await page.goto(`${experienceUrl.href}#checkpoint=${campaign}&baseline=recorded&view=images`);
  await page.getByText('Frame evidence · populations & completion boundaries',{exact:true}).click();
  const frames=page.getByRole('region',{name:'Image workflow frame context',exact:true});
  const returned=frames.getByRole('row').filter({hasText:'C · P13b'});
  await expect(returned).toContainText('visible-stable-focused-destination');
  await expect(returned.locator('td')).toHaveText(['4','6','59 ms','59 ms','6 ms']);
  await expect(frames.getByRole('row').filter({hasText:'C · P15b'})).toContainText('two-decoded-fullscreen-commits');
  await page.setViewportSize({width:390,height:844});
  await expect(frames).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(errors).toEqual([]);expect(remote).toEqual([]);
});

test('bounded corrections: historical exact outcome contracts', async ({page}) => {
  const {errors,remote}=await loadExperience(page);
  for (const side of ['', 'baseline']) {
    for (const scenario of ['P13c','P14a','P14b','P14c','P14d']) {
      await page.goto(`${experienceUrl.href}#checkpoint=${side?'recorded':'proxy-baseline'}&baseline=${side?'proxy-baseline':'none'}&view=images&scenario=${scenario}${side?'&side=baseline':''}`);
      await expect(page.locator('.outcomes')).toContainText('Completion counts unavailable');
      await expect(page.locator('.outcomes')).not.toContainText(/undefined|15,000/);
      await expect(page.locator('.outcomes')).toContainText(scenario==='P13c'?'singleton-response-and-decoded-stable-detail':'5,000 ms historical observation horizon');
      await expect(page.locator('.evidence-head')).toContainText('revision 2');
      if(side) await expect(page).toHaveURL(/checkpoint=recorded&baseline=proxy-baseline.*side=baseline/);
    }
  }
  await page.goto(`${experienceUrl.href}#checkpoint=recorded&baseline=proxy-baseline&view=images&scenario=P14b`);
  await expect(page.locator('.outcomes')).toContainText('4/4 final landings completed');
  await expect(page.locator('.outcomes')).toContainText('15,000 ms observation horizon');
  expect(errors).toEqual([]);expect(remote).toEqual([]);
});

for (const baseline of [false,true]) {
  test(`bounded corrections: summary statistic ownership ${baseline?'baseline':'current'} with keyboard reload and Back`, async ({page}) => {
    const {errors,remote}=await loadExperience(page);
    await page.locator('#baseline').selectOption('proxy-baseline');
    const overview=()=>page.getByRole('navigation').getByRole('link',{name:'Overview',exact:true});
    const grid=()=>page.locator('.metric-panel').filter({has:page.getByRole('heading',{name:'Frame p95 (ms)',exact:true})}).locator('.density-chart-row').first();
    const mark=grid().locator(`.chart-lane${baseline?'.baseline-lane':':not(.baseline-lane)'} .maximum-mark`);
    const tail=baseline?'50':'74.9',median=baseline?'49.8':'50.25';
    await mark.focus();await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/statistic=p95/);
    await expect(page.locator('.measures')).toContainText(`${tail} ms`);
    if(baseline) await expect(page).toHaveURL(/side=baseline/);
    await page.reload();await expect(page.locator('#metric-middleFrameP95Ms th')).toBeFocused();
    await page.goBack();await expect(page.getByRole('region',{name:'Numerical workflow summary'})).toBeVisible();
    await page.getByRole('navigation').getByRole('link',{name:'Scrolling & Layout',exact:true}).click();
    await page.locator('#scroll-statistic').selectOption('p95');
    await overview().click();
    await expect(page.locator('#main')).toBeFocused();
    const bar=grid().locator(`.bar-mark[data-baseline="${baseline}"]`);
    await expect(bar).toHaveAttribute('href',/statistic=median/);
    await expect(grid().locator('.reference-mark').nth(baseline?1:0)).toHaveAttribute('href',/statistic=median/);
    await expect(grid().locator('.delta-mini')).toHaveAttribute('href',/statistic=median/);
    await bar.focus();await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/statistic=median/);
    await expect(page.locator('.measures')).toContainText(`${median} ms`);
    await expect(page.locator('.comparison')).toContainText('+0.45 ms');
    await page.reload();await expect(page.locator('#metric-middleFrameP95Ms th')).toBeFocused();
    await page.goBack();await expect(page.getByRole('region',{name:'Numerical workflow summary'})).toBeVisible();
    await page.getByRole('navigation').getByRole('link',{name:'Scrolling & Layout',exact:true}).click();
    await page.locator('#scroll-statistic').selectOption('p95');
    const index=page.locator('#scroll-indices tbody tr').first().locator('td').nth(1).locator('.scroll-index-value a').nth(baseline?1:0);
    const componentLinks=await page.locator('#scroll-indices .panel-method a').evaluateAll(links=>links.map(link=>link.getAttribute('href')));
    expect(componentLinks.length).toBeGreaterThan(0);
    expect(componentLinks.every(href=>href?.includes('statistic=median'))).toBe(true);
    const href=await index.getAttribute('href');
    expect(href).toContain('statistic=median');
    await index.focus();await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/statistic=median/);
    await expect(page).toHaveURL(/metric=lateFrameP95Ms/);
    await expect(page.locator('.measures')).toContainText(baseline?'91.75 ms':'95.7 ms');
    if(baseline) await expect(page).toHaveURL(/side=baseline/);
    await page.reload();await expect(page.locator('.table-wrap tr.selected th')).toBeFocused();
    await page.goBack();await expect(page.locator('#scroll-statistic')).toHaveValue('p95');
    expect(errors).toEqual([]);expect(remote).toEqual([]);
  });
}

async function openSearch(page: Page, baseline = 'proxy-baseline') {
  await page.locator('#baseline').selectOption(baseline);
  await page.getByRole('navigation').getByRole('link',{name:'Search & Navigation',exact:true}).click();
  await expect(page.getByRole('region',{name:'Search and Navigation summary',exact:true})).toBeVisible();
}

test('search summary: canonical C−B, baseline maximum ownership, local phase and reload/Back',async ({page})=>{
  const {errors,remote}=await loadExperience(page);
  await openSearch(page);
  await expect(page.locator('.search-summary')).toContainText('28 Search & Navigation records');
  const sort=page.locator('#search-record-PP3');
  await expect(sort).toContainText('1,114');
  await expect(sort).toContainText('4/4 healthy · 0/4 degraded');
  await expect(sort).toContainText('Δ C−B -43 ms (-3.72 %)');
  await sort.locator('.maximum-mark').last().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/checkpoint=recorded&baseline=proxy-baseline/);
  await expect(page).toHaveURL(/side=baseline/);
  await expect(page.locator('#metric-dt_visual_settled_p95_ms th')).toBeFocused();
  await expect(page.locator('.measures')).toContainText('1,198 ms');
  await expect(page.locator('.comparison')).toContainText('+8 ms');
  const selected=page.url();
  await page.reload();
  expect(page.url()).toBe(selected);
  await expect(page.locator('#metric-dt_visual_settled_p95_ms th')).toBeFocused();
  await page.getByRole('link',{name:'← Search & Navigation summary',exact:true}).click();
  await expect(page.locator('#search-actions')).toBeFocused();
  await page.locator('#search-phase').focus();
  await page.locator('#search-phase').selectOption('dt_store_ready_ms');
  await expect(page.locator('#search-phase')).toBeFocused();
  await page.locator('#search-regime').selectOption('seek');
  await expect(sort.locator('.bar-mark[data-baseline="false"]')).toHaveAttribute('data-value','971');
  await sort.locator('.bar-mark[data-baseline="true"]').click();
  await expect(page.locator('#metric-dt_store_ready_ms th')).toBeFocused();
  await expect(page).toHaveURL(/searchPhase=dt_store_ready_ms/);
  await expect(page).toHaveURL(/searchRegime=seek/);
  await page.getByRole('link',{name:'← Search & Navigation summary',exact:true}).click();
  await expect(page.locator('#search-phase')).toHaveValue('dt_store_ready_ms');
  await expect(page.locator('#search-regime')).toHaveValue('seek');
  await page.goBack();
  await expect(page.locator('#metric-dt_store_ready_ms th')).toBeFocused();
  expect(errors).toEqual([]);expect(remote).toEqual([]);
});

test('search summary: canonical startup gaps, optional status, signed D11 pairing and background',async ({page})=>{
  const {errors,remote}=await loadExperience(page);
  await openSearch(page);
  await expect(page.locator('#search-startup')).toContainText('B: long responsiveness absent');
  const paired=page.locator('#search-refresh [data-paired-field="refreshDataDeltaMs"][data-baseline="false"]').first();
  expect(Number(await paired.getAttribute('data-paired-value'))).toBeCloseTo(-2.9,5);
  await expect(page.locator('#search-refresh')).toContainText('4/4 paired contributors');
  await expect(page.locator('#search-refresh')).toContainText('2/4 paired contributors · 2/4 unavailable');
  await expect(page.locator('#search-refresh [data-paired-field][data-baseline="true"]')).toHaveCount(0);
  const tail=page.locator('#search-refresh tbody tr').first().locator('td').nth(2).getByRole('link',{name:'42 ms',exact:true});
  await tail.click();
  await expect(page).toHaveURL(/statistic=p95/);
  await expect(page.locator('#metric-refreshDataDeltaMs th')).toBeFocused();
  await expect(page.locator('.measures')).toContainText('42 ms');
  await page.getByRole('link',{name:'← Search & Navigation summary',exact:true}).click();
  await page.locator('#search-phase').selectOption('dt_status_ms');
  const sort=page.locator('#search-record-PP3');
  await expect(sort.locator('.bar-mark')).toHaveCount(0);
  await expect(sort).toContainText('Unavailable');
  await expect(sort).not.toContainText('Meets proposed band');
  await expect(page.locator('#search-actions')).toContainText('not instantaneous feedback');
  await sort.locator('.missing-value a').first().click();
  await expect(page.locator('#metric-dt_status_ms th')).toBeFocused();
  await expect(page.locator('.evidence .bar')).toHaveCount(0);
  await expect(page.locator('.measures')).not.toContainText('1,114');
  await page.getByRole('link',{name:'← Search & Navigation summary',exact:true}).click();
  await expect(page.locator('#search-background')).toContainText('1,447');
  await expect(page.locator('#search-background')).toContainText('21,627');
  await page.locator('#search-background .bar-mark[data-baseline="false"]').click();
  await expect(page.locator('#metric-dt_store_ready_ms th')).toBeFocused();
  await expect(page.locator('.record-assessment')).toHaveCount(0);
  await expect(page.locator('.outcomes')).toContainText('Background position-map publication');
  expect(errors).toEqual([]);expect(remote).toEqual([]);
});

for(const kind of ['mixed','degraded','search-invalid','search-unsupported','search-incompatible','search-missing-phase','search-zero','search-d11-isolation','search-d11-media','search-d11-invalid','search-background','search-signed','search-no-settlement'] as const) {
  test(`search summary: synthetic ${kind} preserves action and paired boundaries`,async ({page})=>{
    const {errors,remote}=await loadExperience(page,kind);
    await openSearch(page,'prior');
    const sort=page.locator('#search-record-PP3');
    if(kind==='mixed'||kind==='degraded') {
      for(const id of ['PP3','PP4']) {
        const row=page.locator(`#search-record-${id}`);
        await expect(row).toContainText(kind==='mixed'?'2/5 healthy · 3/5 degraded':'0/5 healthy · 5/5 degraded');
        await expect(row).not.toContainText('Meets proposed band');
        await expect(row).toContainText('Degraded outcomes');
        await expect(row.locator('.bar-mark[data-baseline="false"]')).toHaveCount(kind==='mixed'?1:0);
      }
      if(kind==='degraded') {
        await page.locator('#search-phase').selectOption('dt_store_ready_ms');
        await expect(sort.locator('.bar-mark[data-baseline="false"]')).toHaveCount(0);
        await sort.locator('.missing-value a').first().click();
        await expect(page.locator('.evidence .bar')).toHaveCount(0);
        await expect(page.locator('.outcomes')).toContainText('0/5 healthy · 5/5 degraded');
        await page.getByRole('link',{name:'← Search & Navigation summary',exact:true}).click();
        await sort.getByRole('link',{name:'3/3 healthy · 0/3 degraded',exact:true}).click();
        await expect(page).toHaveURL(/side=baseline/);
        await expect(decodeURIComponent(page.url())).toContain('2030-01-02T12:00:00.000Z/PP3');
        await expect(page.locator('#metric-sampleCount th')).toBeFocused();
        await expect(page.locator('.record-assessment')).toHaveCount(0);
      }
    } else if(kind==='search-invalid'||kind==='search-unsupported'||kind==='search-missing-phase') {
      await expect(sort.locator('.bar-mark[data-baseline="false"]')).toHaveCount(0);
      await expect(sort).toContainText('Unrated');
      await expect(sort).not.toContainText('4/4 healthy');
      await sort.locator('.missing-value a').first().click();
      await expect(page.locator('#metric-dt_visual_settled_ms th')).toBeFocused();
      await expect(page.locator('.evidence .bar')).toHaveCount(0);
      if(kind==='search-missing-phase') await expect(page.locator('.measures')).toContainText('Absent · unavailable');
      await page.reload();
      await expect(page.locator('#metric-dt_visual_settled_ms th')).toBeFocused();
      await expect(page.locator('.evidence .bar')).toHaveCount(0);
    } else if(kind==='search-no-settlement') {
      await expect(sort).toContainText('Unrated');
      await page.locator('#search-phase').selectOption('dt_ack_ms');
      await expect(sort.locator('.bar-mark[data-baseline="false"]')).toHaveCount(1);
      await expect(sort).not.toContainText('Meets proposed band');
      await sort.locator('.bar-mark[data-baseline="false"]').click();
      await expect(page.locator('#metric-dt_ack_ms th')).toBeFocused();
      await expect(page.locator('.record-assessment')).toHaveCount(0);
      await page.locator('#metric-sampleCount th a').click();
      await expect(page.locator('#metric-sampleCount th')).toBeFocused();
      await expect(page.locator('.record-assessment')).toHaveCount(0);
      await page.reload();
      await expect(page.locator('#metric-sampleCount th')).toBeFocused();
      await expect(page.locator('.record-assessment')).toHaveCount(0);
    } else if(kind==='search-incompatible') {
      await expect(sort.locator('.bar-mark[data-baseline="false"]')).toHaveCount(1);
      await expect(sort.locator('.bar-mark[data-baseline="true"]')).toHaveCount(0);
      await expect(sort.locator('.delta-mini')).toHaveAttribute('title',/scenarioRevision/);
    } else if(kind==='search-zero') {
      await expect(sort.locator('.zero-mark[data-baseline="false"]')).toHaveCount(1);
      await expect(sort).toContainText('5/5 healthy · 0/5 degraded');
    } else if(kind==='search-background') {
      await expect(page.locator('#search-background')).toContainText('no grade');
      await expect(page.locator('#search-background [data-metric="dt_visual_settled_ms"]')).toHaveCount(0);
      await page.locator('#search-background .bar-mark[data-baseline="false"]').click();
      await page.locator('#metric-dt_visual_settled_ms th a').click();
      await expect(page.locator('.measures')).toContainText('Null · unavailable');
      await expect(page.locator('.evidence .bar')).toHaveCount(0);
      await expect(page.locator('.record-assessment')).toHaveCount(0);
    } else if(kind==='search-signed') {
      const chip=page.locator('#search-record-PP9'),history=page.locator('#search-record-PP11');
      await expect(chip).toContainText('-12 px');await expect(chip).toContainText('false');
      await expect(history).toContainText('0 px');await expect(history).toContainText('false');
      await page.setViewportSize({width:390,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await chip.getByRole('link',{name:'-12 px',exact:true}).focus();await page.keyboard.press('Enter');
      await expect(page.locator('#metric-anchorDriftPx th')).toBeFocused();
      await expect(page.locator('#metric-focusVisible')).toContainText('false');
      await page.getByRole('link',{name:'← Search & Navigation summary',exact:true}).click();
      await page.getByRole('link',{name:'History / preservation',exact:true}).focus();await page.keyboard.press('Enter');
      await expect(page.locator('#search-restore')).toBeFocused();
    } else {
      const gridRows=page.locator('#search-refresh tbody tr').filter({hasText:/grid ·/});
      const paired=gridRows.locator('[data-paired-field][data-baseline="false"]');
      await expect(paired).toHaveCount(kind==='search-d11-media'?2:0);
      if(kind==='search-d11-media') {
        await expect(gridRows.filter({hasText:'data publication'}).locator('.bar-mark[data-baseline="false"]')).toHaveCount(2);
        await expect(gridRows.filter({hasText:'decoded media'})).toContainText('censored');
      } else if(kind==='search-d11-isolation') {
        await expect(gridRows.first().locator('.bar-mark[data-baseline="false"]')).toHaveCount(2);
        await expect(gridRows.first()).toContainText('isolation');
      } else {
        await expect(gridRows.locator('.bar-mark[data-baseline="false"]')).toHaveCount(0);
        await expect(gridRows.first()).toContainText('Invalid');
      }
      await gridRows.first().locator('a[href*="metric=refreshDataDeltaMs"]').first().click();
      await expect(page.locator('#metric-refreshDataDeltaMs th')).toBeFocused();
      if(kind!=='search-d11-media') {
        await expect(page.locator('.measures')).toContainText('Null · unavailable');
        await expect(page.locator('.signed-axis')).toHaveCount(0);
      }
    }
    expect(errors).toEqual([]);expect(remote).toEqual([]);
  });
}

async function openScroll(page: Page, baseline = "proxy-baseline") {
  await page.locator("#baseline").selectOption(baseline);
  await page.getByRole("link", { name: "Scrolling & Layout", exact: true }).click();
  await expect(page.getByRole("region", { name: "Scrolling and Layout summary", exact: true })).toBeVisible();
}

test("scrolling summary: real values, fixed-side phase evidence, reload and Back", async ({ page }) => {
  const { errors, remote } = await loadExperience(page);
  await openScroll(page);
  const frames = page.locator('#scroll-browsing section[aria-label="Frame p95 (ms)"]');
  await expect(frames.locator('.bar-mark[data-baseline="false"]').first()).toHaveAttribute("data-value", /50\.249/);
  await expect(frames).toContainText("Δ +0.45 ms");
  await page.locator("#scroll-density").selectOption("grid");
  await page.locator("#scroll-direction").selectOption("backward");
  await page.locator("#scroll-phase").focus();
  await page.locator("#scroll-phase").selectOption("reversal");
  await expect(page.locator("#scroll-phase")).toBeFocused();
  await expect(frames.locator('.bar-mark[data-baseline="false"]')).toHaveAttribute("data-metric", "reversalFrameP95Ms");
  await expect(frames.locator('.bar-mark[data-baseline="false"]')).toHaveAttribute("data-value", /54\.700/);
  const baselineMark = frames.locator('.bar-mark[data-baseline="true"]');
  await baselineMark.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/checkpoint=recorded&baseline=proxy-baseline/);
  await expect(page).toHaveURL(/side=baseline/);
  await expect(page).toHaveURL(/D2-grid/);
  await expect(page.locator("#metric-reversalFrameP95Ms th")).toBeFocused();
  await expect(page.locator("#metric-reversalFrameP95Ms")).toContainText("54.2");
  await expect(page.locator(".comparison")).toContainText("+0.5 ms");
  const selected = page.url();
  await page.reload();
  expect(page.url()).toBe(selected);
  await expect(page.locator("#metric-reversalFrameP95Ms th")).toBeFocused();
  await page.getByRole("link", { name: "← Scrolling & Layout summary", exact: true }).click();
  await expect(page.locator("#scroll-browsing")).toBeFocused();
  await expect(page.locator("#scroll-density")).toHaveValue("grid");
  await expect(page.locator("#scroll-direction")).toHaveValue("backward");
  await expect(page.locator("#scroll-phase")).toHaveValue("reversal");
  await page.goBack();
  await expect(page.locator("#metric-reversalFrameP95Ms th")).toBeFocused();
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test("scrolling summary: canonical recovery, layout ownership, p95 and mobile access", async ({ page }) => {
  const { errors, remote } = await loadExperience(page);
  await openScroll(page);
  const constrained = page.getByRole("region", { name: "Constrained stopped recovery", exact: true });
  const table = constrained.getByRole("row").filter({ hasText: "Table · forward" });
  await expect(table).toContainText("0/4 complete · 4/4 unavailable");
  await expect(table.locator('a.bar-mark[data-metric="stopMediaReadyMs"]')).toHaveCount(0);
  await expect(table).toContainText("4,000 ms (not latency)");
  const ordinary=page.getByRole("region", { name: "Ordinary stopped recovery", exact: true }).getByRole("row").filter({ hasText: "Table · forward" });
  await expect(ordinary).toContainText("C 3/4 complete · 1/4 unavailable · partial");
  await expect(ordinary).toContainText("B 4/4 complete · 0/4 unavailable");
  await expect(ordinary).toContainText("Comparison withheld");
  await expect(ordinary.locator('.bar-mark[data-metric="stopMediaReadyMs"]')).toHaveCount(0);
  const baselineOutcome=ordinary.locator('td').last().getByRole('link', { name: '4/4 complete · 0/4 unavailable', exact: true });
  await baselineOutcome.click();
  await expect(page).toHaveURL(/side=baseline/);
  await expect(decodeURIComponent(page.url())).toContain('2026-10-24T04:32:34.673Z/D1-table');
  await expect(page.locator('#metric-stopMediaReadyMs th')).toBeFocused();
  await page.getByRole('link', { name: '← Scrolling & Layout summary', exact: true }).click();
  await expect(page.locator("#scroll-layout")).toContainText("227.8");
  await expect(page.locator("#scroll-maintenance")).toContainText("32.9");
  await page.locator("#scroll-workload").selectOption("constrained");
  await expect(page.locator("#scroll-direction")).toBeDisabled();
  await page.locator("#scroll-phase").selectOption("late");
  await expect(page.locator('#scroll-browsing .bar-mark[data-metric="lateFrameP95Ms"]').first()).toHaveAttribute('href', /D8-grid/);
  await expect(page.locator('#scroll-browsing')).toContainText('80ms / 4Mibit/s');
  await page.locator("#scroll-workload").selectOption("ordinary");
  await expect(page.locator("#scroll-direction")).toBeEnabled();
  await page.locator("#scroll-phase").selectOption("middle");
  await page.locator("#scroll-statistic").selectOption("p95");
  const frames=page.locator('#scroll-browsing section[aria-label="Frame p95 (ms)"]');
  await expect(frames.locator('.bar-mark[data-baseline="false"]').first()).toHaveAttribute("data-value", /74\.899/);
  await frames.locator('.bar-mark[data-baseline="false"]').first().click();
  await expect(page.locator(".measures")).toContainText("74.9 ms");
  await page.getByRole("link", { name: "← Scrolling & Layout summary", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#scroll-statistic")).toHaveValue("p95");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Transitions / reflow", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#scroll-layout")).toBeFocused();
  const evidence = page.locator('#scroll-layout .bar-mark[data-metric="placementMs"][data-baseline="true"]').first();
  await evidence.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#metric-placementMs th")).toBeFocused();
  await expect(page).toHaveURL(/side=baseline/);
  await expect(page).toHaveURL(/D3-grid/);
  await page.getByRole("link", { name: "← Scrolling & Layout summary", exact: true }).click();
  await page.getByRole("link", { name: "D11-grid · refresh / contention", exact: true }).click();
  await expect(page).toHaveURL(/view=search/);
  await expect(page.getByRole("link", { name: "← Scrolling & Layout summary", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

for (const kind of ["scroll-phase-invalid", "scroll-unsupported", "scroll-partial", "scroll-zero", "scroll-missing-phase", "scroll-incompatible", "scroll-signed"] as const) {
  test(`scrolling summary: synthetic ${kind} preserves gaps, outcomes and raw evidence`, async ({ page }) => {
    const { errors, remote } = await loadExperience(page, kind);
    await openScroll(page, "prior");
    const frames=page.locator('#scroll-browsing section[aria-label="Frame p95 (ms)"]');
    if (kind === "scroll-phase-invalid") {
      await page.locator("#scroll-phase").selectOption("early");
      await expect(frames.locator('.bar-mark[data-baseline="false"]')).toHaveCount(2);
      await expect(page.locator('.scroll-index-table tbody tr').first()).toContainText("Unavailable");
      await frames.locator('.missing-value a').first().click();
      await expect(page.locator("#metric-earlyFrameP95Ms")).toContainText("invalid");
      await expect(page.locator("#metric-earlyTrackingOverflow")).toContainText("1");
    } else if (kind === "scroll-unsupported") {
      await expect(frames.locator('.bar-mark[data-baseline="false"]')).toHaveCount(2);
      await expect(page.locator('.scroll-index-table tbody tr').first()).toContainText("Unavailable");
    } else if (kind === "scroll-partial") {
      const row=page.getByRole("region", { name: "Constrained stopped recovery", exact: true }).getByRole("row").filter({ hasText: "Table · forward" });
      await expect(row).toContainText("2/5 complete · 3/5 unavailable · partial");
      await expect(row.locator('.bar-mark[data-metric="stopMediaReadyMs"][data-baseline="false"]')).toHaveCount(0);
      await row.getByRole("link", { name: "2/5 complete · 3/5 unavailable · partial", exact: true }).click();
      await expect(page.locator("#metric-stopMediaReadyMs")).toContainText("partial");
    } else if (kind === "scroll-zero") {
      await expect(page.locator('#scroll-browsing .zero-mark[data-metric="middlePendingVisibleRatioMean"]')).toHaveCount(1);
    } else if (kind === "scroll-missing-phase") {
      await page.locator("#scroll-phase").selectOption("late");
      await expect(frames.locator('.bar-mark[data-baseline="false"]')).toHaveCount(2);
      await expect(frames).toContainText("Unavailable");
      await page.locator("#scroll-phase").selectOption("reversal");
      await expect(frames.locator('.bar-mark')).toHaveCount(0);
      await expect(page.locator("#scroll-browsing")).toContainText("no other phase is substituted");
      await frames.locator('.missing-value a').first().click();
      await expect(page.locator('#metric-reversalFrameP95Ms')).toContainText('Absent');
      await expect(page.locator('.measures')).toContainText('Absent · unavailable');
      await expect(page.locator('.evidence .bar')).toHaveCount(0);
      await expect(page.locator('.comparison')).toContainText('Field absent; numeric comparison withheld.');
      await expect(page.locator('.comparison')).not.toContainText('50.25');
      await page.reload();
      await expect(page.locator('#metric-reversalFrameP95Ms th')).toBeFocused();
      await expect(page.locator('.measures')).toContainText('Absent · unavailable');
      await expect(page.locator('.evidence .bar')).toHaveCount(0);
    } else if (kind === "scroll-incompatible") {
      await expect(frames.locator('.bar-mark[data-baseline="false"]')).toHaveCount(3);
      await expect(frames.locator('.bar-mark[data-baseline="true"]')).toHaveCount(2);
      await expect(frames.locator('.delta-mini').first()).toHaveAttribute("title", /contractKey/);
    } else {
      await page.locator("#scroll-layout details").first().locator("summary").first().click();
      const row=page.getByRole("region", { name: "Supporting layout records", exact: true }).getByRole("row").filter({ has: page.getByRole("link", { name: "P4a", exact: true }) });
      await expect(row).toContainText("-12");
      await expect(row).toContainText("false");
      await row.getByRole("link", { name: "-12 px", exact: true }).click();
      await expect(page.locator("#metric-focusDriftPx th")).toBeFocused();
      await expect(page.locator("#metric-focusVisible")).toContainText("false");
    }
    expect(errors).toEqual([]);
    expect(remote).toEqual([]);
  });
}

test("dashboard integration: real local-file overview, summary and full evidence round-trip", async ({ page }) => {
  const { errors, remote } = await loadExperience(page);
  await expect(page.locator("#context")).toContainText("78 records / 78");
  expect(await page.locator("script[src]").evaluateAll(scripts => scripts.map(script => script.getAttribute("src")))).not.toContain("fixtures.js");
  await page.getByRole("link", { name: "Detail entry", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Detail opening", exact: true })).toBeVisible();
  const max = page.locator('#image-detail .maximum-mark');
  await max.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#metric-dt_visual_settled_p95_ms")).toContainText("18,056");
  await expect(page.locator("#metric-dt_visual_settled_p95_ms th")).toBeFocused();
  const selected = page.url();
  await page.reload();
  await expect(page.locator("#metric-dt_visual_settled_p95_ms")).toContainText("18,056");
  expect(page.url()).toBe(selected);
  await page.getByRole("link", { name: "← Image Workflows summary", exact: true }).click();
  await expect(page.locator("#image-detail")).toBeFocused();
  await page.goBack();
  await expect(page.locator("#metric-dt_visual_settled_p95_ms th")).toBeFocused();
  await page.getByRole("link", { name: "← Image Workflows summary", exact: true }).click();
  await page.locator('#image-detail a[data-metric="detailImageReadyMs"]').click();
  await expect(page.locator("#metric-detailImageReadyMs")).toContainText("1,374");
  await expect(page.locator("#metric-completionBoundary")).toContainText("singleton-response-and-bounded-returned-media");
  await page.getByText("Complete canonical record (machine precision)", { exact: true }).click();
  await expect(page.locator("pre.raw-evidence").last()).toContainText('"networkCaptureRevision": 1');
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

for (const kind of ["healthy", "mixed", "degraded", "censored", "unsupported", "missing", "incompatible", "invalid"] as const) {
  test(`dashboard integration: synthetic ${kind} outcomes and stable baseline direction`, async ({ page }) => {
    const { errors, remote } = await loadExperience(page, kind);
    await page.getByRole("combobox", { name: "Baseline", exact: true }).selectOption("prior");
    await expect(page).toHaveURL(/baseline=prior/);
    if (kind === "degraded") {
      const sort=page.locator('.action-table tbody tr').filter({hasText:"Focused sort"});
      await expect(sort).toContainText("0/5 healthy");
      await expect(sort.locator('a.bar-mark[data-baseline="false"]')).toHaveCount(0);
      await expect(sort.locator('a.bar-mark[data-baseline="true"]')).toHaveCount(0);
      await expect(sort.locator('.delta-mini')).toHaveAttribute('title',/No healthy timing contributors/);
      await expect(page.locator('.workflow-number').filter({hasText:"Search / sort"})).toContainText("Adverse");
    }
    if (kind === "mixed") {
      await expect(page.locator('.action-table tbody tr').filter({hasText:"Focused sort"})).toContainText("2/5 healthy");
      await expect(page.locator('.traversal-panel tbody tr').filter({hasText:"Fast forward"})).toContainText("2/5 complete");
    }
    await page.getByRole("link", { name: "Image Workflows", exact: true }).click();
    const current = page.locator('#image-detail a.bar-mark[data-metric="detailImageReadyMs"][data-baseline="false"]');
    if (["unsupported", "invalid", "censored", "missing"].includes(kind)) await expect(current).toHaveCount(0);
    if (["incompatible", "missing", "unsupported", "invalid"].includes(kind)) {
      await expect(page.locator('#image-detail a.bar-mark[data-metric="detailImageReadyMs"][data-baseline="true"]')).toHaveCount(0);
      if(kind==="unsupported") {
        await page.locator('#image-detail .missing-value a[href*="metric=detailImageReadyMs"]').click();
        await expect(page.locator('.outcomes')).toContainText("Unsupported measurement");
        await expect(page.locator('#metric-detailImageReadyCount')).toContainText("unsupported");
        await page.getByRole("link", {name:"← Image Workflows summary",exact:true}).click();
      }
    } else {
      const baseline = page.locator('#image-detail a.bar-mark[data-metric="detailImageReadyMs"][data-baseline="true"]');
      await expect(baseline).toHaveCount(1);
      if (kind === "censored") {
        await baseline.click();
        const hash = new URL(page.url()).hash;
        expect(hash).toContain("checkpoint=recorded&baseline=prior");
        expect(hash).toContain("side=baseline");
        await expect(page.locator("#metric-detailImageReadyMs")).toContainText("3 field contributors / 3 outcomes");
        const selected=page.url();
        await page.reload();
        expect(page.url()).toBe(selected);
        await expect(page.locator("#metric-detailImageReadyMs th")).toBeFocused();
        await page.getByRole("link", { name: "← Image Workflows summary", exact: true }).click();
        await expect(page).toHaveURL(/checkpoint=recorded&baseline=prior&view=images/);
        await expect(page.locator("#image-return")).toContainText("false");
        await expect(page.locator("#image-return")).toContainText("-12");
      }
    }
    expect(errors).toEqual([]);
    expect(remote).toEqual([]);
  });
}

test("dashboard integration: real proxy baseline has explicit coverage, compatible deltas and revision refusals", async ({ page }) => {
  const { errors, remote } = await loadExperience(page);
  await page.getByRole("combobox", { name: "Baseline", exact: true }).selectOption("proxy-baseline");
  await expect(page.locator("#context")).toContainText("78 records / 78");
  await expect(page.locator(".baseline-coverage")).toContainText("70 included records");
  await expect(page.locator(".baseline-coverage")).toContainText("Long responsiveness absent");
  await expect(page.locator("#context")).toContainText("Source fingerprints differ");
  const sort = page.locator(".action-table tbody tr").filter({ hasText: "Focused sort" });
  await expect(sort).toContainText("Δ -43 ms");
  await expect(sort.locator('.bar-mark[data-baseline="true"]')).toHaveAttribute("data-value", "1157");
  const seek = page.locator(".action-table tbody tr").filter({ hasText: "Seek · middle click" });
  await expect(seek).toContainText("Δ -46 ms");
  await expect(page.locator('.scrolling-panel .bar-mark[data-baseline="true"]')).toHaveCount(9);
  await expect(page.locator('.recovery-panel .bar-mark')).toHaveCount(0);
  await expect(page.locator('.recovery-panel')).toContainText("0/4 complete");
  await expect(page.locator('.traversal-panel .bar-mark[data-baseline="true"]')).toHaveCount(0);
  await page.getByRole("navigation").getByRole("link", { name: "Image Workflows", exact: true }).click();
  const returned = page.locator("#image-detail tbody tr").filter({ hasText: "Detail · returned image" });
  await expect(returned.locator('.bar-mark[data-baseline="false"]')).toHaveAttribute("data-value", "1374");
  await expect(returned.locator('.bar-mark[data-baseline="true"]')).toHaveCount(0);
  const doubleClick = page.locator("#image-detail tbody tr").filter({ hasText: "Detail · double-click" });
  await expect(doubleClick).toContainText("18,056");
  await expect(doubleClick.locator('.bar-mark[data-baseline="true"]')).toHaveCount(0);
  await page.locator('#image-traversal tbody tr').filter({ hasText: "Fast forward" }).getByRole("link", { name: "Fast forward", exact: true }).click();
  await expect(page.locator('.comparison')).toContainText("scenarioRevision");
  await expect(page.locator('#metric-landingRenderMs')).toContainText("6,653");
  await page.getByRole("link", { name: "← Image Workflows summary", exact: true }).click();
  await expect(page.locator("#image-traversal")).toBeFocused();
  await page.locator('#image-return a[href*="JB5"]').click();
  await expect(page.locator('.comparison')).toContainText("Baseline profile did not include this observation");
  await expect(page.locator('#checkpoint')).toHaveValue("recorded");
  await expect(page.locator('#baseline')).toHaveValue("proxy-baseline");
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test("dashboard integration: real baseline-side evidence preserves ownership, direction, reload and Back", async ({ page }) => {
  const { errors, remote } = await loadExperience(page);
  await page.getByRole("combobox", { name: "Baseline", exact: true }).selectOption("proxy-baseline");
  const sort = page.locator(".action-table tbody tr").filter({ hasText: "Focused sort" });
  await sort.locator('.bar-mark[data-baseline="true"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('#metric-dt_visual_settled_ms th')).toBeFocused();
  await expect(page.locator('#metric-dt_visual_settled_ms')).toContainText("1,157");
  await expect(page.locator('.comparison')).toContainText("-43 ms");
  await expect(page.locator('#checkpoint')).toHaveValue("recorded");
  await expect(page.locator('#baseline')).toHaveValue("proxy-baseline");
  expect(page.url()).toContain("side=baseline");
  expect(decodeURIComponent(page.url())).toContain("responsiveness/short/2026-10-23T23:29:50.826Z/PP3/r3");
  const evidence = page.url();
  await page.reload();
  await expect(page.locator('#metric-dt_visual_settled_ms th')).toBeFocused();
  expect(page.url()).toBe(evidence);
  await page.goBack();
  await expect(page.locator('.workflow-strip')).toBeVisible();
  await expect(page.locator('#baseline')).toHaveValue("proxy-baseline");
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test("dashboard integration: baseline search and scroll evidence keeps owner across reload and Back", async ({page}) => {
  const {errors}=await loadExperience(page,"healthy");
  await page.getByRole("combobox",{name:"Baseline",exact:true}).selectOption("prior");
  const search=page.locator('.action-table tbody tr').filter({hasText:"Focused sort"}).locator('a.bar-mark[data-baseline="true"]');
  await search.click();
  await expect(page.locator('#metric-dt_visual_settled_ms th')).toBeFocused();
  expect(new URL(page.url()).hash).toContain("checkpoint=recorded&baseline=prior&view=search");
  expect(new URL(page.url()).hash).toContain("side=baseline");
  await page.reload();
  await expect(page.locator('#metric-dt_visual_settled_ms')).toContainText("3 field contributors / 3 outcomes");
  await page.goBack();
  await expect(page.getByRole("region",{name:"Numerical workflow summary"})).toBeVisible();
  await page.locator('a.bar-mark[data-metric="middleFrameP95Ms"][data-baseline="true"]').first().click();
  await page.getByRole('link',{name:'← Scrolling & Layout summary',exact:true}).click();
  await page.locator('#scroll-browsing a.bar-mark[data-metric="middleFrameP95Ms"][data-baseline="true"]').nth(1).click();
  await expect(page.locator('#metric-middleFrameP95Ms th')).toBeFocused();
  await page.locator('#metric-middleFrameP95Ms th a').click();
  await expect(page.locator('#metric-middleFrameP95Ms th')).toBeFocused();
  expect(new URL(page.url()).searchParams.size).toBe(0);
  const selected=page.url();
  expect(new URL(selected).hash).toContain("side=baseline");
  expect(decodeURIComponent(new URL(selected).hash)).toContain("2030-01-02");
  await page.reload();
  await expect(page.locator('#metric-middleFrameP95Ms')).toContainText("3 field contributors / 3 outcomes");
  await page.goBack();
  await expect(page.locator('#scroll-browsing')).toBeFocused();
  expect(errors).toEqual([]);
});

for (const kind of ["traversal-invalid", "traversal-unsupported"] as const) {
  test(`dashboard integration: ${kind} has no numerical traversal conclusion`, async ({ page }) => {
    const { errors, remote } = await loadExperience(page, kind);
    const card = page.locator(".workflow-number").filter({ has: page.getByText("Traversal", { exact: true }) });
    await expect(card).toContainText("Unavailable");
    await expect(card).toContainText(kind === "traversal-invalid" ? "Invalid" : "Unsupported");
    await expect(card).not.toContainText("3/15");
    await expect(card).not.toContainText("20 %");
    const row = page.locator(".traversal-panel tbody tr").filter({ hasText: "Fast forward" });
    await expect(row.locator('.bar-mark[data-baseline="false"]')).toHaveCount(0);
    await expect(row).not.toContainText("3/15 loaded");
    await row.getByRole("link", { name: "Fast forward", exact: true }).click();
    await expect(page.locator(".evidence-head")).toContainText(kind === "traversal-invalid" ? "Invalid capture" : "Unsupported");
    await expect(page.locator('.measures')).not.toContainText('3 / 15');
    await expect(page.locator('.measures')).toContainText('raw evidence only');
    await expect(page.locator('.evidence .bar')).toHaveCount(0);
    await page.getByText("Complete canonical record (machine precision)", { exact: true }).click();
    await expect(page.locator("pre.raw-evidence").last()).toContainText('"renderedCount": 3');
    await expect(page.locator("pre.raw-evidence").last()).toContainText(kind === "traversal-invalid" ? '"captureValid": false' : '"supported": false');
    expect(errors).toEqual([]);
    expect(remote).toEqual([]);
  });
}

for (const kind of ["traversal-over-total", "traversal-empty"] as const) {
  test(`dashboard integration: ${kind} cannot earn a reassuring traversal grade`, async ({ page }) => {
    const { errors, remote } = await loadExperience(page, kind);
    const row = page.locator(".traversal-panel tbody tr").filter({ hasText: "Fast forward" });
    await expect(row.locator('.engineering-grade')).toHaveText("Unrated");
    await expect(row.locator('.bar-mark[data-metric="renderedCount"]')).toHaveCount(0);
    const card = page.locator(".workflow-number").filter({ has: page.getByText("Traversal", { exact: true }) });
    await expect(card).toContainText("Unavailable");
    await expect(card).not.toContainText("100 %");
    await row.getByRole("link", { name: "Fast forward", exact: true }).click();
    await expect(page.locator('.record-assessment')).toContainText("Unrated");
    await expect(page.locator('.measures')).toContainText('raw evidence only');
    await expect(page.locator('.measures')).not.toContainText(/3 \/ 0|16 \/ 15|-1 \/ 15|15 \/ 15/);
    await expect(page.locator('.evidence .bar')).toHaveCount(0);
    await expect(page.locator('.evidence')).not.toContainText('Infinity');
    await page.getByText('Complete canonical record (machine precision)',{exact:true}).click();
    await expect(page.locator('pre.raw-evidence').last()).toContainText('"renderedCount"');
    expect(errors).toEqual([]);
    expect(remote).toEqual([]);
  });
}

test("dashboard integration: valid zero traversal remains a measured adverse control", async ({ page }) => {
  await loadExperience(page, "traversal-zero");
  const row = page.locator(".traversal-panel tbody tr").filter({ hasText: "Fast forward" });
  await expect(row.locator('.bar-mark[data-metric="renderedCount"][data-value="0"]')).toHaveCount(1);
  await expect(row).toContainText("0/15 loaded");
  await expect(row).toContainText("Weak");
  await row.getByRole('link',{name:'Fast forward',exact:true}).click();
  await expect(page.locator('.measures')).toContainText('0 / 15');
  await expect(page.locator('.evidence .bar')).toHaveAttribute('style','width:0%');
});

for (const kind of ['healthy','censored'] as const) {
  test(`bounded corrections: valid exact traversal ${kind} retains cadence and outcomes`,async ({page})=>{
    const {errors,remote}=await loadExperience(page,kind);
    await page.locator('.traversal-panel tbody tr').filter({hasText:'Fast forward'}).getByRole('link',{name:'Fast forward',exact:true}).click();
    await expect(page.locator('.measures')).toContainText('3 / 15');
    await expect(page.locator('.evidence .bar')).toHaveAttribute('style','width:20%');
    await expect(page.locator('.outcomes')).toContainText(kind==='censored'?'0/5 final landings completed · 5/5 censored':'5/5 final landings completed · 0/5 censored');
    if(kind==='censored')await expect(page.locator('.record-assessment')).toContainText('Adverse outcome');
    expect(errors).toEqual([]);expect(remote).toEqual([]);
  });
}

test("dashboard integration: saved fullscreen observations are uncharted, not unmeasured", async ({ page }) => {
  await loadExperience(page);
  await page.getByRole("navigation").getByRole("link", { name: "Image Workflows", exact: true }).click();
  await expect(page.locator("#image-return")).toContainText("Not charted in this summary; saved observations are available below.");
  await expect(page.locator("#image-return")).not.toContainText("unavailable in this projection");
  await expect(page.locator('#image-return a[href*="JB5"]')).toHaveCount(1);
});

test("dashboard integration: invalid density remains unassessed",async ({page})=>{
  await loadExperience(page,"density-invalid");
  await expect(page.locator('.workflow-number').first()).toContainText("Partial / unrated");
  await expect(page.locator('a.bar-mark[data-metric="middleFrameP95Ms"][data-value="1"]')).toHaveCount(0);
  await page.locator('a[href*="metric=middleFrameP95Ms"][href*="D1-grid"]').first().click();
  await expect(page.locator('#metric-middleFrameP95Ms')).toContainText("invalid");
  await expect(page.locator('.evidence .bar')).toHaveCount(0);
  await page.getByRole('link',{name:'← Scrolling & Layout summary',exact:true}).click();
  await expect(page.locator('#scroll-browsing .bar-mark[data-metric="middleFrameP95Ms"][data-value="1"]')).toHaveCount(0);
  await expect(page.locator('#scroll-browsing')).toContainText("Unavailable");
});

test("dashboard integration: invalid signed guards remain unassessed",async ({page})=>{
  await loadExperience(page,"guards-invalid");
  await page.getByRole('link',{name:'Image Workflows',exact:true}).click();
  await expect(page.locator('#image-return .guard-displacement')).toHaveCount(0);
  await expect(page.locator('#image-return')).toContainText("Invalid capture");
});

test("dashboard integration: larger populations do not relabel p95 as maximum",async ({page})=>{
  await loadExperience(page,"large");
  await expect(page.locator('#context')).toContainText("n=40");
  const mark=page.locator('.action-table tbody tr').filter({hasText:"Detail · double-click"}).locator('.maximum-mark');
  await expect(mark).toHaveAttribute('aria-label',/recorded p95/);
  await expect(page.locator('.overview-key')).not.toContainText(/Observed max|Synthetic max/);
  await expect(page.locator('.action-table thead')).not.toContainText("observed max");
  await expect(page.locator('.plot-heading')).not.toContainText(["observed max","observed max","observed max"]);
  await mark.click();
  await expect(page.locator('.measures')).toContainText("Recorded p95 · 40 contributors");
  await expect(page.locator('#metric-dt_visual_settled_p95_ms')).not.toContainText("observed maximum");
});

test("dashboard integration: absent image endpoint stays unrated without JA2 masking",async ({page})=>{
  await loadExperience(page,"missing-endpoint");
  await expect(page.locator('.workflow-number').filter({hasText:'Detail entry'})).toContainText('Unrated');
  await page.getByRole('link',{name:'Image Workflows',exact:true}).click();
  const row=page.locator('#image-detail tbody tr').filter({hasText:'Detail · returned image'});
  await expect(row.locator('.bar-mark')).toHaveCount(0);
  await row.locator('.missing-value a').click();
  await expect(page.locator('#metric-detailImageReadyMs')).toContainText('Absent');
  await expect(page.locator('#metric-detailImageReadyMs th')).toBeFocused();
});

test("dashboard integration: absent pending field cannot break scroll evidence",async ({page})=>{
  const {errors}=await loadExperience(page,"missing-pending");
  await page.locator('a[href*="metric=middleFrameP95Ms"][href*="D1-grid"]').first().click();
  await page.getByRole('link',{name:'← Scrolling & Layout summary',exact:true}).click();
  const pending=page.locator('#scroll-browsing section[aria-label="Pending slots (%)"]');
  await expect(pending.locator('.bar-mark[data-baseline="false"]')).toHaveCount(2);
  await expect(pending).toContainText('Unavailable');
  await pending.locator('.missing-value a').first().click();
  await expect(page.locator('#metric-middlePendingVisibleRatioMean')).toContainText('Absent');
  expect(errors).toEqual([]);
});

test("dashboard integration: missing whole family stays visibly absent",async ({page})=>{
  await loadExperience(page,"missing-family");
  await expect(page.locator('#context')).toContainText("44 records / 78");
  await expect(page.locator('#context')).toContainText("rendering/rendering/2030-01-01T12:00:00.000Z: missing");
  await expect(page.locator('a.bar-mark[data-metric="landingRenderMs"]')).toHaveCount(0);
  await expect(page.locator('.workflow-number').filter({hasText:"Detail entry"})).toContainText("Unrated");
});

test("dashboard integration: zero baseline retains zero and has no invented percentage delta",async ({page})=>{
  await loadExperience(page,"zero-baseline");
  await page.getByRole('combobox',{name:'Baseline',exact:true}).selectOption('prior');
  const row=page.locator('.action-table tbody tr').filter({hasText:"Detail · returned image"});
  await expect(row.locator('a.bar-mark[data-baseline="true"]')).toHaveAttribute('data-value','0');
  await expect(row.locator('.delta-mini')).toContainText("% n/a");
  await expect(row).not.toContainText(/Infinity|NaN/);
});

test("dashboard integration: mobile tables and keyboard groups do not overflow the page", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await loadExperience(page);
  await page.getByRole("link", { name: "Image Workflows", exact: true }).click();
  await expect(page.locator("main")).toBeFocused();
  const group = page.getByRole("link", { name: "Traversal", exact: true }).first();
  await group.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#image-traversal")).toBeFocused();
  const table = page.getByRole("region", { name: "Traversal charts; scroll horizontally on narrow screens" });
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

type Dashboard = typeof dashboards[number];

async function loadDashboard(page: Page, dashboard: Dashboard, deliveryComparison = false, mixedHistory = false, landingOutcomes: boolean | "latest-censored" = false, imageProbes = false) {
  await page.route("**/*", route => route.abort());
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  const entries = [10, 20, 30].map((value, index) => ({
    label: `Fixture ${index + 1}`,
    timestamp: `2026-01-0${index + 1}T12:00:00Z`,
    gitSha: "fixture",
    runs: 3,
    campaignId: `fixture-campaign-${index}`,
    ...(dashboard === "perceived" && !imageProbes ? { kind: mixedHistory && index === 1 ? "long" : "short" } : {}),
    environment: deliveryComparison ? {
      dataMode: "media-api", apiTopology: "deployed-test", mediaDelivery: index === 2 ? "canonical" : "proxy",
      appBaseUrl: "https://fixture.invalid", browserName: "chromium", browserVersion: "fixture",
      os: { platform: "fixture", release: "fixture", architecture: "fixture" }, viewport: { width: 1720, height: 960 },
      screen: { width: 1720, height: 960 }, deviceScaleFactor: index === 0 ? 1 : 2, headed: true, cpuThrottle: 0,
      cacheClass: "fixture", workers: 1, stableUntil: "2026-02-15", appSourceDirtyStateHash: "fixture",
    } : { dataMode: "direct-es" },
    ...(dashboard === "audit" || imageProbes ? {
      metrics: {
        P1: { severeRate: value, severe: value, maxFrame: value, frameCount: 100, scenarioRevision: !deliveryComparison && index === 1 ? 2 : 1 },
        P2: { severeRate: 100, severe: 1, frameCount: 10 },
        ...(landingOutcomes ? {
          P13c: {
            imageLookupCount: 1,
            completionBoundary: "singleton-response-and-bounded-returned-media",
            detailImageFailedCount: index === 2 ? 1 : 0,
            scenarioRevision: landingOutcomes === "latest-censored" && index < 2 ? 2 : 3,
            cacheClass: landingOutcomes === "latest-censored" && index < 2 ? "nonresident-metadata-warm-media" : "nonresident-metadata-returned-media",
            sampleCount: index === 2 ? 2 : 1,
            detailObservationLimitMs: 15_000,
            detailImageReadyMs: index === 0 || landingOutcomes === "latest-censored" && index === 2 ? null : index === 1 ? 8_300 : 3_000,
            detailImageReadyCount: index === 0 || landingOutcomes === "latest-censored" && index === 2 ? 0 : 1,
            detailImageCensoredCount: landingOutcomes === "latest-censored" && index === 2 ? 2 : index === 1 ? 0 : 1,
            mediaResourceReusedCount: index === 0 ? 1 : 0,
            mediaResourceNotReusedCount: index === 0 ? 0 : 1,
            mediaResourceReuseUnknownCount: index === 2 ? 1 : 0,
          },
          P14b: {
            imageLookupCount: 0,
            completionBoundary: "traversal-and-bounded-landing",
            scenarioRevision: 3, sampleCount: index === 2 ? 2 : 1,
            landingRenderMs: index === 0 ? null : index === 1 ? 8_300 : 3_000,
            landingRenderedCount: index === 0 ? 0 : 1,
            landingCensoredCount: index === 1 ? 0 : 1,
          },
        } : {}),
      },
    } : {
      perceived: {
        ...(mixedHistory && index === 1 ? {
          JA: { label: "Long action", action: "journey", dt_ack_ms: value, dt_visual_settled_ms: value * 10 },
          JB: { label: "Long diagnostic", action: "journey", metricClass: "background-diagnostic", dt_ack_ms: value, dt_visual_settled_ms: value * 10 },
        } : {
          PP1: { label: "Fixture action", action: "home-logo", dt_ack_ms: value, dt_store_ready_ms: value, dt_visual_settled_ms: value * 10, scenarioRevision: !deliveryComparison && index === 1 ? 2 : 1 },
          ...(mixedHistory ? {
            PP10: { label: "Short diagnostic", action: "map", metricClass: "background-diagnostic", dt_ack_ms: value + 5, dt_visual_settled_ms: (value + 5) * 10 },
          } : {}),
        }),
      },
    }),
  }));
  const bootstrap = `<script>
    ${readFileSync(new URL("../results/campaign-comparison.js", import.meta.url), "utf8")}
    window.__AUDIT_LOG__ = ${JSON.stringify({ entries: dashboard === "audit" || imageProbes ? entries : [] })};
    window.__PERCEIVED_LOG__ = ${JSON.stringify({ entries: imageProbes ? [] : entries })};
    window.__chartConfigs = new Map();
    window.__destroyedCharts = [];
    window.Chart = class {
      constructor(context, config) {
        this.id = context.canvas.id;
        window.__chartConfigs.set(this.id, config);
      }
      destroy() {
        window.__destroyedCharts.push(this.id);
        window.__chartConfigs.delete(this.id);
      }
    };
  </script>`;
  const html = readFileSync(new URL(`../results/${dashboard}-graphs.html`, import.meta.url), "utf8")
    .replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace("<head>", `<head>${bootstrap}`);
  await page.setContent(html);
  await expect(page.getByRole("status", { name: "Metric guide" })).toBeVisible();
  return { requests, errors };
}

test("perceived: selecting short campaigns reconciles cards and charts in both grids", async ({ page }) => {
  const { requests, errors } = await loadDashboard(page, "perceived", false, true);
  await page.getByLabel("background diagnostics", { exact: true }).check();
  await expect(page.locator("#grid .card")).toHaveCount(2);
  await expect(page.locator("#diagnosticGrid .card")).toHaveCount(2);
  const initial = await page.evaluate(() => {
    const fixtures = window as any;
    fixtures.__destroyedCharts.length = 0;
    return [...fixtures.__chartConfigs.keys()].sort();
  });
  expect(initial).toEqual(["canvas-JA", "canvas-JB", "canvas-PP1", "canvas-PP10"]);

  await page.getByLabel("Campaign", { exact: true }).selectOption("2");
  await page.getByLabel("Compare with", { exact: true }).selectOption("0");
  await page.getByRole("combobox", { name: "Metric", exact: true }).selectOption("dt_visual_settled_ms");
  await expect(page.locator("#card-JA, #card-JB")).toHaveCount(0);
  await expect(page.locator("#grid .card")).toHaveCount(1);
  await expect(page.locator("#diagnosticGrid .card")).toHaveCount(1);
  for (const id of ["PP1", "PP10"]) {
    await expect(page.locator(`#card-${id} .metric-summary`)).toContainText("Visual settled (ms)");
  }
  const state = await page.evaluate(() => {
    const fixtures = window as any;
    return {
      destroyed: fixtures.__destroyedCharts,
      charts: [...fixtures.__chartConfigs].map(([id, config]: any) => ({
        id, labels: config.data.labels,
        points: config.data.datasets.filter((dataset: any) => !dataset.label.startsWith("Target")).map((dataset: any) => dataset.data),
      })),
    };
  });
  for (const id of ["canvas-JA", "canvas-JB"]) {
    expect(state.destroyed.filter((destroyed: string) => destroyed === id)).toHaveLength(1);
  }
  expect(state.charts.map(chart => chart.id).sort()).toEqual(["canvas-PP1", "canvas-PP10"]);
  expect(state.charts.find(chart => chart.id === "canvas-PP1")?.points).toEqual([[100, 300]]);
  expect(state.charts.find(chart => chart.id === "canvas-PP10")?.points).toEqual([[150, 350]]);
  for (const chart of state.charts) expect(chart.labels).toHaveLength(2);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("audit: campaign metadata is known and navigation reaches the renamed dashboard", async ({ page }) => {
  const { requests, errors } = await loadDashboard(page, "audit");
  await expect(page.locator("#warnings")).toBeEmpty();
  await expect(page.getByRole("link", { name: "Performance dashboard", exact: true })).toHaveAttribute("href", "Performance%20dashboard.html");
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("perceived: imported image outcomes retain boundaries, failures and resource evidence", async ({ page }) => {
  const { requests, errors } = await loadDashboard(page, "perceived", false, false, true, true);
  const metric = page.getByRole("combobox", { name: "Metric", exact: true });
  await metric.selectOption("detailImageReadyMs");
  const card = page.locator("#card-P13c");
  await expect(card).toContainText("returned media");
  await expect(card).not.toContainText("/ warm media");
  await expect(card).toContainText("1/2 completed · 1 incomplete");
  await expect(card).toContainText("1 failed (included in incomplete)");
  await expect(card).toContainText("Exact warmed URL reused / not reused / unknown: 0 / 1 / 1");
  await expect(card).toContainText("Boundary: singleton-response-and-bounded-returned-media");
  await expect(card).toContainText("Observation cap: 15s (not latency)");
  await expect(page.locator("#metricBanner")).toBeHidden();
  for (const name of ["detailImageReadyCount", "detailImageCensoredCount", "detailImageFailedCount", "mediaResourceReusedCount", "mediaResourceNotReusedCount", "mediaResourceReuseUnknownCount"]) {
    await metric.selectOption(name);
    await expect(page.locator("#metricGuide")).not.toContainText(/Lower is better|undefined/);
    await expect(card.locator(".metric-summary")).not.toContainText(/\\dms/);
  }
  await metric.selectOption("landingRenderMs");
  await expect(page.locator("#card-P14b")).toContainText("1/2 completed · 1 incomplete");
  await expect(page.getByRole("link", { name: "Performance dashboard", exact: true })).toHaveAttribute("href", "Performance%20dashboard.html");
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("perceived: latest censored image evidence stays visible without an older success or empty chart", async ({ page }) => {
  const { requests, errors } = await loadDashboard(page, "perceived", false, false, "latest-censored", true);
  await page.getByRole("combobox", { name: "Metric", exact: true }).selectOption("detailImageReadyMs");
  const card = page.locator("#card-P13c");
  await expect(card).toContainText("0/2 completed · 2 incomplete");
  await expect(card).toContainText("measurement unavailable");
  await expect(card).not.toContainText(/8,?300ms/);
  await expect(card.locator("canvas")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__chartConfigs.size)).toBe(0);
  await page.evaluate(() => {
    const fixture = window as any;
    fixture.__AUDIT_LOG__ = { entries: [] };
    fixture.ingestLog({ entries: [{ label: "No image probe", timestamp: "2026-01-04T12:00:00Z", perceived: { PP1: { action: "home-logo", dt_ack_ms: 10 } } }] });
  });
  await expect(card).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("perceived: historical missing outcome counts remain unknown, not zero", async ({ page }) => {
  const { errors } = await loadDashboard(page, "perceived", false, false, true, true);
  await page.evaluate(() => {
    const fixture = window as any;
    for (const entry of fixture.__AUDIT_LOG__.entries) {
      for (const key of ["detailImageReadyCount", "detailImageCensoredCount", "detailImageFailedCount", "mediaResourceReusedCount", "mediaResourceNotReusedCount", "mediaResourceReuseUnknownCount"]) delete entry.metrics.P13c[key];
    }
    fixture.ingestLog({ entries: [] });
  });
  await page.getByRole("combobox", { name: "Metric", exact: true }).selectOption("detailImageReadyMs");
  await expect(page.locator("#card-P13c")).toContainText("Completion outcomes not recorded");
  await expect(page.locator("#card-P13c")).not.toContainText("0 incomplete");
  expect(errors).toEqual([]);
});

test("audit: landing and standalone charts retain censored outcomes without invented latency", async ({ page }) => {
  const { requests, errors } = await loadDashboard(page, "audit", false, false, true);
  const metric = page.getByRole("combobox", { name: "Metric", exact: true });
  for (const [name, expected] of [
    ["detailImageReadyMs", [null, 8_300, 3_000]],
    ["detailImageReadyCount", [0, 1, 1]],
    ["detailImageCensoredCount", [1, 0, 1]],
    ["mediaResourceReusedCount", [1, 0, 0]],
    ["mediaResourceNotReusedCount", [0, 1, 1]],
    ["landingRenderMs", [null, 8_300, 3_000]],
    ["landingRenderedCount", [0, 1, 1]],
    ["landingCensoredCount", [1, 0, 1]],
  ] as const) {
    await metric.selectOption(name);
    await expect(page.locator("#grid .card")).toHaveCount(1);
    const points = await page.evaluate(() => {
      const [config] = (window as any).__chartConfigs.values();
      return config.data.datasets.filter((dataset: any) => !dataset.label.startsWith("Target")).flatMap((dataset: any) => dataset.data);
    });
    expect(points).toEqual(expected);
  }
  await expect(page.getByRole("status", { name: "Metric guide" })).toContainText("still incomplete at 15 seconds");
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("audit: latest censored returned media cannot show an older warm-media success", async ({ page }) => {
  const { requests, errors } = await loadDashboard(page, "audit", false, false, "latest-censored");
  await page.getByRole("combobox", { name: "Metric", exact: true }).selectOption("detailImageReadyMs");
  await expect(page.locator("#grid")).toContainText("not ready within 15s");
  await expect(page.locator("#grid")).not.toContainText("8300");
  expect(await page.evaluate(() => (window as any).__chartConfigs.size)).toBe(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

for (const dashboard of dashboards) {
  test(`${dashboard}: selected delivery pair shows exact deltas and refuses mismatched viewports`, async ({ page }) => {
    const { errors, requests } = await loadDashboard(page, dashboard, true);
    await page.getByLabel("Campaign", { exact: true }).selectOption("2");
    await page.getByLabel("Compare with", { exact: true }).selectOption("1");
    await expect(page.locator("#comparisonStatus")).toContainText("Changed mediaDelivery; recorded source fingerprints match; identical source not verified (untracked file contents not covered)");
    await expect(page.locator("#grid .selected-comparison").first()).toContainText(/20.*30.*delta 10/);
    const labels = await page.evaluate(() => {
      const configs = (window as any).__chartConfigs;
      return [...configs.values()].flatMap((config: any) => config.data.datasets.map((dataset: any) => dataset.label));
    });
    expect(labels).toContain("TEST API / proxy");
    expect(labels).toContain("TEST API / canonical");
    await page.getByLabel("Compare with", { exact: true }).selectOption("0");
    await expect(page.locator("#comparisonStatus")).toContainText("Different deviceScaleFactor");
    await expect(page.locator("#grid .selected-comparison").first()).toHaveText("Selected pair: no comparable evidence");
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  });

  test(`${dashboard}: metric buttons, dropdown and keyboard share bounded navigation and complete help`, async ({ page }) => {
    const { requests, errors } = await loadDashboard(page, dashboard);
    const metric = page.getByRole("combobox", { name: "Metric", exact: true });
    const previous = page.getByRole("button", { name: "Previous metric", exact: true });
    const next = page.getByRole("button", { name: "Next metric", exact: true });
    const guide = page.getByRole("status", { name: "Metric guide" });
    const values = await metric.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    await expect(previous).toBeDisabled();
    await expect(metric).toHaveValue(values[0]);
    await next.click();
    await expect(metric).toHaveValue(values[1]);
    await expect(previous).toBeEnabled();
    await page.keyboard.press("ArrowRight");
    await expect(metric).toHaveValue(values[2]);
    await page.keyboard.press("ArrowLeft");
    await expect(metric).toHaveValue(values[1]);
    await previous.click();
    await expect(metric).toHaveValue(values[0]);
    await expect(previous).toBeDisabled();

    for (const value of values) {
      await metric.selectOption(value);
      const label = await metric.locator("option:checked").textContent();
      await expect(guide).toContainText(label!);
      await expect(guide).not.toContainText(/undefined|No description/);
      expect((await guide.textContent())!.length).toBeGreaterThan(label!.length + 20);
    }
    await expect(next).toBeDisabled();
    await previous.click();
    await expect(next).toBeEnabled();
    await expect(metric).toHaveValue(values[values.length - 2]);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${dashboard}: arrows are left to form controls and nested editable content`, async ({ page }) => {
    const { requests, errors } = await loadDashboard(page, dashboard);
    const metric = page.getByRole("combobox", { name: "Metric", exact: true });
    const originalValue = await metric.inputValue();
    await page.evaluate(() => {
      const fixture = document.createElement("div");
      fixture.id = "editing-fixture";
      fixture.innerHTML = '<input aria-label="Text"><textarea aria-label="Notes"></textarea><select aria-label="Other"><option>One</option></select><div contenteditable="true"><span id="editable-child">Editable text</span></div>';
      document.body.append(fixture);
    });
    for (const selector of ["#metric", "#editing-fixture input", "#editing-fixture textarea", "#editing-fixture select", "#editable-child"]) {
      for (const key of ["ArrowLeft", "ArrowRight"]) {
        const allowed = await page.locator(selector).evaluate((element, key) =>
          element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })), key);
        expect(allowed).toBe(true);
        await expect(metric).toHaveValue(originalValue);
      }
    }
    const allowed = await page.locator("body").evaluate(element =>
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true, cancelable: true })));
    expect(allowed).toBe(true);
    await expect(metric).toHaveValue(originalValue);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${dashboard}: navigation retains comparable series and tooltip callbacks`, async ({ page }) => {
    const { requests, errors } = await loadDashboard(page, dashboard);
    const points = () => page.evaluate(() => {
      const configs = (window as unknown as { __chartConfigs: Map<string, { data: { datasets: { data: (number | null)[] }[] } }> }).__chartConfigs;
      return [...configs.values()][0].data.datasets[0].data;
    });
    await expect.poll(points).toEqual([10, null, 30]);
    await expect(page.locator("#grid .card")).toHaveCount(1);
    await page.getByRole("button", { name: "Next metric", exact: true }).click();
    await page.getByRole("button", { name: "Previous metric", exact: true }).click();
    await expect.poll(points).toEqual([10, null, 30]);
    await expect(page.locator("#grid .card")).toHaveCount(1);
    await page.getByLabel("comparable within each mode").uncheck();
    await expect.poll(points).toEqual([10, 20, 30]);
    const tooltip = await page.evaluate(() => {
      const configs = (window as unknown as { __chartConfigs: Map<string, { options: { plugins: { tooltip: { callbacks: Record<string, (...args: any[]) => string> } } } }> }).__chartConfigs;
      const callbacks = [...configs.values()][0].options.plugins.tooltip.callbacks;
      return {
        label: callbacks.label({ dataset: { label: "direct ES" }, raw: 30, parsed: { y: 30 } }),
        title: callbacks.title?.([{ dataIndex: 2 }]),
        detail: callbacks.afterLabel?.({ dataIndex: 2 }),
      };
    });
    expect(tooltip.label).toContain("direct ES: 30");
    if (dashboard === "audit") {
      expect(tooltip.title).toContain("Fixture 3");
      expect(tooltip.detail).toContain("runs:3");
    }
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

const historyUrl = new URL("../results/Performance%20dashboard.html", import.meta.url);
async function loadHistory(page: Page, hash: string) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:/, route => route.abort());
  await page.goto(`${historyUrl.href}#checkpoint=recorded&baseline=proxy-baseline&mode=history&${hash}`);
  await page.waitForSelector("svg[data-chart]");
  return errors;
}
const historyModel = (page: Page, script: string) => page.evaluate(script);

test("history: lines never join across contract, environment or withheld values", async ({ page }) => {
  const errors = await loadHistory(page, "view=scroll&h.data=synthetic");
  const result = await historyModel(page, `(() => {
    const H = window.KupuaHistoryModel, view = { dir: "forward", phase: "middle", stat: "median" };
    const items = H.model({ density: { entries: window.KupuaHistoryFixtures.build(window.__DENSITY_LOG__).entries } }, true).kinds.density;
    const row = id => H.WORKFLOWS.scroll.rows.find(r => r.id === id), col = (r, id) => r.columns.find(c => c.id === id);
    const points = (metric, density) => items.map(item => H.point(item, row(metric), col(row(metric), density), view));
    return { frame: H.segments(points("frame", "grid")).map(([a, b]) => [items.indexOf(a.item), items.indexOf(b.item)]),
      pendingJustified: points("pending", "justified").map(p => p.state),
      zero: points("pending", "justified")[3].value, tableRecovery: points("recovery", "table")[6].state };
  })()`) as { frame: number[][]; pendingJustified: string[]; zero: number; tableRecovery: string };
  // r2 0-1 join; r4 local joins 2-3-6; invalid grid at 7 breaks before 8; unknown env (4) and TEST (5) never join.
  expect(result.frame).toEqual([[0, 1], [2, 3], [3, 6]]);
  expect(result.pendingJustified[6]).toBe("partial");
  expect(result.zero).toBe(0);
  expect(result.tableRecovery).toBe("unavailable");
  await expect(page.locator(".synthetic-banner")).toContainText("SYNTHETIC");
  await expect(page).toHaveTitle(/SYNTHETIC/);
  expect(errors).toEqual([]);
});

test("history: baseline pin and selected point survive reload and Back; current follows latest", async ({ page }) => {
  const errors = await loadHistory(page, "view=scroll");
  await expect(page.locator(".role-pill").nth(0)).toContainText("latest · follows new results");
  await expect(page.locator(".role-pill").nth(1)).toContainText("registered proxy baseline");
  const currentLabel = await page.locator(".role-pill").nth(0).innerText();
  const chart = page.getByRole("group", { name: /Table Frame p95 history/ });
  await chart.getByRole("link", { name: /23 Oct 03:30 UTC, Local API · proxy media, r4/ }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  expect(label).toContain("23 Oct 03:30 UTC, Local API · proxy media, r4");
  await page.keyboard.press("Enter");
  await expect(page.locator("#inspector-title")).toHaveText("Table · Frame p95 · 23 Oct 03:30 UTC");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe(label);
  await page.getByRole("link", { name: "Set as baseline" }).click();
  await expect(page.locator(".role-pill").nth(1)).toContainText("23 Oct 03:30 UTC");
  await expect(page.locator(".role-pill").nth(1)).toContainText("pinned");
  await page.reload();
  await expect(page.locator(".role-pill").nth(1)).toContainText("pinned");
  await expect(page.locator("#inspector-title")).toHaveText("Table · Frame p95 · 23 Oct 03:30 UTC");
  await expect(page.locator(".role-pill").nth(0)).toHaveText(currentLabel);
  await page.goBack();
  await expect(page.locator(".role-pill").nth(1)).toContainText("registered proxy baseline");
  await page.goForward();
  await page.locator("#baseline").selectOption("none");
  await expect(page.locator(".role-pill").nth(1)).toContainText("pinned");
  await page.getByRole("navigation", { name: "Scrolling & Layout views" }).getByRole("link", { name: "Compare" }).click();
  await expect(page.locator(".scroll-summary")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#inspector-title")).toHaveText("Table · Frame p95 · 23 Oct 03:30 UTC");
  expect(errors).toEqual([]);
});

test("history: same-campaign and incompatible selections withhold C−B", async ({ page }) => {
  const errors = await loadHistory(page, "view=scroll&c.density=2026-10-15T15:04:40.618Z&b.density=2026-10-24T04:32:34.673Z");
  await expect(page.locator('section[aria-label="Frame p95 history"] .hdelta').first()).toContainText("withheld");
  await page.goto(`${historyUrl.href}#view=scroll&mode=history&c.density=2026-10-24T04:32:34.673Z&b.density=2026-10-24T04:32:34.673Z`);
  await expect(page.locator('section[aria-label="Frame p95 history"] .hdelta').first()).toContainText("same campaign");
  expect(errors).toEqual([]);
});

test("history: Search pins are per family; revisions and inferred environments never join", async ({ page }) => {
  const errors = await loadHistory(page, "view=search");
  await expect(page.locator(".history-kind").nth(0)).toContainText("26 earlier entries predate these fields");
  await expect(page.locator('[aria-label="Long responsiveness selection"] .role-pill').nth(1)).toContainText("no registered baseline");
  const joins = await historyModel(page, `(() => {
    const H = window.KupuaHistoryModel, view = { stat: "median" }, row = H.WORKFLOWS.search.rows[0];
    const items = H.model({ perceived: window.__PERCEIVED_LOG__ }, false).kinds.short;
    const points = items.map(item => H.point(item, row, row.columns[0], view));
    return H.segments(points).map(([a, b]) => [a.revision, b.revision, a.item.env.inferred || b.item.env.inferred]);
  })()`) as [number, number, boolean][];
  expect(joins.length).toBeGreaterThan(10);
  expect(joins.filter(([a, b, inferred]) => a !== b || inferred)).toEqual([]);
  await page.getByRole("group", { name: /Sort around focus Action/ }).locator('a.hpt[tabindex="0"]').focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Set as baseline" }).click();
  await expect(page.locator('[aria-label="Short responsiveness selection"] .role-pill').nth(1)).toContainText("pinned");
  await expect(page.locator('[aria-label="Long responsiveness selection"] .role-pill').nth(1)).toContainText("no registered baseline");
  await page.reload();
  await expect(page.locator('[aria-label="Short responsiveness selection"] .role-pill').nth(1)).toContainText("pinned");
  expect(errors).toEqual([]);
});

test("history: Image traversal reuses the shared evidence gate and refuses r2/r3 comparison", async ({ page }) => {
  const errors = await loadHistory(page, "view=images");
  const panel = page.locator('section[aria-label="Traversal · P14b fast forward history"]');
  await expect(panel.locator(".hdelta").nth(0)).toContainText("withheld");
  await expect(panel.locator(".hdelta").nth(1)).toContainText("Contract mismatch: scenarioRevision");
  const current = await historyModel(page, `(() => {
    const H = window.KupuaHistoryModel, row = H.WORKFLOWS.images.rows[1];
    const items = H.model({ audit: window.__AUDIT_LOG__ }, false).kinds.rendering, latest = items.at(-1);
    return [H.point(latest, row, row.columns[0], { stat: "median" }).value, window.ASSESSMENT.traversalEvidence(latest.records.P14b).percentage];
  })()`) as [number, number];
  expect(current[0]).toBe(current[1]);
  expect(errors).toEqual([]);
});

test("history: p95 points own the saved p95 field through Compare evidence; direction is per metric", async ({ page }) => {
  const errors = await loadHistory(page, "view=search&h.stat=p95&h.point=short~2026-10-24T08:33:51.333Z~actions~PP3");
  await expect(page.locator(".history-inspector")).toContainText("dt_visual_settled_p95_ms");
  await page.getByRole("link", { name: "Open in Compare evidence →", exact: true }).click();
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("metric"))).toBe("dt_visual_settled_p95_ms");
  await page.goto(`${historyUrl.href}#view=images&mode=history`);
  const traversal = page.locator('section[aria-label="Traversal · P14b fast forward history"]');
  await expect(traversal.locator(".panel-heading span")).not.toContainText("is better");
  await expect(traversal.locator("h3").nth(0)).toContainText("higher is better");
  await expect(traversal.locator("h3").nth(1)).toContainText("lower is better");
  expect(errors).toEqual([]);
});
