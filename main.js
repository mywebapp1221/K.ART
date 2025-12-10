// ==================== Firestore コレクション名 ====================
const COLLECTIONS = {
  artworks: "artworks",    // M / B の作品
  surveys: "surveys",      // アンケート
  bPasswords: "bpasswords" // Bユーザー用パスワード
};

// ==================== Cloudinary 設定 ====================
const cloudName = "drfgen4gm";
const uploadPreset = "karts_unsigned";

// ==================== 状態管理用 ====================
let currentCode = null;      // 例: "M00001"
let currentType = null;      // "M" | "B" | "E"
let currentImageUrl = null;  // 現在の作品画像URL（Firestore保存用）

// 画面切り替え
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

// 作品保存（code / head も必ず入れておく）
async function saveArtworkToServer(code, data) {
  const docRef = db.collection(COLLECTIONS.artworks).doc(code);
  await docRef.set(
    {
      code,                // 便利用
      head: code.charAt(0) // "M" / "B" / "E"
    },
    { merge: true }
  );
  await docRef.set(data, { merge: true });
}

// アンケート読み込み
async function loadSurveysFromServer() {
  const snap = await db.collection(COLLECTIONS.surveys).orderBy("createdAt").get();
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

// Bユーザー用パスワード取得
async function getBPassword(code) {
  const docRef = db.collection(COLLECTIONS.bPasswords).doc(code);
  const snap = await docRef.get();
  return snap.exists ? snap.data().password : null;
}

// Bユーザー用パスワード保存
async function saveBPassword(code, password) {
  const docRef = db.collection(COLLECTIONS.bPasswords).doc(code);
  await docRef.set({
    code,
    password,
    updatedAt: firebase.firestore.Timestamp.now()
  });
}

/* =================================================================
   Cloudinary アップロード
   ================================================================= */

async function uploadArtworkImage(code, file) {
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

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

  const raw = (codeInput.value || "").trim().toUpperCase();
  const password = (passInput.value || "").trim();

  // 1文字 + 5桁のみ許可（例: B00001）
  const pattern = /^[A-Z][0-9]{5}$/;
  if (!pattern.test(raw)) {
    error.textContent = "「B00001」のようにアルファベット1文字 + 5桁の数字で入力してください。";
    return;
  }

  const head = raw.charAt(0); // "M" / "B" / "E"

  // ---- パスワードチェック ----
  if (head === "M" || head === "E") {
    // 共通パスワード
    if (password !== "1221") {
      error.textContent = "パスワードが正しくありません。";
      return;
    }
  } else if (head === "B") {
    // Bユーザーは個別パスワード
    if (password.length !== 4) {
      error.textContent = "B の方は 4桁のパスワードを入力してください。";
      return;
    }
    try {
      const bPass = await getBPassword(raw);
      if (!bPass || bPass !== password) {
        error.textContent = "Bユーザーのパスワードが正しくありません。";
        return;
      }
    } catch (err) {
      console.error(err);
      error.textContent = "パスワード確認中にエラーが発生しました。";
      return;
    }
  }

  // ---- ログイン成功 ----
  currentCode = raw;
  currentType = head;
  currentImageUrl = null;
  error.textContent = "";

  if (head === "M" || head === "B") {
    await setupArtScreen();
    showScreen("art-screen");
  } else if (head === "E") {
    await setupAdminScreen(raw); // コードごと渡す（E00001 / E00002 を判定に使う）
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

  // 「入れ替える」ボタンは M の人の時だけ表示
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

// 画像選択
async function handleImageChange(e) {
  const file = e.target.files[0];
  if (!file || !currentCode) return;

  const imagePreview = document.getElementById("art-image-preview");
  const placeholder = document.getElementById("art-image-placeholder");
  const msg = document.getElementById("art-save-message");

  msg.textContent = "画像アップロード中…";

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
      updatedAt: new Date().toISOString()
    });

    msg.textContent = "画像を保存しました。";
    setTimeout(() => (msg.textContent = ""), 2000);
  } catch (err) {
    console.error(err);
    msg.textContent = "アップロードに失敗しました。時間をおいて再試行してください。";
  }
}

// コメント保存
async function handleSaveArt() {
  if (!currentCode) return;

  const msg = document.getElementById("art-save-message");
  const comment = document.getElementById("art-comment").value;

  try {
    await saveArtworkToServer(currentCode, {
      imageUrl: currentImageUrl || null,
      comment,
      updatedAt: new Date().toISOString()
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

// 画像削除
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
      updatedAt: new Date().toISOString()
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

// 「入れ替える」ボタン：みんなの作品に反映（Mユーザーのみ）
async function handleFeatureArt() {
  if (!currentCode || currentType !== "M") return;

  const msg = document.getElementById("art-save-message");

  try {
    await saveArtworkToServer(currentCode, {
      featuredAt: firebase.firestore.Timestamp.now()
    });

    msg.textContent = "トップの「みんなの作品」に反映されます。";
    setTimeout(() => (msg.textContent = ""), 2500);

    // トップページも更新
    await renderFeaturedArtworks();
  } catch (err) {
    console.error(err);
    msg.textContent = "反映に失敗しました。";
  }
}

/* =================================================================
   トップページ「みんなの作品」（M だけ最大 8 件）
   ================================================================= */

async function renderFeaturedArtworks() {
  const container = document.getElementById("featured-container");
  if (!container) return;

  container.innerHTML = "読み込み中…";

  try {
    const snap = await db.collection(COLLECTIONS.artworks).get();
    const all = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        code: doc.id,
        imageUrl: data.imageUrl,
        comment: data.comment || "",
        featuredAt: data.featuredAt
      };
    });

    // M だけ & 画像あり
    let list = all.filter(
      (item) =>
        item.code &&
        item.code.startsWith("M") &&
        item.imageUrl
    );

    // featuredAt が新しい順（なければ 0）
    list.sort((a, b) => {
      const ta =
        a.featuredAt && a.featuredAt.toMillis
          ? a.featuredAt.toMillis()
          : 0;
      const tb =
        b.featuredAt && b.featuredAt.toMillis
          ? b.featuredAt.toMillis()
          : 0;
      return tb - ta;
    });

    list = list.slice(0, 8); // 最大8件

    if (!list.length) {
      container.innerHTML = `
        <div style="font-size:13px; color:#9ca3af; text-align:center; padding:8px;">
          まだ作品が登録されていません。
        </div>
      `;
      return;
    }

    const html = `
      <div class="featured-grid">
        ${list
          .map(
            (item) => `
          <article class="featured-item">
            <div class="featured-img-wrap">
              <img src="${item.imageUrl}" alt="${item.code}" class="featured-img" />
            </div>
            <div class="featured-comment">${escapeHtml(item.comment || "")}</div>
            <div class="featured-code">${item.code}</div>
          </article>
        `
          )
          .join("")}
      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.innerHTML =
      '<div style="font-size:13px; color:#b91c1c; text-align:center;">読み込みに失敗しました。</div>';
  }
}

/* =================================================================
   E 管理画面（アンケート & Bユーザー用パスワード設定）
   ================================================================= */

async function setupAdminScreen(adminCode) {
  // アンケート用メッセージ初期化
  document.getElementById("survey-save-message").textContent = "";
  document.getElementById("survey-reset-message").textContent = "";

  // Bパスワードカードの表示 / 非表示
  const bCard = document.getElementById("bpassword-card");
  if (adminCode === "E00002") {
    bCard.classList.remove("hidden");
  } else {
    bCard.classList.add("hidden");
  }

  await renderSurveyData();
}

// アンケート送信
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
      createdAt: firebase.firestore.Timestamp.now()
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

// アンケート一覧 & 集計
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
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
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

// Bユーザー用パスワード設定（E00002 のみ）
async function handleBPasswordSubmit(e) {
  e.preventDefault();

  const codeInput = document.getElementById("b-code");
  const passInput = document.getElementById("b-pass");
  const msg = document.getElementById("bpassword-message");

  const code = (codeInput.value || "").trim().toUpperCase();
  const password = (passInput.value || "").trim();

  const pattern = /^B[0-9]{5}$/;
  if (!pattern.test(code)) {
    msg.textContent = "コードは「B00001」の形式で入力してください。";
    return;
  }
  if (!/^[0-9]{4}$/.test(password)) {
    msg.textContent = "パスワードは 4桁の数字で入力してください。";
    return;
  }

  try {
    await saveBPassword(code, password);
    msg.textContent = `コード ${code} のパスワードを保存しました。`;
    setTimeout(() => (msg.textContent = ""), 2500);

    codeInput.value = "";
    passInput.value = "";
  } catch (err) {
    console.error(err);
    msg.textContent = "保存に失敗しました。";
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

  document
    .getElementById("bpassword-form")
    .addEventListener("submit", handleBPasswordSubmit);

  // トップページ「みんなの作品」を初期表示
  renderFeaturedArtworks();
}

document.addEventListener("DOMContentLoaded", init);
