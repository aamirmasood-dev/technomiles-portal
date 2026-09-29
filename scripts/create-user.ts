// Usage: npm run create-user -- <email> "<name>"   (prompts for the password)
// Running it again for an existing email resets that user's password.
import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

config({ path: ".env.local" });
config();

async function readPassword(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Hide typed characters.
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  out._writeToOutput = (s: string) => {
    if (s.includes(prompt)) out.output.write(prompt);
  };
  const answer = await rl.question(prompt);
  rl.close();
  process.stdout.write("\n");
  return answer;
}

async function main() {
  const [email, name] = process.argv.slice(2);
  if (!email || !name) {
    console.error('Usage: npm run create-user -- <email> "<name>"');
    process.exit(1);
  }
  const password = process.env.NEW_USER_PASSWORD ?? (await readPassword("Password: "));
  if (password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  await conn.execute(
    `INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
    [email.trim().toLowerCase(), name, hash],
  );
  await conn.end();
  console.log(`User ${email} saved.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
