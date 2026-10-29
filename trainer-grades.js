import { protect } from "./auth-guard.js?v=auth8";
import { db } from "./firebase-config.js?v=auth8";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { esc, pct, score100, attPct, cellColor, csvDown } from "./grades-shell.js";
const root = document.getElementById("root");
const fail = (step, e) => { console.error(step, e); root.innerHTML = `<p class="banner">This page could not load<br>${step}: ${(e&&(e.code||e.message))||e}</p>`; };
try {
  const { user } = await protect("trainer");
  let courses=[];
  try { courses = (await getDocs(query(collection(db,"courses"), where("trainerIds","array-contains", user.uid)))).docs.map(d=>({id:d.id,...d.data()})); }
  catch(e){ fail("courses", e); throw e; }
  root.innerHTML = `<div class="toolbar"><select id="cid">${courses.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join("")||"<option value=\"\">No courses</option>"}</select>
    <input id="q" type="search" placeholder="Search by name" /><button class="btn btn-sm" type="button" id="csv">Export CSV</button></div>
    <div id="sum"></div><div id="box"></div><div id="peek"></div>`;
  const load = async () => {
    const cid = document.getElementById("cid").value;
    const box = document.getElementById("box");
    const peek = document.getElementById("peek");
    peek.innerHTML="";
    if (!cid) { box.innerHTML="<p>No courses.</p>"; return; }
    box.textContent="Loading…";
    let ens=[], assigns=[], quizzes=[], subs=[], atts=[], recs=[];
    const get = async (col, step) => {
      try { return (await getDocs(query(collection(db,col), where("courseId","==", cid)))).docs.map(d=>({id:d.id,...d.data()})); }
      catch(e){ box.innerHTML = `<p class="banner">${step}: ${e.code||e.message}</p>`; throw e; }
    };
    try {
      ens = await get("enrollments","enrollments");
      assigns = await get("assignments","assignments");
      quizzes = await get("quizzes","quizzes");
      subs = await get("submissions","submissions");
      atts = await get("quizAttempts","quizAttempts");
      recs = await get("attendance","attendance");
    } catch { return; }
    const items = [
      ...assigns.map(a=>({id:a.id,type:"hw",title:a.title,max:a.maxPoints||0})),
      ...quizzes.map(q=>({id:q.id,type:"quiz",title:q.title,max:null}))
    ];
    const q = (document.getElementById("q").value||"").toLowerCase();
    const rows = ens.filter(e=>!q || String(e.studentName||"").toLowerCase().includes(q));
    const cell = (en, it) => {
      if (it.type==="hw") {
        const s = subs.find(x=>x.uid===en.uid && x.assignmentId===it.id);
        if (s?.status==="graded") { const p=pct(s.grade,it.max); return {p, kind:"ok", label:score100(s.grade,it.max), sub:s}; }
        if (s) return {p:null, kind:"sub", label:"…", sub:s};
        return {p:null, kind:"missing", label:"—", sub:null};
      }
      const s = atts.find(x=>x.uid===en.uid && x.quizId===it.id);
      if (s?.status==="graded") { const p=pct(s.score,s.maxScore); return {p, kind:"ok", label:score100(s.score,s.maxScore), sub:s}; }
      if (s?.status==="partial") return {p:null, kind:"partial", label:"partial", sub:s};
      if (s) return {p:null, kind:"sub", label:"…", sub:s};
      return {p:null, kind:"missing", label:"—", sub:null};
    };
    const avgFor = (en) => {
      let e=0,m=0;
      items.forEach(it=>{ const c=cell(en,it); if (c.kind==="ok" && c.p!=null) { if (it.type==="hw"){ e+=Number(c.sub.grade||0); m+=Number(it.max||0);} else { e+=Number(c.sub.score||0); m+=Number(c.sub.maxScore||0);} } });
      return pct(e,m);
    };
    let awaiting=0, below=0, classE=0, classM=0;
    rows.forEach(en=>{
      items.forEach(it=>{ const c=cell(en,it); if (c.kind==="sub"||c.kind==="partial") awaiting++; });
      const a=avgFor(en); if (a!=null && a<50) below++;
    });
    items.forEach(it=>{
      let e=0,m=0,n=0;
      rows.forEach(en=>{ const c=cell(en,it); if (c.kind==="ok"){ n++; if(it.type==="hw"){e+=Number(c.sub.grade||0); m+=Number(it.max||0);} else {e+=Number(c.sub.score||0); m+=Number(c.sub.maxScore||0);} }});
      classE+=e; classM+=m;
    });
    const classAvg = pct(classE,classM);
    document.getElementById("sum").innerHTML = `<div class="course-grid"><article class="kpi"><span>Class average</span><strong>${classAvg==null?"—":classAvg+"%"}</strong></article>
      <article class="kpi"><span>Awaiting grading</span><strong>${awaiting}</strong></article>
      <article class="kpi"><span>Below 50%</span><strong>${below}</strong></article></div>`;
    const head = `<tr><th>Student</th>${items.map(it=>`<th>${esc(it.title)}<br><small>${it.max||""}</small></th>`).join("")}<th>Average</th><th>Attendance %</th></tr>`;
    const body = rows.map(en=>{
      const ap = attPct(recs.filter(r=>r.uid===en.uid));
      return `<tr><td>${esc(en.studentName||en.uid)}</td>`+items.map(it=>{
        const c=cell(en,it);
        return `<td data-open="${en.uid}|${it.type}|${it.id}" style="background:${cellColor(c.kind,c.p)};color:#fff;cursor:pointer">${c.label}</td>`;
      }).join("")+`<td>${avgFor(en)==null?"—":avgFor(en)+"%"}</td><td>${ap==null?"—":ap+"%"}</td></tr>`;
    }).join("");
    const avgRow = `<tr><th>Class average</th>`+items.map(it=>{
      let e=0,m=0; rows.forEach(en=>{ const c=cell(en,it); if(c.kind==="ok"){ if(it.type==="hw"){e+=Number(c.sub.grade||0); m+=Number(it.max||0);} else {e+=Number(c.sub.score||0); m+=Number(c.sub.maxScore||0);} }});
      const p=pct(e,m); return `<td>${p==null?"—":p+"%"}</td>`;
    }).join("")+`<td></td><td></td></tr>`;
    box.innerHTML = `<div class="table-wrap"><table class="data"><thead>${head}</thead><tbody>${body}${avgRow}</tbody></table></div>`;
    box.querySelectorAll("[data-open]").forEach(td=> td.onclick=()=>{
      const [uid,type,id]=td.dataset.open.split("|");
      const en=ens.find(e=>e.uid===uid);
      if (type==="hw") {
        const s=subs.find(x=>x.uid===uid && x.assignmentId===id);
        peek.innerHTML = `<article class="kpi"><h3>${esc(en?.studentName)}</h3><p>${esc(s?.answer||s?.text||"No submission")}</p><p>Grade: ${s?.grade??"—"}</p></article>`;
      } else {
        const s=atts.find(x=>x.uid===uid && x.quizId===id);
        peek.innerHTML = `<article class="kpi"><h3>${esc(en?.studentName)}</h3><p>Status ${esc(s?.status||"not taken")}</p><p>Score ${s?.score??"—"} / ${s?.maxScore??"—"}</p></article>`;
      }
    });
    document.getElementById("csv").onclick=()=>{
      const out=[["Student",...items.map(i=>i.title),"Average","Attendance"]];
      rows.forEach(en=> out.push([en.studentName||en.uid, ...items.map(it=>cell(en,it).label), avgFor(en)??"", attPct(recs.filter(r=>r.uid===en.uid))??""]));
      csvDown("gradebook.csv", out);
    };
  };
  document.getElementById("cid").onchange=load;
  document.getElementById("q").oninput=load;
  await load();
} catch(e){ fail("grades page", e); }
