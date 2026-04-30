// BBS Logic with Pinned Posts and Storage Reset
const DB_NAME = 'TSPC_BBS_PROD'; // データベース名を変更してリセット
const STORE_NAME = 'posts';
const DB_VERSION = 1;

// 固定投稿（TSPCの説明）
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

// DBの初期化
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// 投稿データの取得
async function getPosts() {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                const userPosts = request.result.sort((a, b) => new Date(b.date) - new Date(a.date));
                // 固定投稿を常に先頭に表示
                resolve([...pinnedPosts, ...userPosts]);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.error('Failed to get posts:', err);
        return pinnedPosts;
    }
}

// 投稿データの保存・更新
async function savePost(post) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(post);
            request.onsuccess = () => {
                renderPosts();
                resolve();
            };
            request.onerror = (e) => {
                alert('保存に失敗しました。');
                reject(e.target.error);
            };
        });
    } catch (err) {
        console.error('Save Error:', err);
    }
}

// 削除の実行
async function executeDelete(id) {
    // 固定投稿は削除不可
    if (id.startsWith('pinned-')) {
        alert('この投稿は削除できません。');
        return;
    }

    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => {
                renderPosts();
                closeModal();
                resolve();
            };
            request.onerror = (e) => {
                alert('削除に失敗しました。');
                reject(e.target.error);
            };
        });
    } catch (err) {
        console.error('Delete Error:', err);
    }
}

// 投稿の描画
async function renderPosts() {
    const container = document.getElementById('post-container');
    const posts = await getPosts();
    
    container.innerHTML = posts.map((post, index) => `
        <div class="post-card ${post.isPinned ? 'pinned-card' : ''}" style="animation-delay: ${index * 0.1}s" onclick="viewPost('${post.id}')">
            ${post.isPinned ? '<div class="pin-icon">📍 固定</div>' : ''}
            <h2>${escapeHtml(post.title)}</h2>
        </div>
    `).join('');
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

// YouTube埋め込みHTML生成
function getEmbedHtml(url) {
    if (!url) return '';
    const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
        return `<div class="post-media"><iframe width="100%" height="315" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    if (url.match(/\.(mp4|webm|ogg)$/i)) {
        return `<div class="post-media"><video src="${url}" controls style="width:100%"></video></div>`;
    }
    return '';
}

// メディア表示用ヘルパー
function renderMedia(post) {
    if (!post.media) return '';
    let url;
    try {
        url = post.media instanceof Blob ? URL.createObjectURL(post.media) : post.media;
    } catch (e) {
        console.error('ObjectURL Error:', e);
        return '';
    }
    if (post.mediaType === 'image') {
        return `<div class="post-media"><img src="${url}"></div>`;
    } else {
        return `<div class="post-media"><video src="${url}" controls style="width:100%"></video></div>`;
    }
}

// 投稿フォーム
function openPostForm(existingPost = null) {
    const isEdit = !!existingPost;
    const formHtml = `
        <div class="post-form">
            <h3>${isEdit ? '投稿を編集' : '新しい投稿'}</h3>
            <form id="post-form-element">
                <div class="form-group">
                    <label>タイトル<span class="required-mark">*</span></label>
                    <input type="text" id="post-title" required value="${escapeHtml(existingPost?.title || '')}" placeholder="タイトルを入力...">
                </div>
                <div class="form-group">
                    <label>投稿者名</label>
                    <input type="text" id="post-author" value="${escapeHtml(existingPost?.author || '')}" placeholder="お名前（任意）">
                </div>
                <div class="form-group">
                    <label>本文<span class="required-mark">*</span></label>
                    <textarea id="post-content" required placeholder="何を綴りますか？">${escapeHtml(existingPost?.content || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>参考動画URL (YouTube等)</label>
                    <input type="url" id="post-ref-url" value="${escapeHtml(existingPost?.referenceUrl || '')}" placeholder="https://www.youtube.com/watch?v=...">
                    <div id="url-preview" class="media-preview"></div>
                </div>
                <div class="form-group">
                    <label>画像・動画をアップロード</label>
                    <input type="file" id="post-media-input" accept="image/*,video/*">
                    <div id="media-preview" class="media-preview">
                        ${isEdit && existingPost.media ? renderMedia(existingPost) : ''}
                    </div>
                </div>
                <button type="submit" class="submit-btn" id="submit-btn-element">${isEdit ? '更新する' : '投稿する'}</button>
            </form>
        </div>
    `;
    openModal(formHtml);

    const form = document.getElementById('post-form-element');
    const mediaInput = document.getElementById('post-media-input');
    const preview = document.getElementById('media-preview');
    const urlInput = document.getElementById('post-ref-url');
    const urlPreview = document.getElementById('url-preview');
    const submitBtn = document.getElementById('submit-btn-element');
    
    let mediaData = existingPost?.media || null;
    let mediaType = existingPost?.mediaType || null;

    if (existingPost?.referenceUrl) {
        urlPreview.innerHTML = getEmbedHtml(existingPost.referenceUrl);
        urlPreview.style.display = 'block';
    }

    urlInput.oninput = (e) => {
        const url = e.target.value;
        const embed = getEmbedHtml(url);
        if (embed) {
            urlPreview.innerHTML = embed;
            urlPreview.style.display = 'block';
        } else {
            urlPreview.style.display = 'none';
        }
    };

    mediaInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        mediaData = file;
        mediaType = file.type.startsWith('image/') ? 'image' : 'video';
        preview.style.display = 'block';
        const url = URL.createObjectURL(file);
        if (mediaType === 'image') {
            preview.innerHTML = `<img src="${url}">`;
        } else {
            preview.innerHTML = `<video src="${url}" controls style="width:100%"></video>`;
        }
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        const post = {
            id: isEdit ? existingPost.id : Date.now().toString(),
            title: document.getElementById('post-title').value,
            author: document.getElementById('post-author').value || '匿名',
            content: document.getElementById('post-content').value,
            referenceUrl: document.getElementById('post-ref-url').value,
            media: mediaData,
            mediaType: mediaType,
            date: isEdit ? existingPost.date : new Date().toISOString()
        };
        await savePost(post);
        closeModal();
    };
}

// 詳細表示
async function viewPost(id) {
    const posts = await getPosts();
    const post = posts.find(p => p.id === id);
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
                    <span style="color:#ff4d4d; font-size:0.9rem; margin-right:10px;">本当に削除しますか？</span>
                    <button class="action-btn delete-btn" id="btn-delete-confirm-${post.id}" style="background:#ff4d4d; color:#fff">はい</button>
                    <button class="action-btn" id="btn-delete-cancel-${post.id}">いいえ</button>
                </div>
                ` : ''}
            </div>
            <h2>${escapeHtml(post.title)}</h2>
            <div class="post-author">by ${escapeHtml(post.author)}</div>
            <div class="post-text">${escapeHtml(post.content)}</div>
            ${embedHtml}
            ${post.referenceUrl ? `<div class="reference-url"><strong>リンク:</strong> <a href="${post.referenceUrl}" target="_blank">${escapeHtml(post.referenceUrl)}</a></div>` : ''}
            ${mediaHtml}
        </div>
    `;
    openModal(detailHtml);

    if (!isPinned) {
        const actionsContainer = document.getElementById('post-actions-container');
        const confirmContainer = document.getElementById('delete-confirm-container');

        document.getElementById(`btn-edit-${post.id}`).onclick = (e) => {
            e.stopPropagation();
            editPost(id);
        };

        document.getElementById(`btn-delete-trigger-${post.id}`).onclick = (e) => {
            e.stopPropagation();
            actionsContainer.style.display = 'none';
            confirmContainer.style.display = 'flex';
        };

        document.getElementById(`btn-delete-cancel-${post.id}`).onclick = (e) => {
            e.stopPropagation();
            actionsContainer.style.display = 'flex';
            confirmContainer.style.display = 'none';
        };

        document.getElementById(`btn-delete-confirm-${post.id}`).onclick = (e) => {
            e.stopPropagation();
            executeDelete(id);
        };
    }
}

// 編集
async function editPost(id) {
    const posts = await getPosts();
    const post = posts.find(p => p.id === id);
    if (post) openPostForm(post);
}

// グローバル露出
window.viewPost = viewPost;

// 初期化
fab.onclick = () => openPostForm();
renderPosts();
