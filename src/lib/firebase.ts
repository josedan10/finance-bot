import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

try {
	if (!admin.apps.length) {
		const serviceAccountPath =
			process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'firebase-service-account.json');
		const serviceAccountFileExists = fs.existsSync(serviceAccountPath);

		if (process.env.GOOGLE_APPLICATION_CREDENTIALS && serviceAccountFileExists) {
			admin.initializeApp({
				credential: admin.credential.cert(serviceAccountPath),
			});
		} else if (process.env.FIREBASE_PRIVATE_KEY) {
			admin.initializeApp({
				credential: admin.credential.cert({
					projectId: process.env.FIREBASE_PROJECT_ID,
					clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
					privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
				}),
			});
		} else {
			admin.initializeApp({
				credential: admin.credential.cert(serviceAccountPath),
			});
		}
		console.log('Firebase Admin Initialized successfully');
	}
} catch (error) {
	console.warn('Firebase Admin Initialization Error:', error);
}

export const firebaseAdmin = admin;
