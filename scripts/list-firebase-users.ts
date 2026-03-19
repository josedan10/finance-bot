
import * as admin from 'firebase-admin';
import * as path from 'path';

const serviceAccount = require(path.join(__dirname, '../firebase-service-account.json'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function listAllUsers(nextPageToken?: string) {
  const result = await admin.auth().listUsers(100, nextPageToken);
  result.users.forEach((userRecord) => {
    console.log('User:', userRecord.toJSON());
  });
  if (result.pageToken) {
    await listAllUsers(result.pageToken);
  }
}

listAllUsers()
  .then(() => {
    console.log('Finished listing users.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error listing users:', error);
    process.exit(1);
  });
