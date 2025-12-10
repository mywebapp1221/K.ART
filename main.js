// ==================== Firestore コレクション名 ====================
const COLLECTIONS = {
  artworks: "artworks", // M / B の作品
  surveys: "surveys",   // E のアンケート結果
};

// トップページ用の featured コレクション
const FEATURED_COLLECTION = "featured";
const FEATURED_DOC_ID = "home";

// ==================== Cloudinary 設定 ====================
const cloudName = "drfgen4gm";         // Cloud name
const uploadPreset = "karts_unsigned"; // Unsigned upload preset 名

// ==================== 状態管理用の変数 ====================
let currentCode = null;
let currentType = null;      // "M" | "B" | "E"
let currentImageUrl = null;  // Firestore に保存されている URL

// ==================== 画面切り替え ====================
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) =>
    s.classList.remove("active")
  );
  document.getElementById(screenId).classList.add("active");
}

/* =================================================================
   Firestore 関連
   ================================================================= */

// 作品読み込み
async function loadArtworkFromServer(code) {
  const docRef = db.collection(COLLECTIONS.artworks).doc(code);
  const snap = await docRef.get();
  return snap.exists ? snap.data() : null;
}

// 作品保存
async function saveArtworkToServer(code, data) {
  const docRef = db.collection(COLLECTIONS.artworks).doc(code);
  await docRef.set(data, { merge: true });
}

// アンケート読み込み
async function loadSurveysFromServer() {
  const snap = await db
    .collection(COLLECTIONS.surveys)
    .orderBy("createdAt")
    .get();
  return snap.docs.map((doc) => doc.data());
}

// アンケート追加
async function addSurveyToServer(survey) {
  await db.collection(COLLECTIONS.surveys).add(survey);
}

// アンケート全削除
async function resetSurveysOnServer() {
  const snap = await db.collection(COLLECTIONS.surveys).get();
  const batch = db.batch();
  snap.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// トップページ用 featured 読み込み
async function loadFeaturedFromServer() {
  const ref = db.collection(FEATURED_COLLECTION).doc(FEATURED_DOC_ID);
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
}

// featured 保存
async function saveFeaturedToServer(data) {
  const ref = db.collection(FEATURED_COLLECTION).doc(FEATURED_DOC_ID);
  await ref.set(data, { merge: true });
}

/* =================================================================
   Cloudinary アップロード
   ================================================================= */

async function uploadArtworkImage(code, file) {
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  // 毎回ユニークな public_id にする
  const publicId = `${code}_${Date.now()}`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", "karts-artworks");
  formData.append("public_id", publicId);

  const res = await fetch(url, { method: "POST", body: formData });

  if (!res.ok) throw new Error("Cloudinary アップロード失敗");

  const data = await res.json();
  return { imageUrl: data.secure_url, publicId: data.public_id };
}

/* =================================================================
   ログイン処理
   ================================================================= */

async function handleLogin(e) {
  e.preventDefault();

  const codeInput = document.getElementById("login-code");
  const passInput = document.getElementById("login-password");
  const error = document.getElementById("login-error");

  const rawCode = (codeInput.value || "").trim().toUpperCase();
  const password = (passInput.value || "").trim();

  // M / B / E + 5 桁数字
  const pattern = /^[MBE][0-9]{5}$/;
  if (!pattern.test(rawCode)) {
    error.textContent =
      "「B00001」のようにアルファベット1文字 + 5桁の数字で入力してください。";
    return;
  }

  const head = rawCode.charAt(0); // "M" / "B" / "E"

  // ★ M と E だけパスワード必須（1221）
  if (head === "M" || head === "E") {
    if (password !== "1221") {
      error.textContent = "パスワードが正しくありません。";
      return;
    }
  }

  // ログイン成功
  currentCode = rawCode;
  currentType = head;
  currentImageUrl = null;
  error.textContent = "";

  if (head === "M" || head === "B") {
    await setupArtScreen();
    showScreen("art-screen");
  } else if (head === "E") {
    await setupAdminScreen();
    showScreen("admin-screen");
  }
}

/* =================================================================
   M / B 作品画面
   ================================================================= */

async function setupArtScreen() {
  const title = document.getElementById("art-title");
  const imagePreview = document.getElementById("art-image-preview");
  const imagePlaceholder = document.getElementById("art-image-placeholder");
  const commentInput = document.getElementById("art-comment");
  const count = document.getElementById("art-comment-count");
  const msg = document.getElementById("art-save-message");
  const featureBtn = document.getElementById("feature-art");

  title.textContent = `${currentCode} さんの作品ページ`;
  msg.textContent = "";

  // M の人だけ「トップページに表示」ボタンを出す
  if (currentType === "M") {
    featureBtn.classList.remove("hidden");
  } else {
    featureBtn.classList.add("hidden");
  }

  const data = await loadArtworkFromServer(currentCode);

  if (data && data.imageUrl) {
    currentImageUrl = data.imageUrl;
    imagePreview.src = currentImageUrl;
    imagePreview.classList.remove("hidden");
    imagePlaceholder.classList.add("hidden");
  } else {
    currentImageUrl = null;
    imagePreview.src = "";
    imagePreview.classList.add("hidden");
    imagePlaceholder.classList.remove("hidden");
  }

  commentInput.value = data?.comment || "";
  count.textContent = commentInput.value.length.toString();
}

// 画像選択 → Cloudinary アップロード
async function handleImageChange(e) {
  const file = e.target.files[0];
  if (!file || !currentCode) return;

  const imagePreview = document.getElementById("art-image-preview");
  const placeholder = document.getElementById("art-image-placeholder");
  const msg = document.getElementById("art-save-message");

  msg.textContent = "画像アップロード中…";

  // 先にローカルでプレビュー
  const reader = new FileReader();
  reader.onload = (ev) => {
    imagePreview.src = ev.target.result;
    imagePreview.classList.remove("hidden");
    placeholder.classList.add("hidden");
  };
  reader.readAsDataURL(file);

  try {
    const { imageUrl, publicId } = await uploadArtworkImage(currentCode, file);
    currentImageUrl = imageUrl;

    await saveArtworkToServer(currentCode, {
      imageUrl,
      publicId,
      updatedAt: new Date().toISOString(),
    });

    msg.textContent = "画像を保存しました。";
    setTimeout(() => (msg.textContent = ""), 2000);
  } catch (err) {
    console.error(err);
    msg.textContent = "アップロードに失敗しました。時間をおいて再試行してください。";
  }
}

// コメント保存（＋画像URLも一緒に保存）
async function handleSaveArt() {
  if (!currentCode) return;

  const msg = document.getElementById("art-save-message");
  const comment = document.getElementById("art-comment").value;

  try {
    await saveArtworkToServer(currentCode, {
      imageUrl: currentImageUrl || null,
      comment,
      updatedAt: new Date().toISOString(),
    });

    msg.textContent = "保存しました。";
    setTimeout(() => (msg.textContent = ""), 2000);
  } catch (err) {
    console.error(err);
    msg.textContent = "保存に失敗しました。";
  }
}

// コメント文字数カウント
function handleCommentInput(e) {
  document.getElementById("art-comment-count").textContent =
    e.target.value.length.toString();
}

// 画像削除（サイト上＆Firestoreから）
async function handleDeleteImage() {
  if (!currentCode) return;

  const msg = document.getElementById("art-save-message");
  const preview = document.getElementById("art-image-preview");
  const placeholder = document.getElementById("art-image-placeholder");

  if (!currentImageUrl) {
    msg.textContent = "削除する画像がありません。";
    setTimeout(() => (msg.textContent = ""), 2000);
    return;
  }

  if (!confirm("画像を削除しますか？")) return;

  try {
    await saveArtworkToServer(currentCode, {
      imageUrl: null,
      publicId: null,
      updatedAt: new Date().toISOString(),
    });

    currentImageUrl = null;
    preview.src = "";
    preview.classList.add("hidden");
    placeholder.classList.remove("hidden");

    msg.textContent = "削除しました。";
    setTimeout(() => (msg.textContent = ""), 2000);
  } catch (err) {
    console.error(err);
    msg.textContent = "削除に失敗しました。";
  }
}

// ★ Mユーザー専用：この作品をトップページの one/two & three/four に入れ替える
async function handleFeatureArt() {
  const msg = document.getElementById("art-save-message");

  if (currentType !== "M") {
    msg.textContent = "M から始まるコードの方のみ利用できます。";
    setTimeout(() => (msg.textContent = ""), 2500);
    return;
  }

  // 最新の作品データを取得（念のため）
  const artwork = await loadArtworkFromServer(currentCode);
  const imageUrl = artwork?.imageUrl || currentImageUrl;
  const comment =
    artwork?.comment ||
    document.getElementById("art-comment").value.trim();

  if (!imageUrl || !comment) {
    msg.textContent = "画像と文章を保存してから「トップページに表示」を押してください。";
    setTimeout(() => (msg.textContent = ""), 3000);
    return;
  }

  try {
    // 今の featured を取得
    const data = (await loadFeaturedFromServer()) || {};
    const slot1 = data.slot1 || null;
    const slot2 = data.slot2 || null;

    // ロジック：
    // - いまの slot2 を slot1 にずらす
    // - 今回の作品を slot2 に入れる
    const newSlot1 = slot2 && slot2.imageUrl ? slot2 : null;
    const newSlot2 = {
      code: currentCode,
      imageUrl,
      comment,
    };

    await saveFeaturedToServer({
      slot1: newSlot1,
      slot2: newSlot2,
      updatedAt: new Date().toISOString(),
    });

    msg.textContent = "トップページの作品を入れ替えました。";
    setTimeout(() => (msg.textContent = ""), 2500);

    // ログイン画面側も更新
    await renderFeaturedOnLogin();
  } catch (err) {
    console.error(err);
    msg.textContent = "入れ替えに失敗しました。";
  }
}

/* =================================================================
   E 管理画面（アンケート）
   ================================================================= */

async function setupAdminScreen() {
  document.getElementById("survey-save-message").textContent = "";
  document.getElementById("survey-reset-message").textContent = "";
  await renderSurveyData();
}

// アンケート追加
async function handleSurveySubmit(e) {
  e.preventDefault();

  const age = Number(document.getElementById("age").value);
  const wallet = Number(document.getElementById("wallet").value);
  const free = document.getElementById("free-comment").value.trim();
  const msg = document.getElementById("survey-save-message");

  if (Number.isNaN(age) || Number.isNaN(wallet)) {
    msg.textContent = "年齢と財布の中身を正しく入力してください。";
    return;
  }

  try {
    await addSurveyToServer({
      age,
      wallet,
      freeComment: free,
      createdAt: firebase.firestore.Timestamp.now(),
    });

    msg.textContent = "アンケート結果を追加しました。";
    setTimeout(() => (msg.textContent = ""), 2000);

    document.getElementById("survey-form").reset();

    await renderSurveyData();
  } catch (err) {
    console.error(err);
    msg.textContent = "保存に失敗しました。";
  }
}

// アンケート表示
async function renderSurveyData() {
  const summaryDiv = document.getElementById("survey-summary");
  const listDiv = document.getElementById("survey-list");

  const surveys = await loadSurveysFromServer();
  if (!surveys.length) {
    summaryDiv.innerHTML = "<p>まだアンケート結果がありません。</p>";
    listDiv.innerHTML = "";
    return;
  }

  const total = surveys.length;
  const avgAge = (
    surveys.reduce((sum, s) => sum + (s.age || 0), 0) / total
  ).toFixed(1);
  const avgWallet = Math.round(
    surveys.reduce((sum, s) => sum + (s.wallet || 0), 0) / total
  );

  summaryDiv.innerHTML = `
    <p>件数：${total} 件</p>
    <p>平均年齢：${avgAge} 歳</p>
    <p>財布の中身の平均：${avgWallet.toLocaleString()} 円</p>
  `;

  const rows = surveys
    .map(
      (s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${s.age}</td>
          <td>${(s.wallet || 0).toLocaleString()}</td>
          <td>${escapeHtml(s.freeComment || "")}</td>
        </tr>
      `
    )
    .join("");

  listDiv.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>年齢</th>
          <th>財布の中身（円）</th>
          <th>自由な意見</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// アンケート全削除
async function handleSurveyReset() {
  if (!confirm("本当にアンケート結果をすべて削除しますか？")) return;

  const msg = document.getElementById("survey-reset-message");

  try {
    await resetSurveysOnServer();
    await renderSurveyData();
    msg.textContent = "アンケート結果をすべて削除しました。";
    setTimeout(() => (msg.textContent = ""), 2000);
  } catch (err) {
    console.error(err);
    msg.textContent = "削除に失敗しました。";
  }
}

/* =================================================================
   ログイン画面の featured 表示
   ================================================================= */

async function renderFeaturedOnLogin() {
  const container = document.getElementById("featured-container");
  if (!container) return;

  try {
    const data = await loadFeaturedFromServer();

    if (
      !data ||
      (!data.slot1 || !data.slot1.imageUrl) &&
      (!data.slot2 || !data.slot2.imageUrl)
    ) {
      container.innerHTML =
        '<p class="featured-placeholder">まだ作品は表示されていません。</p>';
      return;
    }

    const slots = [];
    if (data.slot1 && data.slot1.imageUrl) slots.push(data.slot1);
    if (data.slot2 && data.slot2.imageUrl) slots.push(data.slot2);

    // 左が ONE/THREE、右が TWO/FOUR に相当
    container.innerHTML = `
      <div class="featured-grid">
        ${slots
          .map(
            (s) => `
              <article class="featured-item">
                <div class="featured-img-wrap">
                  <img src="${s.imageUrl}" alt="作品画像" class="featured-img" />
                </div>
                <p class="featured-comment">${escapeHtml(s.comment || "")}</p>
                <p class="featured-code">コード：${escapeHtml(s.code || "")}</p>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  } catch (err) {
    console.error(err);
    container.innerHTML =
      '<p class="featured-placeholder">作品の読み込みに失敗しました。</p>';
  }
}

/* =================================================================
   共通
   ================================================================= */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function logout() {
  currentCode = null;
  currentType = null;
  currentImageUrl = null;

  const codeInput = document.getElementById("login-code");
  const passInput = document.getElementById("login-password");
  const error = document.getElementById("login-error");

  if (codeInput) codeInput.value = "";
  if (passInput) passInput.value = "";
  if (error) error.textContent = "";

  showScreen("login-screen");
}

function init() {
  // ログイン
  document
    .getElementById("login-form")
    .addEventListener("submit", handleLogin);

  // M / B 作品画面
  document
    .getElementById("art-image-input")
    .addEventListener("change", handleImageChange);

  document
    .getElementById("art-comment")
    .addEventListener("input", handleCommentInput);

  document
    .getElementById("save-art")
    .addEventListener("click", handleSaveArt);

  document
    .getElementById("delete-image")
    .addEventListener("click", handleDeleteImage);

  document
    .getElementById("feature-art")
    .addEventListener("click", handleFeatureArt);

  document
    .getElementById("logout-art")
    .addEventListener("click", logout);

  // E 管理画面
  document
    .getElementById("survey-form")
    .addEventListener("submit", handleSurveySubmit);

  document
    .getElementById("reset-survey")
    .addEventListener("click", handleSurveyReset);

  document
    .getElementById("logout-admin")
    .addEventListener("click", logout);

  // 最初のトップページの作品表示
  renderFeaturedOnLogin();
}

document.addEventListener("DOMContentLoaded", init);
