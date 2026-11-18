import { createHash } from "node:crypto";
export const quote = (name) => `"${name.replaceAll('"', '""')}"`;
export const digest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(value) ?? "undefined")
    .digest("hex");
const namespaces = "('public','auth','storage','pgmq','supabase_migrations')";
const grants = (acl, owner, kind) =>
  `(select jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by pg_get_userbyid(a.grantor),a.grantee::regrole::text,a.privilege_type,a.is_grantable) from aclexplode(coalesce(${acl},acldefault('${kind}',${owner}))) a)`;
export async function databaseSnapshot(client) {
  const extensions = (
    await client.query(
      "select e.extname name,e.extversion version,n.nspname schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by e.extname",
    )
  ).rows;
  const tables = (
    await client.query(`select n.nspname schema,c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
    pg_get_userbyid(c.relowner) owner,${grants("c.relacl", "c.relowner", "r")} acl from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ${namespaces} and c.relkind in ('r','p') order by 1,2`)
  ).rows;
  const values = [];
  for (const table of tables) {
    const data = (
      await client.query(
        `select count(*)::text rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) value from ${quote(table.schema)}.${quote(table.name)} t`,
      )
    ).rows[0];
    values.push({ ...table, ...data });
  }
  const policies = (
    await client.query(
      `select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ${namespaces} order by schemaname,tablename,policyname`,
    )
  ).rows;
  const routines = (
    await client.query(`select p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition,
    pg_get_userbyid(p.proowner) owner,${grants("p.proacl", "p.proowner", "f")} acl,p.prosecdef definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') order by p.oid::regprocedure::text`)
  ).rows;
  const constraints = (
    await client.query(
      `select n.nspname schema,c.relname name,k.conname constraint_name,pg_get_constraintdef(k.oid,true) definition,k.convalidated validated from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces} order by 1,2,3`,
    )
  ).rows;
  const triggers = (
    await client.query(
      `select n.nspname schema,c.relname name,t.tgname trigger_name,t.tgenabled enabled,pg_get_triggerdef(t.oid,true) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces} and not t.tgisinternal order by 1,2,3`,
    )
  ).rows;
  const sequences = [];
  for (const sequence of (
    await client.query(
      `select schemaname schema,sequencename name from pg_sequences where schemaname in ${namespaces} order by 1,2`,
    )
  ).rows) {
    sequences.push({
      ...sequence,
      ...(
        await client.query(
          `select last_value::text value,is_called from ${quote(sequence.schema)}.${quote(sequence.name)}`,
        )
      ).rows[0],
    });
  }
  return { values, policies, routines, constraints, triggers, sequences, extensions };
}
export function compareSnapshots(before, after) {
  const differentSections = Object.keys(before).filter(
    (key) => digest(before[key]) !== digest(after[key]),
  );
  const tableDifferences = before.values.flatMap((table) => {
    const restored = after.values.find(
        (item) => item.schema === table.schema && item.name === table.name,
      ),
      fields = Object.keys(table).filter((key) => digest(table[key]) !== digest(restored?.[key]));
    return fields.length
      ? [
          {
            schema: table.schema,
            name: table.name,
            fields,
            sourceRows: table.rows,
            restoredRows: restored?.rows ?? null,
          },
        ]
      : [];
  });
  return { differentSections, tableDifferences };
}
