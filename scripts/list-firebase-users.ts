
import fs from 'fs';
import path from 'path';
import * as admin from 'firebase-admin';

function loadServiceAccount(): admin.ServiceAccount {
	const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');

	if (!fs.existsSync(serviceAccountPath)) {
		throw new Error(`firebase-service-account.json not found at ${serviceAccountPath}`);
	}

	return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')) as admin.ServiceAccount;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount())
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
