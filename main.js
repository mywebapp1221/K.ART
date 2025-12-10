// ==================== Firestore コレクション名 ====================
const COLLECTIONS = {
  artworks: "artworks",      // M / B の作品
  surveys: "surveys",        // E のアンケート結果
  bPasswords: "b_passwords", // Bユーザー用パスワード
};

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
  const el = document.getElementById(screenId);
  if (el) el.classList.add("active");
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

// Bユーザー用パスワード取得
async function loadBPasswordFromServer(code) {
  const docRef = db.collection(COLLECTIONS.bPasswords).doc(code);
  const snap = await docRef.get();
  return snap.exists ? snap.data() : null;
}

// Bユーザー用パスワード保存
async function saveBPasswordToServer(code, password) {
  const docRef = db.collection(COLLECTIONS.bPasswords).doc(code);
  await docRef.set(
    {
      password,
      updatedAt: firebase.firestore.Timestamp.now(),
    },
    { merge: true }
  );
}

// 「みんなの作品」用に、M作品の featured を最大8件取得
async function loadFeaturedArtworksFromServer() {
  const snap = await db
    .collection(COLLECTIONS.artworks)
    .orderBy("featuredAt", "desc")
    .limit(30) // とりあえず30件取って、Mだけに絞る
    .get();

  return snap.docs
    .map((doc) => ({ code: doc.id, ...doc.data() }))
    .filter((a) => a.codeType === "M" && a.featuredAt)
    .slice(0, 8);
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

  // --- M / E は共通パスワード 1221 ---
  if (head === "M" || head === "E") {
    if (password !== "1221") {
      error.textContent = "パスワードが正しくありません。";
      return;
    }
  }

  // --- B はコードごとの4桁パスワード ---
  if (head === "B") {
    if (!password) {
      error.textContent = "パスワードを入力してください。";
      return;
    }
    try {
      const info = await loadBPasswordFromServer(rawCode);
      if (!info || !info.password) {
        error.textContent =
          "このコードのパスワードはまだ設定されていません。スタッフに確認してください。";
        return;
      }
      if (info.password !== password) {
        error.textContent = "パスワードが正しくありません。";
        return;
      }
    } catch (err) {
      console.error(err);
      error.textContent =
        "ログインに失敗しました。時間をおいて再度お試しください。";
      return;
    }
  }

  // ログイン成功
  currentCode = rawCode;
  currentType = head;
  currentImageUrl = null;
  error.textContent = "";
  codeInput.value = "";
  passInput.value = "";

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

  // M のときだけ「入れ替える」ボタン表示
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
      codeType: currentType, // M / B
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
      codeType: currentType,
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

  // Cloudinary 内の実ファイルはコンソールから手動削除する想定
}

// M の人専用：「みんなの作品」に載せる
async function handleFeatureArt() {
  if (!currentCode || currentType !== "M") return;

  const msg = document.getElementById("art-save-message");
  const comment = document.getElementById("art-comment").value.trim();

  if (!currentImageUrl && !comment) {
    msg.textContent = "写真か解説のどちらかは入力してください。";
    setTimeout(() => (msg.textContent = ""), 2500);
    return;
  }

  try {
    await saveArtworkToServer(currentCode, {
      codeType: currentType,
      featured: true,
      featuredAt: firebase.firestore.Timestamp.now(),
    });

    msg.textContent =
      "トップページの「みんなの作品」に反映されました。（反映まで数秒かかる場合があります）";
    setTimeout(() => (msg.textContent = ""), 3500);
  } catch (err) {
    console.error(err);
    msg.textContent =
      "反映に失敗しました。時間をおいて再試行してください。";
  }
}

/* =================================================================
   E 管理画面（アンケート & Bパスワード）
   ================================================================= */

async function setupAdminScreen() {
  document.getElementById("survey-save-message").textContent = "";
  document.getElementById("survey-reset-message").textContent = "";

  // E00002 のときだけ Bパスワード設定カードを表示
  const card = document.getElementById("bpassword-card");
  if (card) {
    if (currentCode === "E00002") {
      card.classList.remove("hidden");
    } else {
      card.classList.add("hidden");
    }
  }

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

// Bユーザー用パスワード設定（E00002専用）
async function handleBPasswordSubmit(e) {
  e.preventDefault();

  const codeInput = document.getElementById("b-code");
  const passInput = document.getElementById("b-pass");
  const msg = document.getElementById("bpassword-message");

  const code = (codeInput.value || "").trim().toUpperCase();
  const pass = (passInput.value || "").trim();

  const codePattern = /^B[0-9]{5}$/;
  const passPattern = /^[0-9]{4}$/;

  if (!codePattern.test(code)) {
    msg.textContent = "コードは B00001 のように入力してください。";
    return;
  }
  if (!passPattern.test(pass)) {
    msg.textContent = "パスワードは4桁の数字で入力してください。";
    return;
  }

  try {
    await saveBPasswordToServer(code, pass);
    msg.textContent = `コード ${code} のパスワードを設定しました。`;
    setTimeout(() => (msg.textContent = ""), 2500);

    codeInput.value = "";
    passInput.value = "";
  } catch (err) {
    console.error(err);
    msg.textContent = "保存に失敗しました。時間をおいて再試行してください。";
  }
}

/* =================================================================
   トップページ「みんなの作品」
   ================================================================= */

async function renderFeaturedArtworks() {
  const container = document.getElementById("featured-container");
  if (!container) return;

  container.innerHTML = "";

  try {
    const artworks = await loadFeaturedArtworksFromServer();

    if (!artworks.length) {
      container.innerHTML =
        "<p style='font-size:13px;color:#9ca3af;text-align:center;'>まだ作品が選ばれていません。</p>";
      return;
    }

    const grid = document.createElement("div");
    grid.className = "featured-grid";

    artworks.forEach((a) => {
      const item = document.createElement("div");
      item.className = "featured-item";

      const imgWrap = document.createElement("div");
      imgWrap.className = "featured-img-wrap";

      if (a.imageUrl) {
        const img = document.createElement("img");
        img.className = "featured-img";
        img.src = a.imageUrl;
        img.alt = a.code || "";
        imgWrap.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.className = "featured-placeholder";
        ph.textContent = "画像はまだ登録されていません";
        imgWrap.appendChild(ph);
      }

      const commentDiv = document.createElement("div");
      commentDiv.className = "featured-comment";
      commentDiv.textContent = a.comment || "";

      const codeDiv = document.createElement("div");
      codeDiv.className = "featured-code";
      codeDiv.textContent = a.code || "";

      item.appendChild(imgWrap);
      item.appendChild(commentDiv);
      item.appendChild(codeDiv);

      grid.appendChild(item);
    });

    container.appendChild(grid);
  } catch (err) {
    console.error(err);
    container.innerHTML =
      "<p style='font-size:13px;color:#b91c1c;text-align:center;'>作品の読み込みに失敗しました。</p>";
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

// 初期化
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

  const bForm = document.getElementById("bpassword-form");
  if (bForm) {
    bForm.addEventListener("submit", handleBPasswordSubmit);
  }

  // トップページ「みんなの作品」を読み込み
  renderFeaturedArtworks();
}

document.addEventListener("DOMContentLoaded", init);
