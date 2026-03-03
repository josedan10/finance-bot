import * as admin from 'firebase-admin';

try {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
} catch (error) {
  console.warn("Firebase Admin Initialization Error:", error);
}

export const firebaseAdmin = admin;
