// main.js

// Firestore コレクション名
const COLLECTIONS = {
  artworks: "artworks", // A/B お客さんの作品
  surveys: "surveys",   // C のアンケート結果
};

let currentCode = null;      // 例: "A00001"
let currentType = null;      // "A" | "B" | "C"
let currentImageUrl = null;  // Firebase Storage 上の画像URL

// 画面切替
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) target.classList.add("active");
}

/* -------------------- Firebase 関連 -------------------- */

// 作品を Firestore から取得
async function loadArtworkFromServer(code) {
  const docRef = db.collection(COLLECTIONS.artworks).doc(code);
  const snap = await docRef.get();
  if (!snap.exists) return null;
  return snap.data();
}

// 作品を Firestore に保存
async function saveArtworkToServer(code, data) {
  const docRef = db.collection(COLLECTIONS.artworks).doc(code);
  await docRef.set(data, { merge: true });
}

// アンケート一覧を Firestore から取得
async function loadSurveysFromServer() {
  const snap = await db
    .collection(COLLECTIONS.surveys)
    .orderBy("createdAt")
    .get();

  return snap.docs.map((doc) => doc.data());
}

// アンケート 1 件追加
async function addSurveyToServer(survey) {
  await db.collection(COLLECTIONS.surveys).add(survey);
}

// アンケート全削除
async function resetSurveysOnServer() {
  const snap = await db.collection(COLLECTIONS.surveys).get();
  const batch = db.batch();
  snap.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

// 画像アップロード（Firebase Storage）
async function uploadArtworkImage(code, file) {
  const fileName = `${code}_${Date.now()}`;
  const ref = storage.ref().child(`art-images/${fileName}`);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  return url;
}

/* -------------------- ログイン処理 -------------------- */

async function handleLogin(e) {
  e.preventDefault();
  const input = document.getElementById("login-code");
  const error = document.getElementById("login-error");
  const raw = (input.value || "").trim().toUpperCase();

  const pattern = /^[ABC][0-9]{5}$/;
  if (!pattern.test(raw)) {
    error.textContent =
      "「B00001」のように、アルファベット1文字と5桁の数字で入力してください。";
    return;
  }

  currentCode = raw;
  currentType = raw.charAt(0);
  error.textContent = "";

  if (currentType === "A" || currentType === "B") {
    await setupArtScreen();
    showScreen("art-screen");
  } else if (currentType === "C") {
    await setupAdminScreen();
    showScreen("admin-screen");
  }
}

/* -------------------- A / B 作品画面 -------------------- */

async function setupArtScreen() {
  const title = document.getElementById("art-title");
  const commentInput = document.getElementById("art-comment");
  const countSpan = document.getElementById("art-comment-count");
  const imagePreview = document.getElementById("art-image-preview");
  const imagePlaceholder = document.getElementById("art-image-placeholder");

  title.textContent = currentCode + " さんの作品ページ";

  // Firestore から読み込み
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

  commentInput.value = data && data.comment ? data.comment : "";
  countSpan.textContent = commentInput.value.length.toString();
  document.getElementById("art-save-message").textContent = "";
}

// 画像ファイル選択 → Storage へアップロード（＋プレビュー）
async function handleImageChange(e) {
  const file = e.target.files[0];
  const imagePreview = document.getElementById("art-image-preview");
  const imagePlaceholder = document.getElementById("art-image-placeholder");
  const saveMsg = document.getElementById("art-save-message");

  if (!file || !currentCode) return;

  saveMsg.textContent = "画像をアップロード中です…";

  try {
    // 先にローカルプレビュー（見た目用）
    const reader = new FileReader();
    reader.onload = (event) => {
      imagePreview.src = event.target.result;
      imagePreview.classList.remove("hidden");
      imagePlaceholder.classList.add("hidden");
    };
    reader.readAsDataURL(file);

    // Firebase Storage にアップロード
    const url = await uploadArtworkImage(currentCode, file);
    currentImageUrl = url;

    saveMsg.textContent =
      "画像をアップロードしました。『作品を保存する』ボタンで確定します。";
    setTimeout(() => (saveMsg.textContent = ""), 2500);
  } catch (err) {
    console.error(err);
    saveMsg.textContent =
      "画像のアップロードに失敗しました。時間をおいて再度お試しください。";
  }
}

// コメント＋画像URL を Firestore に保存
async function handleSaveArt() {
  if (!currentCode) return;
  const commentInput = document.getElementById("art-comment");
  const saveMsg = document.getElementById("art-save-message");

  try {
    await saveArtworkToServer(currentCode, {
      imageUrl: currentImageUrl || null,
      comment: commentInput.value || "",
      updatedAt: new Date().toISOString(),
    });

    saveMsg.textContent = "保存しました。";
    setTimeout(() => (saveMsg.textContent = ""), 2000);
  } catch (err) {
    console.error(err);
    saveMsg.textContent =
      "保存に失敗しました。時間をおいて再度お試しください。";
  }
}

function handleCommentInput(e) {
  const countSpan = document.getElementById("art-comment-count");
  countSpan.textContent = e.target.value.length.toString();
}

/* -------------------- C 管理画面（アンケート） -------------------- */

async function setupAdminScreen() {
  document.getElementById("survey-save-message").textContent = "";
  document.getElementById("survey-reset-message").textContent = "";
  await renderSurveyData();
}

async function handleSurveySubmit(e) {
  e.preventDefault();
  const ageInput = document.getElementById("age");
  const walletInput = document.getElementById("wallet");
  const freeInput = document.getElementById("free-comment");
  const saveMsg = document.getElementById("survey-save-message");

  const age = parseInt(ageInput.value, 10);
  const wallet = parseInt(walletInput.value, 10);
  const freeComment = (freeInput.value || "").trim();

  if (Number.isNaN(age) || Number.isNaN(wallet)) {
    saveMsg.textContent = "年齢と財布の中身を正しく入力してください。";
    return;
  }

  try {
    await addSurveyToServer({
      age,
      wallet,
      freeComment,
      createdAt: firebase.firestore.Timestamp.now(),
    });

    ageInput.value = "";
    walletInput.value = "";
    freeInput.value = "";

    saveMsg.textContent = "アンケート結果を追加しました。";
    setTimeout(() => (saveMsg.textContent = ""), 2000);

    await renderSurveyData();
  } catch (err) {
    console.error(err);
    saveMsg.textContent =
      "保存に失敗しました。時間をおいて再度お試しください。";
  }
}

async function renderSurveyData() {
  const summaryDiv = document.getElementById("survey-summary");
  const ageChartDiv = document.getElementById("age-chart");
  const listDiv = document.getElementById("survey-list");

  const surveys = await loadSurveysFromServer();

  if (!surveys.length) {
    summaryDiv.innerHTML = "<p>まだアンケート結果がありません。</p>";
    ageChartDiv.innerHTML = "";
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

  const ageGroups = [
    { label: "〜39歳", min: 0, max: 39, count: 0 },
    { label: "40〜64歳", min: 40, max: 64, count: 0 },
    { label: "65歳〜", min: 65, max: 150, count: 0 },
  ];

  surveys.forEach((s) => {
    for (const g of ageGroups) {
      if (s.age >= g.min && s.age <= g.max) {
        g.count++;
        break;
      }
    }
  });

  const maxCount = Math.max(...ageGroups.map((g) => g.count), 1);
  ageChartDiv.innerHTML = "";
  ageGroups.forEach((g) => {
    const percent = (g.count / maxCount) * 100;
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-label">${g.label}</div>
      <div class="chart-bar">
        <div class="chart-bar-fill" style="width: ${percent}%;"></div>
      </div>
      <div class="chart-value">${g.count}</div>
    `;
    ageChartDiv.appendChild(row);
  });

  const rowsHtml = surveys
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
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

// アンケート全削除
async function handleSurveyReset() {
  const msg = document.getElementById("survey-reset-message");
  msg.textContent = "";

  if (
    !confirm(
      "本当にアンケート結果をすべて削除しますか？\nこの操作は元に戻せません。"
    )
  ) {
    return;
  }

  try {
    await resetSurveysOnServer();
    await renderSurveyData();
    msg.textContent = "アンケート結果をすべて削除しました。";
    setTimeout(() => (msg.textContent = ""), 2500);
  } catch (err) {
    console.error(err);
    msg.textContent =
      "削除に失敗しました。時間をおいて再度お試しください。";
  }
}

/* -------------------- 共通 -------------------- */

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
  document.getElementById("login-code").value = "";
  document.getElementById("login-error").textContent = "";
  showScreen("login-screen");
}

function init() {
  // ログイン
  document
    .getElementById("login-form")
    .addEventListener("submit", (e) => {
      handleLogin(e);
    });

  // A/B 作品画面
  document
    .getElementById("art-image-input")
    .addEventListener("change", (e) => {
      handleImageChange(e);
    });

  document
    .getElementById("art-comment")
    .addEventListener("input", handleCommentInput);

  document
    .getElementById("save-art")
    .addEventListener("click", () => {
      handleSaveArt();
    });

  document
    .getElementById("logout-art")
    .addEventListener("click", logout);

  // C 管理画面
  document
    .getElementById("survey-form")
    .addEventListener("submit", (e) => {
      handleSurveySubmit(e);
    });

  document
    .getElementById("logout-admin")
    .addEventListener("click", logout);

  document
    .getElementById("reset-survey")
    .addEventListener("click", () => {
      handleSurveyReset();
    });
}

document.addEventListener("DOMContentLoaded", init);
