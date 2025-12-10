// firebase-config.js

// ★ Firebase コンソール → 歯車アイコン → プロジェクトの設定 → マイアプリ →
// 「構成」タブに表示されている Config をここにコピペ
const firebaseConfig = {
  apiKey: "AIzaSyDP1LgZclt3Atv2B1Z4aWNMruxfIHGnpWc",
  authDomain: "komorebi1221-c3dd8.firebaseapp.com",
  projectId: "komorebi1221-c3dd8",
  storageBucket: "komorebi1221-c3dd8.appspot.com",
  messagingSenderId: "72244772206",
  appId: "1:72244772206:web:f3cc92e93f08292d17157f",
};

// Firebase 初期化
firebase.initializeApp(firebaseConfig);

// Firestore をグローバル変数に（main.js からこれを使う）
const db = firebase.firestore();
