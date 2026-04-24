{
  "name": "tiktok-downloader-functions",
  "description": "TikTok Video Downloader - Cloud Functions",
  "main": "index.js",
  "engines": {
    "node": "18"
  },
  "scripts": {
    "serve": "firebase emulators:start --only functions",
    "deploy": "firebase deploy --only functions"
  },
  "dependencies": {
    "firebase-admin": "^11.11.0",
    "firebase-functions": "^4.5.0",
    "axios": "^1.6.7",
    "uuid": "^9.0.0"
  },
  "private": true
}
