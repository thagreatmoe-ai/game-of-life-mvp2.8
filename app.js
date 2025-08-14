// GoL Modern v6.4 — Fix: "times" target respects user value (not forced to 1)
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const todayKey=()=>new Date().toISOString().slice(0,10);
const uid=()=>Math.random().toString(36).slice(2,10);
function save(){localStorage.setItem('gol64', JSON.stringify(state));}
function load(){try{const a=localStorage.getItem('gol64')||localStorage.getItem('gol63')||localStorage.getItem('gol61')||localStorage.getItem('gol6');return a?JSON.parse(a):{};}catch(e){return{}}}
// --- Toast helper ---
let _toastTimer;
function showToast(msg, type = 'ok'){
  const el = document.getElementById('toast');
  if(!el){ alert(msg); return; }  // fallback if the div is missing
  el.textContent = msg;
  el.setAttribute('data-type', type);
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=> el.classList.remove('show'), 1600);
}
const DEFAULT_LEVELS=[200,300,400,500,600,800,1000,1200,1400,1600,1900,2200,2500];
const defaultState={
  user:{name:'Mohammed', avatarStage:0, prestigeBonus:0},
  theme:{bg:'#0b0f1a', panel:'#12172a', card:'#18203a', text:'#f4f7ff', muted:'#a6b0d6', accent:'#7b8cff', accent2:'#38d39f', danger:'#ff6b6b', border:'#253055'},
  levels:DEFAULT_LEVELS,
  config:{staminaLimit:500,resistHourBonus:15},
  streak:{d:0,protected:false},
  xp:0, level:1, tokens:0,
  day:{date:todayKey(), resistance:false, pointsToday:0},
  fields:[{id:'studying',name:'Studying',xp:0,level:1},{id:'work',name:'Work',xp:0,level:1}],
  tasks:[], titles:[], rewards:[], history:[], templates:[]
};
let state=Object.assign({}, defaultState, load());
applyTheme(state.theme); rolloverIfNeeded();

function applyTheme(t){const r=document.documentElement; for(const k in t) r.style.setProperty('--'+k, t[k]);}

// --- rollover & penalties ---
function rolloverIfNeeded(){
  const prev=state.day?.date||todayKey(), now=todayKey();
  if(prev===now) return;
  applyDailyPenalties(prev);
  if(weekIndex(prev)!==weekIndex(now)) applyWeeklyPenalties(prev);
  if(monthIndex(prev)!==monthIndex(now)) applyMonthlyPenalties(prev);
  state.day={date:now,resistance:false,pointsToday:0}; save();
}
function weekIndex(d){const dt=new Date(d); const f=new Date(dt.getFullYear(),0,1); const day=((dt-f)/86400000)+f.getDay(); return Math.floor(day/7);}
function monthIndex(d){const dt=new Date(d); return dt.getFullYear()*12+dt.getMonth();}
function rangeWeek(d){const dt=new Date(d); const w=(dt.getDay()+6)%7; const s=new Date(dt); s.setDate(dt.getDate()-w); const e=new Date(s); e.setDate(s.getDate()+6); return [s.toISOString().slice(0,10),e.toISOString().slice(0,10)];}
function rangeMonth(d){const dt=new Date(d); const s=new Date(dt.getFullYear(),dt.getMonth(),1); const e=new Date(dt.getFullYear(),dt.getMonth()+1,0); return [s.toISOString().slice(0,10),e.toISOString().slice(0,10)];}
function wasSkippedOrPostponed(id,s,e){return state.history.some(h=>h.taskId===id && h.date>=s && h.date<=e && (h.flags||[]).some(f=>f==='skip'||f==='postpone'));}
function tokenRewardFor(t){ return Number(t.tokenReward ?? Math.floor((t.points||0)/5)); }
function penaltyFor(t){ return tokenRewardFor(t)*3; }

// FIXED: compute period target correctly based on frequency
function targetForFreq(t){
  // For daily/once we use qtyValue (per-day target for "times"/minutes/hours)
  if(t.freq==='daily' || t.freq==='once') return Number(t.qtyValue || 1);
  // For weekly/custom/monthly we use periodTarget (fallback to qtyValue)
  return Number((t.periodTarget!=null ? t.periodTarget : t.qtyValue) || 1);
}

function progressForRange(t,s,e){
  const rows=state.history.filter(h=>h.taskId===t.id && h.date>=s && h.date<=e && h.final>0);
  const u=t.qtyType||'times';
  const val=(u==='times')?rows.length:rows.reduce((a,b)=>a+(b.amount||0),0);
  const target=targetForFreq(t);
  return {val,target,done:val>=target,unit:u,remaining:Math.max(0,target-val)};
}

function applyDailyPenalties(day){
  state.tasks.forEach(t=>{
    if(!isTaskActiveOnDate(t,day)) return;
    if(t.freq!=='daily' && t.freq!=='once') return;
    if(wasSkippedOrPostponed(t.id,day,day)) return;
    const pr=progressForRange(t,day,day);
    if(!pr.done){ const loss=penaltyFor(t); if(loss>0){ state.tokens-=loss; state.history.push({id:uid(),date:day,taskId:t.id,name:`Penalty: ${t.name}`,base:0,final:0,flags:['penalty','daily'],fieldId:t.fieldId,unit:t.qtyType,amount:0,tokens:-loss}); } }
  }); save();
}
function applyWeeklyPenalties(day){
  const [s,e]=rangeWeek(day);
  state.tasks.forEach(t=>{
    if(t.freq!=='weekly' && t.freq!=='custom') return;
    if(wasSkippedOrPostponed(t.id,s,e)) return;
    const pr=progressForRange(t,s,e);
    if(!pr.done){ const loss=penaltyFor(t); if(loss>0){ state.tokens-=loss; state.history.push({id:uid(),date:e,taskId:t.id,name:`Penalty (week): ${t.name}`,base:0,final:0,flags:['penalty','week'],fieldId:t.fieldId,unit:t.qtyType,amount:0,tokens:-loss}); } }
  }); save();
}
function applyMonthlyPenalties(day){
  const [s,e]=rangeMonth(day);
  state.tasks.forEach(t=>{
    if(t.freq!=='monthly') return;
    if(wasSkippedOrPostponed(t.id,s,e)) return;
    const pr=progressForRange(t,s,e);
    if(!pr.done){ const loss=penaltyFor(t); if(loss>0){ state.tokens-=loss; state.history.push({id:uid(),date:e,taskId:t.id,name:`Penalty (month): ${t.name}`,base:0,final:0,flags:['penalty','month'],fieldId:t.fieldId,unit:t.qtyType,amount:0,tokens:-loss}); } }
  }); save();
}

// XP & Fields
function xpReq(l){return state.levels[l-1]||state.levels.at(-1)}
function fieldReq(l){return 200+(l-1)*100}
function getField(id){return state.fields.find(f=>f.id===id)}
function adjustMainXP(d){ if(d>0){ state.xp+=d; while(state.level<=state.levels.length && state.xp>=xpReq(state.level)){ state.xp-=xpReq(state.level); state.level++; } } else if(d<0){ let k=-d; while(k>0){ if(state.xp>=k){ state.xp-=k; k=0; break;} else { k-=state.xp; if(state.level>1){ state.level--; state.xp=xpReq(state.level)-1; } else { state.xp=0; k=0; } } } } }
function adjustFieldXP(id,d){ const f=getField(id); if(!f) return; if(d>0){ f.xp+=d; while(f.xp>=fieldReq(f.level)){ f.xp-=fieldReq(f.level); f.level++; } } else if(d<0){ let k=-d; while(k>0){ if(f.xp>=k){ f.xp-=k; k=0; break;} else{ k-=f.xp; if(f.level>1){ f.level--; f.xp=fieldReq(f.level)-1; } else { f.xp=0; k=0; } } } } }
function finalPoints(base){ const a=1+(state.titles.filter(t=>t.scope==='always').reduce((x,y)=>x+y.boost,0))/100; const r=state.day.resistance?1+state.config.resistHourBonus/100:1; const s=state.day.pointsToday>state.config.staminaLimit?2:1; const d=1+(state.titles.filter(t=>t.scope==='daily').reduce((x,y)=>x+y.boost,0))/100; const wm=1+(state.titles.filter(t=>t.scope==='week'||t.scope==='month').reduce((x,y)=>x+y.boost,0))/100; return Math.floor(base*a*r*s*d*wm);}
function tokensFromBase(base){ return Math.floor(base/5); }

// Recurrence / progress helpers
function isTaskActiveToday(t){ if(state.level<(t.levelReq||1)) return false; return isTaskActiveOnDate(t, todayKey()); }
function isTaskActiveOnDate(t, d){
  if(t.freq==='daily') return true;
  if(t.freq==='once'){
    const rows=state.history.filter(h=>h.taskId===t.id && h.final>0);
    const u=t.qtyType||'times', target=targetForFreq(t);
    const val=u==='times'?rows.length:rows.reduce((a,b)=>a+(b.amount||0),0);
    return val<target;
  }
  if(t.freq==='weekly'||t.freq==='custom'){ const [s,e]=rangeWeek(d); const pr=progressForRange(t,s,e); return !pr.done; }
  if(t.freq==='monthly'){ const [s,e]=rangeMonth(d); const pr=progressForRange(t,s,e); return !pr.done; }
  return true;
}
function progressNow(t){ const d=todayKey(); if(t.freq==='daily'||t.freq==='once'){return progressForRange(t,d,d);} if(t.freq==='weekly'||t.freq==='custom'){const [s,e]=rangeWeek(d); return progressForRange(t,s,e);} if(t.freq==='monthly'){const [s,e]=rangeMonth(d); return progressForRange(t,s,e);} return {val:0,target:1,done:false,unit:t.qtyType,remaining:1}; }
function unitLabel(u){return u==='times'?'times':(u==='minutes'?'min':'h');}

// Render
function renderHeader(){
  $('#dateStr').textContent=new Date().toLocaleDateString();
  $('#level').textContent=state.level; const req=xpReq(state.level)||0; $('#xp').textContent=state.xp; $('#xpReq').textContent=req;
  $('#tokens').textContent=state.tokens; $('#prestigeBonus').textContent=state.user.prestigeBonus||0; $('#avatarBox').textContent='L'+state.level; $('#avatarBig').textContent='L'+state.level;
  $('#resistState').textContent=state.day.resistance?'ON':'OFF';
  const pct=Math.min(100, req?state.xp/req*100:0); $('#xpBar').style.width=pct+'%';
  $('#userName').textContent=state.user.name; $('#profName').value=state.user.name; $('#profAvatar').value=state.user.avatarStage||0;
}
function latestStatusFor(t){ const d=todayKey(); const row=state.history.slice().reverse().find(h=>h.taskId===t.id && h.date===d && (h.flags||[]).some(f=>f==='skip'||f==='postpone')); if(!row) return null; return (row.flags||[]).includes('skip')?'skip':'postpone'; }
function renderTaskCard({t, p, status}){
  // t = task, p = progressNow(t), status = 'skip'|'postpone'|null
  const el = document.createElement('div');
  el.className = 'item' +
    (p.done ? ' done' : '') +
    (status==='skip' ? ' skipped' : '') +
    (status==='postpone' ? ' postponed' : '');

  const unitLabel = (t.qtyType==='minutes'?'min':(t.qtyType==='hours'?'h':'times'));
  const tokensUnit = Math.floor((t.points||0)/5);
  const penaltyTok = tokensUnit * 3;
  const fieldName = getField(t.fieldId)?.name || '—';
  const canAct = !(p.done || status==='skip' || status==='postpone');

  const badge =
    p.done ? '<span class="badge success">Completed</span>' :
    status==='skip' ? '<span class="badge skip">Skipped</span>' :
    status==='postpone' ? '<span class="badge postpone">Postponed</span>' : '';

  const progressPct = p.target ? Math.min(100, (p.val/p.target*100)) : 0;

  el.innerHTML = `
    <div class="summary">
      <strong class="title">${t.name}</strong>
      <span class="count">${p.val}/${p.target}</span>
      ${badge}
    </div>

    <div class="bar"><div class="fill" style="width:${progressPct}%"></div></div>

    <div class="details">
      <div class="info-grid">
        <div class="sub small">Base points${t.qtyType!=='times'?' (per unit)':''}: <b>${t.points||0}</b></div>
        <div class="sub small">Tokens/unit: <b>${tokensUnit}</b></div>
        <div class="sub small">Penalty: <b>${penaltyTok}</b></div>
        <div class="sub small">Field: <b>${fieldName}</b></div>
        <div class="sub small">Freq: <b>${t.freq}</b></div>
        <div class="sub small">Qty type: <b>${unitLabel}</b></div>
      </div>

      <div class="actions">
        <label class="stack small" style="display:flex;flex-direction:column;gap:6px;">
          <span style="font-size:var(--small);color:var(--muted)">Action</span>
          <select class="input small statusSel" data-id="${t.id}">
            <option value="done">Done</option>
            <option value="skip">Skip</option>
            <option value="postpone">Postpone</option>
          </select>
        </label>

        ${ t.qtyType==='times' ? '' : `
        <label class="stack small" style="display:flex;flex-direction:column;gap:6px;">
          <span style="font-size:var(--small);color:var(--muted)">Amount (${unitLabel})</span>
          <input type="number" class="input small addQty" data-id="${t.id}" placeholder="${t.qtyType==='minutes'?'10':'1'}" inputmode="numeric">
        </label>`}

        <button class="btn alt applyBtn" ${canAct?'':'disabled'}>Apply</button>
        ${(p.val>0 || status) ? `<button class="btn alt undoOne">Undo</button>` : ''}
        <button class="btn alt editTask">Edit</button>
        <button class="btn danger delTask">Delete</button>
      </div>
    </div>
  `;

  // Toggle open/close when tapping the header area
  el.querySelector('.summary').onclick = (e)=>{ el.classList.toggle('open'); };

  // Don’t toggle the card when interacting with controls
  el.querySelector('.details').addEventListener('click', (ev)=>{ ev.stopPropagation(); });

  // Actions
  el.querySelector('.applyBtn').onclick = ()=>{
    const sel = el.querySelector('.statusSel').value;
    if(sel==='done'){
      if(t.qtyType==='times'){ completeTask(t.id, 1); }
      else{
        const amt = Number(el.querySelector('.addQty')?.value || 0);
        if(amt<=0){ alert('Enter amount'); return; }
        completeTask(t.id, amt);
      }
    }else if(sel==='skip'){ markStatus(t.id,'skip'); }
     else if(sel==='postpone'){ markStatus(t.id,'postpone'); }
  };

  const u = el.querySelector('.undoOne');
  if(u) u.onclick = (ev)=>{ ev.stopPropagation(); undoRecentForTask(t.id); };

  el.querySelector('.delTask').onclick = (ev)=>{
    ev.stopPropagation();
    if(!confirm('You sure you want to delete this task?')) return;
    const idx = state.tasks.findIndex(x=>x.id===t.id);
    if(idx>-1){ state.tasks.splice(idx,1); save(); renderAll(); showToast('Task deleted','danger'); }
  };

  el.querySelector('.editTask').onclick = (ev)=>{
    ev.stopPropagation();
    openTasks && openTasks(); // takes you to the Tasks manager to edit
    showToast('Open “Tasks” to edit', 'info');
  };

  return el;
}
function renderToday(){
  const list=$('#todayTasks'); list.innerHTML='';
  const items=state.tasks.filter(t=>isTaskActiveToday(t)); // hide locked/inactive
  const A=[], S=[], P=[], D=[];
  items.forEach(t=>{ const p=progressNow(t), status=latestStatusFor(t); const d={t,p,status}; if(status==='skip') S.push(d); else if(status==='postpone') P.push(d); else if(p.done) D.push(d); else A.push(d); });
  [A,S,P,D].forEach(g=>g.forEach(d=>list.appendChild(renderTaskCard(d))));
  if(items.length===0){ const e=document.createElement('div'); e.className='sub small'; e.textContent='No tasks due today.'; list.appendChild(e); }
}
function renderFields(){
  const box=$('#fieldsList'); box.innerHTML='';
  state.fields.forEach(f=>{ const req=fieldReq(f.level), pct=Math.min(100, req?(f.xp/req*100):0);
    const it=document.createElement('div'); it.className='item';
    it.innerHTML=`<div class="grow"><strong>${f.name}</strong><div class="bar" style="margin-top:6px"><div class="fill" style="width:${pct}%"></div></div><div class="sub small">Level ${f.level} • ${f.xp}/${req}</div></div><button class="btn alt small" data-id="${f.id}">Delete</button>`;
    it.querySelector('button').onclick=()=>{ if(!confirm('You sure you want to delete this?')) return; state.fields=state.fields.filter(x=>x.id!==f.id); save(); renderFields(); };
    box.appendChild(it);
  });
}
function renderTitles(){
  const box=$('#titleList'); box.innerHTML='';
  if(state.titles.length===0){ box.innerHTML='<div class="sub small">No titles yet.</div>'; return; }
  state.titles.forEach(t=>{
    const it=document.createElement('div'); it.className='item';
    it.innerHTML=`<div class="grow"><strong>${t.name}</strong><div class="sub small">+${t.boost}% • ${t.scope}</div></div><button class="btn alt small">Delete</button>`;
    it.querySelector('button').onclick=()=>{ if(!confirm('You sure you want to delete this?')) return; state.titles=state.titles.filter(x=>x.id!==t.id); save(); renderTitles(); };
    box.appendChild(it);
  });
}
// ---- Helpers for purchases / tokens ----
function autoRefundPurchases(amountNeeded){
  let needed = Math.max(0, Number(amountNeeded)||0);
  if(needed <= 0) return;
  for(let i = state.history.length - 1; i >= 0 && needed > 0; i--){
    const row = state.history[i];
    if((row.flags || []).includes('purchase')){
      state.tokens -= row.tokens;   // subtracting a negative = refund
      needed -= (-row.tokens);
      state.history.splice(i, 1);
    }
  }
  save();
}
function renderShop(){
  const box = $('#shopList');
  box.innerHTML = '';
  if(state.rewards.length === 0){
    box.innerHTML = '<div class="sub small">No rewards yet.</div>';
    return;
  }

  state.rewards.forEach(r=>{
    const it = document.createElement('div');
    it.className = 'item';
    const can = state.tokens >= r.cost;
    it.innerHTML = `
      <div class="grow">
        <strong>${r.name}</strong>
        <div class="sub small">Type: ${r.type} • Cost (tokens): ${r.cost}</div>
      </div>
      <button class="btn ${can ? '' : 'alt'} small buyBtn" ${can ? '' : 'disabled'}>Buy</button>
      <button class="btn alt small del">Delete</button>
    `;

    // Delete reward
    it.querySelector('.del').onclick = () => {
      if(!confirm('You sure you want to delete this?')) return;
      state.rewards = state.rewards.filter(x => x.id !== r.id);
      save(); renderShop();
    };

    // Buy with confirmation + history entry (undoable)
    const buyBtn = it.querySelector('.buyBtn');
    buyBtn.onclick = () => {
      if(state.tokens < r.cost) return;
      if(!confirm(`Buy "${r.name}" for ${r.cost} tokens?`)) return;

      state.tokens -= r.cost;
      state.history.push({
        id: uid(),
        date: todayKey(),
        taskId: null,
        name: `Purchase: ${r.name}`,
        base: 0,
        final: 0,
        tokens: -r.cost,          // negative = spent
        flags: ['purchase']
      });

      if(r.type === 'avatar'){
        state.user.avatarStage = Math.min(5, (state.user.avatarStage || 0) + 1);
      }

      save();
      renderHeader();
      renderShop();
      renderHistory();
      renderKPIs();
      showToast(`Purchased: ${r.name}`, 'ok');

    };

    box.appendChild(it);
  });
}

function renderHistory(){
  const tb = $('#histTable tbody');
  tb.innerHTML = '';

  state.history.slice().reverse().forEach(h=>{
    const isPurchase = (h.flags || []).includes('purchase');
    const within7 = (new Date(todayKey()) - new Date(h.date)) <= 7 * 86400000;
    const canUndo = isPurchase || within7;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${h.date}</td>
      <td>${h.name}</td>
      <td>${h.base}</td>
      <td>${h.final}</td>
      <td>${h.tokens || 0}</td>
      <td class="small">${(h.flags || []).join(', ')}</td>
      <td>${canUndo ? '<button class="btn alt small">Undo</button>' : ''}</td>
    `;
    if(canUndo){
      tr.querySelector('button').onclick = () => undoEntry(h.id);
    }
    tb.appendChild(tr);
  });
}

function renderKPIs(){
  const todayXP = state.history.filter(h=>h.date===todayKey() && h.final>0).reduce((a,b)=>a+b.final,0);
  $('#kpiXpToday').textContent=todayXP;
  const now=new Date();
  const weekXP= state.history.filter(h=> (new Date(h.date)) >= new Date(now-6*864e5)).reduce((a,b)=>a+b.final,0);
  $('#kpiXpWeek').textContent=weekXP;
  $('#kpiTokens').textContent=state.tokens;
  $('#kpiStreakD').textContent=state.streak.d;
}
function renderAll(){ renderHeader(); renderToday(); renderFields(); renderTitles(); renderShop(); renderHistory(); renderKPIs(); }

// Actions
function completeTask(taskId, amountOr1){
  const t=state.tasks.find(x=>x.id===taskId); if(!t) return;
  if(state.level < (t.levelReq||1)){ alert('Locked by level'); return; }
  const p=progressNow(t);
  const qt=t.qtyType||'times';
  const adding = qt==='times'?1:Number(amountOr1||0);
  if(qt!=='times' && adding<=0){ alert('Enter amount'); return; }
  if(qt==='times' && p.val>=p.target){ alert('Target reached'); return; }
  const addUnits = qt==='times' ? 1 : Math.min(adding, p.remaining);
  const basePerUnit=Number(t.points)||0;
  const base = qt==='times' ? basePerUnit : basePerUnit*addUnits;
  const fin = finalPoints(base);
  state.day.pointsToday+=fin;
  adjustFieldXP(t.fieldId, fin); adjustMainXP(fin);
  const tokensGain = tokensFromBase(base);
  state.tokens += tokensGain;
  state.history.push({id:uid(), date:todayKey(), taskId:t.id, name:t.name, base, final:fin, flags:['done'], fieldId:t.fieldId, unit:qt, amount:addUnits, tokens:tokensGain});
  save();
renderAll();
showToast('Task logged', 'ok');
}
function markStatus(taskId, kind){ // skip or postpone
  const t=state.tasks.find(x=>x.id===taskId); if(!t) return;
  state.history.push({id:uid(), date:todayKey(), taskId:t.id, name:`${kind==='skip'?'Skipped':'Postponed'}: ${t.name}`, base:0, final:0, flags:[kind], fieldId:t.fieldId, unit:t.qtyType, amount:0, tokens:0});
  save();
renderAll();
showToast('Undone', 'info');
}
function undoRecentForTask(taskId){
  const idx = state.history.slice().reverse().findIndex(h => h.taskId === taskId && h.date === todayKey());
  if(idx < 0) return;
  const i = state.history.length - 1 - idx;
  const h = state.history[i];

  const tokenDelta = h.tokens || 0;
  if(tokenDelta > 0 && (state.tokens - tokenDelta) < 0){
    const need = tokenDelta - state.tokens;
    if(confirm(`This undo would drop tokens below 0 by ${need}. Auto-refund latest purchase(s)?`)){
      autoRefundPurchases(need);
      if(state.tokens - tokenDelta < 0){
        alert('Not enough refundable purchases to cover. Undo cancelled.');
        return;
      }
    }else{
      return;
    }
  }

  if(h.final > 0){
    adjustMainXP(-h.final);
    adjustFieldXP(h.fieldId, -h.final);
  }
  state.tokens -= tokenDelta;

  state.history.splice(i,1);
  save();
renderAll();
showToast('Undone', 'info');
}

function undoEntry(id){
  const i = state.history.findIndex(h => h.id === id);
  if(i < 0) return;
  const h = state.history[i];
  const isPurchase = (h.flags || []).includes('purchase');

  if(!isPurchase){
    const within7 = (new Date(todayKey()) - new Date(h.date)) <= 7 * 86400000;
    if(!within7){ alert('Undo window passed'); return; }
  }

  const tokenDelta = h.tokens || 0; // + earned, - purchase
  if(tokenDelta > 0){
    const wouldBe = state.tokens - tokenDelta;
    if(wouldBe < 0){
      const need = tokenDelta - state.tokens;
      if(confirm(`This undo would drop tokens below 0 by ${need}. Auto-refund latest purchase(s)?`)){
        autoRefundPurchases(need);
        if(state.tokens - tokenDelta < 0){
          alert('Not enough refundable purchases to cover. Undo cancelled.');
          return;
        }
      }else{
        return;
      }
    }
  }

  if(h.final > 0){
    adjustMainXP(-h.final);
    adjustFieldXP(h.fieldId, -h.final);
  }
  state.tokens -= tokenDelta;   // refund if purchase; subtract if earned

  state.history.splice(i,1);
  save();
renderAll();
showToast('Undone', 'info');
}


// Sheets
function openTasks(){
  const rows = state.tasks.map(t=>`<div class="item"><div class="grow"><strong>${t.name}</strong><div class="sub small">Points: ${t.points} • Tokens/unit: ${tokenRewardFor(t)} • Penalty: ${penaltyFor(t)} • Field: ${getField(t.fieldId)?.name||'—'} • Lvl req: ${t.levelReq||1} • Freq: ${t.freq}${t.freq!=='daily'?` (target: ${targetForFreq(t)})`:''} • Qty/unit: ${t.qtyValue} ${unitLabel(t.qtyType)}</div></div><button class="btn alt small" data-id="${t.id}">Delete</button></div>`).join('') || '<div class="sub small">No tasks yet.</div>';
  openSheet(`<div class="row-between"><h3>Tasks</h3><button class="btn alt small" id="closeSheet">Close</button></div>
  ${rows}
  <div class="row gap8" style="margin-top:8px; flex-wrap:wrap">
    <label class="stack small"><span>Task name</span><input id="tName" class="input" placeholder="e.g., Read 20 pages"></label>
    <label class="stack small"><span>Base points (per unit)</span><input id="tPts" class="input small" type="number" value="50" inputmode="numeric"></label>
    <label class="stack small"><span>Tokens reward (auto: pts/5)</span><input id="tTok" class="input small" type="number" value="10" inputmode="numeric"></label>
    <label class="stack small"><span>Penalty tokens (auto: reward*3)</span><input id="tPenTok" class="input small" type="number" value="30" inputmode="numeric"></label>
    <label class="stack small"><span>Field</span><select id="tField" class="input small"></select></label>
    <label class="stack small"><span>Required level</span><input id="tLvl" class="input small" type="number" value="1" inputmode="numeric"></label>
    <label class="stack small"><span>Is it mandatory?</span><select id="tMand" class="input small"><option value="no">Optional</option><option value="yes">Mandatory</option></select></label>
    <label class="stack small"><span>Quantity</span><select id="tQtyType" class="input small"><option value="times">Times</option><option value="minutes">Minutes</option><option value="hours">Hours</option></select></label>
    <label class="stack small"><span id="tQtyLabel">Target (times)</span><input id="tQtyVal" class="input small" type="number" value="1" inputmode="numeric"></label>
    <label class="stack small"><span>Frequency</span>
      <select id="tFreq" class="input small">
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="custom">Custom (per week)</option>
        <option value="once">One-time</option>
      </select>
    </label>
    <label class="stack small" id="perTargetRow"><span id="tPerTargetLabel">Period target</span><input id="tPerTarget" class="input small" type="number" value="1" inputmode="numeric"></label>
    <label class="stack small"><span>Notes</span><input id="tNotes" class="input" placeholder="Optional notes"></label>
    <button class="btn" id="btnSaveTask">+ Task</button>
  </div>`);
  $('#closeSheet').onclick=closeSheet;

  // populate fields list
  const sel=$('#tField'); sel.innerHTML = state.fields.map(f=>`<option value="${f.id}">${f.name}</option>`).join('');

  // auto tokens calc
  function recalcTokens(){
    const pts = Number($('#tPts').value||0);
    const tok = Math.floor(pts/5);
    $('#tTok').value = tok;
    $('#tPenTok').value = tok*3;
  }
  $('#tPts').oninput=recalcTokens; recalcTokens();

  const qtySel=$('#tQtyType'), qtyLbl=$('#tQtyLabel'), freqSel=$('#tFreq'), perRow=$('#perTargetRow'), perLbl=$('#tPerTargetLabel');
  qtySel.onchange=()=>{ qtyLbl.textContent = qtySel.value==='times'?'Target (times)':(qtySel.value==='minutes'?'Target (minutes)':'Target (hours)'); };
  function onFreqChange(){
    const v=freqSel.value;
    const show = !(v==='daily'||v==='once');
    perRow.style.display = show?'block':'none';
  }
  freqSel.onchange=onFreqChange; onFreqChange();

  $$('#sheet .item .btn').forEach(b=> b.onclick=()=>{ if(!confirm('You sure you want to delete this?')) return; state.tasks=state.tasks.filter(x=>x.id!==b.dataset.id); save(); openTasks(); renderToday(); });
  $('#btnSaveTask').onclick=()=>{
    const freqVal=$('#tFreq').value;
    const perTarget = (freqVal==='daily'||freqVal==='once') ? null : Number($('#tPerTarget').value||1);
    const t={
      id:uid(), name:$('#tName').value||'Task', points:Number($('#tPts').value||0),
      tokenReward:Number($('#tTok').value||0), penaltyTok:Number($('#tPenTok').value||0),
      fieldId:$('#tField').value, levelReq:Number($('#tLvl').value||1),
      mandatory:$('#tMand').value, notes:$('#tNotes').value,
      qtyType:$('#tQtyType').value, qtyValue:Number($('#tQtyVal').value||1),
      freq:freqVal, periodTarget: perTarget
    };
    state.tasks.push(t); save(); openTasks(); renderToday();
  };
}
function openFields(){
  openSheet(`<div class="row-between"><h3>Fields</h3><button class="btn alt small" id="closeSheet">Close</button></div>
    ${state.fields.map(f=>`<div class="item"><div class="grow"><strong>${f.name}</strong><div class="sub small">Level ${f.level}</div></div><button class="btn alt small" data-id="${f.id}">Delete</button></div>`).join('')}`);
  $('#closeSheet').onclick=closeSheet;
  $$('#sheet .item .btn').forEach(b=> b.onclick=()=>{ if(!confirm('You sure you want to delete this?')) return; state.fields=state.fields.filter(x=>x.id!==b.dataset.id); save(); openFields(); renderFields(); });
}
function openTitles(){
  openSheet(`<div class="row-between"><h3>Titles</h3><button class="btn alt small" id="closeSheet">Close</button></div>
    ${state.titles.map(t=>`<div class="item"><div class="grow"><strong>${t.name}</strong><div class="sub small">+${t.boost}% • ${t.scope}</div></div><button class="btn alt small" data-id="${t.id}">Delete</button></div>`).join('')||'<div class="sub small">No titles</div>'}
    <div class="row gap8" style="margin-top:8px">
      <label class="stack small"><span>Title name</span><input id="ttlName" class="input" placeholder="Title name"></label>
      <label class="stack small"><span>Boost %</span><input id="ttlBoost" class="input small" type="number" value="5" inputmode="numeric"></label>
      <label class="stack small"><span>Scope</span><select id="ttlScope" class="input small"><option value="daily">Daily</option><option value="week">Next Week</option><option value="month">This Month</option><option value="always">Always</option></select></label>
      <button class="btn" id="btnAddT">+ Title</button>
    </div>`);
  $('#closeSheet').onclick=closeSheet;
  $$('#sheet .item .btn').forEach(b=> b.onclick=()=>{ if(!confirm('You sure you want to delete this?')) return; state.titles=state.titles.filter(x=>x.id!==b.dataset.id); save(); openTitles(); renderTitles(); });
  $('#btnAddT').onclick=()=>{ state.titles.push({id:uid(), name:$('#ttlName').value||'Title', boost:Number($('#ttlBoost').value||0), scope:$('#ttlScope').value}); save(); openTitles(); renderTitles(); };
}
function openRewards(){
  openSheet(`<div class="row-between"><h3>Rewards</h3><button class="btn alt small" id="closeSheet">Close</button></div>
    ${state.rewards.map(r=>`<div class="item"><div class="grow"><strong>${r.name}</strong><div class="sub small">${r.type} • Cost (tokens): ${r.cost}</div></div><button class="btn alt small del" data-id="${r.id}">Delete</button></div>`).join('')||'<div class="sub small">No rewards</div>'}
    <div class="row gap8" style="margin-top:8px">
      <label class="stack small"><span>Reward name</span><input id="rwName" class="input" placeholder="Name"></label>
      <label class="stack small"><span>Cost (tokens)</span><input id="rwCost" class="input small" type="number" value="10" inputmode="numeric"></label>
      <label class="stack small"><span>Type</span><select id="rwType" class="input small"><option value="irl">IRL</option><option value="avatar">Avatar</option><option value="cosmetic">Cosmetic</option><option value="tool">Tool</option></select></label>
      <button class="btn" id="btnAddR">+ Reward</button>
    </div>`);
  $('#closeSheet').onclick=closeSheet;
  $$('#sheet .del').forEach(b=> b.onclick=()=>{ if(!confirm('You sure you want to delete this?')) return; state.rewards=state.rewards.filter(x=>x.id!==b.dataset.id); save(); openRewards(); renderShop(); });
  $('#btnAddR').onclick=()=>{ state.rewards.push({id:uid(), name:$('#rwName').value||'Reward', cost:Number($('#rwCost').value||0), type:$('#rwType').value}); save(); openRewards(); renderShop(); };
}
function openTheme(){
  const t=state.theme;
  function row(key,label){ return `<label class="stack small"><span>${label}</span><input type="color" id="clr_${key}" value="${t[key]}"></label>`; }
  openSheet(`<div class="row-between"><h3>Theme</h3><button class="btn alt small" id="closeSheet">Close</button></div>
    <div class="row gap8">${row('bg','App background')}${row('panel','Panels')}${row('card','Cards')}${row('text','Primary text')}</div>
    <div class="row gap8" style="margin-top:8px">${row('muted','Muted text')}${row('accent','Accent')}${row('accent2','Accent 2')}${row('danger','Danger')}</div>
    <div class="row gap8" style="margin-top:8px">${row('border','Borders')}</div>
    <div class="row gap8" style="margin-top:8px"><button class="btn" id="btnThemeSave">Save</button><button class="btn alt" id="btnThemeReset">Reset Defaults</button></div>`);
  $('#closeSheet').onclick=closeSheet;
  $('#btnThemeSave').onclick=()=>{ Object.keys(t).forEach(k=> t[k] = $('#clr_'+k).value); applyTheme(t); save(); alert('Theme saved'); };
  $('#btnThemeReset').onclick=()=>{ state.theme=JSON.parse(JSON.stringify(defaultState.theme)); applyTheme(state.theme); save(); Object.keys(state.theme).forEach(k=>{ const el=$('#clr_'+k); if(el) el.value=state.theme[k]; }); alert('Theme reset'); };
}
function openBackup(){
  openSheet(`<div class="row-between"><h3>Backup</h3><button class="btn alt small" id="closeSheet">Close</button></div>
    <div class="row gap8"><button class="btn alt" id="btnExport">Export JSON</button>
      <label class="btn alt"><input id="importJson" type="file" accept="application/json" hidden>Import JSON</label>
      <button class="btn danger" id="btnReset">Reset</button>
    </div>`);
  $('#closeSheet').onclick=closeSheet;
  $('#btnExport').onclick=()=>{ const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gol_backup.json'; a.click(); };
  $('#importJson').onchange = e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ state=JSON.parse(r.result); applyTheme(state.theme||defaultState.theme); rolloverIfNeeded(); save(); renderAll(); alert('Imported'); }catch(err){ alert('Bad JSON'); } }; r.readAsText(f); };
  $('#btnReset').onclick=()=>{ if(!confirm('You sure you want to delete this?')) return; localStorage.removeItem('gol64'); state=Object.assign({}, defaultState); applyTheme(state.theme); save(); renderAll(); };
}
function openSettings(){
  openSheet(`<div class="row-between"><h3>Settings</h3><button class="btn alt small" id="closeSheet">Close</button></div>
    <div class="row gap8"><label class="stack small"><span>Level thresholds (comma-separated)</span><input id="lvlStr" class="input" value="${state.levels.join(', ')}"></label><button class="btn" id="btnLevels">Save Levels</button></div>
    <div class="row gap8" style="margin-top:8px"><label class="stack small"><span>Daily stamina limit (points)</span><input id="stam" class="input small" type="number" value="${state.config.staminaLimit}" inputmode="numeric"></label><label class="stack small"><span>Resistance bonus per hour %</span><input id="rh" class="input small" type="number" value="${state.config.resistHourBonus}" inputmode="numeric"></label></div>`);
  $('#closeSheet').onclick=closeSheet;
  $('#btnLevels').onclick=()=>{ const arr=$('#lvlStr').value.split(',').map(s=>Number(s.trim())).filter(Boolean); if(arr.length){ state.levels=arr; save(); alert('Saved'); renderHeader(); } };
  $('#rh').onchange=()=>{ state.config.resistHourBonus=Number($('#rh').value||0); save(); };
}

// Router / events
function router(view){ $$('#tabbar .tab').forEach(t=>t.classList.toggle('active', t.dataset.view===view)); $$('.view').forEach(v=>v.classList.remove('active')); $('#view-'+view).classList.add('active'); $('#topTitle').textContent=view[0].toUpperCase()+view.slice(1); }
function toggleDrawer(open){ $('#drawer').classList.toggle('open', open); $('#backdrop').style.display=open?'block':'none'; }

window.addEventListener('DOMContentLoaded', ()=>{
  renderAll();
  $$('#tabbar .tab').forEach(b=> b.onclick=()=> router(b.dataset.view));
  $('#hamburger').onclick=()=> toggleDrawer(true);
  $('#backdrop').onclick=()=> toggleDrawer(false);
  $$('#drawer .nav-item').forEach(b=> b.onclick=()=>{ toggleDrawer(false); const name=b.dataset.open; if(name==='tasks') openTasks(); if(name==='fields') openFields(); if(name==='titles') openTitles(); if(name==='rewards') openRewards(); if(name==='theme') openTheme(); if(name==='backup') openBackup(); if(name==='settings') openSettings(); });
  $('#btnAddTask').onclick=()=> openTasks();
  $('#btnResist').onclick=()=>{ state.day.resistance=!state.day.resistance; save(); renderHeader(); };
  $('#btnProtect').onclick=()=>{ if(confirm('Do you want to protect your streak today?')){ state.streak.protected=true; alert('Today is protected.'); save(); } };
  $('#btnSaveProfile').onclick=()=>{ state.user.name=$('#profName').value||'Player'; state.user.avatarStage=Number($('#profAvatar').value||0); save(); renderHeader();showToast('Streak protected for today', 'ok');
 };

  // Quick add helpers
  $('#btnAddTitle')?.addEventListener('click', ()=>{ state.titles.push({id:uid(), name:$('#titleName').value||'Title', boost:Number($('#titleBoost').value||0), scope:$('#titleScope').value}); save(); renderTitles(); });
  $('#btnAddReward')?.addEventListener('click', ()=>{ state.rewards.push({id:uid(), name:$('#rewardName').value||'Reward', cost:Number($('#rewardCost').value||0), type:$('#rewardType').value}); save(); renderShop(); });
  $('#btnAddField')?.addEventListener('click', ()=>{ const nm=$('#fieldName').value||'Field'; state.fields.push({id:uid(), name:nm, xp:0, level:1}); save(); renderFields(); });

  // Focus session
  let sessM=25, timer=null, left=0;
  $$('.sess').forEach(b=> b.onclick=()=>{ sessM=Number(b.dataset.m); $('#customMin').value=''; });
  $('#btnStartSession').onclick=()=>{ const cm=Number($('#customMin').value||sessM); if(cm<=0) return; left=cm*60; clearInterval(timer); $('#timerBox').textContent=`Session ${cm}m started…`; timer=setInterval(()=>{ left--; if(left<=0){ clearInterval(timer); $('#timerBox').textContent='Session complete — log your task now!'; navigator.vibrate?.(200);} else { const m=Math.floor(left/60), s=left%60; $('#timerBox').textContent=`Time left ${m}:${String(s).padStart(2,'0')}`; } },1000); };
  $('#btnStopSession').onclick=()=>{ clearInterval(timer); timer=null; $('#timerBox').textContent='Session stopped.'; navigator.vibrate?.(50); };

  // Prestige
  $('#btnPrestige').onclick=()=>{ if($('#prestigeConfirm').value.trim().toUpperCase()!=='PRESTIGE'){ alert('Type PRESTIGE'); return; } const pct=Number($('#prestigePct').value||0); state.user.prestigeBonus=(state.user.prestigeBonus||0)+pct; state.user.avatarStage=Math.min(5,(state.user.avatarStage||0)+1); state.level=1; state.xp=0; state.fields.forEach(f=>{ f.level=1; f.xp=0; }); save(); renderAll(); alert('Prestiged!'); };
const fab = document.getElementById('fabAddTask');
if(fab) fab.onclick = () => document.getElementById('btnAddTask')?.click();
});

// Utils
function openSheet(html){ const s=$('#sheet'); s.innerHTML=html; s.classList.add('open'); }
function closeSheet(){ $('#sheet').classList.remove('open'); }
