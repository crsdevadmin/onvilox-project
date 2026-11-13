#!/usr/bin/env node
// READ-ONLY. Counts which protein plan / carb / add-ons patients actually get,
// to pick the formulations to license with FSSAI. No names printed. Never writes.
// Run from the server folder:   node check-formulation-mix.js
const path=require("path"); const S=__dirname;
require(path.join(S,"node_modules/dotenv")).config({path:path.join(S,".env")});
const {Pool}=require(path.join(S,'node_modules/pg'));
const PP=require(path.join(S,'..','js','protein-plans.js'));
const cs=(process.env.DATABASE_URL||'').replace(/([?&])sslmode=[^&]*(&|$)/,(m,a,b)=>(a==='?'&&b==='&')?'?':(b==='&'?a:''));
const pool=new Pool({connectionString:cs,ssl:{rejectUnauthorized:false}});
(async()=>{
 const pts=(await pool.query(`select * from patients`)).rows;
 const plans=(await pool.query(`select distinct on (patient_id) patient_id, final_plan, full_data from nutrition_plans order by patient_id, version desc`)).rows;
 const pm={}; plans.forEach(p=>pm[p.patient_id]=p);
 const c={}; const inc=(k)=>c[k]=(c[k]||0)+1;
 const combo={};
 pts.forEach(p=>{
  const fd=p.full_data||{}; const np=pm[p.id]; const fp=(np&&(np.final_plan||np.full_data))||{};
  const sel=PP.select({sex:p.sex||fd.sex||fd.gender,allergies:p.allergies||fd.allergies,sideEffects:p.side_effects||fd.sideEffects,comorbidities:p.comorbidities||fd.comorbidities,treatmentTypes:p.treatment_types||fd.treatmentTypes,giIssues:p.gi_issues,culturalPreferences:p.cultural_preferences,subSite:p.sub_site||fd.subSite||fd.rtSubSite,dietPreference:fd.dietPreference||fd.diet, vegan:fd.vegan});
  const s=JSON.stringify(fp);
  const stored=(s.match(/"planCode":"(P\d)"/)||[])[1];
  const code=stored||sel.code;
  const carb=/palatinose/.test(s)?'palatinose':(/maltodextrin/.test(s)?'malto':'?');
  const glut=/"glutamine":\{/.test(s)?'+Gln':''; const bcaa=/"bcaa":\{/.test(s)?'+BCAA':'';
  inc('plan:'+code+(sel.soyFree?' soyfree':'')); inc('carb:'+carb); if(glut)inc('glutamine'); if(bcaa)inc('bcaa'); inc('hasPlan:'+(!!np));
  const k=code+(sel.soyFree?'/SF':'')+' '+carb+glut+bcaa; combo[k]=(combo[k]||0)+1;
 });
 console.log('patients',pts.length); console.log(c);
 console.log(Object.entries(combo).sort((a,b)=>b[1]-a[1]));
 await pool.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
