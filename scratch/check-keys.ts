import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  console.log("=== ENV KEYS PRESENT ===");
  content.split('\n').forEach(line => {
    const key = line.split('=')[0]?.trim();
    if (key) console.log("Key:", key);
  });
} else {
  console.log(".env.local file not found");
}
