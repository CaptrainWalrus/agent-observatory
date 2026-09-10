import { openDatabase } from "./database.js";

const database = openDatabase(process.env.DATA_DIR || "./data");
try {
  if (process.argv.includes("--clear")) {
    const result = database.prepare("DELETE FROM observations").run();
    console.log(`Deleted ${result.changes} observations.`);
  } else {
    console.log(JSON.stringify({
      latest: database.prepare("SELECT * FROM observations ORDER BY id DESC LIMIT 100").all(),
      summary: database.prepare("SELECT event, response_status, COUNT(*) AS requests FROM observations GROUP BY event, response_status").all(),
    }, null, 2));
  }
} finally {
  database.close();
}
