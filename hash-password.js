// Usage: npm run hash-password -- "your-new-admin-password"
// Prints a bcrypt hash to paste into ADMIN_PASSWORD_HASH in your .env file.
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your-password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\nAdd this to your .env file:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
