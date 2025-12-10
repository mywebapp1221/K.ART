// ==================== Firestore コレクション名 ====================
const COLLECTIONS = {
  artworks: "artworks", // M / B の作品データ
  surveys: "surveys",   // E のアンケートデータ
};

// ==================== Cloudinary 設定 ====================
const cloudName = "drfgen4gm";
const uploadPreset = "karts_unsigned";

// ==================== 状態管理用の変数 ====================
let currentCode = null;
let currentType = null; // "M" | "B" | "E"
let currentImageUrl = null;

// ==================== 画面切り替え ====================
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) target.classList.add("active");
}

/* =================================================================
   Firestore 関連
   ================================================================= */
async function loadArtworkFromServer(code) {
  const docRef = db.collection(COLLECTIONS.artworks).doc(code);
  const snap = await docRef.get();
  if (!snap.exists) return null;
  return snap.data();
}

async function saveArtworkToServer(code, data) {
  const docRef = db.collection(COLLECTIONS.artworks).doc(code);
  await docRef.set(data, { merge: true });
}

async function loadSurveysFromServer() {
  const snap = await db
    .collection(COLLECTIONS.surveys)
    .orderBy("createdAt")
    .get();
  return snap.docs.map((doc) => doc.data());
}

async function addSurveyToServer(survey) {
  await db.collection(COLLECTIONS.surveys).add(survey);
}

async function resetSurveysOnServer() {
  const snap = await db.collection(COLLECTIONS.surveys).get();
  const batch = db.batch();
  snap.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

/* =================================================================
   Cloudinary アップロード
   ================================================================= */
async function uploadArtworkImage(code, file) {
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  // 毎回ユニーク ID を作って上書きを避ける
  const publicId = `${code}_${Date.now()}`;
  formData.append("public_id", publicId);
  formData.append("folder", "karts-artworks");

  const res = await fetch(url, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Cloudinary へのアップロードに失敗しました");

  const data = await res.json();
  return {
    imageUrl: data.secure_url,
    publicId: data.public_id
  };
}

/* =================================================================
   ログイン処理（M/E は 1221 必須、B は不要）
   ================================================================= */
async function handleLogin(e) {
  e.preventDefault();
  const inputCode = document.getElementById("login-code");
  const inputPass = document.getElementById("login-password");
  const error = document.getElementById("login-error");

  const raw = (inputCode.value || "").trim().toUpperCase();
  const password = (inputPass.value || "").trim();

  // コード形式チェック
  const pattern = /^[MBE][0-9]{5}$/;
  if (!pattern.test(raw)) {
    error.textContent = "「M00001 / B00001 / E00001」の形式で入力してください。";
    return;
  }

  currentCode = raw;
  currentType = raw.charAt(0); // "M" | "B" | "E"

  // パスワード要否
  if (currentType === "M" || currentType === "E") {
    if (password !== "1221") {
      error.textContent = "パスワードが違います。（M/E の方は 1221）";
      return;
    }
  }

  // B の人はパスワード不要
  error.textContent = "";

  if (currentType === "M" || currentType === "B") {
    await setupArtScreen();
    showScreen("art-screen");
  } else if (currentType === "E") {
    await setupAdminScreen();
    showScreen("admin-screen");
  }
}

/* =================================================================
   作品画面（M / B 共通）
   ================================================================= */
async function setupArtScreen() {
  const title = document.getElementById("art-title");
  const commentInput = document.getElementById("art-comment");
  const countSpan = document.getElementById("art-comment-count");
  const imagePreview = document.getElementById("art-image-preview");
  const imagePlaceholder = document.getElementById("art-image-placeholder");

  title.textContent = currentCode + " さんの作品ページ";

  const data = await loadArtworkFromServer(currentCode);

  if (data && data.imageUrl) {
    currentImageUrl = data.imageUrl;
    imagePreview.src = currentImageUrl;
    imagePreview.classList.remove("hidden");
    imagePlaceholder.classList.add("hidden");
  } else {
    currentImageUrl = null;
    imagePreview.classList.add("hidden");
    imagePlaceholder.classList.remove("hidden");
  }

  commentInput.value = (data && data.comment) ? data.comment : "";
  countSpan.textContent = commentInput.value.length;
}

// 画像アップロード
async function handleImageChange(e) {
  const file = e.target.files[0];
  const imagePreview = document.getElementById("art-image-preview");
  const imagePlaceholder = document.getElementById("art-image-placeholder");
  const saveMsg = document.getElementById("art-save-message");

  if (!file || !currentCode) return;

  saveMsg.textContent = "画像をアップロード中…";

  try {
    // ローカルプレビュー
    const reader = new FileReader();
    reader.onload = (ev) => {
      imagePreview.src = ev.target.result;
      imagePreview.classList.remove("hidden");
      imagePlaceholder.classList.add("hidden");
    };
    reader.readAsDataURL(file);

    // Cloudinary アップロード
    const { imageUrl, publicId } = await uploadArtworkImage(currentCode, file);
    currentImageUrl = imageUrl;

    // Firestore に反映
    await saveArtworkToServer(currentCode, {
      imageUrl,
      publicId,
      updatedAt: new Date().toISOString()
    });

    saveMsg.textContent = "画像を保存しました！";
    setTimeout(() => (saveMsg.textContent = ""), 2000);
  } catch (err) {
    console.error(err);
    saveMsg.textContent = "アップロードに失敗しました。";
  }
}

// コメント保存
async function handleSaveArt() {
  const commentInput = document.getElementById("art-comment");
  const saveMsg = document.getElementById("art-save-message");

  try {
    await saveArtworkToServer(currentCode, {
      imageUrl: currentImageUrl || null,
      comment: commentInput.value,
      updatedAt: new Date().toISOString()
    });

    saveMsg.textContent = "保存しました。";
    setTimeout(() => (saveMsg.textContent = ""), 2000);
  } catch (err) {
    console.error(err);
    saveMsg.textContent = "保存に失敗しました。";
  }
}

// 画像削除（Firestore だけ削除）
async function handleDeleteImage() {
  if (!currentImageUrl) {
    alert("画像がありません。");
    return;
  }

  const ok = confirm("画像を削除しますか？（Cloudinary の実ファイルは残ります）");
  if (!ok) return;

  await saveArtworkToServer(currentCode, {
    imageUrl: null,
    publicId: null,
    updatedAt: new Date().toISOString()
  });

  currentImageUrl = null;

  document.getElementById("art-image-preview").classList.add("hidden");
  document.getElementById("art-image-placeholder").classList.remove("hidden");

  document.getElementById("art-save-message").textContent = "画像を削除しました。";
}

/* =================================================================
   管理画面（E ユーザー専用）
   ================================================================= */
async function setupAdminScreen() {
  await renderSurveyData();
}

async function handleSurveySubmit(e) {
  e.preventDefault();

  const age = parseInt(document.getElementById("age").value, 10);
  const wallet = parseInt(document.getElementById("wallet").value, 10);
  const freeComment = document.getElementById("free-comment").value.trim();

  await addSurveyToServer({
    age,
    wallet,
    freeComment,
    createdAt: firebase.firestore.Timestamp.now()
  });

  await renderSurveyData();
}

async function renderSurveyData() {
  const listDiv = document.getElementById("survey-list");
  const surveys = await loadSurveysFromServer();

  if (!surveys.length) {
    listDiv.innerHTML = "<p>まだデータがありません</p>";
    return;
  }

  listDiv.innerHTML =
    surveys
      .map(
        (s, i) =>
          `<p>${i + 1}. 年齢：${s.age} / 財布：${s.wallet}円 / 意見：${s.freeComment}</p>`
      )
      .join("");
}

// すべて削除
async function handleSurveyReset() {
  if (!confirm("アンケートを全削除しますか？")) return;

  await resetSurveysOnServer();
  await renderSurveyData();
}

/* =================================================================
   共通
   ================================================================= */
function logout() {
  currentCode = null;
  currentType = null;
  currentImageUrl = null;
  document.getElementById("login-code").value = "";
  document.getElementById("login-password").value = "";
  showScreen("login-screen");
}

function init() {
  document.getElementById("login-form").addEventListener("submit", handleLogin);

  document.getElementById("art-image-input").addEventListener("change", handleImageChange);
  document.getElementById("save-art").addEventListener("click", handleSaveArt);
  document.getElementById("delete-image").addEventListener("click", handleDeleteImage);
  document.getElementById("logout-art").addEventListener("click", logout);

  document.getElementById("survey-form").addEventListener("submit", handleSurveySubmit);
  document.getElementById("reset-survey").addEventListener("click", handleSurveyReset);
  document.getElementById("logout-admin").addEventListener("click", logout);
}

document.addEventListener("DOMContentLoaded", init);
