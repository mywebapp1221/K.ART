// firebase-config.js

// ★ Firebase コンソール → 歯車アイコン → プロジェクトの設定 → マイアプリ → Config の中身をここにコピペ
const firebaseConfig = {
  apiKey: "AIzaSyDP1LgZclt3Atv2B1Z4aWNMruxfIHGnpWc",
  authDomain: "komorebi1221-c3dd8.firebaseapp.com",
  projectId: "komorebi1221-c3dd8",
  storageBucket: "komorebi1221-c3dd8.appspot.com",
  messagingSenderId: "72244772206",
  appId: "1:72244772206:web:f3cc92e93f08292d17157f",
};

// 初期化
firebase.initializeApp(firebaseConfig);

// Firestore / Storage をグローバル変数に
const db = firebase.firestore();
const storage = firebase.storage();
