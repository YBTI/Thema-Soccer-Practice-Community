import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- 【重要】Firebaseコンソールからコピーした設定をここに貼り付けてください ---
// 手順：Firebaseコンソール > プロジェクト設定 > マイアプリ > 設定
const firebaseConfig = {
  apiKey: "AIzaSyD3_kZYwuXNvetBNC4sue13lY5iN8t5IBI",
  authDomain: "tspc-bbs.firebaseapp.com",
  projectId: "tspc-bbs",
  storageBucket: "tspc-bbs.firebasestorage.app",
  messagingSenderId: "602876084545",
  appId: "1:602876084545:web:f60c9508808f207f9de1c0"
};
// -------------------------------------------------------------------------

// Firebaseの初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const postsCol = collection(db, "posts");

// 固定投稿（プログラム内に保持）
const pinnedPosts = [
    {
        id: 'pinned-1',
        title: 'TSPCへようこそ',
        author: 'TSPC事務局',
        content: 'TSPC（Thema Soccer Practice Community）は、テーマサッカーを実践するための練習ノウハウを共有するコミュニティです。\n\n【この掲示板の使い方】\n・日々の練習メニューの共有\n・課題や気づきの投稿\n・画像や動画を使ったプレー解説\n\n右下の「＋」ボタンから、あなたのノウハウを共有してください。',
        media: null,
        mediaType: null,
        referenceUrl: '',
        date: new Date('2026-04-30T00:00:00Z').toISOString(),
        isPinned: true
    }
];

// 投稿データの保存（Firebase版）
async function savePost(post) {
    try {
        let mediaUrl = null;
        
        // メディア（画像・動画）がある場合はStorageにアップロード
        if (post.media instanceof File || post.media instanceof Blob) {
            const fileName = `${Date.now()}_${post.media.name || 'upload'}`;
            const storageRef = ref(storage, `media/${fileName}`);
            const snapshot = await uploadBytes(storageRef, post.media);
            mediaUrl = await getDownloadURL(snapshot.ref);
            post.media = mediaUrl; // URLに置き換え
        }

        if (post.id && !post.id.startsWith('new-')) {
            // 編集（既存ドキュメントの更新）
            const postRef = doc(db, "posts", post.id);
            await updateDoc(postRef, post);
        } else {
            // 新規投稿（IDは自動生成されるため削除）
            const { id, ...data } = post;
            await addDoc(postsCol, data);
        }
        console.log('Saved to Firebase');
    } catch (err) {
        console.error('Firebase Save Error:', err);
        alert('保存に失敗しました。Firebaseの設定や通信状況を確認してください。');
    }
}

// 削除の実行（Firebase版）
async function executeDelete(id) {
    if (id.startsWith('pinned-')) {
        alert('この投稿は削除できません。');
        return;
    }
    try {
        await deleteDoc(doc(db, "posts", id));
        closeModal();
    } catch (err) {
        console.error('Firebase Delete Error:', err);
        alert('削除に失敗しました。');
    }
}

// 投稿の描画（リアルタイム更新対応）
function initPosts() {
    const q = query(postsCol, orderBy("date", "desc"));
    onSnapshot(q, (snapshot) => {
        const userPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const allPosts = [...pinnedPosts, ...userPosts];
        renderPostsUI(allPosts);
    });
}

function renderPostsUI(posts) {
    const container = document.getElementById('post-container');
    container.innerHTML = posts.map((post, index) => `
        <div class="post-card ${post.isPinned ? 'pinned-card' : ''}" style="animation-delay: ${index * 0.1}s" onclick="viewPost('${post.id}')">
            ${post.isPinned ? '<div class="pin-icon">📍 固定</div>' : ''}
            <h2>${escapeHtml(post.title)}</h2>
        </div>
    `).join('');
    
    // viewPostで使えるようにデータを一時的に保持
    window._currentPosts = posts;
}

// XSS対策
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// モーダルの制御
const modalOverlay = document.getElementById('modal-overlay');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');
const fab = document.getElementById('fab');

function openModal(content) {
    modalBody.innerHTML = content;
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = 'auto';
}

modalClose.onclick = (e) => {
    e.stopPropagation();
    closeModal();
};
modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) closeModal();
};

// YouTube埋め込み
function getEmbedHtml(url) {
    if (!url) return '';
    const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
        return `<div class="post-media"><iframe width="100%" height="315" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    return '';
}

// メディア表示
function renderMedia(post) {
    if (!post.media) return '';
    if (post.mediaType === 'image') {
        return `<div class="post-media"><img src="${post.media}"></div>`;
    } else {
        return `<div class="post-media"><video src="${post.media}" controls style="width:100%"></video></div>`;
    }
}

// フォーム
function openPostForm(existingPost = null) {
    const isEdit = !!existingPost;
    const formHtml = `
        <div class="post-form">
            <h3>${isEdit ? '投稿を編集' : '新しい投稿'}</h3>
            <form id="post-form-element">
                <div class="form-group">
                    <label>タイトル<span class="required-mark">*</span></label>
                    <input type="text" id="post-title" required value="${escapeHtml(existingPost?.title || '')}">
                </div>
                <div class="form-group">
                    <label>投稿者名</label>
                    <input type="text" id="post-author" value="${escapeHtml(existingPost?.author || '')}">
                </div>
                <div class="form-group">
                    <label>本文<span class="required-mark">*</span></label>
                    <textarea id="post-content" required>${escapeHtml(existingPost?.content || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>参考動画URL</label>
                    <input type="url" id="post-ref-url" value="${escapeHtml(existingPost?.referenceUrl || '')}">
                </div>
                <div class="form-group">
                    <label>メディアを選択</label>
                    <input type="file" id="post-media-input" accept="image/*,video/*">
                    <div id="media-preview" class="media-preview"></div>
                </div>
                <button type="submit" class="submit-btn" id="submit-btn-element">保存</button>
            </form>
        </div>
    `;
    openModal(formHtml);

    const form = document.getElementById('post-form-element');
    const mediaInput = document.getElementById('post-media-input');
    const preview = document.getElementById('media-preview');
    let mediaFile = existingPost?.media || null;
    let mediaType = existingPost?.mediaType || null;

    mediaInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        mediaFile = file;
        mediaType = file.type.startsWith('image/') ? 'image' : 'video';
        preview.style.display = 'block';
        preview.innerHTML = `<p>${file.name} が選択されました</p>`;
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        document.getElementById('submit-btn-element').disabled = true;
        const post = {
            id: isEdit ? existingPost.id : `new-${Date.now()}`,
            title: document.getElementById('post-title').value,
            author: document.getElementById('post-author').value || '匿名',
            content: document.getElementById('post-content').value,
            referenceUrl: document.getElementById('post-ref-url').value,
            media: mediaFile,
            mediaType: mediaType,
            date: isEdit ? existingPost.date : new Date().toISOString()
        };
        await savePost(post);
        closeModal();
    };
}

// 詳細
window.viewPost = async (id) => {
    const post = window._currentPosts.find(p => p.id === id);
    if (!post) return;

    const mediaHtml = renderMedia(post);
    const embedHtml = getEmbedHtml(post.referenceUrl);
    const isPinned = !!post.isPinned;

    const detailHtml = `
        <div class="post-detail">
            <div class="post-meta">
                <span>${new Date(post.date).toLocaleString('ja-JP')}</span>
                ${!isPinned ? `
                <div class="post-actions" id="post-actions-container">
                    <button class="action-btn edit-btn" id="btn-edit-${post.id}">編集</button>
                    <button class="action-btn delete-btn" id="btn-delete-trigger-${post.id}">削除</button>
                </div>
                <div class="post-actions" id="delete-confirm-container" style="display:none">
                    <button class="action-btn delete-btn" id="btn-delete-confirm-${post.id}">はい</button>
                    <button class="action-btn" id="btn-delete-cancel-${post.id}">いいえ</button>
                </div>
                ` : ''}
            </div>
            <h2>${escapeHtml(post.title)}</h2>
            <div class="post-author">by ${escapeHtml(post.author)}</div>
            <div class="post-text">${escapeHtml(post.content)}</div>
            ${embedHtml}
            ${mediaHtml}
        </div>
    `;
    openModal(detailHtml);

    if (!isPinned) {
        document.getElementById(`btn-edit-${post.id}`).onclick = () => editPost(id);
        document.getElementById(`btn-delete-trigger-${post.id}`).onclick = () => {
            document.getElementById('post-actions-container').style.display = 'none';
            document.getElementById('delete-confirm-container').style.display = 'flex';
        };
        document.getElementById(`btn-delete-cancel-${post.id}`).onclick = () => {
            document.getElementById('post-actions-container').style.display = 'flex';
            document.getElementById('delete-confirm-container').style.display = 'none';
        };
        document.getElementById(`btn-delete-confirm-${post.id}`).onclick = () => executeDelete(id);
    }
}

async function editPost(id) {
    const post = window._currentPosts.find(p => p.id === id);
    if (post) openPostForm(post);
}

// 初期化
fab.onclick = () => openPostForm();
initPosts();
