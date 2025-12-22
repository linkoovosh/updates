import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async () => {
  try {
    const db = await open({
      filename: './database.sqlite',
      driver: sqlite3.Database
    });

    const email = 'newyour228@gmail.com';
    const user = await db.get('SELECT username, email, password, discriminator FROM users WHERE email = ?', email);

    if (user) {
      console.log('--- User Found ---');
      console.log(`Username: ${user.username}#${user.discriminator}`);
      console.log(`Email:    ${user.email}`);
      console.log(`Password: ${user.password}`); // Plaintext retrieval
      console.log('------------------');
    } else {
      console.log(`User with email ${email} not found.`);
    }
  } catch (err) {
    console.error('Error reading DB:', err);
  }
})();
