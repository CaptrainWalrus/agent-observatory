import { openDatabase } from "./database.js";

const database = openDatabase(process.env.DATA_DIR || "./data");
try {
  if (process.argv.includes("--clear")) {
    database.exec("BEGIN IMMEDIATE");
    const result = database.prepare("DELETE FROM observations").run();
    const submissions = database.prepare("DELETE FROM fruit_submissions").run();
    const journeys = database.prepare("DELETE FROM access_journeys").run();
    database.exec("COMMIT");
    console.log(`Deleted ${result.changes} observations, ${submissions.changes} fruit submissions, and ${journeys.changes} access journeys.`);
  } else {
    console.log(JSON.stringify({
      latest: database.prepare("SELECT * FROM observations ORDER BY id DESC LIMIT 100").all(),
      summary: database.prepare("SELECT event, path, response_status, COUNT(*) AS requests FROM observations GROUP BY event, path, response_status").all(),
      fruit_submissions: database.prepare("SELECT * FROM fruit_submissions ORDER BY id DESC LIMIT 100").all(),
      fruit_summary: database.prepare("SELECT fruit, COUNT(*) AS submissions FROM fruit_submissions GROUP BY fruit").all(),
      access_journeys: database.prepare("SELECT id, fruit_submission_id, pseudonym, objective, objective_at, place, place_at FROM access_journeys ORDER BY id DESC LIMIT 100").all(),
    }, null, 2));
  }
} finally {
  database.close();
}
