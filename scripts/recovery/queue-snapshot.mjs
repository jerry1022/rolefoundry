import { createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { quote } from "./postgres-snapshot.mjs";
// PGMQ's extension members are omitted by ordinary pg_dump on the pinned stack.
// This sidecar shares the exported transaction snapshot; the source schema is never detached or changed.
export async function exportQueue(client, directory) {
  const queues = (
    await client.query(
      "select queue_name,is_partitioned,is_unlogged from pgmq.meta order by queue_name",
    )
  ).rows;
  if (
    queues.length !== 1 ||
    queues[0].queue_name !== "rolefoundry_tasks" ||
    queues[0].is_partitioned ||
    queues[0].is_unlogged
  )
    throw Error(
      "This rehearsal supports only the project’s logged, non-partitioned rolefoundry_tasks queue.",
    );
  const tables = ["meta", "q_rolefoundry_tasks", "a_rolefoundry_tasks"];
  for (const name of tables) {
    const cursor = `backup_${name}`;
    await client.query(
      `declare ${quote(cursor)} no scroll cursor for select row_to_json(t)::text row from pgmq.${quote(name)} t`,
    );
    try {
      async function* rows() {
        while (true) {
          const page = await client.query(`fetch forward 500 from ${quote(cursor)}`);
          if (!page.rows.length) break;
          for (const row of page.rows) yield row.row + "\n";
        }
      }
      await pipeline(
        rows(),
        createWriteStream(path.join(directory, `pgmq-${name}.ndjson`), {
          flags: "wx",
          mode: 0o600,
        }),
      );
    } finally {
      await client.query(`close ${quote(cursor)}`);
    }
  }
  return { tables, queueName: queues[0].queue_name };
}
export async function restoreQueue(client, directory, metadata, sequences) {
  await client.query("select pgmq.create($1)", [metadata.queueName]);
  for (const name of metadata.tables) {
    const table = `pgmq.${quote(name)}`;
    await client.query(`truncate ${table}`);
    const stream = createReadStream(path.join(directory, `pgmq-${name}.ndjson`));
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (line)
          await client.query(
            `insert into ${table} overriding system value select * from json_populate_record(null::${table},$1::json)`,
            [line],
          );
      }
    } finally {
      lines.close();
      stream.destroy();
    }
  }
  for (const sequence of sequences.filter((item) => item.schema === "pgmq"))
    await client.query("select pg_catalog.setval($1::regclass,$2::bigint,$3::boolean)", [
      `pgmq.${quote(sequence.name)}`,
      sequence.value,
      sequence.is_called,
    ]);
}
