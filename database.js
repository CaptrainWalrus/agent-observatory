import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function openDatabase(dataDirectory) {
  const directory = resolve(dataDirectory);
  mkdirSync(directory, { recursive: true });
  const database = new DatabaseSync(join(directory, "observations.sqlite"));
  database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
  database.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  return database;
}
