import React,{useState,useEffect,useLayoutEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import '@/index.css';
import {MetadataEditorContext,FormBatchContext,SavingValue,FieldSaveNote,MetadataSaveFeedback} from '@/components/MetadataEditing';
import {MetadataFormField,MetadataTextEditor} from '@/components/MetadataTextEditor';
import {MetadataRow,ValueLink} from '@/components/metadata-primitives';
import {RightsCreatorInput} from '@/components/RightsCreatorInput';
import {EditableSearchPill} from '@/components/SearchPill';
import {EditIssueDisclosure} from '@/components/EditIssueDisclosure';
import {createMetadataEditorStore} from '@/stores/metadata-editor-store';
import {FIELDS_BY_ID} from '@/lib/field-registry';

const cases={
  'Field save vs batch apply':['Idle','Saving…','Confirmed'],
  'Direct scalar edit':['Idle','Draft','Saving…','Not saved','Not confirmed','Confirmed'],
  'Rights-derived Credit':['Idle','Saving…','Not saved','Not confirmed','Confirmed'],
  'Description guidance':['Valid','Short','Empty','Permission pending','Not saved','Not confirmed','Valid'],
  'Required Creator':['Valid','Required','Valid','Saving…','Not saved','Not confirmed'],
  'Keyword pills':['Idle','Pending existing','Pending new','Confirmed','Not saved','Not confirmed'],
  'Partial save / label steps':['Idle','Saving…','Partially saved','Issue details'],
  'Batch arrow disclosure':['Idle','Saving…','Not saved','Issue details','Idle'],
  'Selection issues':['Idle','Not saved','Not confirmed','Both','Reload required','Idle'],
  'Taken on / grant change':['Valid','Permission pending','Read only','Valid']
};
type Case=keyof typeof cases;
const noop=()=>{};
function specimenStore(){const store=createMetadataEditorStore();store.setState({connected:true,schedule:noop,flush:noop,settleDraftGrant:noop});return store}
function Spec({kind,state,upload}:{kind:Case;state:string;upload:boolean}){
  const [store]=useState(specimenStore),root=useRef<HTMLDivElement>(null);const id='local-study',ids=[id];
  const arrow=kind==='Batch arrow disclosure'||kind==='Field save vs batch apply'&&upload,derived=kind==='Rights-derived Credit',pills=kind==='Keyword pills',partial=kind==='Partial save / label steps';
  const desc=kind==='Description guidance',date=kind==='Taken on / grant change'; const fid=desc?'metadata_description':date?'metadata_dateTaken':pills?'metadata_keywords':partial?'labels':'metadata_credit';
  const field=FIELDS_BY_ID.get(fid)!;const value=desc?(state==='Valid'?'Residents wait for the first train at the station on Tuesday morning.':state==='Short'?'At the station':''):date?'2026-11-24T08:30:00Z':'Evening desk';
  const failed=state==='Not saved'||state==='Issue details',uncertain=state==='Not confirmed',busy=state==='Saving…';
  const status=busy||failed||uncertain||state==='Partially saved'?state==='Issue details'?'Not saved':state as 'Saving…'|'Not saved'|'Not confirmed'|'Partially saved':undefined;
  useLayoutEffect(()=>{const targets=arrow?['peer-1','peer-2']:ids;const save={id:1,sequence:1,intent:{fieldId:derived?'usageRights_category':fid,action:'overwrite',value,targetIds:targets},state:busy?'saving':'finished',excluded:0,items:targets.map(imageId=>({imageId,state:failed?'rejected':uncertain?'unknown':'accepted-awaiting-visibility',observation:busy?'pending':failed||uncertain?'unavailable':'observed',result:derived?{outcome:'acknowledged',metadataFromRights:failed?'rejected':uncertain?'unknown':'acknowledged'}:partial?{outcome:'partial',labelSteps:{acknowledged:1,rejected:1,uncertain:0,notSent:0}}:{outcome:failed?'rejected':uncertain?'unknown':'acknowledged'}}))} as any;
    store.setState({submit:()=>1,saves:new Map(status?[[1,save]]:[]),latestSingle:(_,key)=>status&&!arrow&&!derived&&key===fid?save:undefined,derivedOwners:new Map(derived&&status?[[JSON.stringify([id,fid]),1]]:[]),arrowSaves:new Map(arrow&&status?[[JSON.stringify(['local-batch',id,fid]),1]]:[])});
    if(!upload&&kind==='Direct scalar edit'&&state!=='Idle'&&state!=='Confirmed'){
      root.current?.querySelector<HTMLButtonElement>('[aria-label="Edit Credit"]')?.click();
      let timer=requestAnimationFrame(()=>{const input=root.current?.querySelector<HTMLInputElement>('input[aria-label="Credit"]');if(!input)return;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Evening desk');input.dispatchEvent(new Event('input',{bubbles:true}));if(state!=='Draft')timer=requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>('[aria-label="Commit Credit"]:enabled')?.click());});return()=>cancelAnimationFrame(timer);
    }
    if(arrow&&state==='Issue details'){const timer=requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>('.metadata-batch-tool button')?.click());return()=>cancelAnimationFrame(timer)}
  },[kind,state,upload]);
  let content:React.ReactNode;
  if(kind==='Required Creator')content=<fieldset disabled={busy||uncertain}><form className="usage-rights-form text-xs" data-field-state={status}><FieldSaveNote state={status}/><RightsCreatorInput label="Creator" options={['Staff photographer']} required value={state==='Required'?'':'Staff photographer'} className="w-full" onChange={noop}/></form></fieldset>;
  else if(kind==='Selection issues')content=upload?<small>Selection indicator is not on Upload Form.</small>:state==='Idle'?null:<EditIssueDisclosure count={state==='Both'?2:1} compact={false} below issues={(state==='Both'?[true,false]:[failed]).map((notSaved,index)=>({imageId:String(index),field:'Credit',notSaved,reload:state==='Reload required'}))}/>;
  else if(pills)content=<><div className="flex flex-wrap gap-1">{['Railway','Station platform','Evening departure',...(['Pending new','Confirmed'].includes(state)?['Commuters']:[])].map((text,index)=><EditableSearchPill key={text} value={text} cqlKey="keyword" count={state==='Pending new'&&index===3?0:1} total={1} pending={state==='Pending existing'&&index===1||state==='Pending new'&&index===3} onSearch={noop} onAdd={noop} onRemove={noop}/>)}</div>{upload&&<MetadataSaveFeedback fieldId={fid} targetIds={ids}/>}</>;
  else if(partial)content=<>{!upload&&<FieldSaveNote state={status}/>} {upload&&<MetadataSaveFeedback fieldId={fid} targetIds={ids}/>}</>;
  else if(upload)content=<MetadataFormField imageId={id} field={field} value={value} editable={!['Permission pending','Read only'].includes(state)} pendingGrant={state==='Permission pending'} required={!date} editorialGuidance/>;
  else if(kind==='Batch arrow disclosure'||date)content=<small>This control is specific to Upload Form.</small>;
  else if(kind==='Direct scalar edit')content=<dl className="wrap-anywhere"><MetadataTextEditor key={state} field={field} targetIds={ids} value={state==='Confirmed'?value:'Morning desk'}>{state==='Confirmed'?value:'Morning desk'}</MetadataTextEditor></dl>;
  else content=<dl className="wrap-anywhere"><MetadataRow label={field.label} fill><SavingValue saving={busy} state={derived?status:busy?'Saving…':undefined}><ValueLink cqlKey="credit" value={value||'Unknown'} onSearch={noop}/></SavingValue></MetadataRow></dl>;
  return <MetadataEditorContext value={store}><FormBatchContext value={upload?{key:'local-batch',ids:[id,'peer-1','peer-2']}:undefined}><div ref={root}>{content}</div></FormBatchContext></MetadataEditorContext>;
}
function Study(){const [kind,setKind]=useState<Case>('Field save vs batch apply'),[step,setStep]=useState(0),[play,setPlay]=useState(false),[narrow,setNarrow]=useState(false);const states=cases[kind],state=states[step]||states[0];const prev=useRef<{key:string;ys:number[]}>(),[motion,setMotion]=useState([0,0]);
 useEffect(()=>{if(play){const timer=setInterval(()=>setStep(n=>(n+1)%states.length),1700);return()=>clearInterval(timer)}},[play,states]);
 useLayoutEffect(()=>{const raf=requestAnimationFrame(()=>{const key=kind+narrow,ys=[...document.querySelectorAll('.ruler')].map(e=>e.getBoundingClientRect().top-e.closest('article')!.getBoundingClientRect().top);setMotion(ys.map((n,i)=>prev.current?.key===key?Math.round(n-prev.current.ys[i]):0));prev.current={key,ys}});return()=>cancelAnimationFrame(raf)},[kind,step,narrow]);
 return <><header><h1>Editing feedback</h1><small>Local component study</small></header><nav><label>Scenario <select value={kind} onChange={e=>{setKind(e.target.value as Case);setStep(0);setPlay(false)}}>{Object.keys(cases).map(k=><option key={k}>{k}</option>)}</select></label><button onClick={()=>setPlay(!play)}>{play?'Pause':'Replay'}</button><button onClick={()=>setStep((step+1)%states.length)}>Next</button><label><input type="checkbox" checked={narrow} onChange={e=>setNarrow(e.target.checked)}/> Narrow</label></nav><nav aria-label="States">{states.map((s,i)=><button key={i} aria-pressed={step===i} style={{borderColor:step===i?'var(--color-grid-accent)':undefined}} onClick={()=>{setPlay(false);setStep(i)}}>{s}</button>)}</nav><section className="panes">{[false,true].map((upload,i)=><article key={i}><h2>{upload?'Upload Form':'Details'}</h2><div className={upload?'uframe':'pane'} style={{width:upload?(narrow?356:700):(narrow?240:300)}}><div className={upload?'form-density-item':'text-sm'}><div data-form-content={upload?'':undefined}><Spec kind={kind} state={state} upload={upload}/><div className="ruler">Following field</div></div></div></div><output>Movement: {motion[i]>0?'+':''}{motion[i]} px</output></article>)}</section></>}
createRoot(document.getElementById('study')!).render(<Study/>);