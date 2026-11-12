import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import JsBarcode from 'https://esm.sh/jsbarcode@3.11.6';

const url = 'https://jiofldtieaxlqykhylnc.supabase.co';
const key = 'sb_publishable_UuhoeoVzriR7_vbZiD52_g_DCnP9fw0';
const db = createClient(url, key);
const $ = (s) => document.querySelector(s);
const app = $('#app');
const categories = {expense:['餐飲','日用品','交通','居住','水電網路','醫療','教育','娛樂','其他'],income:['薪資','獎金','投資','補助','其他']};
const state = {user:null, carrier:null, households:[], household:null, members:[], entries:[], personalEntries:[], groupEntries:[], month:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}).slice(0,7), tab:'home', kind:'expense', editing:null};
const money = n => new Intl.NumberFormat('zh-TW').format(n || 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
const icon = {home:'⌂',list:'☷',stats:'▥',group:'◎',family:'♧'};
function toast(msg){ let el=$('#toast'); if(!el){el=document.createElement('div');el.id='toast';document.body.append(el)} el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3500) }
function error(e){toast(e?.message || '操作失敗，請稍後重試')}

async function loadCarrier(){
  const {data,error:e}=await db.from('ledger_carriers').select('carrier_code').eq('user_id',state.user.id).maybeSingle();
  if(e) throw e;
  state.carrier=data?.carrier_code||null;
}
function carrierPanel(){return `<section class="carrier-panel" aria-label="我的手機條碼"><div class="carrier-heading"><strong>我的手機條碼</strong><button id="carrier-edit" type="button">${state.carrier?'編輯':'設定條碼'}</button></div>${state.carrier?`<div class="carrier-graphic"><svg id="carrier-barcode" role="img" aria-label="手機條碼 ${esc(state.carrier)}"></svg><strong>${esc(state.carrier)}</strong></div>`:'<p>設定財政部核發的手機條碼，結帳時快速出示。</p>'}</section>`}
function drawCarrier(){if(!state.carrier)return;try{JsBarcode('#carrier-barcode',state.carrier,{format:'CODE39',width:2,height:56,displayValue:false,margin:10,background:'#fff',lineColor:'#111'})}catch(e){error(e)}}
function editCarrier(){
  const layer=document.createElement('div');layer.className='modal-layer';
  layer.innerHTML=`<div class="shade"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="設定手機條碼"><div class="handle"></div><div class="sheet-head"><h2>設定手機條碼</h2><button id="close-carrier" aria-label="關閉">×</button></div><p class="carrier-help">請填入財政部核發的手機條碼，以 / 開頭，共 8 碼。這是你個人的條碼，不會分享給其他家庭成員。</p><form id="carrier-form"><label>手機條碼<input name="carrier" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" required placeholder="/E7E6888" value="${esc(state.carrier||'')}"></label><button class="primary">儲存手機條碼</button></form></section>`;
  document.body.append(layer);const close=()=>layer.remove();layer.querySelector('#close-carrier').onclick=close;layer.querySelector('.shade').onclick=close;
  const input=layer.querySelector('[name=carrier]');input.focus();
  layer.querySelector('#carrier-form').onsubmit=async e=>{e.preventDefault();const value=input.value.trim().toUpperCase();if(!/^\/[0-9A-Z.+-]{7}$/.test(value)){toast('格式需為 / 開頭，後接 7 碼英數或 . + -');input.focus();return}const button=e.target.querySelector('button');button.disabled=true;try{const {error:err}=await db.from('ledger_carriers').upsert({user_id:state.user.id,carrier_code:value},{onConflict:'user_id'});if(err)throw err;state.carrier=value;close();render();toast('手機條碼已儲存')}catch(err){error(err)}finally{button.disabled=false}};
}

async function loadHouseholds(){
  const {data,error:e}=await db.from('ledger_households').select('id,name,invite_code,created_at').order('created_at');
  if(e) throw e; state.households=data||[];
  const saved=localStorage.getItem('ledger-household');
  state.household=state.households.find(h=>h.id===saved)||state.households[0]||null;
  await loadData();
}
async function loadData(){
  const first=state.month+'-01', last=new Date(Number(state.month.slice(0,4)),Number(state.month.slice(5,7)),1).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
  const [m,t,g]=await Promise.all([
    state.household?db.from('ledger_members').select('user_id,display_name').eq('household_id',state.household.id):Promise.resolve({data:[],error:null}),
    db.from('ledger_entries').select('*').eq('user_id',state.user.id).gte('occurred_on',first).lt('occurred_on',last).order('occurred_on',{ascending:false}).order('created_at',{ascending:false}),
    state.household?db.rpc('ledger_group_entries',{p_household:state.household.id,p_from:first,p_to:last}):Promise.resolve({data:[],error:null})
  ]);
  if(m.error||t.error||g.error)throw m.error||t.error||g.error;
  state.members=m.data||[];state.personalEntries=t.data||[];state.groupEntries=g.data||[];
  state.entries=state.tab==='group'?state.groupEntries:state.personalEntries;
}
function shell(content){app.innerHTML=`<div class="app-shell"><header class="top"><div class="brand"><span class="brand-mark">⌂</span><span>家好帳<small>先記個人，再看家庭</small></span></div><button class="avatar" id="menu" aria-label="家庭群組設定">${esc((state.members.find(x=>x.user_id===state.user.id)?.display_name||state.user.email||'我').slice(0,1))}</button></header>${carrierPanel()}<main>${content}</main><nav class="bottom" aria-label="主要選單">${[['home','個人'],['list','明細'],['stats','統計'],['group','合併'],['family','群組']].map(([k,v])=>`<button class="${state.tab===k?'active':''}" data-tab="${k}"><span>${icon[k]}</span>${v}</button>`).join('')}</nav><button class="fab" id="add" aria-label="新增個人收支">＋</button></div>`;document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.entries=state.tab==='group'?state.groupEntries:state.personalEntries;render()});$('#menu').onclick=()=>{state.tab='family';state.entries=state.personalEntries;render()};$('#add').onclick=()=>openEditor();$('#carrier-edit').onclick=editCarrier;drawCarrier()}
function monthBar(){return `<div class="monthbar"><button id="prev" aria-label="上個月">‹</button><strong>${state.month.replace('-',' 年 ')} 月</strong><button id="next" aria-label="下個月">›</button></div>`}
function bindMonth(){ const move=n=>{const [y,m]=state.month.split('-').map(Number);const d=new Date(y,m-1+n,1);state.month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;refresh()};$('#prev').onclick=()=>move(-1);$('#next').onclick=()=>move(1)}
function totals(){return state.entries.reduce((a,x)=>(a[x.kind]+=x.amount,a),{expense:0,income:0})}
function rows(items=state.entries){return items.length?items.map(x=>`<button class="entry" data-id="${x.id}"><span class="entry-icon ${x.kind}">${x.kind==='expense'?'↗':'↙'}</span><span class="entry-main"><strong>${esc(x.category)}</strong><small>${x.occurred_on.slice(5).replace('-','/')} · ${esc(state.members.find(m=>m.user_id===x.user_id)?.display_name||'成員')}${x.note?' · '+esc(x.note):''}</small></span><strong class="entry-amount ${x.kind}">${x.kind==='expense'?'−':'＋'}${money(x.amount)}</strong></button>`).join(''):`<div class="empty"><span>✦</span><strong>這個月還沒有紀錄</strong><p>點右下角 ＋，記下第一筆收支</p></div>`}
function bindRows(){document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openEditor(state.entries.find(x=>x.id===b.dataset.id)))}
function render(){
 if(!state.user){app.innerHTML=`<div class="auth-page"><div class="auth-art"><span class="big-logo">⌂</span><p>每一筆日常，<br>都讓家的計畫更清楚。</p></div><div class="auth-card"><span class="eyebrow">PERSONAL & FAMILY</span><h1>歡迎來到家好帳</h1><p>先記自己的收支，再選擇加入家庭群組合併查看。</p><button class="primary google-button" id="google-login"><span class="google-mark">G</span>使用 Google 帳號繼續</button><small>加入家庭群組的成員可查看彼此的個人收支。</small></div></div>`;$('#google-login').onclick=async()=>{const b=$('#google-login');b.disabled=true;try{const {error:e2}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(e2)throw e2}catch(err){error(err);b.disabled=false}};return}
 state.entries=state.tab==='group'?state.groupEntries:state.personalEntries;
 const t=totals();let body='';
 if(state.tab==='home')body=`<div class="welcome"><span>我的個人帳本</span><h1>把每一天，<br>過得更有餘裕。</h1></div>${monthBar()}<section class="balance"><small>我的本月結餘</small><div>NT$ ${money(t.income-t.expense)}</div><div class="balance-grid"><span>↙ 我的收入<strong>NT$ ${money(t.income)}</strong></span><span>↗ 我的支出<strong>NT$ ${money(t.expense)}</strong></span></div></section><div class="section-heading"><h2>我的最近紀錄</h2><button id="all">查看全部 →</button></div><div class="entries">${rows(state.entries.slice(0,5))}</div>`;
 if(state.tab==='list')body=`<div class="page-title"><span class="eyebrow">MY TRANSACTIONS</span><h1>我的收支明細</h1><p>每一筆個人收支都有跡可循</p></div>${monthBar()}<div class="chips"><button class="selected" data-filter="all">全部</button><button data-filter="expense">支出</button><button data-filter="income">收入</button></div><div class="entries" id="filtered">${rows()}</div>`;
 if(state.tab==='stats'){const grouped={};for(const x of state.entries.filter(x=>x.kind==='expense'))grouped[x.category]=(grouped[x.category]||0)+x.amount;const sorted=Object.entries(grouped).sort((a,b)=>b[1]-a[1]);body=`<div class="page-title"><span class="eyebrow">INSIGHTS</span><h1>月度統計</h1><p>看見家的消費節奏</p></div>${monthBar()}<div class="stat-cards"><div><small>收入</small><strong>NT$ ${money(t.income)}</strong></div><div><small>支出</small><strong>NT$ ${money(t.expense)}</strong></div></div><section class="white-card"><h2>支出分類</h2>${sorted.length?sorted.map(([c,n],i)=>`<div class="bar-row"><div><span>${esc(c)}</span><strong>NT$ ${money(n)}</strong></div><div class="bar-track"><span style="width:${Math.round(n/t.expense*100)}%;background:${['#43765b','#8cae83','#d1b878','#a9b6a7','#d4a58c'][i%5]}"></span></div></div>`).join(''):'<p class="muted">本月尚無支出</p>'}</section>`}
 if(state.tab==='group'){const gt=totals();body=`<div class="page-title"><span class="eyebrow">FAMILY GROUP</span><h1>${state.household?esc(state.household.name)+' · 家庭合併':'家庭合併'}</h1><p>${state.household?'彙總群組成員的個人收支；新增紀錄仍存到你的個人帳本。':'到「群組」建立或加入家庭後，就能看合併收支。'}</p></div>${state.household?`${monthBar()}<section class="balance"><small>家庭本月合併結餘</small><div>NT$ ${money(gt.income-gt.expense)}</div><div class="balance-grid"><span>↙ 合併收入<strong>NT$ ${money(gt.income)}</strong></span><span>↗ 合併支出<strong>NT$ ${money(gt.expense)}</strong></span></div></section><div class="section-heading"><h2>成員收支</h2></div><section class="white-card">${state.members.map(m=>{const own=state.groupEntries.filter(x=>x.user_id===m.user_id);const inc=own.filter(x=>x.kind==='income').reduce((n,x)=>n+x.amount,0);const out=own.filter(x=>x.kind==='expense').reduce((n,x)=>n+x.amount,0);return `<div class="member"><strong>${esc(m.display_name)}</strong><small>收入 ${money(inc)} · 支出 ${money(out)}</small></div>`}).join('')}</section><div class="section-heading"><h2>合併明細</h2></div><div class="entries">${rows()}</div>`:'<button class="secondary" id="go-group">前往家庭群組</button>'}`}
 if(state.tab==='family')body=`<div class="page-title"><span class="eyebrow">FAMILY GROUP</span><h1>家庭群組</h1><p>加入群組後，成員的個人收支會顯示在合併頁。</p></div>${state.household?`<section class="white-card"><h2>${esc(state.household.name)}</h2><div class="section-heading"><h2>成員</h2><span>${state.members.length} 人</span></div>${state.members.map(m=>`<div class="member"><span class="member-avatar">${esc(m.display_name.slice(0,1))}</span><strong>${esc(m.display_name)}</strong>${m.user_id===state.user.id?'<small>你</small>':''}</div>`).join('')}</section><section class="white-card invite"><h2>邀請家人加入</h2><p>加入者能查看群組成員的個人收支，請只將邀請碼分享給信任的家人。</p><code>${esc(state.household.invite_code)}</code><button class="secondary" id="copy">複製邀請碼</button></section>`:''}<section class="white-card"><h2>建立或加入群組</h2><label>你的稱呼<input id="nickname" maxlength="40" value="${esc(state.members.find(m=>m.user_id===state.user.id)?.display_name||state.user.user_metadata?.full_name||'')}" placeholder="例如：阿哲"></label><label>新群組名稱<input id="familyname" maxlength="60" placeholder="例如：我們家"></label><button class="primary" id="create">建立家庭群組</button><label>家人的邀請碼<input id="code" placeholder="貼上邀請碼"></label><button class="secondary" id="join">加入家庭群組</button></section>${state.households.length>1?`<section class="white-card"><h2>切換群組</h2><select id="switch">${state.households.map(h=>`<option value="${h.id}" ${h.id===state.household?.id?'selected':''}>${esc(h.name)}</option>`).join('')}</select></section>`:''}<button class="text-button signout" id="signout">登出帳號</button>`;
 shell(body);if(['home','list','stats'].includes(state.tab)||state.tab==='group'&&state.household)bindMonth();bindRows();
 if($('#go-group'))$('#go-group').onclick=()=>{state.tab='family';render()};
 if($('#create'))$('#create').onclick=()=>setup('ledger_create_household',{p_name:$('#familyname').value.trim(),p_display_name:$('#nickname').value.trim()});
 if($('#join'))$('#join').onclick=()=>setup('ledger_join_household',{p_code:$('#code').value.trim(),p_display_name:$('#nickname').value.trim()});
 if($('#all'))$('#all').onclick=()=>{state.tab='list';render()};
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');$('#filtered').innerHTML=rows(b.dataset.filter==='all'?state.entries:state.entries.filter(x=>x.kind===b.dataset.filter));bindRows()});
 if($('#copy'))$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(state.household.invite_code);toast('已複製邀請碼')}catch{toast('請長按邀請碼複製')}};
 if($('#switch'))$('#switch').onchange=async e=>{state.household=state.households.find(h=>h.id===e.target.value);localStorage.setItem('ledger-household',state.household.id);try{await loadData();render()}catch(err){error(err)}};
 if($('#signout'))$('#signout').onclick=()=>db.auth.signOut();
}
async function setup(fn,args){if(!args.p_display_name){toast('請先填寫你的稱呼');return}if(fn==='ledger_create_household'&&!args.p_name){toast('請填寫群組名稱');return}if(fn==='ledger_join_household'&&!args.p_code){toast('請貼上邀請碼');return}try{const {data,error:e}=await db.rpc(fn,args);if(e)throw e;localStorage.setItem('ledger-household',data);await loadHouseholds();state.tab='group';render();toast('已加入家庭群組')}catch(err){error(err)}}
async function refresh(){try{await loadData();render()}catch(e){error(e)}}
function openEditor(item=null){state.editing=item;state.kind=item?.kind||'expense';const own=!item||item.user_id===state.user.id;const layer=document.createElement('div');layer.className='modal-layer';layer.innerHTML=`<div class="shade"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${item?'編輯紀錄':'新增紀錄'}"><div class="handle"></div><div class="sheet-head"><h2>${item?'編輯紀錄':'新增一筆'}</h2><button id="close" aria-label="關閉">×</button></div>${own?`<div class="kind-tabs"><button data-kind="expense" class="${state.kind==='expense'?'active':''}">↗ 支出</button><button data-kind="income" class="${state.kind==='income'?'active':''}">↙ 收入</button></div><form id="entryform"><label>金額 <span>NT$</span><input name="amount" type="number" inputmode="numeric" min="1" max="1000000000" step="1" required placeholder="0" value="${item?.amount||''}"></label><div class="form-grid"><label>日期<input name="date" type="date" required value="${item?.occurred_on||today()}"></label><label>分類<select name="category"></select></label></div><label>備註（選填）<input name="note" maxlength="300" placeholder="今天買了什麼？" value="${esc(item?.note||'')}"></label><button class="primary">${item?'儲存修改':'儲存紀錄'}</button></form>${item?'<button class="delete" id="delete">刪除這筆紀錄</button>':''}`:'<p class="muted">這筆紀錄由其他成員建立，只有建立者可以修改。</p>'}</section>`;document.body.append(layer);const close=()=>layer.remove();layer.querySelector('#close').onclick=close;layer.querySelector('.shade').onclick=close;if(!own)return;
 const cats=()=>{const select=layer.querySelector('[name=category]');const preferred=localStorage.getItem(`ledger-category-${state.kind}`);select.innerHTML=categories[state.kind].map(c=>`<option ${item?.category===c||(!item&&preferred===c)?'selected':''}>${c}</option>`).join('');const host=layer.querySelector('.quick-categories');if(host){host.innerHTML=categories[state.kind].map(c=>`<button type="button" data-category="${c}" class="${select.value===c?'active':''}">${c}</button>`).join('');host.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{select.value=b.dataset.category;syncCats()})}};
 const syncCats=()=>layer.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===layer.querySelector('[name=category]').value));
 const select=layer.querySelector('[name=category]');select.parentElement.insertAdjacentHTML('afterend','<div class="quick-categories" aria-label="快速選擇分類"></div>');select.onchange=syncCats;cats();
 if(!item)layer.querySelector('#entryform .primary').insertAdjacentHTML('afterend','<button class="secondary save-next" type="submit">儲存後再記一筆</button>');
 layer.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{state.kind=b.dataset.kind;layer.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('active',x===b));cats()});
 layer.querySelector('#entryform').onsubmit=async e=>{e.preventDefault();const f=e.target;const next=e.submitter?.classList.contains('save-next');const fields=f.elements;const payload={household_id:null,user_id:state.user.id,kind:state.kind,amount:Number(fields.namedItem('amount').value),category:fields.namedItem('category').value,note:fields.namedItem('note').value.trim(),occurred_on:fields.namedItem('date').value};f.querySelectorAll('button').forEach(b=>b.disabled=true);try{const result=item?await db.from('ledger_entries').update(payload).eq('id',item.id).eq('user_id',state.user.id):await db.from('ledger_entries').insert(payload);if(result.error)throw result.error;localStorage.setItem(`ledger-category-${state.kind}`,payload.category);state.month=payload.occurred_on.slice(0,7);if(!next)close();await refresh();if(next){fields.namedItem('amount').value='';fields.namedItem('note').value='';fields.namedItem('amount').focus()}toast(item?'已更新紀錄':'已儲存到個人帳本')}catch(err){error(err)}finally{f.querySelectorAll('button').forEach(b=>b.disabled=false)}};
 if(item)layer.querySelector('#delete').onclick=async()=>{if(!confirm('確定刪除這筆紀錄？此操作無法復原。'))return;try{const {error:e}=await db.from('ledger_entries').delete().eq('id',item.id).eq('user_id',state.user.id);if(e)throw e;close();await refresh();toast('已刪除紀錄')}catch(err){error(err)}};
}
let authVersion=0;
db.auth.onAuthStateChange((_event,session)=>{
  const version=++authVersion;
  state.user=session?.user||null;
  if(!state.user){state.household=null;state.entries=[];state.carrier=null;render();return}
  // Finish the auth callback before querying Supabase to avoid locking session access.
  setTimeout(async()=>{
    try{
      await Promise.all([loadHouseholds(),loadCarrier()]);
      if(version===authVersion)render();
    }catch(e){
      if(version!==authVersion)return;
      app.innerHTML='<div class="setup"><h1>載入帳本時發生問題</h1><p>請重新整理頁面再試一次。</p><button class="primary" id="retry-load">重新載入</button></div>';
      $('#retry-load').onclick=()=>location.reload();error(e);
    }
  },0);
});
app.innerHTML='<div class="setup"><p>正在載入家好帳…</p></div>';
