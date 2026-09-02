import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root=process.cwd();
const confirmationSql=readFileSync(join(root,"supabase/migrations/20260902010000_candidate_confirmation_safety.sql"),"utf8");
const importSql=readFileSync(join(root,"supabase/migrations/20260829030000_resume_partial_dates.sql"),"utf8");
const actions=readFileSync(join(root,"src/app/profile/actions.ts"),"utf8");
const repository=readFileSync(join(root,"src/lib/candidate/repository.ts"),"utf8");

for(const [kind,table] of [["skill","candidate_skills"],["experience","candidate_experiences"],["project","candidate_projects"],["education","candidate_education"]] as const){
  test(`confirm ${kind} is an owner-scoped in-place update`,()=>{
    assert.match(confirmationSql,new RegExp(`update public\\.${table} set confirmed=true where id=p_id and user_id=v_user returning id into v_id`));
    assert.doesNotMatch(confirmationSql,new RegExp(`delete from public\\.${table}`));
  });
}

test("candidate queries continue returning confirmed rows",()=>{
  assert.match(repository,/from\("candidate_experiences"\)\.select\("\*"\)\.eq\("user_id",userId\)/);
  assert.doesNotMatch(repository,/\.eq\("confirmed",false\)/);
});

test("existing saves update by id without replacing provenance",()=>{
  assert.match(actions,/id\?await db\.from\("candidate_experiences"\)\.update\(value\)\.eq\("id",id\)\.eq\("user_id",user\.id\)/);
  assert.match(actions,/insert\(\{\.\.\.value,user_id:user\.id,source:"manual"\}\)/);
});

test("resume re-import only updates unconfirmed resume evidence",()=>{
  for(const table of ["candidate_experiences","candidate_projects","candidate_education"]){
    assert.match(importSql,new RegExp(`where not public\\.${table}\\.confirmed and public\\.${table}\\.source='resume'`));
  }
  assert.doesNotMatch(importSql,/delete\s+from\s+public\.candidate_/i);
});
