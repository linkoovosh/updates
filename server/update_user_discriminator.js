import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async () => {
  try {
    const db = await open({
      filename: './database.sqlite',
      driver: sqlite3.Database
    });

    const username = 'Linko';
    const oldDiscriminator = '1442';
    const newDiscriminator = '0000';
    const email = 'newyour228@gmail.com'; // Using email to uniquely identify

    // First, check if the user exists with the old discriminator
    const user = await db.get(
      'SELECT id FROM users WHERE username = ? AND discriminator = ? AND email = ?',
      username, oldDiscriminator, email
    );

    if (user) {
      // Then, check if the new discriminator is already taken by this username
      const existingUserWithNewDiscriminator = await db.get(
        'SELECT id FROM users WHERE username = ? AND discriminator = ? AND id != ?',
        username, newDiscriminator, user.id
      );

      if (existingUserWithNewDiscriminator) {
        console.error(`Error: User ${username}#${newDiscriminator} already exists! Cannot change discriminator.`);
        return;
      }

      await db.run(
        'UPDATE users SET discriminator = ? WHERE id = ?',
        newDiscriminator, user.id
      );
      console.log(`Successfully updated user ${username}#${oldDiscriminator} to ${username}#${newDiscriminator}`);
    } else {
      console.error(`Error: User ${username}#${oldDiscriminator} with email ${email} not found.`);
    }
  } catch (err) {
    console.error('Error updating DB:', err);
  } finally {
    console.log('Script finished.');
  }
})();
