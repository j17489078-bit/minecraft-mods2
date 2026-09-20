const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const pw = process.argv[2];
if (!pw || pw.length < 8) {
  console.error('Usage: npm run set-password -- "a password at least 8 characters"');
  process.exit(1);
}

const dir = path.join(__dirname, "..", "config");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "admin.hash"), bcrypt.hashSync(pw, 12) + "\n");
console.log("Admin password set. Restart the server for it to take effect.");
