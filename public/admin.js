// 初始化 Firebase - 使用從 auth-guard.js 讀取的全域配置
const firebaseConfig = window.firebaseConfig;
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const auth = firebase.auth();

// 全域變數
let agents = {};
let conversations = {};
let currentUser = null; // 存儲當前登入用戶資訊
let knowledgeBases = []; // 知識庫陣列
let knowledgeBaseCounter = 0; // 知識庫計數器
let showAllAgents = false; // 是否顯示全部代理（管理員專用）
let filteredAgents = {}; // 過濾後的代理列表

// 快取配置
const CACHE_VERSION = '1.0.0';
const CACHE_EXPIRY = 30 * 60 * 1000; // 30分鐘（毫秒）
const CACHE_PREFIX = 'agents_cache_';
const PROFILES_CACHE_PREFIX = 'profiles_cache_';

// 頁面載入時初始化
document.addEventListener('DOMContentLoaded', function () {
    initializeAuth();
    setupForm();
    setupTestFeatures();
    initializeDefaultAdmin(); // 初始化預設管理員
});

// 初始化認證
function initializeAuth() {
    // 監聽認證狀態變化
    auth.onAuthStateChanged((user) => {
        currentUser = user;
        if (user) {
            // 使用者已登入
            showUserInfo(user);
            loadAgents();
            loadStats();
        } else {
            // 暫時使用匿名認證進行測試
            console.log('未登入，嘗試匿名認證...');
            auth.signInAnonymously()
                .then((result) => {
                    console.log('匿名登入成功:', result.user);
                    showUserInfo(result.user);
                    loadAgents();
                    loadStats();
                })
                .catch((error) => {
                    console.error('匿名登入失敗:', error);
                    // 如果匿名登入失敗，顯示登入選項
                    showLoginSection();
                });
        }
    });
}

// 顯示使用者資訊
async function showUserInfo(user) {
    currentUser = user; // 保存用戶資訊到全局變量

    const userInfoEl = document.getElementById('userInfo');
    const loginSectionEl = document.getElementById('loginSection');
    const userNameEl = document.getElementById('userName');
    const userEmailEl = document.getElementById('userEmail');
    const userAvatarBtn = document.getElementById('userAvatarBtn');

    if (userInfoEl) userInfoEl.style.display = 'block';
    if (loginSectionEl) loginSectionEl.style.display = 'none';

    if (userNameEl) {
        const userName = user.displayName || user.email || (user.isAnonymous ? '匿名用戶' : '管理員');
        userNameEl.textContent = userName;
    }

    if (userEmailEl && user.email) {
        userEmailEl.textContent = user.email;
    }

    if (userAvatarBtn) {
        if (user.photoURL) {
            userAvatarBtn.style.backgroundImage = `url('${user.photoURL}')`;
            userAvatarBtn.innerHTML = '';
        } else {
            // 使用預設頭像或首字母
            const initials = (user.displayName || user.email || 'A').charAt(0).toUpperCase();
            userAvatarBtn.style.backgroundImage = 'none';
            userAvatarBtn.style.backgroundColor = '#8B5CF6';
            userAvatarBtn.innerHTML = `<span class="text-white text-sm font-semibold">${initials}</span>`;
        }
    }

    // 更新過濾切換按鈕顯示
    await updateAgentFilterToggle();

    // 更新 pageTitle 顯示用戶資訊
    updatePageTitle();
}

// 更新頁面標題（包含用戶資訊）
function updatePageTitle(pageName = null) {
    const pageTitle = document.getElementById('pageTitle');
    if (!pageTitle) return;

    // 如果沒有提供頁面名稱，嘗試從當前活動的 tab 獲取
    if (!pageName) {
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab) {
            const tabId = activeTab.id;
            const titles = {
                'dashboard': '儀表板',
                'agents': '代理管理',
                'linebot-analytics': 'LINE Bot 分析',
                'create': '建立代理',
                'profiles': '人物誌分析',
                'notifications': '通知管理'
            };
            pageName = titles[tabId] || '儀表板';
        } else {
            pageName = '儀表板';
        }
    }

    // 如果有用戶資訊，顯示用戶資訊和頁面名稱
    if (currentUser) {
        const userName = currentUser.displayName || currentUser.email || (currentUser.isAnonymous ? '匿名用戶' : '管理員');
        pageTitle.innerHTML = `<span>${pageName}</span> <span class="text-muted-dark text-base font-normal">| ${userName}</span>`;
    } else {
        pageTitle.textContent = pageName;
    }
}

// 切換用戶選單
function toggleUserMenu() {
    const userMenu = document.getElementById('userMenu');
    if (userMenu) {
        userMenu.classList.toggle('hidden');
    }
}

// 點擊外部關閉選單
document.addEventListener('click', function (event) {
    const userInfo = document.getElementById('userInfo');
    const userMenu = document.getElementById('userMenu');
    if (userInfo && userMenu && !userInfo.contains(event.target)) {
        userMenu.classList.add('hidden');
    }
});

// 顯示登入區域
function showLoginSection() {
    const userInfoEl = document.getElementById('userInfo');
    const loginSectionEl = document.getElementById('loginSection');

    if (userInfoEl) userInfoEl.style.display = 'none';
    if (loginSectionEl) loginSectionEl.style.display = 'flex';
}

// Google 登入回調
function handleCredentialResponse(response) {
    const credential = firebase.auth.GoogleAuthProvider.credential(response.credential);

    auth.signInWithCredential(credential)
        .then((result) => {
            console.log('Google 登入成功:', result.user);
        })
        .catch((error) => {
            console.error('Google 登入失敗:', error);
            alert('登入失敗：' + error.message);
        });
}

// 登出功能
function logout() {
    auth.signOut()
        .then(() => {
            console.log('登出成功');
        })
        .catch((error) => {
            console.error('登出失敗:', error);
        });
}

// 切換分頁
function switchTab(tabName, targetElement = null) {
    // 隱藏所有分頁內容
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // 移除所有分頁的 active 狀態
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // 顯示選中的分頁
    document.getElementById(tabName).classList.add('active');

    // 如果是 LINE Bot 分析分頁，確保選項已載入
    if (tabName === 'linebot-analytics') {
        console.log('切換到 LINE Bot 分析分頁，開始載入選項...');
        loadLineBotAnalyticsOptions();
    }

    // 如果是人物誌分析分頁，確保選項已載入
    if (tabName === 'profiles') {
        loadProfileAgentOptions();
    }

    // 如果有提供目標元素，則設定為 active
    if (targetElement) {
        targetElement.classList.add('active');
    } else {
        // 嘗試找到對應的 tab 元素
        const tabElement = document.querySelector(`[onclick*="switchTab('${tabName}')"]`);
        if (tabElement) {
            tabElement.classList.add('active');
        }
    }
}

// ==================== 快取管理函數 ====================

// 獲取快取鍵名
function getCacheKey(userId, isAdmin, showAll) {
    if (isAdmin && showAll) {
        return `${CACHE_PREFIX}all`;
    }
    return `${CACHE_PREFIX}${userId}`;
}

// 檢查快取是否有效
function isCacheValid(cacheData) {
    if (!cacheData || !cacheData.timestamp || !cacheData.data) {
        return false;
    }

    // 檢查版本
    if (cacheData.version !== CACHE_VERSION) {
        return false;
    }

    // 檢查是否過期
    const now = Date.now();
    const age = now - cacheData.timestamp;
    if (age > CACHE_EXPIRY) {
        return false;
    }

    return true;
}

// 從本地快取載入代理資料
function loadAgentsFromCache(userId, isAdmin, showAll) {
    try {
        const cacheKey = getCacheKey(userId, isAdmin, showAll);
        const cachedData = localStorage.getItem(cacheKey);

        if (!cachedData) {
            return null;
        }

        const cacheData = JSON.parse(cachedData);

        if (isCacheValid(cacheData)) {
            console.log('從本地快取載入代理資料');
            return cacheData.data;
        } else {
            // 快取已過期，清除
            localStorage.removeItem(cacheKey);
            console.log('快取已過期，已清除');
            return null;
        }
    } catch (error) {
        console.error('讀取本地快取失敗:', error);
        return null;
    }
}

// 保存代理資料到本地快取
function saveAgentsToCache(userId, isAdmin, showAll, agentsData) {
    try {
        const cacheKey = getCacheKey(userId, isAdmin, showAll);
        const cacheData = {
            data: agentsData,
            timestamp: Date.now(),
            version: CACHE_VERSION
        };

        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log('代理資料已保存到本地快取');
    } catch (error) {
        console.error('保存到本地快取失敗:', error);
        // 如果 localStorage 空間不足，嘗試清理舊快取
        if (error.name === 'QuotaExceededError') {
            clearExpiredCache();
            try {
                localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (retryError) {
                console.error('重試保存快取失敗:', retryError);
            }
        }
    }
}

// 清除代理快取
function clearAgentsCache(userId, isAdmin, showAll) {
    try {
        const cacheKey = getCacheKey(userId, isAdmin, showAll);
        localStorage.removeItem(cacheKey);
        console.log('代理快取已清除');
    } catch (error) {
        console.error('清除快取失敗:', error);
    }
}

// 清除所有過期的快取
function clearExpiredCache() {
    try {
        const keysToRemove = [];
        const now = Date.now();

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith(CACHE_PREFIX) || key.startsWith(PROFILES_CACHE_PREFIX))) {
                try {
                    const cachedData = JSON.parse(localStorage.getItem(key));
                    if (!isCacheValid(cachedData)) {
                        keysToRemove.push(key);
                    }
                } catch (error) {
                    // 如果解析失敗，也標記為刪除
                    keysToRemove.push(key);
                }
            }
        }

        // 同時清除過期的總數快取
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.endsWith('_count') && key.startsWith(PROFILES_CACHE_PREFIX)) {
                try {
                    const cachedData = JSON.parse(localStorage.getItem(key));
                    if (!isCacheValid(cachedData)) {
                        keysToRemove.push(key);
                    }
                } catch (error) {
                    keysToRemove.push(key);
                }
            }
        }

        keysToRemove.forEach(key => localStorage.removeItem(key));
        if (keysToRemove.length > 0) {
            console.log(`清理了 ${keysToRemove.length} 個過期快取`);
        }
    } catch (error) {
        console.error('清理過期快取失敗:', error);
    }
}

// 手動更新快取（清除快取並重新載入）
async function refreshAgentsCache() {
    if (!currentUser) {
        return;
    }

    const isAdmin = await isCurrentUserAdmin();

    // 顯示載入狀態
    const refreshBtn = event?.target?.closest('button');
    if (refreshBtn) {
        const icon = refreshBtn.querySelector('.material-symbols-outlined');
        if (icon) {
            icon.style.animation = 'spin 1s linear infinite';
            icon.textContent = 'sync';
        }
    }

    // 清除快取
    clearAgentsCache(currentUser.uid, isAdmin, showAllAgents);

    // 重新載入資料
    await loadAgentsFromFirebase(true);

    // 恢復按鈕狀態
    if (refreshBtn) {
        const icon = refreshBtn.querySelector('.material-symbols-outlined');
        if (icon) {
            icon.style.animation = '';
            icon.textContent = 'refresh';
        }
    }
}

// ==================== 資料載入函數 ====================

// 從 Firebase 載入代理基本資訊（只載入必要欄位）
async function loadAgentsFromFirebase(forceRefresh = false) {
    if (!currentUser) {
        return;
    }

    const isAdmin = await isCurrentUserAdmin();

    // 如果不是強制刷新，先檢查快取
    if (!forceRefresh) {
        const cachedAgents = loadAgentsFromCache(currentUser.uid, isAdmin, showAllAgents);
        if (cachedAgents) {
            agents = cachedAgents;
            await filterAgents();
            displayAgents();
            updateTestAgentSelect();
            loadProfileAgentOptions();
            loadNotificationAgentOptions();
            loadLineBotAnalyticsOptions();
            updateDashboardAgentsTable();
            loadStats();
            await updateAgentFilterToggle();
            return;
        }
    }

    // 從 Firebase 載入
    const agentsRef = database.ref('agents');

    // 根據用戶角色決定載入策略
    if (!isAdmin || !showAllAgents) {
        // 非管理員或管理員選擇「我的代理」：只載入自己的代理
        const userId = currentUser.uid;
        agentsRef.orderByChild('ownerId').equalTo(userId).once('value', async (snapshot) => {
            const allAgents = snapshot.val() || {};
            // 只提取基本資訊
            agents = extractBasicAgentInfo(allAgents);

            // 保存到快取
            saveAgentsToCache(userId, isAdmin, showAllAgents, agents);

            // 過濾並顯示
            await filterAgents();
            displayAgents();
            updateTestAgentSelect();
            loadProfileAgentOptions();
            loadNotificationAgentOptions();
            loadLineBotAnalyticsOptions();
            updateDashboardAgentsTable();
            loadStats();
            await updateAgentFilterToggle();
        }, (error) => {
            console.error('載入代理列表失敗:', error);
            alert('載入代理列表失敗: ' + error.message);
        });
    } else {
        // 管理員選擇「全部代理」：載入所有代理，但只載入基本資訊
        agentsRef.once('value', async (snapshot) => {
            const allAgents = snapshot.val() || {};
            // 只提取基本資訊
            agents = extractBasicAgentInfo(allAgents);

            // 保存到快取
            saveAgentsToCache(currentUser.uid, isAdmin, showAllAgents, agents);

            // 過濾並顯示
            await filterAgents();
            displayAgents();
            updateTestAgentSelect();
            loadProfileAgentOptions();
            loadNotificationAgentOptions();
            loadLineBotAnalyticsOptions();
            updateDashboardAgentsTable();
            loadStats();
            await updateAgentFilterToggle();
        }, (error) => {
            console.error('載入代理列表失敗:', error);
            alert('載入代理列表失敗: ' + error.message);
        });
    }
}

// 提取代理基本資訊（不包含大量資料）
function extractBasicAgentInfo(allAgents) {
    const basicAgents = {};

    for (const agentId in allAgents) {
        const agent = allAgents[agentId];
        basicAgents[agentId] = {
            id: agentId,
            name: agent.name || '',
            ownerId: agent.ownerId || '',
            description: agent.description || '',
            avatarImageUrl: agent.avatarImageUrl || null,
            chatUrl: agent.chatUrl || null,
            createdAt: agent.createdAt || Date.now(),
            updatedAt: agent.updatedAt || Date.now(),
            knowledgeBases: agent.knowledgeBases || [],
            stats: agent.stats || {
                conversationCount: 0,
                knowledgeBaseCount: agent.knowledgeBases ? agent.knowledgeBases.length : 0,
                lastUpdated: agent.updatedAt || Date.now()
            },
            llmConfig: agent.llmConfig ? {
                provider: agent.llmConfig.provider || 'unknown'
            } : null,
            lineBot: agent.lineBot ? {
                enabled: agent.lineBot.enabled || false
            } : null,
            // 不包含以下大量資料：
            // conversations, profiles, knowledgeBases, tokenStats, lineBotAnalytics, sessionAnalytics
            // 這些將按需載入
        };
    }

    return basicAgents;
}

// 過濾代理列表（根據用戶權限和過濾模式）
async function filterAgents() {
    if (!currentUser) {
        filteredAgents = {};
        return;
    }

    const isAdmin = await isCurrentUserAdmin();

    // 如果是管理員且選擇顯示全部，則不過濾
    if (showAllAgents && isAdmin) {
        filteredAgents = agents;
        return;
    }

    // 否則只顯示當前用戶創建的代理
    const userId = currentUser.uid;
    filteredAgents = {};

    for (const agentId in agents) {
        const agent = agents[agentId];
        if (agent.ownerId === userId) {
            filteredAgents[agentId] = agent;
        }
    }
}

// 載入代理列表（使用快取機制）
function loadAgents() {
    loadAgentsFromFirebase(false);
}

// 更新儀表板代理表格
function updateDashboardAgentsTable() {
    const tableBody = document.getElementById('dashboardAgentsTableBody');
    if (!tableBody) return;

    // 檢查 filteredAgents 數據是否已載入
    if (typeof filteredAgents === 'undefined' || !filteredAgents || Object.keys(filteredAgents).length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-muted-dark">載入中...</td></tr>';
        return;
    }

    const agentsArray = Object.entries(filteredAgents).map(([id, agent]) => ({ id, ...agent }));

    if (agentsArray.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-muted-dark">尚無代理，請建立第一個代理</td></tr>';
        return;
    }

    // 獲取對話數據來計算每個代理的對話數
    // 從每個代理的 conversations 路徑獲取數據
    const conversationCounts = {};
    let completedAgents = 0;
    const totalAgents = agentsArray.length;

    if (totalAgents === 0) {
        // 如果沒有代理，直接顯示空表格
        tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-muted-dark">尚無代理，請建立第一個代理</td></tr>';
        return;
    }

    agentsArray.forEach(agent => {
        const agentConversationsRef = database.ref(`agents/${agent.id}/conversations`);
        agentConversationsRef.once('value', (snapshot) => {
            const agentConversations = snapshot.val() || {};
            conversationCounts[agent.id] = Object.keys(agentConversations).length;
            completedAgents++;

            // 當所有代理的對話數據都載入完成後，更新表格
            if (completedAgents === totalAgents) {
                renderDashboardTable(agentsArray, conversationCounts);
            }
        }).catch((error) => {
            console.error(`載入代理 ${agent.id} 的對話數據失敗:`, error);
            conversationCounts[agent.id] = 0;
            completedAgents++;

            if (completedAgents === totalAgents) {
                renderDashboardTable(agentsArray, conversationCounts);
            }
        });
    });

    // 如果所有代理都載入完成，渲染表格
    if (completedAgents === totalAgents) {
        renderDashboardTable(agentsArray, conversationCounts);
    }
}

// 渲染儀表板代理表格
function renderDashboardTable(agentsArray, conversationCounts) {
    const tableBody = document.getElementById('dashboardAgentsTableBody');
    if (!tableBody) return;

    if (agentsArray.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-muted-dark">尚無代理，請建立第一個代理</td></tr>';
        return;
    }

    // 生成表格行
    tableBody.innerHTML = agentsArray.map(agent => {
        // 優先使用 stats 物件中的統計資訊，如果不存在則使用動態計算的值
        const conversationCount = conversationCounts[agent.id] !== undefined
            ? conversationCounts[agent.id]
            : (agent.stats?.conversationCount || 0);
        const knowledgeBaseCount = agent.stats?.knowledgeBaseCount !== undefined
            ? agent.stats.knowledgeBaseCount
            : (agent.knowledgeBases ? agent.knowledgeBases.length : 0);
        const lastUpdated = agent.stats?.lastUpdated
            ? new Date(agent.stats.lastUpdated).toLocaleString('zh-TW')
            : (agent.updatedAt ? new Date(agent.updatedAt).toLocaleString('zh-TW') : '未知');
        const status = agent.lineBot && agent.lineBot.enabled ? 'Active' : 'Inactive';
        const statusClass = status === 'Active'
            ? 'bg-green-900/40 text-green-300'
            : 'bg-gray-700/50 text-gray-300';

        return `
            <tr>
                <td class="whitespace-nowrap px-6 py-4 font-medium text-gray-50">${agent.name || '未命名代理'}</td>
                <td class="whitespace-nowrap px-6 py-4">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}">${status}</span>
                </td>
                <td class="whitespace-nowrap px-6 py-4 text-muted-dark">${conversationCount.toLocaleString()}</td>
                <td class="whitespace-nowrap px-6 py-4 text-muted-dark">${knowledgeBaseCount}</td>
                <td class="whitespace-nowrap px-6 py-4 text-muted-dark">${lastUpdated}</td>
                <td class="whitespace-nowrap px-6 py-4 text-right">
                    <button onclick="editAgent('${agent.id}')" class="p-2 text-muted-dark hover:text-white transition-colors">
                        <span class="material-symbols-outlined text-base">more_horiz</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 更新儀表板代理表格（舊版本，保留以備用）
function updateDashboardAgentsTableOld() {
    const tableBody = document.getElementById('dashboardAgentsTableBody');
    if (!tableBody) return;

    // 檢查 agents 數據是否已載入
    if (typeof agents === 'undefined' || !agents || Object.keys(agents).length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-muted-dark">載入中...</td></tr>';
        return;
    }

    const agentsArray = Object.entries(agents).map(([id, agent]) => ({ id, ...agent }));

    if (agentsArray.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-muted-dark">尚無代理，請建立第一個代理</td></tr>';
        return;
    }

    // 獲取對話數據來計算每個代理的對話數
    // 從每個代理的 conversations 路徑獲取數據
    const conversationCounts = {};
    let completedAgents = 0;
    const totalAgents = agentsArray.length;

    agentsArray.forEach(agent => {
        const agentConversationsRef = database.ref(`agents/${agent.id}/conversations`);
        agentConversationsRef.once('value', (snapshot) => {
            const agentConversations = snapshot.val() || {};
            conversationCounts[agent.id] = Object.keys(agentConversations).length;
            completedAgents++;

            // 當所有代理的對話數據都載入完成後，更新表格
            if (completedAgents === totalAgents) {
                renderDashboardTable(agentsArray, conversationCounts);
            }
        }).catch((error) => {
            console.error(`載入代理 ${agent.id} 的對話數據失敗:`, error);
            conversationCounts[agent.id] = 0;
            completedAgents++;

            if (completedAgents === totalAgents) {
                renderDashboardTable(agentsArray, conversationCounts);
            }
        });
    });

    // 如果所有代理都載入完成，渲染表格
    if (completedAgents === totalAgents) {
        renderDashboardTable(agentsArray, conversationCounts);
    }
}

// 顯示代理列表
function displayAgents() {
    const agentsList = document.getElementById('agentsList');

    if (Object.keys(filteredAgents).length === 0) {
        agentsList.innerHTML = '<div class="text-center py-12 px-4 text-muted-dark col-span-full">尚未建立任何代理</div>';
        return;
    }

    let html = '';
    Object.keys(filteredAgents).forEach(agentId => {
        const agent = filteredAgents[agentId];
        // 統計資料將按需載入，這裡先顯示載入中
        const knowledgeBaseCount = agent.knowledgeBases ? agent.knowledgeBases.length : 0;
        const chatUrl = agent.chatUrl || `${window.location.origin}/demo.html?agentId=${agentId}`;
        const avatarUrl = agent.avatarImageUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxjaXJjbGUgY3g9IjQwIiBjeT0iMzAiIHI9IjEwIiBmaWxsPSIjOUI5QkE1Ii8+CjxwYXRoIGQ9Ik0yMCA2MEMyMCA1NS41ODE3IDIzLjU4MTcgNTIgMjggNTJINjBDNjQuNDE4MyA1MiA2OCA1NS41ODE3IDY4IDYwVjY4SDIwVjYwWiIgZmlsbD0iIzlCOUJBNSIvPgo8dGV4dCB4PSI0MCIgeT0iNzAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiM2MzY2RjEiPkFJPC90ZXh0Pgo8L3N2Zz4K';

        html += `
            <div class="flex flex-col gap-6 rounded-xl border border-border-dark bg-card-dark p-6">
                <div class="flex items-center justify-between gap-4">
                    <div class="flex items-center gap-4">
                        <img alt="${agent.name}" class="size-12 rounded-full" src="${avatarUrl}" onerror="this.src='${avatarUrl}'"/>
                        <div>
                            <h3 class="text-lg font-bold text-white">${agent.name || '未命名代理'}</h3>
                            <p class="text-sm text-muted-dark">${getProviderName(agent.llmConfig?.provider || 'unknown')}</p>
                    </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="p-2 text-muted-dark hover:text-white rounded-full hover:bg-white/10 transition-colors" onclick="editAgent('${agentId}')" title="編輯代理">
                            <span class="material-symbols-outlined !text-xl">edit</span>
                        </button>
                        <button class="p-2 text-muted-dark hover:text-white rounded-full hover:bg-white/10 transition-colors" onclick="deleteAgent('${agentId}')" title="刪除代理">
                            <span class="material-symbols-outlined !text-xl">delete</span>
                        </button>
                    </div>
                </div>
                
                <div class="border-t border-border-dark pt-4">
                    <h4 class="text-sm font-semibold text-white mb-2">系統提示詞</h4>
                    <p class="text-sm text-muted-dark leading-relaxed">${truncateText(agent.description || '無描述', 150)}</p>
                    </div>
                    
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                        <p class="text-sm text-muted-dark">對話數</p>
                        <p class="text-xl font-bold mt-1 text-white" id="agent-conversation-count-${agentId}">載入中...</p>
                            </div>
                    <div>
                        <p class="text-sm text-muted-dark">人物誌</p>
                        <p class="text-xl font-bold mt-1 text-white" id="agent-profile-count-${agentId}">載入中...</p>
                        </div>
                    <div>
                        <p class="text-sm text-muted-dark">知識庫</p>
                        <p class="text-xl font-bold mt-1 text-white">${knowledgeBaseCount}</p>
                            </div>
                    <div>
                        <p class="text-sm text-muted-dark">總 Token</p>
                        <p class="text-xl font-bold mt-1 text-white" id="agent-total-tokens-${agentId}">載入中...</p>
                        </div>
                    </div>
                    
                <div class="border-t border-border-dark pt-4">
                    <h4 class="text-sm font-semibold text-white mb-3">LINE Bot 統計</h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center" id="agent-linebot-stats-${agentId}">
                        <div class="rounded-lg bg-background-dark p-3">
                            <p class="text-xs text-muted-dark">用戶數</p>
                            <p class="text-lg font-bold mt-1 text-white">載入中...</p>
                            </div>
                        <div class="rounded-lg bg-background-dark p-3">
                            <p class="text-xs text-muted-dark">總訊息</p>
                            <p class="text-lg font-bold mt-1 text-white">載入中...</p>
                        </div>
                        <div class="rounded-lg bg-background-dark p-3">
                            <p class="text-xs text-muted-dark">AI 回應</p>
                            <p class="text-lg font-bold mt-1 text-white">載入中...</p>
                            </div>
                        <div class="rounded-lg bg-background-dark p-3">
                            <p class="text-xs text-muted-dark">錯誤數</p>
                            <p class="text-lg font-bold mt-1 text-white">載入中...</p>
                            </div>
                        </div>
                    </div>
                    
                <div class="border-t border-border-dark pt-4">
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="text-sm font-semibold text-white">嵌入代碼</h4>
                        <button class="p-2 text-muted-dark hover:text-white rounded-md hover:bg-white/10 transition-colors" onclick="copyEmbedCode('${agentId}')" title="複製嵌入代碼">
                            <span class="material-symbols-outlined !text-xl">content_copy</span>
                        </button>
                        </div>
                    <div class="rounded-lg border border-border-dark bg-background-dark p-4">
                        <pre class="text-sm text-muted-dark font-mono whitespace-pre-wrap break-all"><code>&lt;ai-convai agent-id="${agentId}"&gt;&lt;/ai-convai&gt;
&lt;script src="https://ees-ai.web.app/ai-convai-widget-standalone.js" async type="text/javascript"&gt;&lt;/script&gt;</code></pre>
                    </div>
                </div>
                
                <div class="border-t border-border-dark pt-4">
                    <h4 class="text-sm font-semibold text-white mb-3">LINE 官方對話入口</h4>
                    <div class="flex items-center gap-2 rounded-lg border border-border-dark bg-background-dark p-2 pl-4">
                        <input class="w-full bg-transparent text-sm text-muted-dark outline-none border-none ring-0 focus:ring-0 p-0" readonly type="text" value="${chatUrl.length > 40 ? chatUrl.substring(0, 40) + '...' : chatUrl}"/>
                        <button class="p-2 text-muted-dark hover:text-white rounded-md hover:bg-white/10 transition-colors" onclick="copyAgentChatUrl('${agentId}')" title="複製網址">
                            <span class="material-symbols-outlined !text-xl">content_copy</span>
                        </button>
                        <button class="p-2 text-muted-dark hover:text-white rounded-md hover:bg-white/10 transition-colors" onclick="openAgentChatUrl('${agentId}')" title="開啟對話">
                            <span class="material-symbols-outlined !text-xl">link</span>
                            </button>
                        </div>
                        </div>
                
                ${agent.lineBot && agent.lineBot.enabled ? `
                <div class="border-t border-border-dark pt-4">
                    <div class="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-900/20 p-3">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-green-400">check_circle</span>
                            <p class="text-sm font-medium text-green-300">LINE Bot 已啟用</p>
                    </div>
                        <span class="text-sm font-semibold text-green-300">ACTIVE</span>
                </div>
                </div>
                ` : ''}
            </div>
        `;
    });

    agentsList.innerHTML = html;

    // 為每個代理按需載入統計資料
    Object.keys(filteredAgents).forEach(agentId => {
        loadAgentIndividualStats(agentId);
        loadAgentConversationCount(agentId);
        loadAgentProfileCount(agentId);
    });
}

// 按需載入代理對話數量
function loadAgentConversationCount(agentId) {
    const conversationRef = database.ref(`agents/${agentId}/conversations`);
    conversationRef.once('value').then((snapshot) => {
        const conversations = snapshot.val() || {};
        const count = Object.keys(conversations).length;
        const countElement = document.getElementById(`agent-conversation-count-${agentId}`);
        if (countElement) {
            countElement.textContent = count.toLocaleString();
        }
    }).catch((error) => {
        console.error(`載入代理 ${agentId} 的對話數量失敗:`, error);
        const countElement = document.getElementById(`agent-conversation-count-${agentId}`);
        if (countElement) {
            countElement.textContent = '0';
        }
    });
}

// 按需載入代理人物誌數量
function loadAgentProfileCount(agentId) {
    const profileRef = database.ref(`agents/${agentId}/profiles`);
    profileRef.once('value').then((snapshot) => {
        const profiles = snapshot.val() || {};
        const count = Object.keys(profiles).length;
        const countElement = document.getElementById(`agent-profile-count-${agentId}`);
        if (countElement) {
            countElement.textContent = count.toLocaleString();
        }
    }).catch((error) => {
        console.error(`載入代理 ${agentId} 的人物誌數量失敗:`, error);
        const countElement = document.getElementById(`agent-profile-count-${agentId}`);
        if (countElement) {
            countElement.textContent = '0';
        }
    });
}

// 取得提供商名稱
function getProviderName(provider) {
    const names = {
        'openai': 'OpenAI',
        'gemini': 'Google Gemini',
        'custom': '自訂 API'
    };
    return names[provider] || provider;
}

// 截斷文字
function truncateText(text, maxLength) {
    if (!text) return '無描述';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// 切換人物誌 JSON 顯示
function toggleProfileJson(profileId) {
    const jsonElement = document.getElementById(`profile-json-${profileId}`);
    if (jsonElement) {
        if (jsonElement.style.display === 'none') {
            jsonElement.style.display = 'block';
        } else {
            jsonElement.style.display = 'none';
        }
    }
}

// 生成 JSON 摘要
function generateJsonSummary(profile) {
    try {
        const summary = [];

        // 基本資訊
        if (profile.basic?.name) summary.push(`姓名: ${profile.basic.name}`);
        if (profile.basic?.age) summary.push(`年齡: ${profile.basic.age}`);

        // 教育資訊
        if (profile.education?.school) summary.push(`學校: ${profile.education.school}`);
        if (profile.education?.major) summary.push(`科系: ${profile.education.major}`);

        // 職業資訊
        if (profile.career?.company && profile.career.company !== '公司') summary.push(`公司: ${profile.career.company}`);
        if (profile.career?.position && profile.career.position !== '職位') summary.push(`職位: ${profile.career.position}`);

        // 聯絡資訊
        if (profile.contact?.phone && profile.contact.phone !== '電話') summary.push(`電話: ${profile.contact.phone}`);
        if (profile.contact?.email && profile.contact.email !== '信箱') summary.push(`信箱: ${profile.contact.email}`);

        // 興趣和個性
        if (profile.interests?.hobbies && profile.interests.hobbies !== '興趣愛好') summary.push(`興趣: ${profile.interests.hobbies}`);
        if (profile.personality?.traits && profile.personality.traits !== '個性特質') summary.push(`個性: ${profile.personality.traits}`);

        // 生活習慣
        if (profile.lifestyle?.habits && profile.lifestyle.habits !== '生活習慣') summary.push(`習慣: ${profile.lifestyle.habits}`);

        // 如果沒有具體內容，顯示統計資訊
        if (summary.length === 0) {
            if (profile.metadata?.confidence) summary.push(`信心度: ${profile.metadata.confidence}`);
            if (profile.metadata?.totalInteractions) summary.push(`互動: ${profile.metadata.totalInteractions}`);
        }

        return summary.slice(0, 6).join(' | '); // 最多顯示6個項目
    } catch (error) {
        console.error('生成 JSON 摘要失敗:', error);
        return '摘要生成失敗';
    }
}

// 複製人物誌 JSON
function copyProfileJson(profileId) {
    try {
        // 從 Firebase 重新獲取人物誌資料
        const profileRef = database.ref(`agents/${currentProfileAgentId}/profiles/${profileId}`);
        profileRef.once('value').then((snapshot) => {
            const profile = snapshot.val();
            if (profile) {
                const jsonString = JSON.stringify(profile, null, 2);
                navigator.clipboard.writeText(jsonString).then(() => {
                    alert('JSON 已複製到剪貼簿！');
                }).catch((error) => {
                    console.error('複製失敗:', error);
                    // 備用方案
                    const textArea = document.createElement('textarea');
                    textArea.value = jsonString;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    alert('JSON 已複製到剪貼簿！');
                });
            } else {
                alert('找不到人物誌資料');
            }
        }).catch((error) => {
            console.error('獲取人物誌資料失敗:', error);
            alert('獲取人物誌資料失敗');
        });
    } catch (error) {
        console.error('複製 JSON 失敗:', error);
        alert('複製失敗');
    }
}

// 複製嵌入代碼
function copyEmbedCode(agentId) {
    const embedCode = `<ai-convai agent-id="${agentId}"></ai-convai>
<script src="https://ees-ai.web.app/ai-convai-widget-standalone.js" async type="text/javascript"></script>`;

    navigator.clipboard.writeText(embedCode).then(() => {
        alert('嵌入代碼已複製到剪貼簿！');
    }).catch((error) => {
        console.error('複製失敗:', error);
        // 備用方案：顯示代碼讓用戶手動複製
        const codeText = document.createElement('textarea');
        codeText.value = embedCode;
        document.body.appendChild(codeText);
        codeText.select();
        document.execCommand('copy');
        document.body.removeChild(codeText);
        alert('嵌入代碼已複製到剪貼簿！');
    });
}

// 載入統計資料
function loadStats() {
    // 載入過濾後的代理數量
    const agentsCount = Object.keys(filteredAgents).length;
    const totalAgentsEl = document.getElementById('totalAgents');
    if (totalAgentsEl) {
        totalAgentsEl.textContent = agentsCount;
    }
    // 更新代理變化提示
    const totalAgentsChangeEl = document.getElementById('totalAgentsChange');
    if (totalAgentsChangeEl) {
        totalAgentsChangeEl.textContent = `共 ${agentsCount} 個代理`;
    }

    // 載入對話數量（統計所有代理下的對話）
    loadConversationStats();

    // 載入通知統計
    loadNotificationStats();

    // 載入 Token 統計
    loadTokenStats();

    // 載入 LINE Bot 統計
    loadLineBotStats();

    // 載入 LINE Bot 分析選項
    loadLineBotAnalyticsOptions();

    // 更新最後更新時間
    updateLastUpdateTime();
}

// 載入 Token 統計
function loadTokenStats() {
    let totalTokens = 0;
    let totalRequests = 0;
    let todayTokens = 0;

    // 統計過濾後代理的 Token 使用量
    Object.keys(filteredAgents).forEach(agentId => {
        const agent = filteredAgents[agentId];
        if (agent.tokenStats) {
            // 總計統計
            if (agent.tokenStats.total) {
                totalTokens += agent.tokenStats.total.totalTokens || 0;
                totalRequests += agent.tokenStats.total.totalRequests || 0;
            }

            // 今日統計
            const today = new Date().toISOString().split('T')[0];
            if (agent.tokenStats[today]) {
                todayTokens += agent.tokenStats[today].totalTokens || 0;
            }
        }
    });

    // 更新顯示
    const totalTokensEl = document.getElementById('totalTokens');
    const totalRequestsEl = document.getElementById('totalRequests');
    const todayTokensEl = document.getElementById('todayTokens');

    if (totalTokensEl) totalTokensEl.textContent = totalTokens.toLocaleString();
    if (totalRequestsEl) totalRequestsEl.textContent = totalRequests.toLocaleString();
    if (todayTokensEl) todayTokensEl.textContent = todayTokens.toLocaleString();
}

// 載入 LINE Bot 統計（按需載入）
function loadLineBotStats() {
    let totalLineBotUsers = 0;
    let totalLineBotMessages = 0;
    let totalLineBotResponses = 0;
    let totalLineBotErrors = 0;
    let todayLineBotMessages = 0;
    let todayLineBotUsers = 0;

    const agentIds = Object.keys(filteredAgents);
    if (agentIds.length === 0) {
        // 如果沒有代理，直接更新顯示為 0
        const totalLineBotUsersEl = document.getElementById('totalLineBotUsers');
        const totalLineBotMessagesEl = document.getElementById('totalLineBotMessages');
        const totalLineBotResponsesEl = document.getElementById('totalLineBotResponses');
        const totalLineBotErrorsEl = document.getElementById('totalLineBotErrors');
        const todayLineBotMessagesEl = document.getElementById('todayLineBotMessages');
        const todayLineBotUsersEl = document.getElementById('todayLineBotUsers');

        if (totalLineBotUsersEl) totalLineBotUsersEl.textContent = '0';
        if (totalLineBotMessagesEl) totalLineBotMessagesEl.textContent = '0';
        if (totalLineBotResponsesEl) totalLineBotResponsesEl.textContent = '0';
        if (totalLineBotErrorsEl) totalLineBotErrorsEl.textContent = '0';
        if (todayLineBotMessagesEl) todayLineBotMessagesEl.textContent = '0';
        if (todayLineBotUsersEl) todayLineBotUsersEl.textContent = '0';
        return;
    }

    let completedAgents = 0;
    const today = new Date().toISOString().split('T')[0];

    // 按需載入每個代理的 LINE Bot 統計
    agentIds.forEach(agentId => {
        const lineBotStatsRef = database.ref(`agents/${agentId}/lineBotAnalytics`);
        lineBotStatsRef.once('value').then((snapshot) => {
            const lineBotAnalytics = snapshot.val() || {};

            if (lineBotAnalytics) {
                // 統計用戶數
                if (lineBotAnalytics.users) {
                    totalLineBotUsers += Object.keys(lineBotAnalytics.users).length;
                }

                // 統計今日訊息數
                if (lineBotAnalytics.agentStats && lineBotAnalytics.agentStats[today]) {
                    todayLineBotMessages += lineBotAnalytics.agentStats[today].totalMessages || 0;
                }

                // 統計總訊息數
                if (lineBotAnalytics.agentStats) {
                    Object.values(lineBotAnalytics.agentStats).forEach(dayStats => {
                        totalLineBotMessages += dayStats.totalMessages || 0;
                    });
                }

                // 統計 AI 回應數
                if (lineBotAnalytics.aiStats) {
                    Object.values(lineBotAnalytics.aiStats).forEach(dayStats => {
                        totalLineBotResponses += dayStats.totalResponses || 0;
                    });
                }

                // 統計錯誤數
                if (lineBotAnalytics.errorStats) {
                    Object.values(lineBotAnalytics.errorStats).forEach(dayStats => {
                        totalLineBotErrors += dayStats.totalErrors || 0;
                    });
                }
            }

            completedAgents++;

            // 當所有代理的統計都載入完成後，更新顯示
            if (completedAgents === agentIds.length) {
                const totalLineBotUsersEl = document.getElementById('totalLineBotUsers');
                const totalLineBotMessagesEl = document.getElementById('totalLineBotMessages');
                const totalLineBotResponsesEl = document.getElementById('totalLineBotResponses');
                const totalLineBotErrorsEl = document.getElementById('totalLineBotErrors');
                const todayLineBotMessagesEl = document.getElementById('todayLineBotMessages');
                const todayLineBotUsersEl = document.getElementById('todayLineBotUsers');

                if (totalLineBotUsersEl) totalLineBotUsersEl.textContent = totalLineBotUsers.toLocaleString();
                if (totalLineBotMessagesEl) totalLineBotMessagesEl.textContent = totalLineBotMessages.toLocaleString();
                if (totalLineBotResponsesEl) totalLineBotResponsesEl.textContent = totalLineBotResponses.toLocaleString();
                if (totalLineBotErrorsEl) totalLineBotErrorsEl.textContent = totalLineBotErrors.toLocaleString();
                if (todayLineBotMessagesEl) todayLineBotMessagesEl.textContent = todayLineBotMessages.toLocaleString();
                if (todayLineBotUsersEl) todayLineBotUsersEl.textContent = todayLineBotUsers.toLocaleString();
            }
        }).catch((error) => {
            console.error(`載入代理 ${agentId} 的 LINE Bot 統計失敗:`, error);
            completedAgents++;

            if (completedAgents === agentIds.length) {
                const totalLineBotUsersEl = document.getElementById('totalLineBotUsers');
                const totalLineBotMessagesEl = document.getElementById('totalLineBotMessages');
                const totalLineBotResponsesEl = document.getElementById('totalLineBotResponses');
                const totalLineBotErrorsEl = document.getElementById('totalLineBotErrors');
                const todayLineBotMessagesEl = document.getElementById('todayLineBotMessages');
                const todayLineBotUsersEl = document.getElementById('todayLineBotUsers');

                if (totalLineBotUsersEl) totalLineBotUsersEl.textContent = totalLineBotUsers.toLocaleString();
                if (totalLineBotMessagesEl) totalLineBotMessagesEl.textContent = totalLineBotMessages.toLocaleString();
                if (totalLineBotResponsesEl) totalLineBotResponsesEl.textContent = totalLineBotResponses.toLocaleString();
                if (totalLineBotErrorsEl) totalLineBotErrorsEl.textContent = totalLineBotErrors.toLocaleString();
                if (todayLineBotMessagesEl) todayLineBotMessagesEl.textContent = todayLineBotMessages.toLocaleString();
                if (todayLineBotUsersEl) todayLineBotUsersEl.textContent = todayLineBotUsers.toLocaleString();
            }
        });
    });
}

// 載入代理個別統計
function loadAgentIndividualStats(agentId) {
    // 使用 filteredAgents 或 agents（因為統計需要從完整數據中讀取）
    const agent = filteredAgents[agentId] || agents[agentId];
    if (!agent) return;

    // 載入 Token 統計
    loadAgentTokenStats(agentId);

    // 載入 LINE Bot 統計
    loadAgentLineBotStats(agentId);
}

// 切換代理過濾模式（全部/我的）
async function toggleAgentFilter() {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
        return; // 非管理員無法切換
    }

    showAllAgents = !showAllAgents;

    // 清除舊快取並重新載入
    if (currentUser) {
        clearAgentsCache(currentUser.uid, isAdmin, !showAllAgents);
    }

    // 重新載入資料
    await loadAgentsFromFirebase(true);
    await updateAgentFilterToggle();
}

// 更新代理過濾切換按鈕顯示
async function updateAgentFilterToggle() {
    const filterToggle = document.getElementById('agentFilterToggle');
    const filterText = document.getElementById('filterText');
    const filterIcon = document.getElementById('filterIcon');

    if (!filterToggle) return;

    const isAdmin = await isCurrentUserAdmin();

    if (isAdmin) {
        filterToggle.style.display = 'flex';
        if (filterText) {
            filterText.textContent = showAllAgents ? '全部代理' : '我的代理';
        }
        if (filterIcon) {
            filterIcon.textContent = showAllAgents ? 'filter_alt_off' : 'filter_alt';
        }
    } else {
        filterToggle.style.display = 'none';
    }
}

// 載入代理 Token 統計
function loadAgentTokenStats(agentId) {
    const tokenStatsRef = database.ref(`agents/${agentId}/tokenStats`);
    tokenStatsRef.once('value').then((snapshot) => {
        const tokenStats = snapshot.val() || {};

        let totalTokens = 0;
        let totalRequests = 0;
        let todayTokens = 0;
        let todayRequests = 0;

        if (tokenStats.total) {
            totalTokens = tokenStats.total.totalTokens || 0;
            totalRequests = tokenStats.total.totalRequests || 0;
        }

        const today = new Date().toISOString().split('T')[0];
        if (tokenStats[today]) {
            todayTokens = tokenStats[today].totalTokens || 0;
            todayRequests = tokenStats[today].requestCount || 0;
        }

        // 更新顯示 - 總 Token 顯示在統計區域
        const totalTokensElement = document.getElementById(`agent-total-tokens-${agentId}`);
        if (totalTokensElement) {
            totalTokensElement.textContent = totalTokens.toLocaleString();
        }
    });
}

// 載入代理 LINE Bot 統計
function loadAgentLineBotStats(agentId) {
    const lineBotStatsRef = database.ref(`agents/${agentId}/lineBotAnalytics`);
    lineBotStatsRef.once('value').then((snapshot) => {
        const lineBotStats = snapshot.val() || {};

        let totalUsers = 0;
        let totalMessages = 0;
        let totalResponses = 0;
        let totalErrors = 0;
        let todayMessages = 0;

        if (lineBotStats.users) {
            totalUsers = Object.keys(lineBotStats.users).length;
        }

        if (lineBotStats.agentStats) {
            Object.values(lineBotStats.agentStats).forEach(dayStats => {
                totalMessages += dayStats.totalMessages || 0;
            });
        }

        if (lineBotStats.aiStats) {
            Object.values(lineBotStats.aiStats).forEach(dayStats => {
                totalResponses += dayStats.totalResponses || 0;
            });
        }

        if (lineBotStats.errorStats) {
            Object.values(lineBotStats.errorStats).forEach(dayStats => {
                totalErrors += dayStats.totalErrors || 0;
            });
        }

        const today = new Date().toISOString().split('T')[0];
        if (lineBotStats.agentStats && lineBotStats.agentStats[today]) {
            todayMessages = lineBotStats.agentStats[today].totalMessages || 0;
        }

        // 更新顯示 - LINE Bot 統計
        const lineBotElement = document.getElementById(`agent-linebot-stats-${agentId}`);
        if (lineBotElement) {
            lineBotElement.innerHTML = `
                <div class="rounded-lg bg-background-dark p-3">
                    <p class="text-xs text-muted-dark">用戶數</p>
                    <p class="text-lg font-bold mt-1 text-white">${totalUsers.toLocaleString()}</p>
                </div>
                <div class="rounded-lg bg-background-dark p-3">
                    <p class="text-xs text-muted-dark">總訊息</p>
                    <p class="text-lg font-bold mt-1 text-white">${totalMessages.toLocaleString()}</p>
                </div>
                <div class="rounded-lg bg-background-dark p-3">
                    <p class="text-xs text-muted-dark">AI 回應</p>
                    <p class="text-lg font-bold mt-1 text-white">${totalResponses.toLocaleString()}</p>
                </div>
                <div class="rounded-lg bg-background-dark p-3">
                    <p class="text-xs text-muted-dark">錯誤數</p>
                    <p class="text-lg font-bold mt-1 text-white">${totalErrors.toLocaleString()}</p>
                </div>
            `;
        }
    });
}

// 載入代理對話統計
function loadAgentConversationStats(agentId) {
    const conversationsRef = database.ref(`agents/${agentId}/conversations`);
    conversationsRef.once('value').then((snapshot) => {
        const conversations = snapshot.val() || {};
        const totalConversations = Object.keys(conversations).length;

        // 計算今日對話數
        const today = new Date().toISOString().split('T')[0];
        let todayConversations = 0;

        Object.values(conversations).forEach(conversation => {
            if (conversation.createdAt) {
                const conversationDate = new Date(conversation.createdAt).toISOString().split('T')[0];
                if (conversationDate === today) {
                    todayConversations++;
                }
            }
        });

        // 更新顯示
        const conversationElement = document.getElementById(`agent-conversation-stats-${agentId}`);
        if (conversationElement) {
            conversationElement.innerHTML = `
                <div class="agent-stat-item">
                    <span class="stat-label">總對話</span>
                    <span class="stat-value">${totalConversations.toLocaleString()}</span>
                </div>
                <div class="agent-stat-item">
                    <span class="stat-label">今日對話</span>
                    <span class="stat-value">${todayConversations.toLocaleString()}</span>
                </div>
            `;
        }
    });
}

// 載入 LINE Bot 分析選項
function loadLineBotAnalyticsOptions() {
    console.log('開始載入 LINE Bot 分析選項...');

    const select = document.getElementById('linebotAgentSelect');

    if (!select) {
        console.error('找不到 linebotAgentSelect 元素');
        return;
    }

    console.log('找到 linebotAgentSelect 元素');

    // 清空現有選項
    select.innerHTML = '<option value="">請選擇代理</option>';

    let enabledCount = 0;
    // 添加代理選項（使用過濾後的代理）
    Object.keys(filteredAgents).forEach(agentId => {
        const agent = filteredAgents[agentId];
        console.log(`檢查代理 ${agentId}:`, agent);
        if (agent.lineBot && agent.lineBot.enabled) {
            const option = document.createElement('option');
            option.value = agentId;
            option.textContent = agent.name || `代理 ${agentId}`;
            select.appendChild(option);
            enabledCount++;
            console.log(`添加代理選項: ${agent.name}`);
        }
    });

    console.log(`載入了 ${enabledCount} 個啟用 LINE Bot 的代理`);

    if (enabledCount === 0) {
        select.innerHTML = '<option value="">沒有啟用 LINE Bot 的代理</option>';
    }

    // 添加選擇變更事件監聽器，自動載入 LINE Bot 分析
    select.addEventListener('change', function () {
        console.log('代理選擇變更:', this.value);
        if (this.value) {
            loadLineBotAnalytics();
        }
    });
}

// 載入 LINE Bot 分析
function loadLineBotAnalytics() {
    const agentId = document.getElementById('linebotAgentSelect').value;
    console.log('選擇的代理 ID:', agentId);

    if (!agentId) {
        document.getElementById('linebotAnalyticsContent').innerHTML = `
            <div class="analytics-placeholder xl:col-span-3 text-center py-12 px-4 rounded-xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark">
                <p class="text-muted-dark">請選擇一個代理來查看 LINE Bot 用戶行為分析</p>
            </div>
        `;
        return;
    }

    // 載入代理資料
    const agentRef = database.ref(`agents/${agentId}`);
    agentRef.once('value').then((snapshot) => {
        const agent = snapshot.val();
        if (!agent) {
            document.getElementById('linebotAnalyticsContent').innerHTML = `
                <div class="analytics-placeholder xl:col-span-3 text-center py-12 px-4 rounded-xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark">
                    <p class="text-muted-dark">代理不存在</p>
                </div>
            `;
            return;
        }

        // 清除現有內容
        document.getElementById('linebotAnalyticsContent').innerHTML = '';

        // 載入 LINE Bot 統計
        loadLineBotAgentStats(agentId, agent);

        // 載入用戶行為分析
        loadLineBotUserBehaviorAnalysis(agentId, agent);
    });
}

// 載入 LINE Bot 代理統計
function loadLineBotAgentStats(agentId, agent) {
    const lineBotStatsRef = database.ref(`agents/${agentId}/lineBotAnalytics`);
    lineBotStatsRef.once('value').then((snapshot) => {
        const lineBotStats = snapshot.val() || {};

        // 計算統計數據
        let totalUsers = 0;
        let totalMessages = 0;
        let totalResponses = 0;
        let totalErrors = 0;
        let todayMessages = 0;
        let todayUsers = 0;

        if (lineBotStats.users) {
            totalUsers = Object.keys(lineBotStats.users).length;
        }

        if (lineBotStats.agentStats) {
            Object.values(lineBotStats.agentStats).forEach(dayStats => {
                totalMessages += dayStats.totalMessages || 0;
            });
        }

        if (lineBotStats.aiStats) {
            Object.values(lineBotStats.aiStats).forEach(dayStats => {
                totalResponses += dayStats.totalResponses || 0;
            });
        }

        if (lineBotStats.errorStats) {
            Object.values(lineBotStats.errorStats).forEach(dayStats => {
                totalErrors += dayStats.totalErrors || 0;
            });
        }

        const today = new Date().toISOString().split('T')[0];
        if (lineBotStats.agentStats && lineBotStats.agentStats[today]) {
            todayMessages = lineBotStats.agentStats[today].totalMessages || 0;
        }

        // 更新 LINE Bot 統計顯示
        updateLineBotStatsDisplay(totalUsers, totalMessages, totalResponses, totalErrors, todayMessages);

        // 載入用戶行為分析（已在 loadLineBotAnalytics 中調用，無需重複調用）
    });
}

// 更新 LINE Bot 統計顯示
function updateLineBotStatsDisplay(totalUsers, totalMessages, totalResponses, totalErrors, todayMessages) {
    const lineBotStatsHtml = `
        <div class="flex flex-col gap-6 xl:col-span-1">
            <div class="rounded-xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark p-4">
                <h3 class="flex items-center gap-2 text-base font-semibold text-gray-50 mb-4">
                    <span class="material-symbols-outlined text-xl text-primary">monitoring</span>
                    LINE Bot 統計
                </h3>
                <div class="grid grid-cols-2 gap-4">
                    <div class="rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">總用戶數</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${totalUsers.toLocaleString()}</p>
                </div>
                    <div class="rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">總訊息數</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${totalMessages.toLocaleString()}</p>
                </div>
                    <div class="rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">AI 回應數</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${totalResponses.toLocaleString()}</p>
                </div>
                    <div class="rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">錯誤數</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${totalErrors.toLocaleString()}</p>
                </div>
                    <div class="col-span-2 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">今日訊息數</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${todayMessages.toLocaleString()}</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 更新或創建 LINE Bot 統計區塊
    let lineBotSection = document.getElementById('lineBotStats');
    if (!lineBotSection) {
        lineBotSection = document.createElement('div');
        lineBotSection.id = 'lineBotStats';
        document.getElementById('linebotAnalyticsContent').appendChild(lineBotSection);
    }
    lineBotSection.innerHTML = lineBotStatsHtml;
}

// 載入 LINE Bot 用戶行為分析
function loadLineBotUserBehaviorAnalysis(agentId, agent) {
    const lineBotStatsRef = database.ref(`agents/${agentId}/lineBotAnalytics/users`);
    lineBotStatsRef.once('value').then((snapshot) => {
        const users = snapshot.val() || {};

        // 分析用戶行為
        const userAnalysis = analyzeUserBehavior(users);

        // 更新用戶行為分析顯示
        updateUserBehaviorAnalysisDisplay(userAnalysis);
    });
}

// 分析用戶行為
function analyzeUserBehavior(users) {
    const userList = Object.entries(users);

    // 計算統計數據
    const totalUsers = userList.length;
    const totalMessages = userList.reduce((sum, [_, user]) => sum + (user.totalMessages || 0), 0);
    const avgMessagesPerUser = totalUsers > 0 ? (totalMessages / totalUsers).toFixed(1) : 0;

    // 活躍用戶分析
    const activeUsers = userList.filter(([_, user]) => {
        const lastInteraction = user.lastInteraction || 0;
        const daysSinceLastInteraction = (Date.now() - lastInteraction) / (1000 * 60 * 60 * 24);
        return daysSinceLastInteraction <= 7; // 7天內有互動
    }).length;

    // 訊息類型分析
    const messageTypes = {};
    userList.forEach(([_, user]) => {
        if (user.messageTypes) {
            Object.entries(user.messageTypes).forEach(([type, count]) => {
                messageTypes[type] = (messageTypes[type] || 0) + count;
            });
        }
    });

    // 用戶活躍度分級
    const userActivityLevels = {
        high: 0,    // 10+ 訊息
        medium: 0,  // 3-9 訊息
        low: 0      // 1-2 訊息
    };

    userList.forEach(([_, user]) => {
        const messageCount = user.totalMessages || 0;
        if (messageCount >= 10) {
            userActivityLevels.high++;
        } else if (messageCount >= 3) {
            userActivityLevels.medium++;
        } else {
            userActivityLevels.low++;
        }
    });

    return {
        totalUsers,
        totalMessages,
        avgMessagesPerUser,
        activeUsers,
        messageTypes,
        userActivityLevels,
        userList: userList.sort((a, b) => (b[1].totalMessages || 0) - (a[1].totalMessages || 0))
    };
}

// 更新用戶行為分析顯示
function updateUserBehaviorAnalysisDisplay(analysis) {
    const getActivityBadgeClass = (level) => {
        if (level === '高') {
            return 'bg-green-900/40 text-green-300';
        } else if (level === '中') {
            return 'bg-yellow-900/40 text-yellow-300';
        } else {
            return 'bg-red-900/40 text-red-300';
        }
    };

    const userBehaviorHtml = `
        <div class="flex flex-col gap-6 xl:col-span-2">
            <div class="rounded-xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark p-4">
                <h3 class="flex items-center gap-2 text-base font-semibold text-gray-50 mb-4">
                    <span class="material-symbols-outlined text-xl text-primary">pie_chart</span>
                    用戶行為分析
                </h3>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">總用戶數</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${analysis.totalUsers.toLocaleString()}</p>
                </div>
                    <div class="rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">活躍用戶 (7天)</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${analysis.activeUsers.toLocaleString()}</p>
                </div>
                    <div class="rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">平均訊息數</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${analysis.avgMessagesPerUser}</p>
                </div>
                    <div class="rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">高活躍用戶</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${analysis.userActivityLevels.high.toLocaleString()}</p>
                </div>
                    <div class="rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">中活躍用戶</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${analysis.userActivityLevels.medium.toLocaleString()}</p>
                </div>
                    <div class="rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4 text-center">
                        <p class="text-sm text-muted-dark">低活躍用戶</p>
                        <p class="text-2xl font-bold text-gray-50 mt-1">${analysis.userActivityLevels.low.toLocaleString()}</p>
                </div>
            </div>
        </div>
        
            <div class="rounded-xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark">
                <div class="p-4">
                    <h3 class="flex items-center gap-2 text-base font-semibold text-gray-50">
                        <span class="material-symbols-outlined text-xl text-primary">list_alt</span>
                        用戶詳細列表
                    </h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-border-light dark:divide-border-dark text-sm">
                        <thead class="bg-white/5">
                            <tr>
                                <th class="px-6 py-3 text-left font-medium text-muted-dark" scope="col">用戶 ID</th>
                                <th class="px-6 py-3 text-left font-medium text-muted-dark" scope="col">總訊息數</th>
                                <th class="px-6 py-3 text-left font-medium text-muted-dark" scope="col">首次互動</th>
                                <th class="px-6 py-3 text-left font-medium text-muted-dark" scope="col">最後互動</th>
                                <th class="px-6 py-3 text-left font-medium text-muted-dark" scope="col">訊息類型</th>
                                <th class="px-6 py-3 text-left font-medium text-muted-dark" scope="col">活躍度</th>
                    </tr>
                </thead>
                        <tbody class="divide-y divide-border-light dark:divide-border-dark">
                            ${analysis.userList.length > 0 ? analysis.userList.map(([userId, userData]) => {
        const messageCount = userData.totalMessages || 0;
        let activityLevel = '低';
        if (messageCount >= 10) activityLevel = '高';
        else if (messageCount >= 3) activityLevel = '中';

        const formatDate = (timestamp) => {
            if (!timestamp) return '-';
            const date = new Date(timestamp);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}/${month}/${day}`;
        };
        const firstInteraction = formatDate(userData.firstInteraction);
        const lastInteraction = formatDate(userData.lastInteraction);
        const messageTypesStr = Object.entries(userData.messageTypes || {}).map(([type, count]) => `${type}: ${count}`).join(', ') || '-';

        return `
                            <tr>
                                        <td class="whitespace-nowrap px-6 py-4 font-medium text-gray-50">${userId.length > 8 ? userId.substring(0, 8) + '...' : userId}</td>
                                        <td class="whitespace-nowrap px-6 py-4 text-muted-dark">${messageCount}</td>
                                        <td class="whitespace-nowrap px-6 py-4 text-muted-dark">${firstInteraction}</td>
                                        <td class="whitespace-nowrap px-6 py-4 text-muted-dark">${lastInteraction}</td>
                                        <td class="whitespace-nowrap px-6 py-4 text-muted-dark">${messageTypesStr}</td>
                                        <td class="whitespace-nowrap px-6 py-4">
                                            <span class="inline-flex items-center rounded-full ${getActivityBadgeClass(activityLevel)} px-2.5 py-0.5 text-xs font-medium">${activityLevel}</span>
                                        </td>
                            </tr>
                        `;
    }).join('') : '<tr><td colspan="6" class="px-6 py-4 text-center text-muted-dark">尚無用戶數據</td></tr>'}
                </tbody>
            </table>
                </div>
            </div>
        </div>
    `;

    // 更新或創建用戶行為分析區塊
    let userBehaviorSection = document.getElementById('userBehaviorAnalysis');
    if (!userBehaviorSection) {
        userBehaviorSection = document.createElement('div');
        userBehaviorSection.id = 'userBehaviorAnalysis';
        document.getElementById('linebotAnalyticsContent').appendChild(userBehaviorSection);
    }
    userBehaviorSection.innerHTML = userBehaviorHtml;
}

// 載入對話統計（按需載入）
function loadConversationStats() {
    let totalConversations = 0;
    let todayConversations = 0;
    let yesterdayConversations = 0;
    let dayBeforeYesterdayConversations = 0;

    const agentIds = Object.keys(filteredAgents);
    if (agentIds.length === 0) {
        // 如果沒有代理，直接更新顯示為 0
        const totalConversationsEl = document.getElementById('totalConversations');
        const todayConversationsEl = document.getElementById('todayConversations');
        const yesterdayConversationsEl = document.getElementById('yesterdayConversations');
        const dayBeforeYesterdayConversationsEl = document.getElementById('dayBeforeYesterdayConversations');

        if (totalConversationsEl) totalConversationsEl.textContent = '0';
        if (todayConversationsEl) todayConversationsEl.textContent = '0';
        if (yesterdayConversationsEl) yesterdayConversationsEl.textContent = '0';
        if (dayBeforeYesterdayConversationsEl) dayBeforeYesterdayConversationsEl.textContent = '0';
        return;
    }

    // 獲取今天的日期範圍
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const dayBeforeYesterday = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    let completedAgents = 0;

    // 按需載入每個代理的對話統計
    agentIds.forEach(agentId => {
        const conversationsRef = database.ref(`agents/${agentId}/conversations`);
        conversationsRef.once('value').then((snapshot) => {
            const conversations = snapshot.val() || {};
            const conversationCount = Object.keys(conversations).length;
            totalConversations += conversationCount;

            // 統計各日期的對話數
            Object.values(conversations).forEach(conversation => {
                if (conversation.createdAt) {
                    const conversationDate = new Date(conversation.createdAt);

                    if (conversationDate >= today && conversationDate < tomorrow) {
                        todayConversations++;
                    } else if (conversationDate >= yesterday && conversationDate < today) {
                        yesterdayConversations++;
                    } else if (conversationDate >= dayBeforeYesterday && conversationDate < yesterday) {
                        dayBeforeYesterdayConversations++;
                    }
                }
            });

            completedAgents++;

            // 當所有代理的統計都載入完成後，更新顯示
            if (completedAgents === agentIds.length) {
                const totalConversationsEl = document.getElementById('totalConversations');
                const todayConversationsEl = document.getElementById('todayConversations');
                const yesterdayConversationsEl = document.getElementById('yesterdayConversations');
                const dayBeforeYesterdayConversationsEl = document.getElementById('dayBeforeYesterdayConversations');

                if (totalConversationsEl) totalConversationsEl.textContent = totalConversations;
                if (todayConversationsEl) todayConversationsEl.textContent = todayConversations;
                if (yesterdayConversationsEl) yesterdayConversationsEl.textContent = yesterdayConversations;
                if (dayBeforeYesterdayConversationsEl) dayBeforeYesterdayConversationsEl.textContent = dayBeforeYesterdayConversations;
            }
        }).catch((error) => {
            console.error(`載入代理 ${agentId} 的對話統計失敗:`, error);
            completedAgents++;

            if (completedAgents === agentIds.length) {
                const totalConversationsEl = document.getElementById('totalConversations');
                const todayConversationsEl = document.getElementById('todayConversations');
                const yesterdayConversationsEl = document.getElementById('yesterdayConversations');
                const dayBeforeYesterdayConversationsEl = document.getElementById('dayBeforeYesterdayConversations');

                if (totalConversationsEl) totalConversationsEl.textContent = totalConversations;
                if (todayConversationsEl) todayConversationsEl.textContent = todayConversations;
                if (yesterdayConversationsEl) yesterdayConversationsEl.textContent = yesterdayConversations;
                if (dayBeforeYesterdayConversationsEl) dayBeforeYesterdayConversationsEl.textContent = dayBeforeYesterdayConversations;
            }
        });
    });
}

// 載入通知統計（按需載入）
function loadNotificationStats() {
    const agentIds = Object.keys(filteredAgents);
    if (agentIds.length === 0) {
        // 如果沒有代理，直接更新顯示為 0
        const totalNotificationsEl = document.getElementById('totalNotifications');
        const pendingNotificationsEl = document.getElementById('pendingNotifications');
        const pendingKnowledgeBaseEl = document.getElementById('pendingKnowledgeBase');

        if (totalNotificationsEl) totalNotificationsEl.textContent = '0';
        if (pendingNotificationsEl) pendingNotificationsEl.textContent = '0';
        if (pendingKnowledgeBaseEl) pendingKnowledgeBaseEl.textContent = '0';
        return;
    }

    let totalNotifications = 0;
    let pendingNotifications = 0;
    let pendingKnowledgeBase = 0;
    let completedAgents = 0;

    // 按需載入每個代理的通知統計
    agentIds.forEach(agentId => {
        const notificationsRef = database.ref(`agents/${agentId}/notifications`);
        notificationsRef.once('value').then((snapshot) => {
            const notifications = snapshot.val() || {};
            const notificationCount = Object.keys(notifications).length;
            totalNotifications += notificationCount;

            // 計算不同類型的待處理通知數量
            Object.values(notifications).forEach(notification => {
                if (notification.status === 'pending') {
                    if (notification.type === 'knowledge_base_needed') {
                        pendingKnowledgeBase++;
                    } else {
                        pendingNotifications++;
                    }
                }
            });

            completedAgents++;

            // 當所有代理的統計都載入完成後，更新顯示
            if (completedAgents === agentIds.length) {
                const totalNotificationsEl = document.getElementById('totalNotifications');
                const pendingNotificationsEl = document.getElementById('pendingNotifications');
                const pendingKnowledgeBaseEl = document.getElementById('pendingKnowledgeBase');

                if (totalNotificationsEl) totalNotificationsEl.textContent = totalNotifications;
                if (pendingNotificationsEl) pendingNotificationsEl.textContent = pendingNotifications;
                if (pendingKnowledgeBaseEl) pendingKnowledgeBaseEl.textContent = pendingKnowledgeBase;
            }
        }).catch((error) => {
            console.error(`載入代理 ${agentId} 的通知統計失敗:`, error);
            completedAgents++;

            if (completedAgents === agentIds.length) {
                const totalNotificationsEl = document.getElementById('totalNotifications');
                const pendingNotificationsEl = document.getElementById('pendingNotifications');
                const pendingKnowledgeBaseEl = document.getElementById('pendingKnowledgeBase');

                if (totalNotificationsEl) totalNotificationsEl.textContent = totalNotifications;
                if (pendingNotificationsEl) pendingNotificationsEl.textContent = pendingNotifications;
                if (pendingKnowledgeBaseEl) pendingKnowledgeBaseEl.textContent = pendingKnowledgeBase;
            }
        });
    });
}

// 更新最後更新時間
function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const lastUpdateElement = document.getElementById('lastUpdateTime');
    if (lastUpdateElement) {
        lastUpdateElement.textContent = timeString;
    }
}

// 設定表單
function setupForm() {
    const form = document.getElementById('agentForm');
    form.addEventListener('submit', createAgent);

    // 設定登出按鈕事件
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // 初始化知識庫管理
    initializeKnowledgeBaseManager();
}

// 切換自訂 URL 欄位
function toggleCustomUrl() {
    const provider = document.getElementById('llmProvider').value;
    const customUrlGroup = document.getElementById('customUrlGroup');

    if (provider === 'custom') {
        customUrlGroup.style.display = 'block';
        document.getElementById('customUrl').required = true;
    } else {
        customUrlGroup.style.display = 'none';
        document.getElementById('customUrl').required = false;
    }
}

// 切換 LINE Bot 設定顯示
function toggleLineBotSettings() {
    const enableLineBot = document.getElementById('enableLineBot').checked;
    const lineBotSettings = document.getElementById('lineBotSettings');

    if (enableLineBot) {
        lineBotSettings.style.display = 'block';
        // 設定必要欄位
        document.getElementById('lineChannelId').required = true;
        document.getElementById('lineChannelSecret').required = true;
        document.getElementById('lineAccessToken').required = true;

        // 生成 webhook URL（會自動檢測是否在編輯模式）
        generateWebhookUrl();
    } else {
        lineBotSettings.style.display = 'none';
        // 移除必要欄位
        document.getElementById('lineChannelId').required = false;
        document.getElementById('lineChannelSecret').required = false;
        document.getElementById('lineAccessToken').required = false;
    }
}

// 生成 webhook URL
function generateWebhookUrl(agentId = null) {
    const webhookUrlDisplay = document.getElementById('webhookUrlDisplay');
    if (webhookUrlDisplay) {
        let displayAgentId = agentId;

        // 如果沒有提供 agentId，檢查是否在編輯模式
        if (!displayAgentId) {
            // 檢查是否在編輯代理模式
            const editForm = document.getElementById('agentForm');
            if (editForm && editForm.dataset.editingAgentId) {
                displayAgentId = editForm.dataset.editingAgentId;
            } else {
                displayAgentId = 'your-agent-id';
            }
        }

        const webhookUrl = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/lineWebhook?agentId=${displayAgentId}`;
        webhookUrlDisplay.value = webhookUrl;
    }
}

// 複製 webhook URL
function copyWebhookUrl() {
    const webhookUrlDisplay = document.getElementById('webhookUrlDisplay');
    if (webhookUrlDisplay) {
        webhookUrlDisplay.select();
        webhookUrlDisplay.setSelectionRange(0, 99999); // 對於行動裝置

        try {
            document.execCommand('copy');

            // 顯示複製成功提示
            const copyBtn = document.querySelector('.copy-btn');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅ 已複製';
            copyBtn.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
            }, 2000);

        } catch (err) {
            console.error('複製失敗:', err);
            alert('複製失敗，請手動複製 URL');
        }
    }
}

// 使用真實的代理 ID 更新 webhook URL
function updateWebhookUrlWithAgentId(agentId) {
    const webhookUrlDisplay = document.getElementById('webhookUrlDisplay');
    if (webhookUrlDisplay) {
        const webhookUrl = `https://${firebaseConfig.projectId}.cloudfunctions.net/lineWebhook?agentId=${agentId}`;
        webhookUrlDisplay.value = webhookUrl;

        // 高亮顯示 URL
        webhookUrlDisplay.style.border = '2px solid #4CAF50';
        webhookUrlDisplay.style.background = 'rgba(76, 175, 80, 0.1)';

        setTimeout(() => {
            webhookUrlDisplay.style.border = '1px solid rgba(102, 126, 234, 0.5)';
            webhookUrlDisplay.style.background = 'rgba(0, 0, 0, 0.3)';
        }, 3000);
    }
}

// 建立代理
function createAgent(event) {
    event.preventDefault();

    // 初始化知識庫計數器
    initializeKnowledgeBaseCounter();

    const name = document.getElementById('agentName').value;
    const description = document.getElementById('agentDescription').value;
    const avatarImageUrl = document.getElementById('avatarImageUrl').value;
    const provider = document.getElementById('llmProvider').value;
    const apiKey = document.getElementById('apiKey').value;
    const customUrl = document.getElementById('customUrl').value;

    // 驗證知識庫
    if (knowledgeBases.length === 0 || knowledgeBases.every(kb => !kb.content.trim())) {
        alert('請至少添加一個有內容的知識庫');
        return;
    }

    // 處理知識庫 ID 格式，轉換為資料庫格式
    const processedKnowledgeBases = knowledgeBases.map(kb => {
        const processedKb = { ...kb };
        // 如果 ID 是 kb_X 格式，轉換為數字 ID
        if (typeof processedKb.id === 'string' && processedKb.id.startsWith('kb_')) {
            const numericId = processedKb.id.replace('kb_', '');
            processedKb.id = numericId;
        }
        return processedKb;
    });

    const agentData = {
        name: name,
        description: description,
        avatarImageUrl: avatarImageUrl || null,
        knowledgeBases: processedKnowledgeBases, // 多份知識庫
        llmConfig: {
            provider: provider,
            apiKey: apiKey
        },
        ownerId: currentUser.uid, // 存儲使用者 ID
        createdAt: Date.now(),
        updatedAt: Date.now(),
        // 初始化統計資訊
        stats: {
            conversationCount: 0,
            knowledgeBaseCount: processedKnowledgeBases.length,
            lastUpdated: Date.now()
        }
    };

    if (provider === 'custom' && customUrl) {
        agentData.llmConfig.customUrl = customUrl;
    }

    // 處理對話入口網址
    const chatUrl = document.getElementById('chatUrl').value;
    if (chatUrl) {
        agentData.chatUrl = chatUrl;
    }

    // 處理 LINE Bot 設定
    const enableLineBot = document.getElementById('enableLineBot').checked;
    if (enableLineBot) {
        const lineChannelId = document.getElementById('lineChannelId').value;
        const lineChannelSecret = document.getElementById('lineChannelSecret').value;
        const lineAccessToken = document.getElementById('lineAccessToken').value;
        const lineWelcomeMessage = document.getElementById('lineWelcomeMessage').value;
        const lineFallbackMessage = document.getElementById('lineFallbackMessage').value;

        // 驗證 LINE Bot 必要欄位
        if (!lineChannelId || !lineChannelSecret || !lineAccessToken) {
            alert('請填寫完整的 LINE Bot 設定資訊');
            return;
        }

        agentData.lineBot = {
            enabled: true,
            channelId: lineChannelId,
            channelSecret: lineChannelSecret,
            accessToken: lineAccessToken,
            webhookUrl: `https://${firebaseConfig.projectId}.cloudfunctions.net/lineWebhook?agentId=${agentId}`,
            settings: {
                autoReply: true,
                welcomeMessage: lineWelcomeMessage || '歡迎使用 AI 客服！',
                fallbackMessage: lineFallbackMessage || '抱歉，我無法理解您的問題。',
                maxRetries: 3,
                typingDelay: 1000
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    // 儲存到 Firebase
    const agentsRef = database.ref('agents');
    agentsRef.push(agentData).then((snapshot) => {
        const agentId = snapshot.key;

        // 更新 webhook URL 顯示
        updateWebhookUrlWithAgentId(agentId);

        alert('代理建立成功！\n\nWebhook URL 已生成，請複製到 LINE Developers Console 中使用。\n請在對話入口網址欄位中輸入您的 LINE 官方聊天管理網址或自訂對話入口網址。');
        document.getElementById('agentForm').reset();
        document.getElementById('customUrlGroup').style.display = 'none';
        // 重置知識庫
        knowledgeBases = [];
        knowledgeBaseCounter = 0;
        initializeKnowledgeBaseManager();
        switchTab('agents');
    }).catch((error) => {
        alert('建立代理時發生錯誤：' + error.message);
    });
}

// 編輯代理
function editAgent(agentId) {
    // 從 Firebase 載入完整的代理資料（不依賴快取）
    const agentRef = database.ref(`agents/${agentId}`);
    agentRef.once('value').then((snapshot) => {
        const agent = snapshot.val();
        if (!agent) {
            alert('代理不存在或已被刪除');
            return;
        }

        // 設定編輯模式標記
        const editForm = document.getElementById('agentForm');
        if (!editForm) {
            console.error('找不到代理表單');
            return;
        }
        editForm.dataset.editingAgentId = agentId;

        // 填入表單資料
        const agentNameEl = document.getElementById('agentName');
        const agentDescriptionEl = document.getElementById('agentDescription');
        const avatarImageUrlEl = document.getElementById('avatarImageUrl');
        const llmProviderEl = document.getElementById('llmProvider');
        const apiKeyEl = document.getElementById('apiKey');
        const customUrlEl = document.getElementById('customUrl');
        const chatUrlEl = document.getElementById('chatUrl');

        if (agentNameEl) agentNameEl.value = agent.name || '';
        if (agentDescriptionEl) agentDescriptionEl.value = agent.description || '';
        if (avatarImageUrlEl) avatarImageUrlEl.value = agent.avatarImageUrl || '';
        if (llmProviderEl) llmProviderEl.value = agent.llmConfig?.provider || 'openai';
        if (apiKeyEl) apiKeyEl.value = agent.llmConfig?.apiKey || '';
        if (customUrlEl) customUrlEl.value = agent.llmConfig?.customUrl || '';
        if (chatUrlEl) chatUrlEl.value = agent.chatUrl || '';

        // 填入 LINE Bot 設定
        const enableLineBotEl = document.getElementById('enableLineBot');
        if (agent.lineBot && agent.lineBot.enabled) {
            if (enableLineBotEl) enableLineBotEl.checked = true;
            const lineChannelIdEl = document.getElementById('lineChannelId');
            const lineChannelSecretEl = document.getElementById('lineChannelSecret');
            const lineAccessTokenEl = document.getElementById('lineAccessToken');
            const lineWelcomeMessageEl = document.getElementById('lineWelcomeMessage');
            const lineFallbackMessageEl = document.getElementById('lineFallbackMessage');

            if (lineChannelIdEl) lineChannelIdEl.value = agent.lineBot.channelId || '';
            if (lineChannelSecretEl) lineChannelSecretEl.value = agent.lineBot.channelSecret || '';
            if (lineAccessTokenEl) lineAccessTokenEl.value = agent.lineBot.accessToken || '';
            if (lineWelcomeMessageEl) lineWelcomeMessageEl.value = agent.lineBot.settings?.welcomeMessage || '';
            if (lineFallbackMessageEl) lineFallbackMessageEl.value = agent.lineBot.settings?.fallbackMessage || '';
            toggleLineBotSettings();

            // 更新 webhook URL 顯示真實的代理 ID
            generateWebhookUrl(agentId);
        } else {
            if (enableLineBotEl) enableLineBotEl.checked = false;
            toggleLineBotSettings();
        }

        // 載入知識庫（從完整資料中載入）
        if (agent.knowledgeBases && Array.isArray(agent.knowledgeBases)) {
            knowledgeBases = agent.knowledgeBases.map(kb => {
                // 確保 ID 格式正確，如果是數字 ID 則轉換為 kb_X 格式
                let kbId = kb.id;
                if (typeof kbId === 'number' || /^\d+$/.test(kbId)) {
                    kbId = `kb_${kbId}`;
                }
                return { ...kb, id: kbId };
            });

            // 清理重複的知識庫 ID
            knowledgeBases = cleanDuplicateKnowledgeBases(knowledgeBases);
        } else if (agent.knowledgeBase) {
            // 相容舊格式
            knowledgeBases = [{
                id: 'kb_1',
                title: '知識庫 1',
                content: agent.knowledgeBase
            }];
        } else {
            knowledgeBases = [{
                id: 'kb_1',
                title: '知識庫 1',
                content: ''
            }];
        }

        // 初始化知識庫計數器
        initializeKnowledgeBaseCounter();

        renderKnowledgeBases();

        toggleCustomUrl();
        switchTab('create');

        // 修改表單提交行為
        const form = document.getElementById('agentForm');
        if (form) {
            // 移除舊的事件監聽器
            if (form._updateHandler) {
                form.removeEventListener('submit', form._updateHandler);
            }
            if (form._createHandler) {
                form.removeEventListener('submit', form._createHandler);
            }

            // 添加新的事件監聽器
            const updateHandler = function (event) {
                event.preventDefault();
                updateAgent(agentId);
            };

            form.addEventListener('submit', updateHandler);

            // 儲存更新處理器引用，以便後續移除
            form._updateHandler = updateHandler;

            // 修改按鈕文字
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.textContent = '更新代理';
            }
        }
    }).catch((error) => {
        console.error('載入代理資料失敗:', error);
        alert('載入代理資料失敗：' + error.message);
    });
}

// 更新代理
function updateAgent(agentId) {
    try {
        const name = document.getElementById('agentName').value;
        const description = document.getElementById('agentDescription').value;
        const avatarImageUrl = document.getElementById('avatarImageUrl').value;
        const provider = document.getElementById('llmProvider').value;
        const apiKey = document.getElementById('apiKey').value;
        const customUrl = document.getElementById('customUrl').value;

        // 驗證知識庫
        if (knowledgeBases.length === 0 || knowledgeBases.every(kb => !kb.content.trim())) {
            alert('請至少添加一個有內容的知識庫');
            return;
        }

        // 處理知識庫 ID 格式，轉換為資料庫格式
        const processedKnowledgeBases = knowledgeBases.map(kb => {
            const processedKb = { ...kb };
            // 如果 ID 是 kb_X 格式，轉換為數字 ID
            if (typeof processedKb.id === 'string' && processedKb.id.startsWith('kb_')) {
                const numericId = processedKb.id.replace('kb_', '');
                processedKb.id = numericId;
            }
            return processedKb;
        });

        const agentData = {
            name: name,
            description: description,
            avatarImageUrl: avatarImageUrl || null,
            knowledgeBases: processedKnowledgeBases, // 多份知識庫
            llmConfig: {
                provider: provider,
                apiKey: apiKey
            },
            updatedAt: Date.now(),
            // 更新統計資訊
            'stats/knowledgeBaseCount': processedKnowledgeBases.length,
            'stats/lastUpdated': Date.now()
        };

        if (provider === 'custom' && customUrl) {
            agentData.llmConfig.customUrl = customUrl;
        }

        // 處理對話入口網址
        const chatUrl = document.getElementById('chatUrl').value;
        if (chatUrl) {
            agentData.chatUrl = chatUrl;
        }

        // 處理 LINE Bot 設定
        const enableLineBot = document.getElementById('enableLineBot').checked;
        if (enableLineBot) {
            const lineChannelId = document.getElementById('lineChannelId').value;
            const lineChannelSecret = document.getElementById('lineChannelSecret').value;
            const lineAccessToken = document.getElementById('lineAccessToken').value;
            const lineWelcomeMessage = document.getElementById('lineWelcomeMessage').value;
            const lineFallbackMessage = document.getElementById('lineFallbackMessage').value;

            // 驗證 LINE Bot 必要欄位
            if (!lineChannelId || !lineChannelSecret || !lineAccessToken) {
                alert('請填寫完整的 LINE Bot 設定資訊');
                return;
            }

            agentData.lineBot = {
                enabled: true,
                channelId: lineChannelId,
                channelSecret: lineChannelSecret,
                accessToken: lineAccessToken,
                webhookUrl: `https://${firebaseConfig.projectId}.cloudfunctions.net/lineWebhook?agentId=${agentId}`,
                settings: {
                    autoReply: true,
                    welcomeMessage: lineWelcomeMessage || '歡迎使用 AI 客服！',
                    fallbackMessage: lineFallbackMessage || '抱歉，我無法理解您的問題。',
                    maxRetries: 3,
                    typingDelay: 1000
                },
                updatedAt: Date.now()
            };
        } else {
            // 如果取消啟用 LINE Bot，設定為禁用
            agentData.lineBot = {
                enabled: false,
                updatedAt: Date.now()
            };
        }

        // 更新到 Firebase
        const agentRef = database.ref(`agents/${agentId}`);
        agentRef.update(agentData).then(() => {
            alert('代理更新成功！\n對話入口網址已儲存。');

            // 清除編輯模式標記
            const editForm = document.getElementById('agentForm');
            delete editForm.dataset.editingAgentId;

            // 重置表單
            document.getElementById('agentForm').reset();
            document.getElementById('customUrlGroup').style.display = 'none';

            // 重置知識庫
            knowledgeBases = [];
            knowledgeBaseCounter = 0;

            try {
                initializeKnowledgeBaseManager();
            } catch (error) {
                console.error('初始化知識庫管理器失敗:', error);
            }

            // 重置按鈕文字
            const submitBtn = document.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.textContent = '建立代理';
            }

            // 重置表單提交行為
            const form = document.getElementById('agentForm');

            // 移除更新處理器
            if (form._updateHandler) {
                form.removeEventListener('submit', form._updateHandler);
                delete form._updateHandler;
            }

            // 重新添加默認的 createAgent 事件監聽器
            form.addEventListener('submit', createAgent);

            // 切換到代理列表
            switchTab('agents');
        }).catch((error) => {
            console.error('更新代理錯誤:', error);
            alert('更新代理時發生錯誤：' + error.message);
        });
    } catch (error) {
        console.error('更新代理函數錯誤:', error);
        alert('更新代理時發生錯誤：' + error.message);
    }
}

// 刪除代理
function deleteAgent(agentId) {
    if (confirm('確定要刪除這個代理嗎？此操作無法復原。')) {
        const agentRef = database.ref(`agents/${agentId}`);
        agentRef.remove().then(() => {
            // 代理已刪除，無需提示
        }).catch((error) => {
            alert('刪除代理時發生錯誤：' + error.message);
        });
    }
}

// 設定測試功能
function setupTestFeatures() {
    // 設定清空對話按鈕
    document.getElementById('clearChatBtn').addEventListener('click', clearTestChat);

    // 設定發送訊息按鈕
    document.getElementById('sendTestMessage').addEventListener('click', sendTestMessage);

    // 設定 Widget 測試按鈕
    document.getElementById('testWidgetBtn').addEventListener('click', startWidgetTest);
}

// 載入測試代理
function loadTestAgent() {
    const agentId = document.getElementById('testAgentSelect').value;
    if (!agentId) {
        document.getElementById('testAgentInfo').style.display = 'none';
        document.getElementById('testChat').style.display = 'none';
        return;
    }

    const agent = agents[agentId];
    if (!agent) return;

    // 顯示代理資訊
    document.getElementById('testAgentName').textContent = agent.name;
    document.getElementById('testAgentDescription').textContent = agent.description || '無描述';
    document.getElementById('testAgentProvider').textContent = getProviderName(agent.llmConfig?.provider || 'unknown');

    // 計算知識庫總長度（支援多份知識庫和舊格式）
    let totalKnowledgeLength = 0;
    if (agent.knowledgeBases && Array.isArray(agent.knowledgeBases)) {
        // 新格式：多份知識庫
        totalKnowledgeLength = agent.knowledgeBases.reduce((total, kb) => total + (kb.content ? kb.content.length : 0), 0);
    } else if (agent.knowledgeBase) {
        // 舊格式：單一知識庫
        totalKnowledgeLength = agent.knowledgeBase.length;
    }

    document.getElementById('testAgentKnowledgeLength').textContent = `${totalKnowledgeLength} 字元`;

    document.getElementById('testAgentInfo').style.display = 'block';
    document.getElementById('testChat').style.display = 'block';

    // 清空之前的對話
    clearTestChat();
}

// 清空測試對話
function clearTestChat() {
    const messagesContainer = document.getElementById('chatMessages');
    messagesContainer.innerHTML = `
        <div class="welcome-message">
            <p>👋 您好！我是您的 AI 客服代理，請輸入您的問題開始對話。</p>
        </div>
    `;
}

// 處理測試按鍵事件
function handleTestKeyPress(event) {
    if (event.key === 'Enter') {
        sendTestMessage();
    }
}

// 發送測試訊息
async function sendTestMessage() {
    const input = document.getElementById('testMessageInput');
    const message = input.value.trim();

    if (!message) return;

    const agentId = document.getElementById('testAgentSelect').value;
    if (!agentId) {
        alert('請先選擇一個代理');
        return;
    }

    const agent = agents[agentId];
    if (!agent) return;

    // 清空輸入框
    input.value = '';

    // 顯示使用者訊息
    addTestMessage(message, 'user');

    // 顯示載入動畫
    showTestTyping();

    try {
        // 取得 AI 回應
        const response = await getTestAIResponse(message, agent);

        // 隱藏載入動畫
        hideTestTyping();

        // 顯示 AI 回應
        addTestMessage(response, 'assistant');

    } catch (error) {
        console.error('AI 回應錯誤:', error);
        hideTestTyping();

        // 根據錯誤類型顯示不同的訊息
        let errorMessage = '抱歉，我暫時無法回應。';

        if (error.message.includes('API 錯誤: 401')) {
            errorMessage = 'API Key 無效，請檢查設定。';
        } else if (error.message.includes('API 錯誤: 403')) {
            errorMessage = 'API 權限不足，請檢查 API Key 權限。';
        } else if (error.message.includes('API 錯誤: 404')) {
            errorMessage = 'API 端點不存在，請檢查 LLM 提供商設定。';
        } else if (error.message.includes('API 錯誤: 429')) {
            errorMessage = 'API 請求過於頻繁，請稍後再試。';
        } else if (error.message.includes('API 錯誤: 500')) {
            errorMessage = 'API 伺服器錯誤，請稍後再試。';
        } else if (error.message.includes('API 錯誤: 503')) {
            errorMessage = 'AI 服務暫時不可用，請稍後再試。我們已經自動重試，如果問題持續，請檢查服務狀態。';
        } else if (error.message.includes('不支援的 LLM 提供商')) {
            errorMessage = '不支援的 LLM 提供商，請檢查代理設定。';
        }

        addTestMessage(errorMessage, 'assistant', true);
    }
}

// 取得測試 AI 回應
async function getTestAIResponse(message, agent) {
    const { llmConfig, knowledgeBases, knowledgeBase, description } = agent;

    // 建立提示詞，使用代理的 system prompt
    const systemPrompt = description || '你是一個專業的客服代理。';

    // 處理知識庫（支援多份知識庫和舊格式）
    let knowledgeContent = '';
    if (knowledgeBases && Array.isArray(knowledgeBases)) {
        // 新格式：多份知識庫
        knowledgeBases.forEach((kb, index) => {
            if (kb.content && kb.content.trim()) {
                knowledgeContent += `知識庫 ${index + 1} (${kb.title || `知識庫 ${index + 1}`}):\n${kb.content}\n\n`;
            }
        });
    } else if (knowledgeBase) {
        // 舊格式：單一知識庫
        knowledgeContent = `知識庫：\n${knowledgeBase}`;
    }

    if (!knowledgeContent.trim()) {
        knowledgeContent = '無知識庫內容';
    }

    const prompt = `${systemPrompt}

${knowledgeContent}

使用者問題：${message}

請提供有用且準確的回答：`;

    // 根據不同的 LLM 提供商發送請求
    switch (llmConfig.provider) {
        case 'openai':
            return await callTestOpenAI(prompt, llmConfig.apiKey);
        case 'gemini':
            return await callTestGemini(prompt, llmConfig.apiKey);
        case 'custom':
            return await callTestCustomAPI(prompt, llmConfig.apiKey, llmConfig.customUrl);
        default:
            throw new Error('不支援的 LLM 提供商');
    }
}

// 呼叫測試 OpenAI API
async function callTestOpenAI(prompt, apiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'user', content: prompt }
            ],
            max_tokens: 1000,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        throw new Error(`OpenAI API 錯誤: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// 呼叫測試 Gemini API（帶重試機制）
async function callTestGemini(prompt, apiKey, retryCount = 0) {
    const maxRetries = 2;
    const retryDelay = 1000 * (retryCount + 1); // 遞增延遲：1s, 2s, 3s

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || response.statusText;

            // 如果是 503 錯誤且還有重試次數，則重試
            if (response.status === 503 && retryCount < maxRetries) {
                console.log(`Gemini API 503 錯誤，${retryDelay}ms 後重試 (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return await callTestGemini(prompt, apiKey, retryCount + 1);
            }

            // 根據錯誤狀態碼提供具體的錯誤訊息
            let userMessage = 'Gemini API 服務暫時不可用';

            switch (response.status) {
                case 400:
                    userMessage = '請求格式錯誤，請檢查 API Key 和請求內容';
                    break;
                case 401:
                    userMessage = 'API Key 無效，請檢查您的 Gemini API Key';
                    break;
                case 403:
                    userMessage = 'API 權限不足，請檢查 API Key 權限設定';
                    break;
                case 404:
                    userMessage = 'API 端點不存在，請檢查模型名稱';
                    break;
                case 429:
                    userMessage = 'API 請求過於頻繁，請稍後再試';
                    break;
                case 500:
                    userMessage = 'Gemini 服務器內部錯誤，請稍後再試';
                    break;
                case 503:
                    userMessage = 'Gemini 服務暫時不可用，請稍後再試';
                    break;
                default:
                    userMessage = `Gemini API 錯誤 (${response.status}): ${errorMessage}`;
            }

            throw new Error(userMessage);
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Gemini API 回應格式錯誤，請稍後再試');
        }

        return data.candidates[0].content.parts[0].text;

    } catch (error) {
        // 如果是網路錯誤且還有重試次數，則重試
        if (error.name === 'TypeError' && retryCount < maxRetries) {
            console.log(`網路錯誤，${retryDelay}ms 後重試 (${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return await callTestGemini(prompt, apiKey, retryCount + 1);
        }

        throw error;
    }
}

// 呼叫測試自訂 API
async function callTestCustomAPI(prompt, apiKey, customUrl) {
    const response = await fetch(customUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            messages: [
                { role: 'user', content: prompt }
            ]
        })
    });

    if (!response.ok) {
        throw new Error(`自訂 API 錯誤: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    return data.response || data.message || data.content;
}

// 新增測試訊息到聊天視窗
function addTestMessage(content, role, isError = false) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');

    if (isError) {
        messageDiv.className = 'error-message';
    } else {
        messageDiv.className = `message ${role}`;
    }

    messageDiv.textContent = content;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 顯示測試載入動畫
function showTestTyping() {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.style.display = 'flex';
}

// 隱藏測試載入動畫
function hideTestTyping() {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.style.display = 'none';
}

// 更新測試代理選擇器
function updateTestAgentSelect() {
    const select = document.getElementById('testAgentSelect');
    if (!select) return;

    // 清空現有選項
    select.innerHTML = '<option value="">請選擇要測試的代理</option>';

    // 添加代理選項（使用過濾後的代理）
    Object.keys(filteredAgents).forEach(agentId => {
        const agent = filteredAgents[agentId];
        const option = document.createElement('option');
        option.value = agentId;
        option.textContent = agent.name;
        select.appendChild(option);
    });
}

// Widget 測試功能
function startWidgetTest() {
    const agentId = document.getElementById('testAgentSelect').value;
    if (!agentId) {
        alert('請先選擇一個代理');
        return;
    }

    const agent = agents[agentId];
    if (!agent) {
        alert('代理不存在');
        return;
    }

    // 顯示 Widget 測試區域
    document.getElementById('widgetTest').style.display = 'block';

    // 載入 Widget
    loadWidgetForTest(agentId, agent);
}

// 載入 Widget 進行測試
function loadWidgetForTest(agentId, agent) {
    const widgetContainer = document.getElementById('widgetContainer');

    // 清空容器
    widgetContainer.innerHTML = '';

    // 建立 Widget 元素
    const widgetElement = document.createElement('ai-convai');
    widgetElement.setAttribute('agent-id', agentId);

    // 如果有頭像圖片，設定頭像
    if (agent.avatarImageUrl) {
        widgetElement.setAttribute('avatar-image-url', agent.avatarImageUrl);
    }

    // 添加到容器
    widgetContainer.appendChild(widgetElement);

    // 載入 Widget 腳本
    loadWidgetScript();

    // 等待 Widget 初始化完成後，調整樣式
    setTimeout(() => {
        adjustWidgetForTestEnvironment();
    }, 1000);
}

// 調整 Widget 在測試環境中的樣式
function adjustWidgetForTestEnvironment() {
    const widget = document.querySelector('#widgetContainer .ai-convai-widget');
    const chat = document.querySelector('#widgetContainer .ai-convai-chat');
    const button = document.querySelector('#widgetContainer .ai-convai-button');

    if (widget) {
        // 確保 Widget 在測試容器中正確定位
        widget.style.position = 'relative';
        widget.style.bottom = 'auto';
        widget.style.right = 'auto';
        widget.style.zIndex = '1000';
    }

    if (chat) {
        // 確保聊天視窗相對於按鈕定位
        chat.style.position = 'absolute';
        chat.style.bottom = '80px';
        chat.style.right = '0';
        chat.style.zIndex = '1001';
    }

    if (button) {
        // 確保按鈕在測試環境中可見
        button.style.position = 'relative';
        button.style.margin = '20px auto';
        button.style.display = 'block';
    }
}

// 載入 Widget 腳本
function loadWidgetScript() {
    // 檢查是否已經載入
    if (document.querySelector('script[src*="ai-convai-widget-standalone.js"]')) {
        return;
    }

    const script = document.createElement('script');
    script.src = 'https://ees-ai.web.app/ai-convai-widget-standalone.js';
    script.async = true;
    script.type = 'text/javascript';

    script.onload = function () {
        console.log('Widget 腳本已載入');
    };

    script.onerror = function () {
        console.error('Widget 腳本載入失敗');
        alert('Widget 腳本載入失敗，請檢查網路連接');
    };

    document.head.appendChild(script);
}

// 知識庫管理功能
function initializeKnowledgeBaseManager() {
    // 如果沒有知識庫，添加預設知識庫
    if (knowledgeBases.length === 0) {
        addKnowledgeBase();
    }
}

// 清理重複的知識庫 ID
function cleanDuplicateKnowledgeBases(knowledgeBases) {
    const seen = new Set();
    const cleaned = [];
    let nextId = 1;

    for (const kb of knowledgeBases) {
        let kbId = kb.id;

        // 如果 ID 已存在，生成新的 ID
        if (seen.has(kbId)) {
            // 找到下一個可用的 ID
            while (seen.has(`kb_${nextId}`)) {
                nextId++;
            }
            kbId = `kb_${nextId}`;
            nextId++;
        }

        seen.add(kbId);
        cleaned.push({ ...kb, id: kbId });
    }


    return cleaned;
}

// 初始化知識庫計數器
function initializeKnowledgeBaseCounter() {
    if (knowledgeBases.length === 0) {
        knowledgeBaseCounter = 0;
        return;
    }

    // 從現有知識庫的最大 ID 開始計算
    const existingIds = knowledgeBases.map(kb => {
        const match = kb.id.match(/kb_(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }).filter(id => id > 0); // 過濾掉無效的 ID

    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    knowledgeBaseCounter = maxId;

}

// 新增知識庫
function addKnowledgeBase() {
    // 找到所有現有的數字 ID
    const existingIds = knowledgeBases.map(kb => {
        const match = kb.id.match(/kb_(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }).filter(id => id > 0); // 過濾掉無效的 ID

    // 找到下一個可用的 ID
    let nextId = 1;
    if (existingIds.length > 0) {
        const maxId = Math.max(...existingIds);
        // 檢查是否有空缺的 ID
        for (let i = 1; i <= maxId + 1; i++) {
            if (!existingIds.includes(i)) {
                nextId = i;
                break;
            }
        }
    }

    const knowledgeBase = {
        id: `kb_${nextId}`,
        title: `知識庫 ${nextId}`,
        content: '',
        keywords: [], // 新增關鍵字欄位
        aiGenerated: false // 標記是否為 AI 生成
    };

    knowledgeBases.push(knowledgeBase);
    renderKnowledgeBases();
}

// 刪除知識庫
function removeKnowledgeBase(id) {
    if (knowledgeBases.length <= 1) {
        alert('至少需要保留一個知識庫');
        return;
    }

    knowledgeBases = knowledgeBases.filter(kb => kb.id !== id);
    renderKnowledgeBases();
}

// 更新知識庫標題
function updateKnowledgeBaseTitle(id, title) {
    const kb = knowledgeBases.find(kb => kb.id === id);
    if (kb) {
        kb.title = title;
    }
}

// AI 生成關鍵字功能
async function generateKeywordsWithAI(content, title) {
    if (!content || content.trim().length < 10) {
        return [];
    }

    try {
        // 直接從表單讀取 LLM 配置
        const llmProvider = document.getElementById('llmProvider')?.value;
        const apiKey = document.getElementById('apiKey')?.value;

        if (!llmProvider) {
            throw new Error('請先選擇 LLM 提供商');
        }

        if (!apiKey) {
            throw new Error('請先設定 API key');
        }

        // 根據 LLM 提供商選擇 API
        const prompt = `請分析以下知識庫內容，生成相關的關鍵字，用於智能匹配用戶問題：

標題：${title}
內容：${content}

請直接返回 JSON 陣列格式，不要使用 markdown 代碼塊，不要包含任何其他文字，只返回純 JSON 格式。

要求：
1. 主要概念關鍵字
2. 相關術語
3. 用戶可能使用的查詢詞
4. 中英文關鍵字

直接返回格式（不要包含代碼塊標記）：
["關鍵字1", "關鍵字2", "keyword3", "關鍵字4"]`;

        let response;

        if (llmProvider === 'gemini') {
            // 使用 Gemini API
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 200
                    }
                })
            });
        } else if (llmProvider === 'openai') {
            // 使用 OpenAI API
            response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{
                        role: 'user',
                        content: prompt
                    }],
                    temperature: 0.3,
                    max_tokens: 200
                })
            });
        } else {
            throw new Error('不支援的 LLM 提供商');
        }

        if (!response.ok) {
            throw new Error(`API 錯誤: ${response.status}`);
        }

        const data = await response.json();
        let generatedText;

        if (llmProvider === 'gemini') {
            generatedText = data.candidates[0].content.parts[0].text;
        } else if (llmProvider === 'openai') {
            generatedText = data.choices[0].message.content;
        }

        // 解析 JSON 回應
        try {
            let jsonText = generatedText;

            // 確保 generatedText 是字串類型
            if (typeof generatedText !== 'string') {
                generatedText = String(generatedText);
            }

            // 處理 markdown 格式的 JSON 代碼塊
            const jsonCodeBlockMatch = generatedText.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonCodeBlockMatch) {
                jsonText = jsonCodeBlockMatch[1].trim();
            }

            // 處理普通 JSON 格式
            const keywords = JSON.parse(jsonText);
            if (Array.isArray(keywords)) {
                return keywords; // 不限制關鍵字數量
            }
        } catch (parseError) {
            console.warn('AI 回應格式錯誤，使用備用解析:', parseError);

            // 備用解析 1：嘗試提取 JSON 陣列格式
            const arrayMatch = generatedText.match(/\[[\s\S]*?\]/);
            if (arrayMatch) {
                try {
                    const keywords = JSON.parse(arrayMatch[0]);
                    if (Array.isArray(keywords)) {
                        return keywords;
                    }
                } catch (e) {
                    // 繼續嘗試其他解析方式
                }
            }

            // 備用解析 2：提取引號內的內容
            const keywordMatches = generatedText.match(/"([^"]+)"/g);
            if (keywordMatches) {
                return keywordMatches.map(match => match.replace(/"/g, ''));
            }

            // 備用解析 3：提取單引號內的內容
            const singleQuoteMatches = generatedText.match(/'([^']+)'/g);
            if (singleQuoteMatches) {
                return singleQuoteMatches.map(match => match.replace(/'/g, ''));
            }
        }

        return [];
    } catch (error) {
        console.error('AI 生成關鍵字失敗:', error);
        return [];
    }
}

// 為知識庫生成關鍵字
async function generateKeywordsForKnowledgeBase(id) {
    console.log('generateKeywordsForKnowledgeBase 被調用，ID:', id);
    console.log('當前知識庫列表:', knowledgeBases.map(kb => ({ id: kb.id, title: kb.title })));

    const kb = knowledgeBases.find(kb => kb.id === id);
    if (!kb || !kb.content) {
        alert('請先填寫知識庫內容');
        return;
    }

    console.log('找到知識庫:', kb.title, 'ID:', kb.id);

    // 檢查 LLM 配置
    const llmProvider = document.getElementById('llmProvider')?.value;
    const apiKey = document.getElementById('apiKey')?.value;

    if (!llmProvider) {
        alert('請先選擇 LLM 提供商');
        return;
    }

    if (!apiKey) {
        alert('請先設定 API key');
        return;
    }

    // 顯示載入狀態
    const button = document.querySelector(`.generate-keywords-btn[data-kb-id="${id}"]`);
    if (button) {
        const originalText = button.textContent;
        button.textContent = 'AI 分析中...';
        button.disabled = true;

        // 保存原始文字以便恢復
        button._originalText = originalText;
    }

    try {
        const keywords = await generateKeywordsWithAI(kb.content, kb.title);

        if (keywords.length > 0) {
            kb.keywords = keywords;
            kb.aiGenerated = true;

            preserveKnowledgeBaseStates(() => {
                renderKnowledgeBases();
            });

            alert(`已生成 ${keywords.length} 個關鍵字：\n${keywords.join(', ')}`);
        } else {
            alert('AI 無法生成關鍵字，請手動添加');
        }
    } catch (error) {
        console.error('生成關鍵字失敗:', error);
        if (error.message.includes('請先選擇 LLM 提供商')) {
            alert('請先選擇 LLM 提供商');
        } else if (error.message.includes('請先設定 API key')) {
            alert('請先設定 API key');
        } else if (error.message.includes('不支援的 LLM 提供商')) {
            alert('不支援的 LLM 提供商，請選擇 Gemini 或 OpenAI');
        } else {
            alert('生成關鍵字失敗，請稍後再試');
        }
    } finally {
        if (button) {
            button.textContent = button._originalText || '🤖 AI 生成關鍵字';
            button.disabled = false;
        }
    }
}

// 手動添加關鍵字
function addKeywordToKnowledgeBase(id, keyword) {
    const kb = knowledgeBases.find(kb => kb.id === id);
    if (kb && keyword && keyword.trim()) {
        const trimmedKeyword = keyword.trim();
        if (!kb.keywords.includes(trimmedKeyword)) {
            kb.keywords.push(trimmedKeyword);

            preserveKnowledgeBaseStates(() => {
                renderKnowledgeBases();
            });
        }
    }
}

// 移除關鍵字
function removeKeywordFromKnowledgeBase(id, keyword) {
    const kb = knowledgeBases.find(kb => kb.id === id);
    if (kb) {
        kb.keywords = kb.keywords.filter(k => k !== keyword);

        preserveKnowledgeBaseStates(() => {
            renderKnowledgeBases();
        });
    }
}

// 保存和恢復知識庫收折狀態的通用函數
function preserveKnowledgeBaseStates(callback) {
    // 保存當前收折狀態
    const currentStates = {};
    document.querySelectorAll('.knowledge-base-item').forEach(item => {
        const kbId = item.querySelector('[data-kb-id]')?.getAttribute('data-kb-id');
        if (kbId) {
            currentStates[kbId] = !item.classList.contains('collapsed');
        }
    });

    // 執行回調函數
    callback();

    // 恢復收折狀態
    Object.keys(currentStates).forEach(kbId => {
        const item = document.querySelector(`[data-kb-id="${kbId}"]`)?.closest('.knowledge-base-item');
        if (item) {
            if (currentStates[kbId]) {
                item.classList.remove('collapsed');
            } else {
                item.classList.add('collapsed');
            }
        }
    });
}

// 更新知識庫內容
function updateKnowledgeBaseContent(id, content) {
    const kb = knowledgeBases.find(kb => kb.id === id);
    if (kb) {
        kb.content = content;
    }
}

// 渲染知識庫列表
function renderKnowledgeBases() {
    try {
        const container = document.getElementById('knowledgeBaseList');
        if (!container) {
            console.error('知識庫容器不存在');
            return;
        }

        container.innerHTML = '';

        knowledgeBases.forEach(kb => {
            const kbElement = document.createElement('div');
            kbElement.className = 'knowledge-base-item';

            // 安全地處理標題和內容
            const safeTitle = (kb.title || '').replace(/"/g, '&quot;');
            const safeContent = (kb.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // 生成關鍵字顯示 HTML
            const keywords = kb.keywords || [];
            const keywordsHtml = keywords.length > 0
                ? keywords.map(keyword =>
                    `<span class="keyword-tag">
                        ${keyword.replace(/"/g, '&quot;')}
                        <button type="button" class="keyword-remove remove-keyword-btn" data-kb-id="${kb.id}" data-keyword="${keyword.replace(/"/g, '&quot;')}">×</button>
                    </span>`
                ).join('')
                : '<span class="no-keywords">尚未設定關鍵字</span>';

            // 預設為收折狀態
            kbElement.className = 'knowledge-base-item collapsed';

            kbElement.innerHTML = `
                <div class="knowledge-base-header" onclick="toggleKnowledgeBase('${kb.id}')">
                    <div class="knowledge-base-toggle">
                        <span class="knowledge-base-toggle-icon">▼</span>
                        <input type="text" class="knowledge-base-title" value="${safeTitle}" 
                               data-kb-id="${kb.id}"
                               placeholder="知識庫標題"
                               onclick="event.stopPropagation()">
                    </div>
                    <div class="knowledge-base-actions">
                        <button type="button" class="btn btn-primary btn-sm generate-keywords-btn" data-kb-id="${kb.id}">🤖 AI 生成關鍵字</button>
                        <button type="button" class="btn btn-danger remove-kb-btn" data-kb-id="${kb.id}">刪除</button>
                    </div>
                </div>
                <div class="knowledge-base-keywords">
                    <div class="keywords-header">
                        <label>關鍵字管理：</label>
                        <div class="keyword-input-group">
                            <input type="text" class="keyword-input" data-kb-id="${kb.id}" placeholder="手動添加關鍵字...">
                            <button type="button" class="btn btn-sm btn-outline-primary add-keyword-btn" data-kb-id="${kb.id}">
                                添加
                            </button>
                        </div>
                    </div>
                    <div class="keywords-display">
                        ${keywordsHtml}
                    </div>
                </div>
                <textarea class="knowledge-base-content" 
                          data-kb-id="${kb.id}"
                          placeholder="輸入知識庫內容...">${safeContent}</textarea>
            `;
            container.appendChild(kbElement);
        });

        // 添加事件委託處理
        setupKnowledgeBaseEventListeners();
    } catch (error) {
        console.error('渲染知識庫列表失敗:', error);
    }
}

// 切換知識庫收折狀態
function toggleKnowledgeBase(kbId) {
    const kbElement = document.querySelector(`[data-kb-id="${kbId}"]`)?.closest('.knowledge-base-item');
    if (kbElement) {
        kbElement.classList.toggle('collapsed');
    }
}

// 切換 LINE Bot 設定指南收折狀態
function toggleLineBotInfo() {
    const lineBotInfo = document.getElementById('lineBotInfo');
    if (lineBotInfo) {
        lineBotInfo.classList.toggle('collapsed');
    }
}


// 複製對話入口網址
function copyChatUrl() {
    const chatUrlInput = document.getElementById('chatUrl');
    if (!chatUrlInput || !chatUrlInput.value) {
        alert('請先輸入對話入口網址');
        return;
    }

    chatUrlInput.select();
    chatUrlInput.setSelectionRange(0, 99999); // 對於行動裝置

    try {
        document.execCommand('copy');
        // 顯示複製成功提示
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = '✓';
        button.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';

        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }, 2000);
    } catch (err) {
        // 如果 execCommand 失敗，嘗試使用 Clipboard API
        if (navigator.clipboard) {
            navigator.clipboard.writeText(chatUrlInput.value).then(() => {
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = '✓';
                button.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';

                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                }, 2000);
            }).catch(() => {
                alert('複製失敗，請手動複製網址');
            });
        } else {
            alert('複製失敗，請手動複製網址');
        }
    }
}

// 開啟對話入口網址
function openChatUrl() {
    const chatUrlInput = document.getElementById('chatUrl');
    if (!chatUrlInput || !chatUrlInput.value) {
        alert('請先輸入對話入口網址');
        return;
    }

    window.open(chatUrlInput.value, '_blank');
}

// 複製代理對話入口網址（用於代理卡片）
function copyAgentChatUrl(agentId) {
    // 從代理資料中獲取對話入口網址
    const agent = agents[agentId];
    const chatUrl = agent?.chatUrl || `${window.location.origin}/demo.html?agentId=${agentId}`;

    try {
        navigator.clipboard.writeText(chatUrl).then(() => {
            // 顯示複製成功提示
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = '✓';
            button.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            }, 2000);
        }).catch(() => {
            // 如果 Clipboard API 失敗，使用傳統方法
            const textArea = document.createElement('textarea');
            textArea.value = chatUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);

            const button = event.target;
            const originalText = button.textContent;
            button.textContent = '✓';
            button.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            }, 2000);
        });
    } catch (err) {
        alert('複製失敗，請手動複製網址');
    }
}

// 開啟代理對話入口網址（用於代理卡片）
function openAgentChatUrl(agentId) {
    // 從代理資料中獲取對話入口網址
    const agent = agents[agentId];
    const chatUrl = agent?.chatUrl || `${window.location.origin}/demo.html?agentId=${agentId}`;
    window.open(chatUrl, '_blank');
}

// 設置知識庫事件監聽器
function setupKnowledgeBaseEventListeners() {
    const container = document.getElementById('knowledgeBaseList');
    if (!container) return;

    // 移除舊的事件監聽器
    container.removeEventListener('click', handleKnowledgeBaseClick);
    container.removeEventListener('keypress', handleKeywordInputKeypress);
    container.removeEventListener('input', handleKnowledgeBaseInput);
    container.removeEventListener('change', handleKnowledgeBaseChange);

    // 添加新的事件監聽器
    container.addEventListener('click', handleKnowledgeBaseClick);
    container.addEventListener('keypress', handleKeywordInputKeypress);
    container.addEventListener('input', handleKnowledgeBaseInput);
    container.addEventListener('change', handleKnowledgeBaseChange);
}

// 處理知識庫點擊事件
function handleKnowledgeBaseClick(event) {
    const target = event.target;

    // 檢查是否點擊了按鈕或按鈕內的子元素
    const generateBtn = target.closest('.generate-keywords-btn');
    const removeBtn = target.closest('.remove-kb-btn');
    const addKeywordBtn = target.closest('.add-keyword-btn');
    const removeKeywordBtn = target.closest('.remove-keyword-btn');

    if (generateBtn) {
        event.preventDefault();
        event.stopPropagation();
        const kbId = generateBtn.getAttribute('data-kb-id');
        console.log('點擊了 AI 生成關鍵字按鈕，kbId:', kbId);
        generateKeywordsForKnowledgeBase(kbId);
    } else if (removeBtn) {
        event.preventDefault();
        event.stopPropagation();
        const kbId = removeBtn.getAttribute('data-kb-id');
        console.log('點擊了刪除按鈕，kbId:', kbId);
        removeKnowledgeBase(kbId);
    } else if (addKeywordBtn) {
        event.preventDefault();
        event.stopPropagation();
        const kbId = addKeywordBtn.getAttribute('data-kb-id');
        const input = document.querySelector(`.keyword-input[data-kb-id="${kbId}"]`);
        if (input) {
            addKeywordToKnowledgeBase(kbId, input.value);
            input.value = '';
        }
    } else if (removeKeywordBtn) {
        event.preventDefault();
        event.stopPropagation();
        const kbId = removeKeywordBtn.getAttribute('data-kb-id');
        const keyword = removeKeywordBtn.getAttribute('data-keyword');
        removeKeywordFromKnowledgeBase(kbId, keyword);
    }
}

// 處理關鍵字輸入框按鍵事件
function handleKeywordInputKeypress(event) {
    if (event.target.classList.contains('keyword-input') && event.key === 'Enter') {
        const kbId = event.target.getAttribute('data-kb-id');
        const keyword = event.target.value;
        if (keyword.trim()) {
            addKeywordToKnowledgeBase(kbId, keyword);
            event.target.value = '';
        }
    }
}

// 處理知識庫輸入事件（即時更新）
function handleKnowledgeBaseInput(event) {
    const target = event.target;

    if (target.classList.contains('knowledge-base-title')) {
        const kbId = target.getAttribute('data-kb-id');
        const title = target.value;
        updateKnowledgeBaseTitle(kbId, title);
    } else if (target.classList.contains('knowledge-base-content')) {
        const kbId = target.getAttribute('data-kb-id');
        const content = target.value;
        updateKnowledgeBaseContent(kbId, content);
    }
}

// 處理知識庫變更事件（失去焦點時更新）
function handleKnowledgeBaseChange(event) {
    const target = event.target;

    if (target.classList.contains('knowledge-base-title')) {
        const kbId = target.getAttribute('data-kb-id');
        const title = target.value;
        updateKnowledgeBaseTitle(kbId, title);
    } else if (target.classList.contains('knowledge-base-content')) {
        const kbId = target.getAttribute('data-kb-id');
        const content = target.value;
        updateKnowledgeBaseContent(kbId, content);
    }
}

// 從對話匯入知識庫
function importFromConversation() {
    // 載入對話列表
    loadConversationList();
}

// 載入對話列表
async function loadConversationList() {
    try {
        // 從當前選中的代理載入對話
        const selectedAgentId = document.getElementById('agentSelect').value;
        if (!selectedAgentId) {
            alert('請先選擇代理');
            return;
        }

        const conversationsRef = database.ref(`agents/${selectedAgentId}/conversations`);
        const snapshot = await conversationsRef.once('value');
        const conversations = snapshot.val() || {};

        // 顯示對話選擇器
        showConversationSelector(conversations);
    } catch (error) {
        console.error('載入對話列表失敗:', error);
        alert('載入對話列表失敗');
    }
}

// 顯示對話選擇器
function showConversationSelector(conversations) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';

    // 安全地建立對話列表 HTML
    const conversationItems = Object.keys(conversations).map(convId => {
        const conv = conversations[convId];
        const messages = conv.messages || {};
        const messageList = Object.values(messages);
        const preview = messageList.slice(0, 3).map(msg => {
            const safeContent = (msg.content || '').substring(0, 50).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `${msg.role === 'user' ? '使用者' : 'AI'}: ${safeContent}...`;
        }).join('\n');

        const safePreview = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeConvId = convId.replace(/"/g, '&quot;');

        return `
            <div class="conversation-item" onclick="selectConversation('${safeConvId}')">
                <div><strong>對話 ${convId.substring(0, 8)}</strong></div>
                <div class="conversation-preview">${safePreview}</div>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>選擇對話匯入知識庫</h3>
                <span class="close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="conversation-selector">
                    ${conversationItems}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// 選擇對話
async function selectConversation(conversationId) {
    try {
        // 從當前選中的代理載入對話
        const selectedAgentId = document.getElementById('agentSelect').value;
        if (!selectedAgentId) {
            alert('請先選擇代理');
            return;
        }

        const conversationRef = database.ref(`agents/${selectedAgentId}/conversations/${conversationId}`);
        const snapshot = await conversationRef.once('value');
        const conversation = snapshot.val();

        if (!conversation || !conversation.messages) {
            alert('對話不存在或沒有訊息');
            return;
        }

        // 從對話中提取知識庫內容
        const messages = Object.values(conversation.messages)
            .sort((a, b) => a.timestamp - b.timestamp);

        // 建立知識庫內容
        let knowledgeContent = '從對話中提取的知識庫內容：\n\n';

        messages.forEach(msg => {
            if (msg.role === 'assistant') {
                knowledgeContent += `Q&A:\n`;
                knowledgeContent += `問題: ${messages[messages.indexOf(msg) - 1]?.content || '未知'}\n`;
                knowledgeContent += `回答: ${msg.content}\n\n`;
            }
        });

        // 新增知識庫
        addKnowledgeBase();
        const newKb = knowledgeBases[knowledgeBases.length - 1];
        newKb.title = `從對話匯入 - ${new Date().toLocaleDateString()}`;
        newKb.content = knowledgeContent;

        // 自動為匯入的知識庫生成關鍵字
        try {
            const keywords = await generateKeywordsWithAI(knowledgeContent, newKb.title);
            if (keywords.length > 0) {
                newKb.keywords = keywords;
                newKb.aiGenerated = true;
            }
        } catch (error) {
            console.warn('自動生成關鍵字失敗:', error);
            // 如果 AI 生成失敗，不影響知識庫匯入
        }

        renderKnowledgeBases();

        // 關閉模態框
        document.querySelector('.modal').remove();

        alert('知識庫已從對話匯入' + (newKb.keywords && newKb.keywords.length > 0 ? `，並自動生成了 ${newKb.keywords.length} 個關鍵字` : ''));
    } catch (error) {
        console.error('匯入對話失敗:', error);
        alert('匯入對話失敗');
    }
}

// 人物誌分析功能
let currentProfileAgentId = null;

// 載入代理選項到人物誌選擇器
function loadProfileAgentOptions() {
    const select = document.getElementById('profileAgentSelect');
    if (select) {
        select.innerHTML = '<option value="">請選擇代理...</option>';

        Object.keys(filteredAgents).forEach(agentId => {
            const agent = filteredAgents[agentId];
            const option = document.createElement('option');
            option.value = agentId;
            option.textContent = agent.name;
            select.appendChild(option);
        });

        // 添加選擇變更事件監聽器，自動載入人物誌
        select.addEventListener('change', function () {
            if (this.value) {
                loadProfiles();
            } else {
                document.getElementById('profilesList').innerHTML = '<div class="text-center py-12 px-4 text-muted-dark">請選擇代理...</div>';
            }
        });
    }

    // 同時更新失敗對話和 Session 統計的代理選擇器
    loadFailedConversationsAgentOptions();
    loadSessionAnalyticsAgentOptions();
}

// 載入代理選項到失敗對話選擇器
function loadFailedConversationsAgentOptions() {
    const select = document.getElementById('failedConversationsAgentSelect');
    if (select) {
        select.innerHTML = '<option value="">請選擇代理...</option>';

        Object.keys(filteredAgents).forEach(agentId => {
            const agent = filteredAgents[agentId];
            const option = document.createElement('option');
            option.value = agentId;
            option.textContent = agent.name;
            select.appendChild(option);
        });

        // 添加選擇變更事件監聽器
        select.addEventListener('change', function () {
            if (this.value) {
                loadFailedConversations(this.value);
            } else {
                const failedList = document.getElementById('failedConversationsList');
                if (failedList) {
                    failedList.innerHTML = '<div class="text-center py-12 px-4 text-muted-dark">請選擇代理...</div>';
                }
            }
        });
    }
}

// 載入代理選項到 Session 統計選擇器
function loadSessionAnalyticsAgentOptions() {
    const select = document.getElementById('sessionAnalyticsAgentSelect');
    if (select) {
        select.innerHTML = '<option value="">請選擇代理...</option>';

        Object.keys(filteredAgents).forEach(agentId => {
            const agent = filteredAgents[agentId];
            const option = document.createElement('option');
            option.value = agentId;
            option.textContent = agent.name;
            select.appendChild(option);
        });

        // 添加選擇變更事件監聽器
        select.addEventListener('change', function () {
            if (this.value) {
                loadSessionAnalytics(this.value);
            } else {
                const analyticsContent = document.getElementById('sessionAnalyticsContent');
                if (analyticsContent) {
                    analyticsContent.innerHTML = '<div class="text-center py-12 px-4 text-muted-dark">請選擇代理...</div>';
                }
            }
        });
    }
}

// 獲取人物誌快取鍵
function getProfilesCacheKey(agentId) {
    return `${PROFILES_CACHE_PREFIX}${agentId}`;
}

// 獲取人物誌總數快取鍵
function getProfilesCountCacheKey(agentId) {
    return `${PROFILES_CACHE_PREFIX}${agentId}_count`;
}

// 從本地快取載入人物誌
function loadProfilesFromCache(agentId) {
    try {
        const cacheKey = getProfilesCacheKey(agentId);
        const cachedData = localStorage.getItem(cacheKey);

        if (!cachedData) {
            return null;
        }

        const cacheData = JSON.parse(cachedData);

        if (isCacheValid(cacheData)) {
            console.log('從本地快取載入人物誌資料');
            return cacheData.data;
        } else {
            // 快取已過期，清除
            localStorage.removeItem(cacheKey);
            console.log('人物誌快取已過期，已清除');
            return null;
        }
    } catch (error) {
        console.error('讀取人物誌本地快取失敗:', error);
        return null;
    }
}

// 保存人物誌資料到本地快取
function saveProfilesToCache(agentId, profilesData, totalCount = null) {
    try {
        const cacheKey = getProfilesCacheKey(agentId);
        const cacheData = {
            data: profilesData,
            timestamp: Date.now(),
            version: CACHE_VERSION,
            loadedCount: Object.keys(profilesData || {}).length,
            totalCount: totalCount
        };

        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log('人物誌資料已保存到本地快取');

        // 如果有總數，也保存總數快取
        if (totalCount !== null) {
            const countCacheKey = getProfilesCountCacheKey(agentId);
            const countCacheData = {
                count: totalCount,
                timestamp: Date.now(),
                version: CACHE_VERSION
            };
            localStorage.setItem(countCacheKey, JSON.stringify(countCacheData));
        }
    } catch (error) {
        console.error('保存人物誌到本地快取失敗:', error);
        // 如果 localStorage 空間不足，嘗試清理舊快取
        if (error.name === 'QuotaExceededError') {
            clearExpiredCache();
            try {
                localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (retryError) {
                console.error('重試保存人物誌快取失敗:', retryError);
            }
        }
    }
}

// 合併新載入的資料到快取
function mergeProfilesToCache(agentId, newProfiles) {
    try {
        const cacheKey = getProfilesCacheKey(agentId);
        const cachedData = localStorage.getItem(cacheKey);

        if (!cachedData) {
            // 如果沒有快取，直接保存新資料
            saveProfilesToCache(agentId, newProfiles);
            return;
        }

        const cacheData = JSON.parse(cachedData);
        if (!isCacheValid(cacheData)) {
            // 快取已過期，直接保存新資料
            saveProfilesToCache(agentId, newProfiles);
            return;
        }

        // 合併資料（新資料優先）
        const mergedData = { ...cacheData.data, ...newProfiles };

        // 更新快取
        cacheData.data = mergedData;
        cacheData.loadedCount = Object.keys(mergedData).length;
        cacheData.timestamp = Date.now();

        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log('人物誌資料已合併到快取');
    } catch (error) {
        console.error('合併人物誌快取失敗:', error);
    }
}

// 獲取人物誌總數（從快取或 Firebase）
async function getProfilesTotalCount(agentId) {
    try {
        // 先檢查快取
        const countCacheKey = getProfilesCountCacheKey(agentId);
        const cachedCount = localStorage.getItem(countCacheKey);

        if (cachedCount) {
            const countCacheData = JSON.parse(cachedCount);
            if (isCacheValid(countCacheData)) {
                return countCacheData.count;
            }
        }

        // 從 Firebase 獲取總數
        const profilesRef = database.ref(`agents/${agentId}/profiles`);
        const snapshot = await profilesRef.once('value');
        const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;

        // 保存總數到快取
        const countCacheData = {
            count: count,
            timestamp: Date.now(),
            version: CACHE_VERSION
        };
        localStorage.setItem(countCacheKey, JSON.stringify(countCacheData));

        return count;
    } catch (error) {
        console.error('獲取人物誌總數失敗:', error);
        return null;
    }
}

// 清除人物誌快取
function clearProfilesCache(agentId) {
    try {
        const cacheKey = getProfilesCacheKey(agentId);
        const countCacheKey = getProfilesCountCacheKey(agentId);
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(countCacheKey);
        console.log('人物誌快取已清除');
    } catch (error) {
        console.error('清除人物誌快取失敗:', error);
    }
}

// 從快取中移除特定的人物誌
function removeProfileFromCache(agentId, profileId) {
    try {
        const cacheKey = getProfilesCacheKey(agentId);
        const cachedData = localStorage.getItem(cacheKey);

        if (!cachedData) {
            console.log('快取不存在，無需移除');
            return;
        }

        const cacheData = JSON.parse(cachedData);

        if (!isCacheValid(cacheData)) {
            // 快取已過期，清除整個快取
            clearProfilesCache(agentId);
            return;
        }

        // 從快取資料中移除該人物誌
        if (cacheData.data && cacheData.data[profileId]) {
            delete cacheData.data[profileId];

            // 更新快取資料
            cacheData.loadedCount = Object.keys(cacheData.data).length;
            cacheData.timestamp = Date.now();

            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            console.log(`人物誌 ${profileId} 已從快取中移除`);

            // 更新總數快取（如果存在）
            const countCacheKey = getProfilesCountCacheKey(agentId);
            const countCacheData = localStorage.getItem(countCacheKey);
            if (countCacheData) {
                try {
                    const countData = JSON.parse(countCacheData);
                    if (isCacheValid(countData) && countData.count > 0) {
                        countData.count = Math.max(0, countData.count - 1);
                        countData.timestamp = Date.now();
                        localStorage.setItem(countCacheKey, JSON.stringify(countData));
                        console.log('總數快取已更新');
                    }
                } catch (error) {
                    console.error('更新總數快取失敗:', error);
                }
            }
        } else {
            console.log(`快取中找不到人物誌 ${profileId}`);
        }
    } catch (error) {
        console.error('從快取移除人物誌失敗:', error);
        // 如果出錯，清除整個快取以確保一致性
        clearProfilesCache(agentId);
    }
}

// 載入更多人物誌資料（用於分頁）
async function loadMoreProfiles(agentId, startIndex, limit) {
    try {
        // 從 Firebase 載入指定範圍的資料
        const profilesRef = database.ref(`agents/${agentId}/profiles`);

        // 獲取所有資料並排序
        const snapshot = await profilesRef.orderByChild('createdAt').once('value');
        const allProfilesData = snapshot.val() || {};

        // 轉換為陣列並排序（最新的在前）
        const profilesArray = Object.entries(allProfilesData).map(([id, profile]) => ({
            id,
            ...profile,
            createdAt: profile.createdAt || profile.metadata?.lastUpdated || 0
        }));

        profilesArray.sort((a, b) => b.createdAt - a.createdAt);

        // 獲取指定範圍的資料
        const paginatedProfiles = profilesArray.slice(startIndex, startIndex + limit);

        // 轉換回物件格式
        const profilesObj = {};
        paginatedProfiles.forEach(profile => {
            const { id, ...profileData } = profile;
            profilesObj[id] = profileData;
        });

        return profilesObj;
    } catch (error) {
        console.error('載入更多人物誌失敗:', error);
        return null;
    }
}

// 載入人物誌
async function loadProfiles(forceRefresh = false) {
    const agentId = document.getElementById('profileAgentSelect').value;
    if (!agentId) {
        alert('請先選擇代理');
        return;
    }

    currentProfileAgentId = agentId;
    const profilesList = document.getElementById('profilesList');
    profilesList.innerHTML = '<div class="text-center py-12 px-4 text-muted-dark">載入人物誌中...</div>';

    // 重置搜索、排序和篩選
    const searchInput = document.getElementById('profileSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    currentSortBy = 'time-desc';
    currentFilter = 'all';
    currentPage = 1; // 重置到第一頁

    try {
        // 如果不是強制刷新，先檢查快取
        if (!forceRefresh) {
            const cachedProfiles = loadProfilesFromCache(agentId);
            if (cachedProfiles) {
                // 獲取總數（用於分頁計算）
                const totalCount = await getProfilesTotalCount(agentId);
                renderProfiles(cachedProfiles, totalCount);
                return;
            }
        }

        // 從 Firebase 載入，使用 limitToLast 只載入最近10筆
        const profilesRef = database.ref(`agents/${agentId}/profiles`);
        const snapshot = await profilesRef.orderByChild('createdAt').limitToLast(10).once('value');
        const profiles = snapshot.val();

        if (!profiles) {
            allProfiles = [];
            profilesList.innerHTML = '<div class="text-center py-12 px-4 text-muted-dark">該代理尚未有人物誌資料</div>';
            // 清除快取
            clearProfilesCache(agentId);
            // 隱藏分頁控制
            updatePaginationControls(0);
            return;
        }

        // 獲取總數
        const totalCount = await getProfilesTotalCount(agentId);

        // 保存到快取
        saveProfilesToCache(agentId, profiles, totalCount);

        renderProfiles(profiles, totalCount);
    } catch (error) {
        console.error('載入人物誌失敗:', error);
        profilesList.innerHTML = '<div class="text-center py-12 px-4 text-red-400">載入人物誌失敗</div>';
        updatePaginationControls(0);
    }
}

// 全局變量：存儲當前人物誌數據
let allProfiles = [];
let currentSortBy = 'time-desc'; // 預設按時間降序
let currentFilter = 'all'; // 預設顯示全部
let currentPage = 1; // 當前頁碼
const PROFILES_PER_PAGE = 10; // 每頁顯示的人物誌數量
let totalPages = 1; // 總頁數

// 渲染人物誌列表
function renderProfiles(profiles, totalCount = null) {
    const profilesList = document.getElementById('profilesList');
    allProfiles = Object.entries(profiles).map(([id, profile]) => ({ id, ...profile }));

    // 應用搜索、排序和篩選（包含分頁）
    applyFiltersAndSort(totalCount);
}

// 應用搜索、排序和篩選
async function applyFiltersAndSort(totalCount = null) {
    const profilesList = document.getElementById('profilesList');
    let filtered = [...allProfiles];

    // 應用搜索
    const searchInput = document.getElementById('profileSearchInput');
    if (searchInput && searchInput.value.trim()) {
        const searchTerm = searchInput.value.trim().toLowerCase();
        filtered = filtered.filter(profile => {
            const title = generateProfileTitle(profile).toLowerCase();
            const summary = generateJsonSummary(profile).toLowerCase();
            return title.includes(searchTerm) || summary.includes(searchTerm);
        });
    }

    // 應用篩選
    if (currentFilter !== 'all') {
        filtered = filtered.filter(profile => {
            const source = profile.metadata?.source || (profile.sessionId ? 'widget' : 'unknown');
            if (currentFilter === 'linebot') return source === 'linebot';
            if (currentFilter === 'widget') return source === 'widget' && profile.sessionId;
            if (currentFilter === 'unknown') return source === 'unknown';
            return true;
        });
    }

    // 應用排序
    filtered.sort((a, b) => {
        const aTime = a.createdAt || a.metadata?.lastUpdated || 0;
        const bTime = b.createdAt || b.metadata?.lastUpdated || 0;

        switch (currentSortBy) {
            case 'time-desc':
                return bTime - aTime;
            case 'time-asc':
                return aTime - bTime;
            case 'confidence-desc':
                return (b.metadata?.confidence || 0) - (a.metadata?.confidence || 0);
            case 'confidence-asc':
                return (a.metadata?.confidence || 0) - (b.metadata?.confidence || 0);
            case 'interactions-desc':
                return (b.metadata?.totalInteractions || 0) - (a.metadata?.totalInteractions || 0);
            case 'interactions-asc':
                return (a.metadata?.totalInteractions || 0) - (b.metadata?.totalInteractions || 0);
            default:
                return bTime - aTime;
        }
    });

    if (filtered.length === 0) {
        profilesList.innerHTML = '<div class="text-center py-12 px-4 text-muted-dark">沒有找到符合條件的人物誌</div>';
        updatePaginationControls(0);
        return;
    }

    // 計算需要的總資料數（用於分頁）
    const requiredDataCount = currentPage * PROFILES_PER_PAGE;
    const currentDataCount = filtered.length;

    // 如果當前頁需要的資料超出已載入的資料，且沒有搜索/篩選，則載入更多
    if (requiredDataCount > currentDataCount &&
        !document.getElementById('profileSearchInput')?.value?.trim() &&
        currentFilter === 'all' &&
        currentProfileAgentId) {

        // 顯示載入中
        profilesList.innerHTML = '<div class="text-center py-12 px-4 text-muted-dark">載入更多資料中...</div>';

        // 載入更多資料
        const startIndex = currentDataCount;
        const loadCount = requiredDataCount - currentDataCount;
        const moreProfiles = await loadMoreProfiles(currentProfileAgentId, startIndex, loadCount);

        if (moreProfiles && Object.keys(moreProfiles).length > 0) {
            // 合併到 allProfiles
            const newProfiles = Object.entries(moreProfiles).map(([id, profile]) => ({ id, ...profile }));
            allProfiles = [...allProfiles, ...newProfiles];

            // 合併到快取
            mergeProfilesToCache(currentProfileAgentId, moreProfiles);

            // 重新過濾和排序
            filtered = [...allProfiles];

            // 重新應用搜索和篩選（如果有的話）
            const searchInput = document.getElementById('profileSearchInput');
            if (searchInput && searchInput.value.trim()) {
                const searchTerm = searchInput.value.trim().toLowerCase();
                filtered = filtered.filter(profile => {
                    const title = generateProfileTitle(profile).toLowerCase();
                    const summary = generateJsonSummary(profile).toLowerCase();
                    return title.includes(searchTerm) || summary.includes(searchTerm);
                });
            }

            if (currentFilter !== 'all') {
                filtered = filtered.filter(profile => {
                    const source = profile.metadata?.source || (profile.sessionId ? 'widget' : 'unknown');
                    if (currentFilter === 'linebot') return source === 'linebot';
                    if (currentFilter === 'widget') return source === 'widget' && profile.sessionId;
                    if (currentFilter === 'unknown') return source === 'unknown';
                    return true;
                });
            }

            // 重新排序
            filtered.sort((a, b) => {
                const aTime = a.createdAt || a.metadata?.lastUpdated || 0;
                const bTime = b.createdAt || b.metadata?.lastUpdated || 0;

                switch (currentSortBy) {
                    case 'time-desc':
                        return bTime - aTime;
                    case 'time-asc':
                        return aTime - bTime;
                    case 'confidence-desc':
                        return (b.metadata?.confidence || 0) - (a.metadata?.confidence || 0);
                    case 'confidence-asc':
                        return (a.metadata?.confidence || 0) - (b.metadata?.confidence || 0);
                    case 'interactions-desc':
                        return (b.metadata?.totalInteractions || 0) - (a.metadata?.totalInteractions || 0);
                    case 'interactions-asc':
                        return (a.metadata?.totalInteractions || 0) - (b.metadata?.totalInteractions || 0);
                    default:
                        return bTime - aTime;
                }
            });
        }
    }

    // 計算分頁（使用總數或已過濾的資料數）
    const totalItems = totalCount !== null &&
        !document.getElementById('profileSearchInput')?.value?.trim() &&
        currentFilter === 'all'
        ? totalCount
        : filtered.length;

    totalPages = Math.ceil(totalItems / PROFILES_PER_PAGE);
    if (currentPage > totalPages) {
        currentPage = totalPages || 1;
    }

    const startIndex = (currentPage - 1) * PROFILES_PER_PAGE;
    const endIndex = startIndex + PROFILES_PER_PAGE;
    const paginatedProfiles = filtered.slice(startIndex, endIndex);

    let html = '';
    paginatedProfiles.forEach((profile, index) => {
        html += createProfileCard(profile, index === 0 && currentPage === 1); // 第一頁的第一個設為激活狀態
    });

    profilesList.innerHTML = html;

    // 更新分頁控制
    updatePaginationControls(totalItems);

    // 確保 JSON 區域在列表容器內正確顯示
    // 由於卡片結構改變，需要調整容器樣式
}

// 更新分頁控制元件
function updatePaginationControls(totalItems) {
    const paginationContainer = document.getElementById('profilesPagination');
    if (!paginationContainer) return;

    if (totalItems === 0 || totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    const startItem = (currentPage - 1) * PROFILES_PER_PAGE + 1;
    const endItem = Math.min(currentPage * PROFILES_PER_PAGE, totalItems);

    let paginationHtml = `
        <div class="flex items-center justify-between px-4 py-3 border-t border-border-dark">
            <div class="text-sm text-muted-dark">
                顯示第 <span class="font-medium text-white">${startItem}</span> - <span class="font-medium text-white">${endItem}</span> 筆，共 <span class="font-medium text-white">${totalItems}</span> 筆
                    </div>
            <div class="flex items-center gap-2">
                <button 
                    onclick="goToProfilePage(${currentPage - 1})" 
                    ${currentPage === 1 ? 'disabled' : ''}
                    class="px-3 py-1.5 rounded-lg border border-border-dark bg-background-dark text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                    ${currentPage === 1 ? 'style="pointer-events: none;"' : ''}
                >
                    <span class="material-symbols-outlined !text-lg">chevron_left</span>
                </button>
                
                <div class="flex items-center gap-1">
    `;

    // 顯示頁碼（最多顯示5個）
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        paginationHtml += `
            <button onclick="goToProfilePage(1)" class="px-3 py-1.5 rounded-lg border border-border-dark bg-background-dark text-sm font-medium text-white hover:bg-white/10 transition-colors">1</button>
        `;
        if (startPage > 2) {
            paginationHtml += `<span class="px-2 text-muted-dark">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHtml += `
            <button 
                onclick="goToProfilePage(${i})" 
                class="px-3 py-1.5 rounded-lg border border-border-dark text-sm font-medium transition-colors ${i === currentPage
                ? 'bg-primary text-white border-primary'
                : 'bg-background-dark text-white hover:bg-white/10'
            }"
            >
                ${i}
            </button>
        `;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHtml += `<span class="px-2 text-muted-dark">...</span>`;
        }
        paginationHtml += `
            <button onclick="goToProfilePage(${totalPages})" class="px-3 py-1.5 rounded-lg border border-border-dark bg-background-dark text-sm font-medium text-white hover:bg-white/10 transition-colors">${totalPages}</button>
        `;
    }

    paginationHtml += `
                    </div>
                
                <button 
                    onclick="goToProfilePage(${currentPage + 1})" 
                    ${currentPage === totalPages ? 'disabled' : ''}
                    class="px-3 py-1.5 rounded-lg border border-border-dark bg-background-dark text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                    ${currentPage === totalPages ? 'style="pointer-events: none;"' : ''}
                >
                    <span class="material-symbols-outlined !text-lg">chevron_right</span>
                </button>
                </div>
        </div>
    `;

    paginationContainer.innerHTML = paginationHtml;
}

// 跳轉到指定頁碼
async function goToProfilePage(page) {
    if (page < 1) return;

    // 如果頁碼超出當前總頁數，先嘗試獲取總數
    if (page > totalPages && currentProfileAgentId) {
        const totalCount = await getProfilesTotalCount(currentProfileAgentId);
        if (totalCount) {
            totalPages = Math.ceil(totalCount / PROFILES_PER_PAGE);
        }
    }

    if (page > totalPages) return;

    currentPage = page;
    await applyFiltersAndSort();
    // 滾動到列表頂部
    const profilesList = document.getElementById('profilesList');
    if (profilesList) {
        profilesList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// 搜索人物誌
async function searchProfiles() {
    currentPage = 1; // 搜索時重置到第一頁
    await applyFiltersAndSort();
}

// 切換排序選單
async function toggleSortMenu() {
    // 簡單實現：循環切換排序方式
    const sortOptions = ['time-desc', 'time-asc', 'confidence-desc', 'confidence-asc', 'interactions-desc', 'interactions-asc'];
    const currentIndex = sortOptions.indexOf(currentSortBy);
    currentSortBy = sortOptions[(currentIndex + 1) % sortOptions.length];
    currentPage = 1; // 排序時重置到第一頁
    await applyFiltersAndSort();
}

// 切換篩選選單
async function toggleFilterMenu() {
    // 簡單實現：循環切換篩選方式
    const filterOptions = ['all', 'linebot', 'widget', 'unknown'];
    const currentIndex = filterOptions.indexOf(currentFilter);
    currentFilter = filterOptions[(currentIndex + 1) % filterOptions.length];
    currentPage = 1; // 篩選時重置到第一頁
    await applyFiltersAndSort();
}

// 創建人物誌卡片（支援動態欄位）
function createProfileCard(profile, isActive = false) {
    const createdAt = new Date(profile.createdAt || profile.metadata?.lastUpdated || Date.now());
    const now = new Date();
    const diffTime = now - createdAt;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let timeDisplay = '';
    if (diffDays === 0) {
        // 今天
        timeDisplay = createdAt.toLocaleString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } else if (diffDays === 1) {
        timeDisplay = '昨天';
    } else if (diffDays < 7) {
        timeDisplay = `${diffDays}天前`;
    } else {
        timeDisplay = createdAt.toLocaleString('zh-TW', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    const confidence = profile.metadata?.confidence || 0;
    const interactions = profile.metadata?.totalInteractions || 0;
    const categories = calculateProfileCategories(profile);
    const source = profile.metadata?.source || (profile.sessionId ? 'widget' : 'unknown');

    // 根據來源決定圖標和顏色
    let iconBg = 'bg-blue-500/20';
    let iconColor = 'text-blue-400';
    let sourceIcon = 'help';

    if (source === 'linebot') {
        iconBg = 'bg-green-500/20';
        iconColor = 'text-green-400';
        sourceIcon = 'chat_bubble';
    } else if (profile.sessionId) {
        iconBg = 'bg-purple-500/20';
        iconColor = 'text-purple-400';
        sourceIcon = 'widgets';
    }

    const profileTitle = generateProfileTitle(profile);
    const jsonSummary = generateJsonSummary(profile);
    const activeClass = isActive ? 'record-card-active' : '';

    return `
        <div class="space-y-1">
            <div class="record-card ${activeClass}" data-profile-id="${profile.id}">
                <div class="flex size-8 items-center justify-center rounded-full ${iconBg} ${iconColor}">
                    <span class="material-symbols-outlined !text-xl">${sourceIcon}</span>
                    </div>
                <div class="flex-1 cursor-pointer" onclick="viewProfileDetails('${profile.id}')">
                    <div class="flex items-center gap-2">
                        <h3 class="font-semibold text-white truncate">${profileTitle}</h3>
                        ${confidence > 0 ? `
                            <div class="flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-xs">
                                <span class="material-symbols-outlined !text-[14px] text-yellow-400">star</span>
                                <span class="font-medium text-white">${confidence.toFixed(1)}</span>
                    </div>
                        ` : ''}
                    </div>
                    <p class="text-sm text-muted-dark truncate">JSON 摘要: ${jsonSummary}</p>
                </div>
                <div class="flex items-center gap-2">
                    <div class="text-right mr-2">
                        <time class="text-sm text-muted-dark">${timeDisplay}</time>
                        <div class="mt-1 flex justify-end items-center gap-2">
                            <span class="flex items-center gap-1 text-xs text-muted-dark">
                                <span class="material-symbols-outlined !text-[14px]">forum</span> ${interactions}
                            </span>
                            <span class="flex items-center gap-1 text-xs text-muted-dark">
                                <span class="material-symbols-outlined !text-[14px]">sell</span> ${categories}
                            </span>
                </div>
            </div>
                    <button class="btn-icon" title="查看 JSON" onclick="event.stopPropagation(); toggleProfileJson('${profile.id}')">
                        <span class="material-symbols-outlined !text-xl">code</span>
                    </button>
                    <button class="btn-icon" title="刪除" onclick="event.stopPropagation(); deleteProfile('${profile.id}')">
                        <span class="material-symbols-outlined !text-xl">delete</span>
                    </button>
                </div>
            </div>
            <div class="profile-json rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark p-4" id="profile-json-${profile.id}" style="display: none;">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-semibold text-gray-50">JSON 資訊</span>
                    <button class="btn-secondary text-xs px-2 py-1" onclick="event.stopPropagation(); copyProfileJson('${profile.id}')" title="複製 JSON">
                        <span class="material-symbols-outlined !text-base">content_copy</span>
                    </button>
                </div>
                <div class="json-content overflow-auto max-h-96">
                    <pre class="text-xs text-muted-dark"><code>${JSON.stringify(profile, null, 2)}</code></pre>
                </div>
            </div>
        </div>
    `;
}

// 獲取欄位顯示名稱
function getFieldDisplayName(fieldName) {
    const fieldNames = {
        'basic': '基本資訊',
        'contact': '聯絡方式',
        'education': '教育背景',
        'career': '職業資訊',
        'interests': '興趣愛好',
        'personality': '個性特質',
        'lifestyle': '生活狀況',
        'name': '姓名',
        'age': '年齡',
        'phone': '電話',
        'email': '電子郵件',
        'line': 'LINE ID',
        'school': '學校',
        'major': '科系',
        'examGroup': '考試群組',
        'company': '公司',
        'position': '職位',
        'hobbies': '興趣',
        'traits': '特質',
        'habits': '習慣'
    };

    return fieldNames[fieldName] || fieldName;
}

// 格式化人物誌區段
function formatProfileSection(section) {
    return Object.entries(section)
        .map(([key, value]) => {
            const displayKey = getFieldDisplayName(key);
            if (Array.isArray(value)) {
                return `${displayKey}: ${value.join(', ')}`;
            }
            return `${displayKey}: ${value}`;
        })
        .join('<br>');
}

// 計算人物誌資訊類別數量（支援動態欄位）
function calculateProfileCategories(profile) {
    // 動態計算所有非 metadata 欄位
    const profileFields = Object.keys(profile).filter(key =>
        key !== 'metadata' &&
        key !== 'createdAt' &&
        profile[key] &&
        typeof profile[key] === 'object' &&
        Object.keys(profile[key]).length > 0
    );

    return profileFields.length;
}

// 格式化 Markdown 內容
function formatMarkdownContent(content) {
    if (!content) return '';

    // 處理粗體 **text**
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 處理斜體 *text*
    content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 處理代碼 `code`
    content = content.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 處理換行
    content = content.replace(/\n/g, '<br>');

    // 處理列表
    content = content.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li>$1</li>');
    content = content.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // 處理標題
    content = content.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    content = content.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    content = content.replace(/^# (.*)$/gm, '<h1>$1</h1>');

    return content;
}

// 生成人物誌標題
function generateProfileTitle(profile) {
    if (!profile) return '未知人物誌';

    let title = '';

    // 優先使用姓名
    if (profile.basic && profile.basic.name) {
        title = profile.basic.name;
    }
    // 其次使用聯絡方式中的姓名
    else if (profile.contact && profile.contact.name) {
        title = profile.contact.name;
    }
    // 使用職業資訊
    else if (profile.career && profile.career.job) {
        title = profile.career.job;
    }
    // 使用教育背景
    else if (profile.education && profile.education.school) {
        title = profile.education.school;
    }
    // 使用興趣愛好
    else if (profile.interests && profile.interests.hobbies && profile.interests.hobbies.length > 0) {
        title = Array.isArray(profile.interests.hobbies) ? profile.interests.hobbies[0] : profile.interests.hobbies;
    }
    // 使用個性特質
    else if (profile.personality && profile.personality.traits && profile.personality.traits.length > 0) {
        title = Array.isArray(profile.personality.traits) ? profile.personality.traits[0] : profile.personality.traits;
    }
    // 最後使用聯絡方式
    else if (profile.contact) {
        if (profile.contact.phone) {
            title = profile.contact.phone;
        } else if (profile.contact.email) {
            title = profile.contact.email;
        }
    }

    // 如果沒有找到合適的標題，使用預設
    if (!title) {
        const profileId = profile.id || '';
        title = `人物誌 #${profileId.length > 8 ? profileId.substring(0, 8) : profileId || '未知'}`;
    }

    // 返回標題（不包含括號內的資訊）
    return title;
}

// 查看人物誌詳情
async function viewProfileDetails(profileId) {
    try {
        // 載入人物誌詳情
        const profileRef = database.ref(`agents/${currentProfileAgentId}/profiles/${profileId}`);
        const profileSnapshot = await profileRef.once('value');
        const profile = profileSnapshot.val();

        if (!profile) {
            alert('找不到人物誌資料');
            return;
        }

        // 根據人物誌來源載入對應的對話記錄
        const source = profile.metadata?.source || (profile.sessionId ? 'widget' : 'unknown');
        let sessionConversations = [];

        console.log('Profile source:', source);
        console.log('Profile sessionId:', profile.sessionId);

        if (source === 'linebot') {
            // LINE Bot 人物誌：從 lineBotConversations 載入
            const lineBotConversationsRef = database.ref(`agents/${currentProfileAgentId}/lineBotConversations`);
            const lineBotConversationsSnapshot = await lineBotConversationsRef.once('value');
            const lineBotConversations = lineBotConversationsSnapshot.val() || {};

            console.log('Available LINE Bot conversations:', Object.keys(lineBotConversations));

            // 找到對應的 LINE Bot 用戶對話
            // profileId 就是 linebot_${userId}，需要提取 userId
            const userId = profileId.replace('linebot_', '');

            if (lineBotConversations[userId]) {
                // 將 LINE Bot 對話格式轉換為標準格式
                const lineBotMessages = lineBotConversations[userId];

                // LINE Bot 每條記錄包含 userMessage 和 assistantMessage
                lineBotMessages.forEach(msg => {
                    if (msg.userMessage) {
                        sessionConversations.push({
                            role: 'user',
                            content: msg.userMessage,
                            timestamp: msg.timestamp
                        });
                    }
                    if (msg.assistantMessage) {
                        sessionConversations.push({
                            role: 'assistant',
                            content: msg.assistantMessage,
                            timestamp: msg.timestamp
                        });
                    }
                });

                // 按時間排序
                sessionConversations.sort((a, b) => a.timestamp - b.timestamp);
                console.log('Found LINE Bot conversation with', sessionConversations.length, 'messages');
            }
        } else {
            // Widget 人物誌：從 conversations 載入
            const conversationsRef = database.ref(`agents/${currentProfileAgentId}/conversations`);
            const conversationsSnapshot = await conversationsRef.once('value');
            const conversations = conversationsSnapshot.val() || {};

            console.log('Available Widget conversations:', Object.keys(conversations));

            const sessionId = profile.sessionId;
            if (sessionId) {
                // 搜尋所有對話中屬於這個 session 的記錄
                Object.values(conversations).forEach(conversation => {
                    console.log('Checking conversation sessionId:', conversation.sessionId);
                    if (conversation.sessionId === sessionId && conversation.messages) {
                        // 將 messages 物件轉換為陣列
                        const messages = Object.values(conversation.messages);
                        sessionConversations = sessionConversations.concat(messages);
                        console.log('Found matching conversation with', messages.length, 'messages');
                    }
                });
            }
        }

        // 如果沒有找到匹配的對話記錄，顯示提示
        if (sessionConversations.length === 0) {
            console.log('沒有找到匹配的對話記錄');
            sessionConversations = [{
                role: 'system',
                content: '沒有找到相關的對話記錄',
                timestamp: Date.now()
            }];
        }

        // 按時間排序
        sessionConversations.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        // 確保 profile 有 id 屬性
        if (!profile.id) {
            profile.id = profileId;
        }

        // 顯示詳情對話框
        showProfileDetailsModal(profile, sessionConversations, profileId);

    } catch (error) {
        console.error('載入人物誌詳情失敗:', error);
        alert('載入人物誌詳情失敗');
    }
}

// 刪除人物誌
async function deleteProfile(profileId) {
    if (!confirm('確定要刪除這個人物誌嗎？此操作將同時刪除相關的對話記錄，無法復原。')) {
        return;
    }

    try {
        // 先獲取人物誌資料以取得 sessionId
        const profileRef = database.ref(`agents/${currentProfileAgentId}/profiles/${profileId}`);
        const profileSnapshot = await profileRef.once('value');
        const profile = profileSnapshot.val();

        if (!profile) {
            alert('找不到人物誌資料');
            return;
        }

        const sessionId = profile.sessionId;
        console.log('刪除人物誌，sessionId:', sessionId);

        // 刪除對應的對話記錄
        if (sessionId) {
            const conversationsRef = database.ref(`agents/${currentProfileAgentId}/conversations`);
            const conversationsSnapshot = await conversationsRef.once('value');
            const conversations = conversationsSnapshot.val() || {};

            let deletedConversations = 0;
            const deletePromises = [];

            // 找到所有屬於該 session 的對話記錄並刪除
            Object.entries(conversations).forEach(([conversationId, conversation]) => {
                if (conversation.sessionId === sessionId) {
                    console.log('刪除對話記錄:', conversationId);
                    deletePromises.push(
                        database.ref(`agents/${currentProfileAgentId}/conversations/${conversationId}`).remove()
                    );
                    deletedConversations++;
                }
            });

            // 執行所有刪除操作
            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
                console.log(`已刪除 ${deletedConversations} 個對話記錄`);
            }
        }

        // 刪除對應的 session 統計
        if (sessionId) {
            const sessionAnalyticsRef = database.ref(`agents/${currentProfileAgentId}/sessionAnalytics/${sessionId}`);
            await sessionAnalyticsRef.remove();
            console.log('Session 統計已刪除');
        }

        // 刪除人物誌
        await database.ref(`agents/${currentProfileAgentId}/profiles/${profileId}`).remove();
        console.log('人物誌已刪除');

        // 從快取中移除該人物誌（同步更新快取）
        removeProfileFromCache(currentProfileAgentId, profileId);

        // 從 allProfiles 陣列中移除已刪除的人物誌
        allProfiles = allProfiles.filter(p => p.id !== profileId);

        // 直接移除對應的 HTML 區塊
        const profileCard = document.querySelector(`[onclick*="deleteProfile('${profileId}')"]`)?.closest('.profile-card');
        if (profileCard) {
            profileCard.remove();
        }

        // 如果還有其他人物誌，重新應用篩選和排序以更新分頁
        const profilesList = document.getElementById('profilesList');
        if (allProfiles.length > 0) {
            // 如果當前頁沒有資料了，回到上一頁
            const remainingCards = profilesList.querySelectorAll('.profile-card');
            if (remainingCards.length === 0 && currentPage > 1) {
                currentPage--;
            }
            // 重新應用篩選和排序以更新分頁
            await applyFiltersAndSort();
        } else {
            // 如果沒有資料了，直接清空列表，不顯示任何訊息
            profilesList.innerHTML = '';
            updatePaginationControls(0);
        }

        // 重新載入統計數據
        loadStats();

    } catch (error) {
        console.error('刪除人物誌失敗:', error);
        alert('刪除人物誌失敗');
    }
}

// 查看人物誌對應的 Session 統計
async function viewProfileSessionStats(profileId) {
    try {
        // 載入人物誌資料
        const profileRef = database.ref(`agents/${currentProfileAgentId}/profiles/${profileId}`);
        const profileSnapshot = await profileRef.once('value');
        const profile = profileSnapshot.val();

        if (!profile) {
            alert('找不到人物誌資料');
            return;
        }

        const sessionId = profile.sessionId;
        if (!sessionId) {
            alert('此人物誌沒有對應的 Session ID');
            return;
        }

        // 載入對應的 Session 統計
        const analyticsRef = database.ref(`agents/${currentProfileAgentId}/sessionAnalytics/${sessionId}`);
        const analyticsSnapshot = await analyticsRef.once('value');
        const analytics = analyticsSnapshot.val();

        if (!analytics) {
            alert('找不到對應的 Session 統計資料');
            return;
        }

        const deviceInfo = analytics.deviceInfo || {};
        const locationInfo = analytics.locationInfo || {};
        const createdAt = new Date(analytics.createdAt).toLocaleString();
        const lastActivity = new Date(analytics.lastActivity).toLocaleString();

        // 創建詳情對話框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>人物誌 Session 統計</h3>
                    <span class="close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="session-analytics-content">
                        <div class="analytics-section device-info">
                            <h4>📱 裝置資訊</h4>
                            <p><strong>Session ID:</strong> ${analytics.sessionId}</p>
                            <p><strong>裝置類型:</strong> ${deviceInfo.deviceType || 'Unknown'}</p>
                            <p><strong>作業系統:</strong> ${deviceInfo.os || 'Unknown'}</p>
                            <p><strong>瀏覽器:</strong> ${deviceInfo.browser || 'Unknown'}</p>
                            <p><strong>語言:</strong> ${deviceInfo.language || 'Unknown'}</p>
                            <p><strong>螢幕解析度:</strong> ${deviceInfo.screenWidth || 0} x ${deviceInfo.screenHeight || 0}</p>
                            <p><strong>視窗大小:</strong> ${deviceInfo.windowWidth || 0} x ${deviceInfo.windowHeight || 0}</p>
                        </div>
                        
                        <div class="analytics-section location-info">
                            <h4>🌍 地理位置</h4>
                            <p><strong>IP 位址:</strong> ${locationInfo.ip || 'Unknown'}</p>
                            <p><strong>國家:</strong> ${locationInfo.country || 'Unknown'} (${locationInfo.countryCode || 'Unknown'})</p>
                            <p><strong>地區:</strong> ${locationInfo.region || 'Unknown'}</p>
                            <p><strong>城市:</strong> ${locationInfo.city || 'Unknown'}</p>
                            <p><strong>時區:</strong> ${locationInfo.timezone || 'Unknown'}</p>
                            <p><strong>ISP:</strong> ${locationInfo.isp || 'Unknown'}</p>
                        </div>
                        
                        <div class="analytics-section page-info">
                            <h4>🌐 頁面資訊</h4>
                            <p><strong>頁面標題:</strong> ${analytics.pageInfo?.title || 'Unknown'}</p>
                            <p><strong>完整網址:</strong> ${analytics.pageInfo?.url || 'Unknown'}</p>
                            <p><strong>網域:</strong> ${analytics.pageInfo?.hostname || 'Unknown'}</p>
                            <p><strong>路徑:</strong> ${analytics.pageInfo?.pathname || 'Unknown'}</p>
                            <p><strong>來源頁面:</strong> ${analytics.pageInfo?.referrer || 'Direct'}</p>
                            <p><strong>協定:</strong> ${analytics.pageInfo?.protocol || 'Unknown'}</p>
                        </div>
                        
                        <div class="analytics-section session-info">
                            <h4>📊 Session 資訊</h4>
                            <p><strong>創建時間:</strong> ${createdAt}</p>
                            <p><strong>最後活動:</strong> ${lastActivity}</p>
                            <p><strong>活動持續時間:</strong> ${Math.round((analytics.lastActivity - analytics.createdAt) / 1000 / 60)} 分鐘</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 點擊背景關閉對話框
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.remove();
            }
        });

    } catch (error) {
        console.error('載入人物誌 Session 統計失敗:', error);
        alert('載入人物誌 Session 統計失敗');
    }
}

// 顯示人物誌詳情對話框
function showProfileDetailsModal(profile, conversations, profileId = null) {
    // 使用傳入的 profileId 或 profile.id
    const actualProfileId = profileId || profile.id;

    if (!actualProfileId) {
        console.error('無法確定人物誌 ID');
        alert('無法確定人物誌 ID');
        return;
    }
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4';
    modal.onclick = function (e) {
        if (e.target === modal) {
            closeProfileDetailsModal();
        }
    };

    const createdAt = profile.createdAt ? new Date(profile.createdAt).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }) : '未知';
    const confidence = profile.metadata?.confidence || 0;
    const interactions = profile.metadata?.totalInteractions || 0;
    const categories = calculateProfileCategories(profile);

    // 建立人物誌內容 HTML（支援動態欄位）
    let profileContentHtml = '';

    // 動態渲染所有人物誌欄位（排除 metadata）
    const profileFields = Object.keys(profile).filter(key => key !== 'metadata' && key !== 'createdAt' && key !== 'id' && key !== 'sessionId');

    if (profileFields.length > 0) {
        profileFields.forEach(fieldName => {
            const fieldData = profile[fieldName];
            if (fieldData && typeof fieldData === 'object' && Object.keys(fieldData).length > 0) {
                const fieldTitle = getFieldDisplayName(fieldName);
                const fieldValue = formatProfileSection(fieldData);
                if (fieldValue && fieldValue.trim() !== '') {
                    profileContentHtml += `
                        <div class="mb-4">
                            <p class="text-sm font-semibold text-muted-dark">${fieldTitle}</p>
                            <p class="mt-1 text-white">${fieldValue}</p>
                    </div>
                `;
                }
            }
        });
    }

    // 如果沒有動態欄位，顯示提示
    if (profileContentHtml === '') {
        profileContentHtml = '<div class="text-muted-dark">暫無人物誌資料</div>';
    }

    // 建立對話內容 HTML（對話框樣式）
    let conversationsHtml = '';
    if (conversations.length > 0) {
        conversations.forEach((conv, index) => {
            if (!conv || !conv.timestamp) return; // 跳過無效的對話記錄

            const time = new Date(conv.timestamp).toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            const role = conv.role === 'user' ? 'user' : 'assistant';
            const isUser = role === 'user';

            // 分離 JSON 資料和純文字內容
            let content = conv.content || '';
            let jsonData = null;
            let extendedQuestions = null;

            // 確保 content 是字串類型
            if (typeof content !== 'string') {
                content = String(content);
            }

            // 檢查是否包含 JSON 區塊
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                try {
                    jsonData = JSON.parse(jsonMatch[1]);
                    content = content.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
                } catch (e) {
                    console.warn('JSON 解析失敗:', e);
                }
            }

            // 檢查是否包含延伸問題
            const questionsMatch = content.match(/💡\s*延伸問題[：:]\s*([\s\S]*?)(?=\n\n|$)/);
            if (questionsMatch) {
                const questionsText = questionsMatch[1].trim();
                const questions = questionsText.split(/\n/).filter(q => q.trim()).map(q => q.replace(/^\d+[\.\)]\s*/, '').trim());
                if (questions.length > 0) {
                    extendedQuestions = questions;
                    content = content.replace(/💡\s*延伸問題[：:]\s*[\s\S]*?$/, '').trim();
                }
            }

            // 優化 Markdown 格式
            content = formatMarkdownContent(content);

            // 根據角色設置不同的樣式
            const avatarBg = isUser ? 'bg-blue-500' : 'bg-teal-500';
            const bubbleClasses = isUser
                ? 'rounded-b-xl rounded-tr-xl'
                : 'rounded-b-xl rounded-tl-xl';

            conversationsHtml += `
                <div class="flex items-start gap-3">
                    <div class="flex size-8 shrink-0 items-center justify-center rounded-full ${avatarBg} text-white">
                        <span class="material-symbols-outlined text-lg">${isUser ? 'person' : 'smart_toy'}</span>
                    </div>
                    <div class="w-full">
                        <div class="flex items-baseline gap-2">
                            <p class="font-semibold text-white">${isUser ? '用戶' : 'AI 助手'}</p>
                            <p class="text-xs text-muted-dark">${time}</p>
                        </div>
                        <div class="mt-1 max-w-lg ${bubbleClasses} bg-white p-3 text-sm text-gray-800 dark:bg-[#343447] dark:text-gray-200">
                            ${content ? `<div class="space-y-3">${content.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}</div>` : ''}
                            ${extendedQuestions ? `
                                <div class="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-border-dark dark:bg-background-dark dark:text-muted-dark">
                                    <p class="font-semibold">💡 延伸問題：</p>
                                    <ol class="mt-1 list-inside list-decimal space-y-1">
                                        ${extendedQuestions.map(q => `<li>${q}</li>`).join('')}
                                    </ol>
                            </div>
                        ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
    } else {
        conversationsHtml = '<div class="text-center py-8 text-muted-dark">沒有找到相關對話記錄</div>';
    }

    modal.innerHTML = `
        <div class="flex h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-[#F4F4F9] dark:bg-card-dark shadow-2xl">
            <header class="flex shrink-0 items-start justify-between border-b border-white/10 p-6 bg-gradient-to-r from-[#8172F5] to-[#6795FF] rounded-t-xl text-white">
                <div>
                    <h2 class="text-xl font-bold">人物誌詳情</h2>
                    <div class="mt-4 flex items-center gap-6 text-sm">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-lg">psychology</span>
                            <span>核心態度 <strong>${confidence.toFixed(1)}</strong></span>
                    </div>
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-lg">forum</span>
                            <span>互動 <strong>${interactions}</strong></span>
                </div>
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-lg">schedule</span>
                            <span>${profile.sessionId ? 'Session' : '未知'}</span>
            </div>
                        </div>
                        </div>
                <button class="rounded-full p-1.5 hover:bg-white/20 transition-colors" onclick="closeProfileDetailsModal()">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </header>
            <div class="flex flex-1 flex-col overflow-hidden md:flex-row">
                <aside class="w-full shrink-0 border-b border-border-dark md:w-1/3 md:border-b-0 md:border-r">
                    <div class="flex h-full flex-col">
                        <div class="flex items-center justify-between border-b border-border-dark p-4">
                            <h3 class="font-semibold text-white">基本資訊</h3>
                            <div class="flex items-center gap-2">
                                <span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">${categories} 類別</span>
                                <button id="toggleJsonEdit-${actualProfileId}" class="p-1.5 text-muted-dark hover:text-white rounded-md hover:bg-white/10 transition-colors" onclick="toggleProfileJsonEdit('${actualProfileId}')" title="編輯 JSON">
                                    <span class="material-symbols-outlined !text-lg">code</span>
                                </button>
                    </div>
                        </div>
                        <div id="profileContent-${actualProfileId}" class="flex-1 space-y-4 p-4 overflow-y-auto">
                            ${profileContentHtml}
                        </div>
                        <div id="profileJsonEdit-${actualProfileId}" class="flex-1 flex-col p-4 overflow-y-auto" style="display: none;">
                            <div class="mb-3">
                                <label class="block text-xs text-muted-dark mb-2">JSON 內容</label>
                                <textarea 
                                    id="profileJsonTextarea-${actualProfileId}" 
                                    class="w-full h-full min-h-[400px] rounded-lg border border-border-dark bg-background-dark px-3 py-2 text-sm text-white font-mono placeholder-muted-dark focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                                    placeholder="請輸入有效的 JSON 格式..."
                                    spellcheck="false"
                                >${JSON.stringify(profile, null, 2)}</textarea>
                    </div>
                            <div class="flex gap-2 mt-3">
                                <button 
                                    onclick="saveProfileJson('${actualProfileId}')" 
                                    class="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
                                >
                                    保存
                                </button>
                                <button 
                                    onclick="toggleProfileJsonEdit('${actualProfileId}')" 
                                    class="rounded-lg border border-border-dark bg-background-dark px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
                                >
                                    取消
                                </button>
                </div>
                            <div id="jsonError-${actualProfileId}" class="mt-2 text-xs text-red-400" style="display: none;"></div>
                    </div>
                        <div class="border-t border-border-dark p-4 text-xs text-muted-dark">
                            <p>建立時間</p>
                            <p>${createdAt}</p>
                        </div>
                </div>
                </aside>
                <main class="flex flex-1 flex-col overflow-hidden">
                    <div class="flex items-center justify-between border-b border-border-dark p-4">
                        <h3 class="font-semibold text-white">對話紀錄</h3>
                        <span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">${conversations.length} 條</span>
            </div>
                    <div class="flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
                        ${conversationsHtml}
                    </div>
                    <div class="mt-auto flex justify-end p-6 border-t border-border-dark">
                        <button class="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors" onclick="closeProfileDetailsModal()">關閉</button>
                    </div>
                </main>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// 切換 JSON 編輯模式
function toggleProfileJsonEdit(profileId) {
    const contentDiv = document.getElementById(`profileContent-${profileId}`);
    const jsonEditDiv = document.getElementById(`profileJsonEdit-${profileId}`);
    const toggleButton = document.getElementById(`toggleJsonEdit-${profileId}`);
    const errorDiv = document.getElementById(`jsonError-${profileId}`);

    if (!contentDiv || !jsonEditDiv) return;

    // 切換顯示
    if (contentDiv.style.display === 'none') {
        // 切換回內容顯示模式
        contentDiv.style.display = 'block';
        jsonEditDiv.style.display = 'none';
        errorDiv.style.display = 'none';
        if (toggleButton) {
            toggleButton.classList.remove('bg-primary/20', 'text-primary');
        }
    } else {
        // 切換到 JSON 編輯模式
        contentDiv.style.display = 'none';
        jsonEditDiv.style.display = 'flex';
        if (toggleButton) {
            toggleButton.classList.add('bg-primary/20', 'text-primary');
        }
        // 聚焦到 textarea
        const textarea = document.getElementById(`profileJsonTextarea-${profileId}`);
        if (textarea) {
            setTimeout(() => textarea.focus(), 100);
        }
    }
}

// 保存人物誌 JSON
async function saveProfileJson(profileId) {
    try {
        if (!currentProfileAgentId) {
            alert('無法確定當前代理');
            return;
        }

        const textarea = document.getElementById(`profileJsonTextarea-${profileId}`);
        const errorDiv = document.getElementById(`jsonError-${profileId}`);

        if (!textarea) {
            alert('找不到 JSON 編輯區域');
            return;
        }

        const jsonText = textarea.value.trim();

        // 驗證 JSON 格式
        let updatedProfile;
        try {
            updatedProfile = JSON.parse(jsonText);
        } catch (error) {
            errorDiv.textContent = `JSON 格式錯誤: ${error.message}`;
            errorDiv.style.display = 'block';
            return;
        }

        // 驗證是否為物件
        if (typeof updatedProfile !== 'object' || updatedProfile === null || Array.isArray(updatedProfile)) {
            errorDiv.textContent = 'JSON 必須是一個物件';
            errorDiv.style.display = 'block';
            return;
        }

        // 保留必要的欄位（id, createdAt, sessionId）
        const profileRef = database.ref(`agents/${currentProfileAgentId}/profiles/${profileId}`);
        const snapshot = await profileRef.once('value');
        const currentProfile = snapshot.val();

        if (!currentProfile) {
            alert('找不到人物誌資料');
            return;
        }

        // 保留必要的系統欄位
        if (currentProfile.id) updatedProfile.id = currentProfile.id;
        if (currentProfile.createdAt) updatedProfile.createdAt = currentProfile.createdAt;
        if (currentProfile.sessionId) updatedProfile.sessionId = currentProfile.sessionId;

        // 更新 metadata.lastUpdated
        if (!updatedProfile.metadata) {
            updatedProfile.metadata = {};
        }
        updatedProfile.metadata.lastUpdated = Date.now();

        // 更新到 Firebase
        await profileRef.set(updatedProfile);

        // 清除快取，強制重新載入
        if (currentProfileAgentId) {
            clearProfilesCache(currentProfileAgentId);
        }

        // 隱藏錯誤訊息
        errorDiv.style.display = 'none';

        alert('人物誌 JSON 已成功保存');

        // 重新載入人物誌列表以反映更改
        if (currentProfileAgentId) {
            loadProfiles(true);
        }

        // 關閉模態框
        closeProfileDetailsModal();

    } catch (error) {
        console.error('保存人物誌 JSON 失敗:', error);
        const errorDiv = document.getElementById(`jsonError-${profileId}`);
        if (errorDiv) {
            errorDiv.textContent = `保存失敗: ${error.message}`;
            errorDiv.style.display = 'block';
        } else {
            alert('保存人物誌 JSON 失敗，請稍後再試');
        }
    }
}

// 關閉人物誌詳情對話框
function closeProfileDetailsModal() {
    const modals = document.querySelectorAll('.fixed.inset-0.z-50');
    // 找到最後一個（最上層）的模態框
    if (modals.length > 0) {
        modals[modals.length - 1].remove();
    }
}

// 重新整理人物誌
function refreshProfiles() {
    if (currentProfileAgentId) {
        // 清除快取
        clearProfilesCache(currentProfileAgentId);
        // 清除搜索框
        const searchInput = document.getElementById('profileSearchInput');
        if (searchInput) {
            searchInput.value = '';
        }
        // 重置排序和篩選
        currentSortBy = 'time-desc';
        currentFilter = 'all';
        // 強制刷新
        loadProfiles(true);
    } else {
        alert('請先選擇代理');
    }
}

// 切換人物誌分析分頁
function switchProfileTab(tabId, buttonElement) {
    // 隱藏所有分頁內容
    document.querySelectorAll('.profile-tab-content').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
    });

    // 移除所有按鈕的激活狀態
    document.querySelectorAll('.profile-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.classList.remove('text-gray-50');
        btn.classList.add('text-muted-dark');
    });

    // 顯示選中的分頁
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
        targetTab.style.display = 'flex';
    }

    // 激活選中的按鈕
    if (buttonElement) {
        buttonElement.classList.add('active');
        buttonElement.classList.add('text-gray-50');
        buttonElement.classList.remove('text-muted-dark');
    }

    // 根據分頁載入數據
    if (tabId === 'failed-conversations') {
        const agentId = document.getElementById('failedConversationsAgentSelect')?.value || document.getElementById('profileAgentSelect')?.value;
        if (agentId) {
            loadFailedConversations(agentId);
        }
    } else if (tabId === 'session-analytics') {
        const agentId = document.getElementById('sessionAnalyticsAgentSelect')?.value || document.getElementById('profileAgentSelect')?.value;
        if (agentId) {
            loadSessionAnalytics(agentId);
        }
    }
}

// 顯示失敗對話
function showFailedConversations() {
    // 切換到失敗對話分頁
    const tabButton = document.querySelector('[onclick*="switchProfileTab(\'failed-conversations\'"]');
    if (tabButton) {
        switchProfileTab('failed-conversations', tabButton);
    }
}

// 載入失敗對話
async function loadFailedConversations(agentId) {
    try {
        const failedList = document.getElementById('failedConversationsList');

        // 載入所有對話
        const conversationsRef = database.ref(`agents/${agentId}/conversations`);
        const conversationsSnapshot = await conversationsRef.once('value');
        const conversations = conversationsSnapshot.val() || {};

        // 載入所有人物誌
        const profilesRef = database.ref(`agents/${agentId}/profiles`);
        const profilesSnapshot = await profilesRef.once('value');
        const profiles = profilesSnapshot.val() || {};

        // 找出沒有對應人物誌的對話
        const failedConversations = [];
        const profileSessionIds = new Set();

        // 收集所有人物誌的 sessionId
        Object.values(profiles).forEach(profile => {
            if (profile.sessionId) {
                profileSessionIds.add(profile.sessionId);
            }
        });

        // 找出沒有對應人物誌的對話
        Object.entries(conversations).forEach(([conversationId, conversation]) => {
            const sessionId = conversation.sessionId;
            const hasProfile = sessionId && profileSessionIds.has(sessionId);

            if (!hasProfile && conversation.messages) {
                const messages = Object.values(conversation.messages);
                if (messages.length > 0) {
                    failedConversations.push({
                        id: conversationId,
                        sessionId: sessionId,
                        conversation: conversation,
                        messages: messages,
                        reason: determineFailureReason(conversation, messages)
                    });
                }
            }
        });

        // 按創建時間排序（最新的在前）
        failedConversations.sort((a, b) => (b.conversation.createdAt || 0) - (a.conversation.createdAt || 0));

        if (failedConversations.length === 0) {
            failedList.innerHTML = '<div class="no-data">沒有找到失敗的對話</div>';
            return;
        }

        // 渲染失敗對話列表
        renderFailedConversations(failedConversations);

    } catch (error) {
        console.error('載入失敗對話失敗:', error);
        document.getElementById('failedConversationsList').innerHTML = '<div class="error">載入失敗對話失敗</div>';
    }
}

// 判斷失敗原因
function determineFailureReason(conversation, messages) {
    const messageCount = messages.length;
    const lastMessage = messages[messages.length - 1];
    const hasUserMessages = messages.some(msg => msg.role === 'user');
    const hasAssistantMessages = messages.some(msg => msg.role === 'assistant');

    if (messageCount < 2) {
        return '對話訊息過少，無法建立人物誌';
    }

    if (!hasUserMessages) {
        return '缺少用戶訊息，無法分析用戶資訊';
    }

    if (!hasAssistantMessages) {
        return '缺少助手回應，無法建立完整對話';
    }

    if (lastMessage && lastMessage.role === 'user') {
        return '對話未完成，最後一條是用戶訊息';
    }

    return '未知原因，未能成功建立人物誌';
}

// 渲染失敗對話列表
function renderFailedConversations(failedConversations) {
    const failedList = document.getElementById('failedConversationsList');

    let html = '';
    failedConversations.forEach(failedConv => {
        html += createFailedConversationCard(failedConv);
    });

    failedList.innerHTML = html;
}

// 創建失敗對話卡片
function createFailedConversationCard(failedConv) {
    const conversation = failedConv.conversation;
    const messages = failedConv.messages;
    const createdAt = new Date(conversation.createdAt || Date.now()).toLocaleString();
    const sessionId = conversation.sessionId || '未知';
    const messageCount = messages.length;

    // 生成對話預覽
    const preview = messages.slice(0, 3).map(msg => {
        const role = msg.role === 'user' ? '用戶' : '助手';
        const content = msg.content ? msg.content.substring(0, 50) + '...' : '無內容';
        return `${role}: ${content}`;
    }).join('<br>');

    return `
        <div class="failed-conversation-card">
            <div class="failed-conversation-header">
                <div class="failed-conversation-title">對話 ${failedConv.id.substring(0, 8)}</div>
                <div class="failed-conversation-meta">
                    <span>Session: ${sessionId.substring(0, 8)}</span>
                    <span>創建時間: ${createdAt}</span>
                </div>
            </div>
            
            <div class="failed-conversation-stats">
                <div class="failed-stat-item">
                    <div class="failed-stat-value">${messageCount}</div>
                    <div class="failed-stat-label">訊息數</div>
                </div>
                <div class="failed-stat-item">
                    <div class="failed-stat-value">${failedConv.reason.includes('過少') ? '⚠️' : '❌'}</div>
                    <div class="failed-stat-label">狀態</div>
                </div>
            </div>
            
            <div class="failed-conversation-reason">
                <strong>失敗原因：</strong>${failedConv.reason}
            </div>
            
            <div class="failed-conversation-content">
                <div class="failed-conversation-messages">
                    ${messages.map(msg => `
                        <div class="failed-message ${msg.role}">
                            <strong>${msg.role === 'user' ? '用戶' : '助手'}:</strong> 
                            ${msg.content || '無內容'}
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="failed-conversation-actions">
                <button class="btn btn-secondary" onclick="viewFailedConversationDetails('${failedConv.id}')">查看詳情</button>
                <button class="btn btn-secondary" onclick="viewFailedConversationSessionStats('${failedConv.id}')">Session 統計</button>
                <button class="btn" onclick="retryCreateProfile('${failedConv.id}')">重新建立人物誌</button>
                <button class="btn btn-danger" onclick="deleteFailedConversation('${failedConv.id}')">刪除對話</button>
            </div>
        </div>
    `;
}

// 查看失敗對話詳情
async function viewFailedConversationDetails(conversationId) {
    try {
        const agentId = document.getElementById('profileAgentSelect').value;
        const conversationRef = database.ref(`agents/${agentId}/conversations/${conversationId}`);
        const snapshot = await conversationRef.once('value');
        const conversation = snapshot.val();

        if (!conversation) {
            alert('找不到對話資料');
            return;
        }

        const messages = Object.values(conversation.messages || {});
        const createdAt = new Date(conversation.createdAt || Date.now()).toLocaleString();

        // 創建詳情對話框
        const modal = document.createElement('div');
        modal.className = 'modal failed-conversation-details-modal';
        modal.style.display = 'block';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🔍 失敗對話詳情分析</h3>
                    <span class="close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="conversation-details">
                        <h4>對話資訊</h4>
                        <p><strong>對話ID:</strong> ${conversationId}</p>
                        <p><strong>Session ID:</strong> ${conversation.sessionId || '未知'}</p>
                        <p><strong>創建時間:</strong> ${createdAt}</p>
                        <p><strong>訊息數量:</strong> ${messages.length}</p>
                    </div>
                    
                    <div class="conversation-messages">
                        <h4>完整對話內容</h4>
                        <div class="enhanced-messages-container">
                            ${messages.map((msg, index) => {
            const timestamp = new Date(msg.timestamp || Date.now()).toLocaleString();
            const roleText = msg.role === 'user' ? '用戶' : '助手';
            const roleIcon = msg.role === 'user' ? '👤' : '🤖';

            return `
                                    <div class="enhanced-failed-message ${msg.role}">
                                        <div class="message-header">
                                            <div class="message-role">
                                                ${roleIcon} ${roleText}
                                            </div>
                                            <div class="message-timestamp">${timestamp}</div>
                                        </div>
                                        <div class="message-content">${msg.content || '無內容'}</div>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    </div>
                    
                    <div class="action-buttons">
                        <button class="btn btn-secondary" onclick="exportConversation('${conversationId}')">📤 匯出對話</button>
                        <button class="btn" onclick="retryCreateProfile('${conversationId}')">🔄 重新建立人物誌</button>
                        <button class="btn btn-danger" onclick="deleteFailedConversation('${conversationId}')">🗑️ 刪除對話</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 點擊背景關閉對話框
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.remove();
            }
        });

    } catch (error) {
        console.error('載入對話詳情失敗:', error);
        alert('載入對話詳情失敗');
    }
}

// 匯出對話
function exportConversation(conversationId) {
    try {
        const agentId = document.getElementById('profileAgentSelect').value;
        const conversationRef = database.ref(`agents/${agentId}/conversations/${conversationId}`);

        conversationRef.once('value').then(snapshot => {
            const conversation = snapshot.val();
            if (!conversation || !conversation.messages) {
                alert('找不到對話資料');
                return;
            }

            const messages = Object.values(conversation.messages);
            const createdAt = new Date(conversation.createdAt || Date.now()).toLocaleString();

            // 生成匯出內容
            let exportContent = `對話匯出報告\n`;
            exportContent += `==================\n\n`;
            exportContent += `對話ID: ${conversationId}\n`;
            exportContent += `Session ID: ${conversation.sessionId || '未知'}\n`;
            exportContent += `創建時間: ${createdAt}\n`;
            exportContent += `訊息數量: ${messages.length}\n\n`;
            exportContent += `對話內容:\n`;
            exportContent += `==================\n\n`;

            messages.forEach((msg, index) => {
                const timestamp = new Date(msg.timestamp || Date.now()).toLocaleString();
                const role = msg.role === 'user' ? '用戶' : '助手';
                exportContent += `[${index + 1}] ${role} (${timestamp}):\n`;
                exportContent += `${msg.content || '無內容'}\n\n`;
            });

            // 創建下載連結
            const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `對話_${conversationId.substring(0, 8)}_${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            alert('對話已匯出');
        });

    } catch (error) {
        console.error('匯出對話失敗:', error);
        alert('匯出對話失敗');
    }
}

// 重新建立人物誌
async function retryCreateProfile(conversationId) {
    if (!confirm('確定要重新嘗試為這個對話建立人物誌嗎？')) {
        return;
    }

    try {
        const agentId = document.getElementById('profileAgentSelect').value;
        const conversationRef = database.ref(`agents/${agentId}/conversations/${conversationId}`);
        const snapshot = await conversationRef.once('value');
        const conversation = snapshot.val();

        if (!conversation || !conversation.messages) {
            alert('找不到對話資料');
            return;
        }

        // 這裡可以添加重新建立人物誌的邏輯
        // 例如調用AI分析對話內容並建立人物誌
        alert('重新建立人物誌功能正在開發中...');

    } catch (error) {
        console.error('重新建立人物誌失敗:', error);
        alert('重新建立人物誌失敗');
    }
}

// 刪除失敗對話
async function deleteFailedConversation(conversationId) {
    if (!confirm('確定要刪除這個對話嗎？此操作無法復原。')) {
        return;
    }

    try {
        const agentId = document.getElementById('profileAgentSelect').value;

        // 先獲取對話資料以取得 sessionId
        const conversationRef = database.ref(`agents/${agentId}/conversations/${conversationId}`);
        const conversationSnapshot = await conversationRef.once('value');
        const conversation = conversationSnapshot.val();

        if (!conversation) {
            alert('找不到對話資料');
            return;
        }

        const sessionId = conversation.sessionId;
        console.log('刪除失敗對話，sessionId:', sessionId);

        // 刪除對話記錄
        await conversationRef.remove();

        // 刪除對應的 session 統計
        if (sessionId) {
            const sessionAnalyticsRef = database.ref(`agents/${agentId}/sessionAnalytics/${sessionId}`);
            await sessionAnalyticsRef.remove();
            console.log('Session 統計已刪除');
        }

        // 直接移除對應的 HTML 元素
        const conversationCard = document.querySelector(`[onclick*="deleteFailedConversation('${conversationId}')"]`)?.closest('.failed-conversation-card');
        if (conversationCard) {
            conversationCard.remove();
        }

        // 檢查是否還有其他失敗對話，如果沒有則顯示空狀態
        const failedList = document.getElementById('failedConversationsList');
        const remainingCards = failedList.querySelectorAll('.failed-conversation-card');
        if (remainingCards.length === 0) {
            failedList.innerHTML = '<div class="no-data">沒有找到失敗的對話</div>';
        }

        // 保持當前選擇的代理不變，不重新載入

    } catch (error) {
        console.error('刪除對話失敗:', error);
        alert('刪除對話失敗');
    }
}

// 查看失敗對話對應的 Session 統計
async function viewFailedConversationSessionStats(conversationId) {
    try {
        const agentId = document.getElementById('profileAgentSelect').value;
        const conversationRef = database.ref(`agents/${agentId}/conversations/${conversationId}`);
        const snapshot = await conversationRef.once('value');
        const conversation = snapshot.val();

        if (!conversation) {
            alert('找不到對話資料');
            return;
        }

        const sessionId = conversation.sessionId;
        if (!sessionId) {
            alert('此對話沒有對應的 Session ID');
            return;
        }

        // 載入對應的 Session 統計
        const analyticsRef = database.ref(`agents/${agentId}/sessionAnalytics/${sessionId}`);
        const analyticsSnapshot = await analyticsRef.once('value');
        const analytics = analyticsSnapshot.val();

        if (!analytics) {
            alert('找不到對應的 Session 統計資料');
            return;
        }

        const deviceInfo = analytics.deviceInfo || {};
        const locationInfo = analytics.locationInfo || {};
        const createdAt = new Date(analytics.createdAt).toLocaleString();
        const lastActivity = new Date(analytics.lastActivity).toLocaleString();

        // 創建詳情對話框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>失敗對話 Session 統計</h3>
                    <span class="close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="session-analytics-content">
                        <div class="analytics-section device-info">
                            <h4>📱 裝置資訊</h4>
                            <p><strong>Session ID:</strong> ${analytics.sessionId}</p>
                            <p><strong>對話 ID:</strong> ${conversationId}</p>
                            <p><strong>裝置類型:</strong> ${deviceInfo.deviceType || 'Unknown'}</p>
                            <p><strong>作業系統:</strong> ${deviceInfo.os || 'Unknown'}</p>
                            <p><strong>瀏覽器:</strong> ${deviceInfo.browser || 'Unknown'}</p>
                            <p><strong>語言:</strong> ${deviceInfo.language || 'Unknown'}</p>
                            <p><strong>螢幕解析度:</strong> ${deviceInfo.screenWidth || 0} x ${deviceInfo.screenHeight || 0}</p>
                            <p><strong>視窗大小:</strong> ${deviceInfo.windowWidth || 0} x ${deviceInfo.windowHeight || 0}</p>
                        </div>
                        
                        <div class="analytics-section location-info">
                            <h4>🌍 地理位置</h4>
                            <p><strong>IP 位址:</strong> ${locationInfo.ip || 'Unknown'}</p>
                            <p><strong>國家:</strong> ${locationInfo.country || 'Unknown'} (${locationInfo.countryCode || 'Unknown'})</p>
                            <p><strong>地區:</strong> ${locationInfo.region || 'Unknown'}</p>
                            <p><strong>城市:</strong> ${locationInfo.city || 'Unknown'}</p>
                            <p><strong>時區:</strong> ${locationInfo.timezone || 'Unknown'}</p>
                            <p><strong>ISP:</strong> ${locationInfo.isp || 'Unknown'}</p>
                        </div>
                        
                        <div class="analytics-section page-info">
                            <h4>🌐 頁面資訊</h4>
                            <p><strong>頁面標題:</strong> ${analytics.pageInfo?.title || 'Unknown'}</p>
                            <p><strong>完整網址:</strong> ${analytics.pageInfo?.url || 'Unknown'}</p>
                            <p><strong>網域:</strong> ${analytics.pageInfo?.hostname || 'Unknown'}</p>
                            <p><strong>路徑:</strong> ${analytics.pageInfo?.pathname || 'Unknown'}</p>
                            <p><strong>來源頁面:</strong> ${analytics.pageInfo?.referrer || 'Direct'}</p>
                            <p><strong>協定:</strong> ${analytics.pageInfo?.protocol || 'Unknown'}</p>
                        </div>
                        
                        <div class="analytics-section session-info">
                            <h4>📊 Session 資訊</h4>
                            <p><strong>創建時間:</strong> ${createdAt}</p>
                            <p><strong>最後活動:</strong> ${lastActivity}</p>
                            <p><strong>活動持續時間:</strong> ${Math.round((analytics.lastActivity - analytics.createdAt) / 1000 / 60)} 分鐘</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 點擊背景關閉對話框
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.remove();
            }
        });

    } catch (error) {
        console.error('載入失敗對話 Session 統計失敗:', error);
        alert('載入失敗對話 Session 統計失敗');
    }
}

// 顯示 Session 統計
function showSessionAnalytics() {
    // 切換到 Session 統計分頁
    const tabButton = document.querySelector('[onclick*="switchProfileTab(\'session-analytics\'"]');
    if (tabButton) {
        switchProfileTab('session-analytics', tabButton);
    }
}

// 重新整理失敗對話
function refreshFailedConversations() {
    const agentId = document.getElementById('failedConversationsAgentSelect')?.value || document.getElementById('profileAgentSelect')?.value;
    if (agentId) {
        loadFailedConversations(agentId);
    } else {
        alert('請先選擇代理');
    }
}

// 重新整理 Session 統計
function refreshSessionAnalytics() {
    const agentId = document.getElementById('sessionAnalyticsAgentSelect')?.value || document.getElementById('profileAgentSelect')?.value;
    if (agentId) {
        loadSessionAnalytics(agentId);
    } else {
        alert('請先選擇代理');
    }
}

// 載入 Session 統計
async function loadSessionAnalytics(agentId) {
    try {
        const sessionAnalyticsContent = document.getElementById('sessionAnalyticsContent');
        if (!sessionAnalyticsContent) {
            console.error('找不到 sessionAnalyticsContent 元素');
            return;
        }

        sessionAnalyticsContent.innerHTML = '<div class="text-center py-12 px-4 text-muted-dark">載入 Session 統計中...</div>';

        // 載入所有 session 統計
        const analyticsRef = database.ref(`agents/${agentId}/sessionAnalytics`);
        const analyticsSnapshot = await analyticsRef.once('value');
        const analytics = analyticsSnapshot.val() || {};

        if (Object.keys(analytics).length === 0) {
            sessionAnalyticsContent.innerHTML = '<div class="text-center py-12 px-4 text-muted-dark">該代理尚未有 Session 統計資料</div>';
            return;
        }

        // 渲染圖表分析儀表板
        renderAnalyticsDashboard(analytics, sessionAnalyticsContent);

    } catch (error) {
        console.error('載入 Session 統計失敗:', error);
        const sessionAnalyticsContent = document.getElementById('sessionAnalyticsContent');
        if (sessionAnalyticsContent) {
            sessionAnalyticsContent.innerHTML = '<div class="text-center py-12 px-4 text-red-400">載入 Session 統計失敗</div>';
        }
    }
}

// 渲染圖表分析儀表板
function renderAnalyticsDashboard(analytics, container) {
    const analyticsArray = Object.values(analytics);
    const totalSessions = analyticsArray.length;

    // 分析數據
    const deviceTypeStats = analyzeDeviceTypes(analyticsArray);
    const osStats = analyzeOperatingSystems(analyticsArray);
    const browserStats = analyzeBrowsers(analyticsArray);
    const locationStats = analyzeLocations(analyticsArray);
    const timeStats = analyzeTimeDistribution(analyticsArray);
    const screenStats = analyzeScreenResolutions(analyticsArray);

    // 頁面分析數據
    const pageDomainStats = analyzePageDomains(analyticsArray);
    const pagePathStats = analyzePagePaths(analyticsArray);
    const pageTitleStats = analyzePageTitles(analyticsArray);
    const pageProtocolStats = analyzePageProtocols(analyticsArray);

    // 創建 HTML 結構
    const dashboardHtml = `
        <div id="analyticsDashboard" class="analytics-dashboard">
            <div class="dashboard-grid">
                <!-- 裝置類型分布 -->
                <div class="chart-container">
                    <h4>📱 裝置類型分布</h4>
                    <canvas id="deviceTypeChart"></canvas>
                </div>
                
                <!-- 作業系統分布 -->
                <div class="chart-container">
                    <h4>💻 作業系統分布</h4>
                    <canvas id="osChart"></canvas>
                </div>
                
                <!-- 瀏覽器分布 -->
                <div class="chart-container">
                    <h4>🌐 瀏覽器分布</h4>
                    <canvas id="browserChart"></canvas>
                </div>
                
                <!-- 地理位置分布 -->
                <div class="chart-container">
                    <h4>🌍 地理位置分布</h4>
                    <canvas id="locationChart"></canvas>
                </div>
                
                <!-- 時間分布 -->
                <div class="chart-container">
                    <h4>⏰ 活動時間分布</h4>
                    <canvas id="timeChart"></canvas>
                </div>
                
                <!-- 螢幕解析度分布 -->
                <div class="chart-container">
                    <h4>📺 螢幕解析度分布</h4>
                    <canvas id="screenChart"></canvas>
                </div>
                
                <!-- 頁面網域分布 -->
                <div class="chart-container">
                    <h4>🌐 頁面網域分布</h4>
                    <canvas id="pageDomainChart"></canvas>
                </div>
                
                <!-- 頁面路徑分布 -->
                <div class="chart-container">
                    <h4>📁 頁面路徑分布</h4>
                    <canvas id="pagePathChart"></canvas>
                </div>
                
                <!-- 頁面標題分布 -->
                <div class="chart-container">
                    <h4>📄 頁面標題分布</h4>
                    <canvas id="pageTitleChart"></canvas>
                </div>
                
                <!-- 頁面協定分布 -->
                <div class="chart-container">
                    <h4>🔒 頁面協定分布</h4>
                    <canvas id="pageProtocolChart"></canvas>
                </div>
            </div>
            
            <!-- 統計摘要 -->
            <div id="analyticsSummary" class="analytics-summary">
                <div class="summary-loading">載入統計摘要中...</div>
            </div>
        </div>
    `;

    if (container) {
        container.innerHTML = dashboardHtml;
    }

    // 創建圖表
    createDeviceTypeChart(deviceTypeStats);
    createOSChart(osStats);
    createBrowserChart(browserStats);
    createLocationChart(locationStats);
    createTimeChart(timeStats);
    createScreenChart(screenStats);

    // 創建頁面分析圖表
    createPageDomainChart(pageDomainStats);
    createPagePathChart(pagePathStats);
    createPageTitleChart(pageTitleStats);
    createPageProtocolChart(pageProtocolStats);

    // 更新統計摘要
    updateAnalyticsSummary(totalSessions, analyticsArray);
}

// 分析裝置類型
function analyzeDeviceTypes(analyticsArray) {
    const stats = {};
    analyticsArray.forEach(analytics => {
        const deviceType = analytics.deviceInfo?.deviceType || 'Unknown';
        stats[deviceType] = (stats[deviceType] || 0) + 1;
    });
    return stats;
}

// 分析作業系統
function analyzeOperatingSystems(analyticsArray) {
    const stats = {};
    analyticsArray.forEach(analytics => {
        const os = analytics.deviceInfo?.os || 'Unknown';
        stats[os] = (stats[os] || 0) + 1;
    });
    return stats;
}

// 分析瀏覽器
function analyzeBrowsers(analyticsArray) {
    const stats = {};
    analyticsArray.forEach(analytics => {
        const browser = analytics.deviceInfo?.browser || 'Unknown';
        stats[browser] = (stats[browser] || 0) + 1;
    });
    return stats;
}

// 分析地理位置
function analyzeLocations(analyticsArray) {
    const stats = {};
    analyticsArray.forEach(analytics => {
        const country = analytics.locationInfo?.country || 'Unknown';
        stats[country] = (stats[country] || 0) + 1;
    });
    return stats;
}

// 分析時間分布
function analyzeTimeDistribution(analyticsArray) {
    const stats = { '00-06': 0, '06-12': 0, '12-18': 0, '18-24': 0 };
    analyticsArray.forEach(analytics => {
        const hour = new Date(analytics.createdAt).getHours();
        if (hour >= 0 && hour < 6) stats['00-06']++;
        else if (hour >= 6 && hour < 12) stats['06-12']++;
        else if (hour >= 12 && hour < 18) stats['12-18']++;
        else stats['18-24']++;
    });
    return stats;
}

// 分析螢幕解析度
function analyzeScreenResolutions(analyticsArray) {
    const stats = {};
    analyticsArray.forEach(analytics => {
        const width = analytics.deviceInfo?.screenWidth || 0;
        const height = analytics.deviceInfo?.screenHeight || 0;
        if (width > 0 && height > 0) {
            const resolution = `${width}x${height}`;
            stats[resolution] = (stats[resolution] || 0) + 1;
        }
    });
    return stats;
}

// 分析頁面網域
function analyzePageDomains(analyticsArray) {
    const stats = {};
    analyticsArray.forEach(analytics => {
        const domain = analytics.pageInfo?.hostname || 'Unknown';
        stats[domain] = (stats[domain] || 0) + 1;
    });
    return stats;
}

// 分析頁面路徑
function analyzePagePaths(analyticsArray) {
    const stats = {};
    analyticsArray.forEach(analytics => {
        const pathname = analytics.pageInfo?.pathname || 'Unknown';
        // 簡化路徑，只保留主要部分
        const simplifiedPath = pathname.split('/').slice(0, 3).join('/') || '/';
        stats[simplifiedPath] = (stats[simplifiedPath] || 0) + 1;
    });
    return stats;
}

// 分析頁面標題
function analyzePageTitles(analyticsArray) {
    const stats = {};
    analyticsArray.forEach(analytics => {
        const title = analytics.pageInfo?.title || 'Unknown';
        // 截取標題前30個字符，避免過長
        const shortTitle = title.length > 30 ? title.substring(0, 30) + '...' : title;
        stats[shortTitle] = (stats[shortTitle] || 0) + 1;
    });
    return stats;
}

// 分析頁面協定
function analyzePageProtocols(analyticsArray) {
    const stats = {};
    analyticsArray.forEach(analytics => {
        const protocol = analytics.pageInfo?.protocol || 'Unknown';
        stats[protocol] = (stats[protocol] || 0) + 1;
    });
    return stats;
}

// 創建裝置類型圖表
function createDeviceTypeChart(stats) {
    const ctx = document.getElementById('deviceTypeChart').getContext('2d');

    // 銷毀現有圖表
    if (window.deviceTypeChart && typeof window.deviceTypeChart.destroy === 'function') {
        try {
            window.deviceTypeChart.destroy();
        } catch (e) {
            console.log('銷毀裝置類型圖表時出錯:', e);
        }
        window.deviceTypeChart = null;
    }

    window.deviceTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                data: Object.values(stats),
                backgroundColor: ['#4facfe', '#00f2fe', '#667eea', '#764ba2', '#f093fb']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// 創建作業系統圖表
function createOSChart(stats) {
    const ctx = document.getElementById('osChart').getContext('2d');

    // 銷毀現有圖表
    if (window.osChart && typeof window.osChart.destroy === 'function') {
        try {
            window.osChart.destroy();
        } catch (e) {
            console.log('銷毀作業系統圖表時出錯:', e);
        }
        window.osChart = null;
    }

    window.osChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                label: '數量',
                data: Object.values(stats),
                backgroundColor: '#4facfe'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// 創建瀏覽器圖表
function createBrowserChart(stats) {
    const ctx = document.getElementById('browserChart').getContext('2d');

    // 銷毀現有圖表
    if (window.browserChart && typeof window.browserChart.destroy === 'function') {
        try {
            window.browserChart.destroy();
        } catch (e) {
            console.log('銷毀瀏覽器圖表時出錯:', e);
        }
        window.browserChart = null;
    }

    window.browserChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                data: Object.values(stats),
                backgroundColor: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// 創建地理位置圖表
function createLocationChart(stats) {
    const ctx = document.getElementById('locationChart').getContext('2d');

    // 銷毀現有圖表
    if (window.locationChart && typeof window.locationChart.destroy === 'function') {
        try {
            window.locationChart.destroy();
        } catch (e) {
            console.log('銷毀地理位置圖表時出錯:', e);
        }
        window.locationChart = null;
    }

    window.locationChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                label: '用戶數量',
                data: Object.values(stats),
                backgroundColor: '#00f2fe'
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true
                }
            }
        }
    });
}

// 創建時間分布圖表
function createTimeChart(stats) {
    const ctx = document.getElementById('timeChart').getContext('2d');

    // 銷毀現有圖表
    if (window.timeChart && typeof window.timeChart.destroy === 'function') {
        try {
            window.timeChart.destroy();
        } catch (e) {
            console.log('銷毀時間分布圖表時出錯:', e);
        }
        window.timeChart = null;
    }

    window.timeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                label: '活動數量',
                data: Object.values(stats),
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// 創建螢幕解析度圖表
function createScreenChart(stats) {
    const ctx = document.getElementById('screenChart').getContext('2d');

    // 銷毀現有圖表
    if (window.screenChart && typeof window.screenChart.destroy === 'function') {
        try {
            window.screenChart.destroy();
        } catch (e) {
            console.log('銷毀螢幕解析度圖表時出錯:', e);
        }
        window.screenChart = null;
    }

    window.screenChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                label: '數量',
                data: Object.values(stats),
                backgroundColor: '#764ba2'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// 創建頁面網域圖表
function createPageDomainChart(stats) {
    const ctx = document.getElementById('pageDomainChart').getContext('2d');

    // 銷毀現有圖表
    if (window.pageDomainChart && typeof window.pageDomainChart.destroy === 'function') {
        try {
            window.pageDomainChart.destroy();
        } catch (e) {
            console.log('銷毀頁面網域圖表時出錯:', e);
        }
        window.pageDomainChart = null;
    }

    window.pageDomainChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                label: '數量',
                data: Object.values(stats),
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
                    '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// 創建頁面路徑圖表
function createPagePathChart(stats) {
    const ctx = document.getElementById('pagePathChart').getContext('2d');

    // 銷毀現有圖表
    if (window.pagePathChart && typeof window.pagePathChart.destroy === 'function') {
        try {
            window.pagePathChart.destroy();
        } catch (e) {
            console.log('銷毀頁面路徑圖表時出錯:', e);
        }
        window.pagePathChart = null;
    }

    window.pagePathChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                label: '數量',
                data: Object.values(stats),
                backgroundColor: '#4BC0C0'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// 創建頁面標題圖表
function createPageTitleChart(stats) {
    const ctx = document.getElementById('pageTitleChart').getContext('2d');

    // 銷毀現有圖表
    if (window.pageTitleChart && typeof window.pageTitleChart.destroy === 'function') {
        try {
            window.pageTitleChart.destroy();
        } catch (e) {
            console.log('銷毀頁面標題圖表時出錯:', e);
        }
        window.pageTitleChart = null;
    }

    window.pageTitleChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                label: '數量',
                data: Object.values(stats),
                backgroundColor: '#FF9F40'
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true
                }
            }
        }
    });
}

// 創建頁面協定圖表
function createPageProtocolChart(stats) {
    const ctx = document.getElementById('pageProtocolChart').getContext('2d');

    // 銷毀現有圖表
    if (window.pageProtocolChart && typeof window.pageProtocolChart.destroy === 'function') {
        try {
            window.pageProtocolChart.destroy();
        } catch (e) {
            console.log('銷毀頁面協定圖表時出錯:', e);
        }
        window.pageProtocolChart = null;
    }

    window.pageProtocolChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                label: '數量',
                data: Object.values(stats),
                backgroundColor: [
                    '#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// 更新統計摘要
function updateAnalyticsSummary(totalSessions, analyticsArray) {
    const summary = document.getElementById('analyticsSummary');

    // 計算統計數據
    const totalCountries = new Set(analyticsArray.map(a => a.locationInfo?.country)).size;
    const totalDevices = new Set(analyticsArray.map(a => a.deviceInfo?.deviceType)).size;
    const totalBrowsers = new Set(analyticsArray.map(a => a.deviceInfo?.browser)).size;
    const avgSessionDuration = analyticsArray.reduce((sum, a) => {
        return sum + (a.lastActivity - a.createdAt) / 1000 / 60; // 分鐘
    }, 0) / totalSessions;

    // 頁面分析統計
    const totalDomains = new Set(analyticsArray.map(a => a.pageInfo?.hostname)).size;
    const totalPaths = new Set(analyticsArray.map(a => a.pageInfo?.pathname)).size;
    const totalTitles = new Set(analyticsArray.map(a => a.pageInfo?.title)).size;

    summary.innerHTML = `
        <div class="summary-stats">
            <div class="summary-stat-item">
                <div class="summary-stat-value">${totalSessions}</div>
                <div class="summary-stat-label">總 Session 數</div>
            </div>
            <div class="summary-stat-item">
                <div class="summary-stat-value">${totalCountries}</div>
                <div class="summary-stat-label">涵蓋國家</div>
            </div>
            <div class="summary-stat-item">
                <div class="summary-stat-value">${totalDevices}</div>
                <div class="summary-stat-label">裝置類型</div>
            </div>
            <div class="summary-stat-item">
                <div class="summary-stat-value">${totalBrowsers}</div>
                <div class="summary-stat-label">瀏覽器類型</div>
            </div>
            <div class="summary-stat-item">
                <div class="summary-stat-value">${Math.round(avgSessionDuration)}</div>
                <div class="summary-stat-label">平均時長(分鐘)</div>
            </div>
            <div class="summary-stat-item">
                <div class="summary-stat-value">${totalDomains}</div>
                <div class="summary-stat-label">不同網域</div>
            </div>
            <div class="summary-stat-item">
                <div class="summary-stat-value">${totalPaths}</div>
                <div class="summary-stat-label">不同路徑</div>
            </div>
            <div class="summary-stat-item">
                <div class="summary-stat-value">${totalTitles}</div>
                <div class="summary-stat-label">不同頁面</div>
            </div>
        </div>
    `;
}

// 渲染 Session 統計列表
function renderSessionAnalytics(analytics) {
    const analyticsList = document.getElementById('sessionAnalyticsList');

    const analyticsArray = Object.entries(analytics).map(([sessionId, data]) => ({ sessionId, ...data }));

    // 按創建時間排序（最新的在前）
    analyticsArray.sort((a, b) => b.createdAt - a.createdAt);

    let html = '';
    analyticsArray.forEach(analytics => {
        html += createSessionAnalyticsCard(analytics);
    });

    analyticsList.innerHTML = html;
}

// 創建 Session 統計卡片
function createSessionAnalyticsCard(analytics) {
    const createdAt = new Date(analytics.createdAt).toLocaleString();
    const lastActivity = new Date(analytics.lastActivity).toLocaleString();
    const deviceInfo = analytics.deviceInfo || {};
    const locationInfo = analytics.locationInfo || {};

    return `
        <div class="session-analytics-card">
            <div class="session-analytics-header">
                <div class="session-analytics-title">Session ${analytics.sessionId.substring(0, 12)}</div>
                <div class="session-analytics-meta">
                    <span>創建: ${createdAt}</span>
                    <span>最後活動: ${lastActivity}</span>
                </div>
            </div>
            
            <div class="analytics-stats">
                <div class="analytics-stat-item">
                    <div class="analytics-stat-value">${deviceInfo.deviceType || 'Unknown'}</div>
                    <div class="analytics-stat-label">裝置類型</div>
                </div>
                <div class="analytics-stat-item">
                    <div class="analytics-stat-value">${deviceInfo.os || 'Unknown'}</div>
                    <div class="analytics-stat-label">作業系統</div>
                </div>
                <div class="analytics-stat-item">
                    <div class="analytics-stat-value">${deviceInfo.browser || 'Unknown'}</div>
                    <div class="analytics-stat-label">瀏覽器</div>
                </div>
                <div class="analytics-stat-item">
                    <div class="analytics-stat-value">${locationInfo.country || 'Unknown'}</div>
                    <div class="analytics-stat-label">國家</div>
                </div>
            </div>
            
            <div class="session-analytics-content">
                <div class="analytics-section device-info">
                    <h4>📱 裝置資訊</h4>
                    <p><strong>裝置類型:</strong> ${deviceInfo.deviceType || 'Unknown'}</p>
                    <p><strong>作業系統:</strong> ${deviceInfo.os || 'Unknown'}</p>
                    <p><strong>瀏覽器:</strong> ${deviceInfo.browser || 'Unknown'}</p>
                    <p><strong>語言:</strong> ${deviceInfo.language || 'Unknown'}</p>
                    <p><strong>螢幕解析度:</strong> ${deviceInfo.screenWidth || 0} x ${deviceInfo.screenHeight || 0}</p>
                    <p><strong>視窗大小:</strong> ${deviceInfo.windowWidth || 0} x ${deviceInfo.windowHeight || 0}</p>
                </div>
                
                <div class="analytics-section location-info">
                    <h4>🌍 地理位置</h4>
                    <p><strong>IP 位址:</strong> ${locationInfo.ip || 'Unknown'}</p>
                    <p><strong>國家:</strong> ${locationInfo.country || 'Unknown'} (${locationInfo.countryCode || 'Unknown'})</p>
                    <p><strong>地區:</strong> ${locationInfo.region || 'Unknown'}</p>
                    <p><strong>城市:</strong> ${locationInfo.city || 'Unknown'}</p>
                    <p><strong>時區:</strong> ${locationInfo.timezone || 'Unknown'}</p>
                    <p><strong>ISP:</strong> ${locationInfo.isp || 'Unknown'}</p>
                </div>
                
                <div class="analytics-section page-info">
                    <h4>🌐 頁面資訊</h4>
                    <p><strong>頁面標題:</strong> ${analytics.pageInfo?.title || 'Unknown'}</p>
                    <p><strong>完整網址:</strong> ${analytics.pageInfo?.url || 'Unknown'}</p>
                    <p><strong>網域:</strong> ${analytics.pageInfo?.hostname || 'Unknown'}</p>
                    <p><strong>路徑:</strong> ${analytics.pageInfo?.pathname || 'Unknown'}</p>
                    <p><strong>來源頁面:</strong> ${analytics.pageInfo?.referrer || 'Unknown'}</p>
                    <p><strong>協定:</strong> ${analytics.pageInfo?.protocol || 'Unknown'}</p>
                </div>
                
                <div class="analytics-section session-info">
                    <h4>📊 Session 資訊</h4>
                    <p><strong>Session ID:</strong> ${analytics.sessionId}</p>
                    <p><strong>創建時間:</strong> ${createdAt}</p>
                    <p><strong>最後活動:</strong> ${lastActivity}</p>
                    <p><strong>活動持續時間:</strong> ${Math.round((analytics.lastActivity - analytics.createdAt) / 1000 / 60)} 分鐘</p>
                </div>
            </div>
            
            <div class="session-analytics-actions">
                <button class="btn btn-secondary" onclick="viewSessionDetails('${analytics.sessionId}')">查看詳情</button>
                <button class="btn btn-danger" onclick="deleteSessionAnalytics('${analytics.sessionId}')">刪除統計</button>
            </div>
        </div>
    `;
}

// 查看 Session 詳情
async function viewSessionDetails(sessionId) {
    try {
        const agentId = document.getElementById('profileAgentSelect').value;
        const analyticsRef = database.ref(`agents/${agentId}/sessionAnalytics/${sessionId}`);
        const snapshot = await analyticsRef.once('value');
        const analytics = snapshot.val();

        if (!analytics) {
            alert('找不到 Session 統計資料');
            return;
        }

        const deviceInfo = analytics.deviceInfo || {};
        const locationInfo = analytics.locationInfo || {};
        const createdAt = new Date(analytics.createdAt).toLocaleString();
        const lastActivity = new Date(analytics.lastActivity).toLocaleString();

        // 創建詳情對話框
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Session 詳情分析</h3>
                    <span class="close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="session-analytics-content">
                        <div class="analytics-section device-info">
                            <h4>📱 裝置資訊</h4>
                            <p><strong>User Agent:</strong> ${deviceInfo.userAgent || 'Unknown'}</p>
                            <p><strong>平台:</strong> ${deviceInfo.platform || 'Unknown'}</p>
                            <p><strong>裝置類型:</strong> ${deviceInfo.deviceType || 'Unknown'}</p>
                            <p><strong>作業系統:</strong> ${deviceInfo.os || 'Unknown'}</p>
                            <p><strong>瀏覽器:</strong> ${deviceInfo.browser || 'Unknown'}</p>
                            <p><strong>語言:</strong> ${deviceInfo.language || 'Unknown'}</p>
                            <p><strong>螢幕解析度:</strong> ${deviceInfo.screenWidth || 0} x ${deviceInfo.screenHeight || 0}</p>
                            <p><strong>視窗大小:</strong> ${deviceInfo.windowWidth || 0} x ${deviceInfo.windowHeight || 0}</p>
                            <p><strong>時區:</strong> ${deviceInfo.timezone || 'Unknown'}</p>
                        </div>
                        
                        <div class="analytics-section location-info">
                            <h4>🌍 地理位置</h4>
                            <p><strong>IP 位址:</strong> ${locationInfo.ip || 'Unknown'}</p>
                            <p><strong>國家:</strong> ${locationInfo.country || 'Unknown'} (${locationInfo.countryCode || 'Unknown'})</p>
                            <p><strong>地區:</strong> ${locationInfo.region || 'Unknown'}</p>
                            <p><strong>城市:</strong> ${locationInfo.city || 'Unknown'}</p>
                            <p><strong>時區:</strong> ${locationInfo.timezone || 'Unknown'}</p>
                            <p><strong>ISP:</strong> ${locationInfo.isp || 'Unknown'}</p>
                            <p><strong>ASN:</strong> ${locationInfo.asn || 'Unknown'}</p>
                            <p><strong>經緯度:</strong> ${locationInfo.latitude || 'Unknown'}, ${locationInfo.longitude || 'Unknown'}</p>
                        </div>
                        
                        <div class="analytics-section page-info">
                            <h4>🌐 頁面資訊</h4>
                            <p><strong>頁面標題:</strong> ${analytics.pageInfo?.title || 'Unknown'}</p>
                            <p><strong>完整網址:</strong> ${analytics.pageInfo?.url || 'Unknown'}</p>
                            <p><strong>網域:</strong> ${analytics.pageInfo?.hostname || 'Unknown'}</p>
                            <p><strong>路徑:</strong> ${analytics.pageInfo?.pathname || 'Unknown'}</p>
                            <p><strong>查詢參數:</strong> ${analytics.pageInfo?.search || 'None'}</p>
                            <p><strong>錨點:</strong> ${analytics.pageInfo?.hash || 'None'}</p>
                            <p><strong>協定:</strong> ${analytics.pageInfo?.protocol || 'Unknown'}</p>
                            <p><strong>連接埠:</strong> ${analytics.pageInfo?.port || 'Default'}</p>
                            <p><strong>來源頁面:</strong> ${analytics.pageInfo?.referrer || 'Direct'}</p>
                        </div>
                        
                        <div class="analytics-section session-info">
                            <h4>📊 Session 資訊</h4>
                            <p><strong>Session ID:</strong> ${analytics.sessionId}</p>
                            <p><strong>代理 ID:</strong> ${analytics.agentId}</p>
                            <p><strong>創建時間:</strong> ${createdAt}</p>
                            <p><strong>最後活動:</strong> ${lastActivity}</p>
                            <p><strong>活動持續時間:</strong> ${Math.round((analytics.lastActivity - analytics.createdAt) / 1000 / 60)} 分鐘</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 點擊背景關閉對話框
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.remove();
            }
        });

    } catch (error) {
        console.error('載入 Session 詳情失敗:', error);
        alert('載入 Session 詳情失敗');
    }
}

// 刪除 Session 統計
async function deleteSessionAnalytics(sessionId) {
    if (!confirm('確定要刪除這個 Session 統計嗎？此操作無法復原。')) {
        return;
    }

    try {
        const agentId = document.getElementById('profileAgentSelect').value;
        const analyticsRef = database.ref(`agents/${agentId}/sessionAnalytics/${sessionId}`);
        await analyticsRef.remove();

        alert('Session 統計已刪除');

        // 重新載入 Session 統計列表
        loadSessionAnalytics(agentId);

    } catch (error) {
        console.error('刪除 Session 統計失敗:', error);
        alert('刪除 Session 統計失敗');
    }
}

// 通知管理功能
let currentNotificationAgentId = null;

// 載入代理選項到通知選擇器
function loadNotificationAgentOptions() {
    const select = document.getElementById('notificationAgentSelect');
    if (!select) return;

    select.innerHTML = '<option value="">請選擇代理...</option>';

    if (!filteredAgents || Object.keys(filteredAgents).length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '暫無代理';
        select.appendChild(option);
        return;
    }

    Object.keys(filteredAgents).forEach(agentId => {
        const agent = filteredAgents[agentId];
        if (agent && agent.name) {
            const option = document.createElement('option');
            option.value = agentId;
            option.textContent = agent.name;
            select.appendChild(option);
        }
    });

    // 添加選擇變更事件監聽器，自動載入通知
    select.addEventListener('change', function () {
        if (this.value) {
            loadNotifications();
        } else {
            document.getElementById('notificationsList').innerHTML = '<div class="loading">請選擇代理...</div>';
        }
    });
}

// 載入通知
async function loadNotifications() {
    const agentId = document.getElementById('notificationAgentSelect').value;
    if (!agentId) {
        alert('請先選擇代理');
        return;
    }

    currentNotificationAgentId = agentId;
    const notificationsList = document.getElementById('notificationsList');
    notificationsList.innerHTML = '<div class="loading">載入通知中...</div>';

    try {
        // 載入傳統通知
        const notificationsRef = database.ref(`agents/${agentId}/notifications`);
        const snapshot = await notificationsRef.once('value');
        const notifications = snapshot.val() || {};

        // 載入預約資訊（從 profile 中）
        const appointmentsRef = database.ref(`agents/${agentId}/profiles`);
        const appointmentsSnapshot = await appointmentsRef.once('value');
        const profiles = appointmentsSnapshot.val() || {};

        // 從 profile 中提取預約資訊並轉換為通知格式
        const appointmentNotifications = {};
        for (const [userId, profile] of Object.entries(profiles)) {
            if (profile.appointments && profile.appointments.currentAppointment) {
                const appointment = profile.appointments.currentAppointment;
                const notificationId = `appointment_${userId}`;
                appointmentNotifications[notificationId] = {
                    id: notificationId,
                    type: 'appointment_request',
                    title: 'LINE Bot 預約參訪申請',
                    message: `用戶透過 LINE Bot 申請預約參訪，需要安排參訪時間`,
                    userId: userId,
                    source: 'linebot',
                    createdAt: appointment.createdAt || Date.now(),
                    status: appointment.status || 'pending',
                    priority: 'high',
                    requiresFollowUp: true,
                    appointmentRequest: true,
                    appointmentId: 'currentAppointment',
                    appointmentData: appointment.appointmentData || {},
                    // 從 profile 中獲取用戶資訊
                    userInfo: {
                        name: profile.name || '未提供',
                        phone: profile.phone || '未提供'
                    }
                };
            }
        }

        // 合併所有通知
        const allNotifications = { ...notifications, ...appointmentNotifications };

        if (Object.keys(allNotifications).length === 0) {
            notificationsList.innerHTML = '<div class="no-data">該代理尚未有通知</div>';
            return;
        }

        renderNotifications(allNotifications);
    } catch (error) {
        console.error('載入通知失敗:', error);
        notificationsList.innerHTML = '<div class="error">載入通知失敗</div>';
    }
}

// 渲染通知列表
function renderNotifications(notifications) {
    const notificationsList = document.getElementById('notificationsList');
    const notificationsArray = Object.entries(notifications).map(([id, notification]) => ({ id, ...notification }));

    // 按創建時間排序（最新的在前）
    notificationsArray.sort((a, b) => b.createdAt - a.createdAt);

    if (notificationsArray.length === 0) {
        notificationsList.innerHTML = '<div class="no-data">該代理尚未有通知</div>';
        return;
    }

    let html = '';
    notificationsArray.forEach(notification => {
        html += createNotificationCard(notification);
    });

    notificationsList.innerHTML = html;
}

// 創建通知卡片
function createNotificationCard(notification) {
    const createdAt = new Date(notification.createdAt).toLocaleString();
    const status = notification.status || 'pending';
    const priority = notification.priority || 'medium';

    let contentHtml = '';

    // 基本通知內容
    contentHtml += `
        <div class="notification-message">
            ${notification.message || '無訊息內容'}
        </div>
    `;

    // 知識庫相關通知
    if (notification.type === 'knowledge_base_needed') {
        contentHtml += `
            <div class="notification-details">
                <h4>知識庫資訊</h4>
                <p><strong>知識庫 ID：</strong>${notification.knowledgeBaseId || 'N/A'}</p>
                <p><strong>知識庫標題：</strong>${notification.knowledgeBaseTitle || 'N/A'}</p>
                <p><strong>關鍵字：</strong>${(notification.keywords || []).join(', ') || '無'}</p>
            </div>
        `;
    }

    // 聯絡資訊收集通知
    if (notification.type === 'contact_info_collection') {
        const contactInfo = notification.contactInfo || {};
        contentHtml += `
            <div class="notification-details">
                <h4>聯絡資訊收集</h4>
                <p><strong>原始訊息：</strong>${notification.originalMessage || 'N/A'}</p>
                <p><strong>已提取資訊：</strong></p>
                <ul style="margin-left: 20px;">
                    <li>姓名：${contactInfo.name || '未提供'}</li>
                    <li>電話：${contactInfo.phone || '未提供'}</li>
                    <li>電子郵件：${contactInfo.email || '未提供'}</li>
                    <li>偏好時間：${contactInfo.preferredTime || '未提及'}</li>
                </ul>
                <p><strong>AI 關鍵字：</strong>${(notification.aiKeywords || []).join(', ') || '無'}</p>
            </div>
        `;
    }

    // LINE Bot 預約參訪通知
    if (notification.type === 'appointment_request') {
        contentHtml += `
            <div class="notification-details">
                <h4>📅 LINE Bot 預約參訪申請</h4>
                <p><strong>來源：</strong>${notification.source || 'linebot'}</p>
                <p><strong>用戶 ID：</strong>${notification.userId || 'N/A'}</p>
                <p><strong>預約 ID：</strong>${notification.appointmentId || 'N/A'}</p>
                <p><strong>預約資料：</strong><span id="appointment-summary-${notification.id}">載入中...</span></p>
                <p><strong>AI 關鍵字：</strong>${(notification.aiKeywords || []).join(', ') || '無'}</p>
                <p><strong>狀態：</strong>${notification.status === 'confirmed' ? '✅ 已確認' : notification.status === 'cancelled' ? '❌ 已取消' : '⏳ 待處理'}</p>
            </div>
        `;
    }

    const cardHtml = `
        <div class="notification-card ${status} ${priority}-priority">
            <div class="notification-header">
                <div class="notification-title">
                    ${notification.type === 'appointment_request' ? '📅 ' : ''}
                    ${notification.title || '無標題'}
                </div>
                <div class="notification-meta">
                    <span class="notification-status ${status}">${status === 'pending' ? '待處理' : '已完成'}</span>
                    <span class="notification-priority ${priority}">${priority === 'high' ? '高' : priority === 'medium' ? '中' : '低'}優先級</span>
                    <span>創建時間: ${createdAt}</span>
                </div>
            </div>
            
            <div class="notification-content">
                ${contentHtml}
            </div>
            
            <div class="notification-actions">
                <button class="btn btn-secondary" onclick="viewNotificationDetails('${notification.id}')">查看詳情</button>
                ${notification.type === 'knowledge_base_needed' ?
            `<button class="btn btn-success" onclick="editKnowledgeBaseFromNotification('${notification.id}')">編輯知識庫</button>` :
            ''
        }
                ${notification.type === 'contact_info_collection' ?
            `<button class="btn btn-info" onclick="editContactInfoFromNotification('${notification.id}')">編輯聯絡資訊</button>` :
            ''
        }
                ${notification.type === 'appointment_request' ?
            `<button class="btn btn-success" onclick="confirmAppointmentFromNotification('${notification.id}')">確認預約</button>
                     <button class="btn btn-warning" onclick="cancelAppointmentFromNotification('${notification.id}')">取消預約</button>` :
            ''
        }
                ${status === 'pending' ?
            `<button class="btn btn-primary" onclick="markNotificationCompleted('${notification.id}')">標記為已完成</button>` :
            `<button class="btn btn-secondary" onclick="markNotificationPending('${notification.id}')">標記為待處理</button>`
        }
                <button class="btn btn-danger" onclick="deleteNotification('${notification.id}')">刪除</button>
            </div>
        </div>
    `;

    // 如果是預約申請，載入預約摘要
    if (notification.type === 'appointment_request' && notification.appointmentId) {
        setTimeout(() => {
            loadAppointmentSummary(notification.id, notification.appointmentId, notification.userId);
        }, 100);
    }

    return cardHtml;
}

// 載入預約摘要資料
async function loadAppointmentSummary(notificationId, appointmentId, userId) {
    try {
        if (!currentNotificationAgentId) {
            console.error('沒有選擇代理');
            return;
        }

        // 從 profile 中獲取預約資料 (appointmentId 現在固定為 'currentAppointment')
        const appointmentRef = database.ref(`agents/${currentNotificationAgentId}/profiles/${userId}/appointments/currentAppointment`);
        const snapshot = await appointmentRef.once('value');
        const appointment = snapshot.val();

        if (appointment) {
            const appointmentData = appointment.appointmentData || {};
            const summaryHtml = `
                <ul style="margin-left: 20px;">
                    <li>👤 姓名：${appointmentData.name || '未提供'}</li>
                    <li>📞 電話：${appointmentData.phone || '未提供'}</li>
                    <li>🕐 預約時間：${appointmentData.appointmentTime || '未提供'}</li>
                </ul>
            `;

            const summaryElement = document.getElementById(`appointment-summary-${notificationId}`);
            if (summaryElement) {
                summaryElement.innerHTML = summaryHtml;
            }
        } else {
            const summaryElement = document.getElementById(`appointment-summary-${notificationId}`);
            if (summaryElement) {
                summaryElement.innerHTML = '<span style="color: red;">找不到預約資料</span>';
            }
        }
    } catch (error) {
        console.error('載入預約摘要失敗:', error);
        const summaryElement = document.getElementById(`appointment-summary-${notificationId}`);
        if (summaryElement) {
            summaryElement.innerHTML = '<span style="color: red;">載入失敗</span>';
        }
    }
}

// 查看通知詳情
async function viewNotificationDetails(notificationId) {
    try {
        let notification;

        // 檢查是否為預約通知（從 profile 中提取的）
        if (notificationId.startsWith('appointment_')) {
            // 從 profile 中獲取預約通知資料
            const userId = notificationId.replace('appointment_', '');
            const appointmentRef = database.ref(`agents/${currentNotificationAgentId}/profiles/${userId}/appointments/currentAppointment`);
            const appointmentSnapshot = await appointmentRef.once('value');
            const appointment = appointmentSnapshot.val();

            if (!appointment) {
                alert('找不到預約資料');
                return;
            }

            // 構建通知物件
            notification = {
                id: notificationId,
                type: 'appointment_request',
                title: 'LINE Bot 預約參訪申請',
                message: `用戶透過 LINE Bot 申請預約參訪，需要安排參訪時間`,
                userId: userId,
                source: 'linebot',
                createdAt: appointment.createdAt || Date.now(),
                status: appointment.status || 'pending',
                priority: 'high',
                requiresFollowUp: true,
                appointmentRequest: true,
                appointmentId: 'currentAppointment',
                appointmentData: appointment.appointmentData || {}
            };
        } else {
            // 獲取傳統通知資料
            const notificationRef = database.ref(`agents/${currentNotificationAgentId}/notifications/${notificationId}`);
            const notificationSnapshot = await notificationRef.once('value');
            notification = notificationSnapshot.val();

            if (!notification) {
                alert('找不到通知資料');
                return;
            }
        }

        // 顯示詳情對話框
        showNotificationDetailsModal(notification);

    } catch (error) {
        console.error('載入通知詳情失敗:', error);
        alert('載入通知詳情失敗');
    }
}

// 標記通知為已完成
async function markNotificationCompleted(notificationId) {
    try {
        // 檢查是否為預約通知（從 profile 中提取的）
        if (notificationId.startsWith('appointment_')) {
            // 從 notificationId 中提取 userId (格式: appointment_${userId})
            const userId = notificationId.replace('appointment_', '');

            // 更新 profile 中的預約狀態
            await database.ref(`agents/${currentNotificationAgentId}/profiles/${userId}/appointments/currentAppointment`).update({
                status: 'completed',
                completedAt: Date.now()
            });
        } else {
            // 更新傳統通知
            await database.ref(`agents/${currentNotificationAgentId}/notifications/${notificationId}`).update({
                status: 'completed',
                completedAt: Date.now()
            });
        }

        // 直接更新對應的 HTML 區塊
        const notificationCard = document.querySelector(`[onclick*="markNotificationCompleted('${notificationId}')"]`)?.closest('.notification-card');
        if (notificationCard) {
            // 更新狀態顯示
            const statusElement = notificationCard.querySelector('.notification-status');
            if (statusElement) {
                statusElement.textContent = '已完成';
                statusElement.className = 'notification-status completed';
            }

            // 更新按鈕
            const button = notificationCard.querySelector(`[onclick*="markNotificationCompleted('${notificationId}')"]`);
            if (button) {
                button.textContent = '標記為待處理';
                button.setAttribute('onclick', `markNotificationPending('${notificationId}')`);
            }
        }

        alert('通知已標記為已完成');
    } catch (error) {
        console.error('標記通知失敗:', error);
        alert('標記通知失敗');
    }
}

// 標記通知為待處理
async function markNotificationPending(notificationId) {
    try {
        // 檢查是否為預約通知（從 profile 中提取的）
        if (notificationId.startsWith('appointment_')) {
            // 從 notificationId 中提取 userId (格式: appointment_${userId})
            const userId = notificationId.replace('appointment_', '');

            // 更新 profile 中的預約狀態
            await database.ref(`agents/${currentNotificationAgentId}/profiles/${userId}/appointments/currentAppointment`).update({
                status: 'pending',
                completedAt: null
            });
        } else {
            // 更新傳統通知
            await database.ref(`agents/${currentNotificationAgentId}/notifications/${notificationId}`).update({
                status: 'pending',
                completedAt: null
            });
        }

        // 直接更新對應的 HTML 區塊
        const notificationCard = document.querySelector(`[onclick*="markNotificationPending('${notificationId}')"]`)?.closest('.notification-card');
        if (notificationCard) {
            // 更新狀態顯示
            const statusElement = notificationCard.querySelector('.notification-status');
            if (statusElement) {
                statusElement.textContent = '待處理';
                statusElement.className = 'notification-status pending';
            }

            // 更新按鈕
            const button = notificationCard.querySelector(`[onclick*="markNotificationPending('${notificationId}')"]`);
            if (button) {
                button.textContent = '標記為已完成';
                button.setAttribute('onclick', `markNotificationCompleted('${notificationId}')`);
            }
        }

        alert('通知已標記為待處理');
    } catch (error) {
        console.error('標記通知失敗:', error);
        alert('標記通知失敗');
    }
}

// 刪除通知
async function deleteNotification(notificationId) {
    if (!confirm('確定要刪除這個通知嗎？')) {
        return;
    }

    try {
        // 檢查是否為預約通知（從 profile 中提取的）
        if (notificationId.startsWith('appointment_')) {
            // 從 notificationId 中提取 userId (格式: appointment_${userId})
            const userId = notificationId.replace('appointment_', '');

            // 刪除 profile 中的預約記錄
            await database.ref(`agents/${currentNotificationAgentId}/profiles/${userId}/appointments/currentAppointment`).remove();
        } else {
            // 刪除傳統通知
            await database.ref(`agents/${currentNotificationAgentId}/notifications/${notificationId}`).remove();
        }

        // 直接移除對應的 HTML 區塊
        const notificationCard = document.querySelector(`[onclick*="deleteNotification('${notificationId}')"]`)?.closest('.notification-card');
        if (notificationCard) {
            notificationCard.remove();
        }

        // 檢查是否還有其他通知，如果沒有則顯示空狀態
        const notificationsList = document.getElementById('notificationsList');
        const remainingCards = notificationsList.querySelectorAll('.notification-card');
        if (remainingCards.length === 0) {
            notificationsList.innerHTML = '<div class="no-data">該代理尚未有通知</div>';
        }
    } catch (error) {
        console.error('刪除通知失敗:', error);
        alert('刪除通知失敗');
    }
}

// 全部標記為已讀
async function markAllNotificationsRead() {
    if (!confirm('確定要將所有通知標記為已完成嗎？')) {
        return;
    }

    try {
        const notificationsRef = database.ref(`agents/${currentNotificationAgentId}/notifications`);
        const snapshot = await notificationsRef.once('value');
        const notifications = snapshot.val() || {};

        const updatePromises = Object.keys(notifications).map(notificationId => {
            if (notifications[notificationId].status === 'pending') {
                return database.ref(`agents/${currentNotificationAgentId}/notifications/${notificationId}`).update({
                    status: 'completed',
                    completedAt: Date.now()
                });
            }
        });

        await Promise.all(updatePromises.filter(p => p));

        // 直接更新所有待處理通知的 HTML 區塊
        const notificationCards = document.querySelectorAll('.notification-card.pending');
        notificationCards.forEach(card => {
            // 更新狀態顯示
            const statusElement = card.querySelector('.notification-status');
            if (statusElement) {
                statusElement.textContent = '已完成';
                statusElement.className = 'notification-status completed';
            }

            // 更新按鈕
            const button = card.querySelector('[onclick*="markNotificationCompleted"]');
            if (button) {
                const notificationId = button.getAttribute('onclick').match(/markNotificationCompleted\('([^']+)'\)/)?.[1];
                if (notificationId) {
                    button.textContent = '標記為待處理';
                    button.setAttribute('onclick', `markNotificationPending('${notificationId}')`);
                }
            }

            // 更新卡片樣式
            card.classList.remove('pending');
            card.classList.add('completed');
        });

        alert('所有通知已標記為已完成');
    } catch (error) {
        console.error('批量標記通知失敗:', error);
        alert('批量標記通知失敗');
    }
}

// 重新整理通知
function refreshNotifications() {
    if (currentNotificationAgentId) {
        loadNotifications();
    } else {
        alert('請先選擇代理');
    }
}

// 顯示通知詳情對話框
function showNotificationDetailsModal(notification) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';

    const createdAt = new Date(notification.createdAt).toLocaleString();
    const status = notification.status || 'pending';
    const priority = notification.priority || 'medium';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>通知詳情</h3>
                <span class="close" onclick="closeNotificationDetailsModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="notification-meta">
                    <p><strong>標題：</strong>${notification.title || '無標題'}</p>
                    <p><strong>狀態：</strong><span class="notification-status ${status}">${status === 'pending' ? '待處理' : '已完成'}</span></p>
                    <p><strong>優先級：</strong><span class="notification-priority ${priority}">${priority === 'high' ? '高' : priority === 'medium' ? '中' : '低'}優先級</span></p>
                    <p><strong>創建時間：</strong>${createdAt}</p>
                </div>
                
                <div class="notification-content">
                    <h4>通知內容</h4>
                    <p>${notification.message || '無訊息內容'}</p>
                </div>
                
                ${notification.type === 'knowledge_base_needed' ? `
                    <div class="notification-details">
                        <h4>知識庫資訊</h4>
                        <p><strong>知識庫 ID：</strong>${notification.knowledgeBaseId || 'N/A'}</p>
                        <p><strong>知識庫標題：</strong>${notification.knowledgeBaseTitle || 'N/A'}</p>
                        <p><strong>關鍵字：</strong>${(notification.keywords || []).join(', ') || '無'}</p>
                        <p><strong>原始用戶訊息：</strong>${notification.originalMessage || '無'}</p>
                        <p><strong>AI 分析關鍵字：</strong>${(notification.aiKeywords || []).join(', ') || '無'}</p>
                        <p><strong>知識庫路徑：</strong>${notification.knowledgeBasePath || 'N/A'}</p>
                        <p><strong>Widget 生成：</strong>${notification.widgetGenerated ? '是' : '否'}</p>
                    </div>
                ` : ''}
                
                ${notification.type === 'contact_info_collection' ? `
                    <div class="notification-details">
                        <h4>聯絡資訊收集</h4>
                        <p><strong>原始訊息：</strong>${notification.originalMessage || 'N/A'}</p>
                        <p><strong>AI 關鍵字：</strong>${(notification.aiKeywords || []).join(', ') || '無'}</p>
                        <p><strong>已提取資訊：</strong></p>
                        <ul style="margin-left: 20px;">
                            <li>姓名：${notification.contactInfo?.name || '未提供'}</li>
                            <li>電話：${notification.contactInfo?.phone || '未提供'}</li>
                            <li>電子郵件：${notification.contactInfo?.email || '未提供'}</li>
                            <li>偏好時間：${notification.contactInfo?.preferredTime || '未提及'}</li>
                            <li>參訪目的：${notification.contactInfo?.purpose || '未提及'}</li>
                        </ul>
                        <p><strong>Widget 生成：</strong>${notification.widgetGenerated ? '是' : '否'}</p>
                        <p><strong>需要後續追蹤：</strong>${notification.requiresFollowUp ? '是' : '否'}</p>
                    </div>
                ` : ''}
                
                ${notification.type === 'appointment_request' ? `
                    <div class="notification-details">
                        <h4>LINE Bot 預約參訪申請</h4>
                        <p><strong>來源：</strong>${notification.source || 'linebot'}</p>
                        <p><strong>用戶 ID：</strong>${notification.userId || 'N/A'}</p>
                        <p><strong>預約 ID：</strong>${notification.appointmentId || 'N/A'}</p>
                        <p><strong>原始訊息：</strong>${notification.originalMessage || 'N/A'}</p>
                        <p><strong>AI 回應：</strong></p>
                        <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0;">
                            ${notification.aiResponse ? notification.aiResponse.replace(/```json\s*[\s\S]*?\s*```/, '').replace(/\{[\s\S]*\}/, '').trim() : '無 AI 回應'}
                        </div>
                        <p><strong>AI 關鍵字：</strong>${(notification.aiKeywords || []).join(', ') || '無'}</p>
                        <p><strong>預約資料：</strong><span id="appointment-details-${notification.id}">載入中...</span></p>
                        <p><strong>預約申請：</strong>${notification.appointmentRequest ? '是' : '否'}</p>
                        <p><strong>需要後續追蹤：</strong>${notification.requiresFollowUp ? '是' : '否'}</p>
                        <p><strong>確認時間：</strong>${notification.confirmedAt ? new Date(notification.confirmedAt).toLocaleString() : '未確認'}</p>
                        <p><strong>取消時間：</strong>${notification.cancelledAt ? new Date(notification.cancelledAt).toLocaleString() : '未取消'}</p>
                    </div>
                ` : ''}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeNotificationDetailsModal()">關閉</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 如果是預約申請，載入預約資料
    if (notification.type === 'appointment_request' && notification.appointmentId) {
        loadAppointmentDetails(notification.id, notification.appointmentId, notification.userId);
    }
}

// 載入預約詳細資料
async function loadAppointmentDetails(notificationId, appointmentId, userId) {
    try {
        if (!currentNotificationAgentId) {
            console.error('沒有選擇代理');
            return;
        }

        // 從 profile 中獲取預約資料 (appointmentId 現在固定為 'currentAppointment')
        const appointmentRef = database.ref(`agents/${currentNotificationAgentId}/profiles/${userId}/appointments/currentAppointment`);
        const snapshot = await appointmentRef.once('value');
        const appointment = snapshot.val();

        if (appointment) {
            const appointmentData = appointment.appointmentData || {};
            const detailsHtml = `
                <ul style="margin-left: 20px;">
                    <li>姓名：${appointmentData.name || '未提供'}</li>
                    <li>電話：${appointmentData.phone || '未提供'}</li>
                    <li>預約時間：${appointmentData.appointmentTime || '未提供'}</li>
                    <li>狀態：${appointment.status || 'pending'}</li>
                    <li>建立時間：${new Date(appointment.createdAt).toLocaleString()}</li>
                </ul>
            `;

            const detailsElement = document.getElementById(`appointment-details-${notificationId}`);
            if (detailsElement) {
                detailsElement.innerHTML = detailsHtml;
            }
        } else {
            const detailsElement = document.getElementById(`appointment-details-${notificationId}`);
            if (detailsElement) {
                detailsElement.innerHTML = '<span style="color: red;">找不到預約資料</span>';
            }
        }
    } catch (error) {
        console.error('載入預約資料失敗:', error);
        const detailsElement = document.getElementById(`appointment-details-${notificationId}`);
        if (detailsElement) {
            detailsElement.innerHTML = '<span style="color: red;">載入失敗</span>';
        }
    }
}

// 關閉通知詳情對話框
function closeNotificationDetailsModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.remove();
    }
}

// 確認 LINE Bot 預約
async function confirmAppointmentFromNotification(notificationId) {
    try {
        if (!currentNotificationAgentId) {
            alert('請先選擇代理');
            return;
        }

        // 從 notificationId 中提取 userId (格式: appointment_${userId})
        const userId = notificationId.replace('appointment_', '');

        const updates = {};
        const timestamp = Date.now();

        // 直接更新 profile 中的預約狀態 (userId 已經包含 linebot_ 前綴)
        updates[`agents/${currentNotificationAgentId}/profiles/${userId}/appointments/currentAppointment/status`] = 'confirmed';
        updates[`agents/${currentNotificationAgentId}/profiles/${userId}/appointments/currentAppointment/confirmedAt`] = timestamp;

        await database.ref().update(updates);

        alert('預約已確認');
        loadNotifications(); // 重新載入通知列表
    } catch (error) {
        console.error('確認預約失敗:', error);
        alert('確認預約失敗');
    }
}

// 取消 LINE Bot 預約
async function cancelAppointmentFromNotification(notificationId) {
    try {
        if (!currentNotificationAgentId) {
            alert('請先選擇代理');
            return;
        }

        // 從 notificationId 中提取 userId (格式: appointment_${userId})
        const userId = notificationId.replace('appointment_', '');

        const updates = {};
        const timestamp = Date.now();

        // 直接更新 profile 中的預約狀態 (userId 已經包含 linebot_ 前綴)
        updates[`agents/${currentNotificationAgentId}/profiles/${userId}/appointments/currentAppointment/status`] = 'cancelled';
        updates[`agents/${currentNotificationAgentId}/profiles/${userId}/appointments/currentAppointment/cancelledAt`] = timestamp;

        await database.ref().update(updates);

        alert('預約已取消');
        loadNotifications(); // 重新載入通知列表
    } catch (error) {
        console.error('取消預約失敗:', error);
        alert('取消預約失敗');
    }
}

// 從通知編輯知識庫
async function editKnowledgeBaseFromNotification(notificationId) {
    try {
        // 獲取通知詳情
        const notificationRef = database.ref(`agents/${currentNotificationAgentId}/notifications/${notificationId}`);
        const notificationSnapshot = await notificationRef.once('value');
        const notification = notificationSnapshot.val();

        if (!notification || notification.type !== 'knowledge_base_needed') {
            alert('此通知不是知識庫維護需求');
            return;
        }

        // 獲取知識庫資料
        const kbId = notification.knowledgeBaseId;
        const kbRef = database.ref(`agents/${currentNotificationAgentId}/knowledgeBases/${kbId}`);
        const kbSnapshot = await kbRef.once('value');
        const knowledgeBase = kbSnapshot.val();

        if (!knowledgeBase) {
            alert('找不到對應的知識庫');
            return;
        }

        // 顯示知識庫編輯對話框
        showKnowledgeBaseEditModal(notification, knowledgeBase, kbId);

    } catch (error) {
        console.error('載入知識庫資料失敗:', error);
        alert('載入知識庫資料失敗');
    }
}

// 顯示知識庫編輯對話框
function showKnowledgeBaseEditModal(notification, knowledgeBase, kbId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h3>編輯知識庫</h3>
                <span class="close" onclick="closeKnowledgeBaseEditModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="kbEditTitle">知識庫標題</label>
                    <input type="text" id="kbEditTitle" class="form-control" value="${knowledgeBase.title || ''}" placeholder="輸入知識庫標題">
                </div>
                
                <div class="form-group">
                    <label for="kbEditContent">知識庫內容</label>
                    <textarea id="kbEditContent" class="form-control" rows="10" placeholder="輸入知識庫內容">${knowledgeBase.content || ''}</textarea>
                </div>
                
                <div class="form-group">
                    <label for="kbEditKeywords">關鍵字 (用逗號分隔)</label>
                    <input type="text" id="kbEditKeywords" class="form-control" value="${(knowledgeBase.keywords || []).join(', ')}" placeholder="輸入關鍵字，用逗號分隔">
                </div>
                
                <div class="notification-info">
                    <h4>相關通知資訊</h4>
                    <p><strong>通知標題：</strong>${notification.title}</p>
                    <p><strong>通知訊息：</strong>${notification.message}</p>
                    <p><strong>原始用戶訊息：</strong>${notification.originalMessage || '無'}</p>
                    <p><strong>AI 關鍵字：</strong>${(notification.aiKeywords || notification.keywords || []).join(', ') || '無'}</p>
                    <p><strong>知識庫路徑：</strong>${notification.knowledgeBasePath || 'N/A'}</p>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeKnowledgeBaseEditModal()">取消</button>
                <button class="btn btn-primary" onclick="saveKnowledgeBaseFromNotification('${notificationId}', '${kbId}')">儲存知識庫</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// 儲存知識庫並完成通知
async function saveKnowledgeBaseFromNotification(notificationId, kbId) {
    try {
        const title = document.getElementById('kbEditTitle').value.trim();
        const content = document.getElementById('kbEditContent').value.trim();
        const keywordsInput = document.getElementById('kbEditKeywords').value.trim();
        const keywords = keywordsInput ? keywordsInput.split(',').map(k => k.trim()).filter(k => k) : [];

        if (!title) {
            alert('請輸入知識庫標題');
            return;
        }

        if (!content) {
            alert('請輸入知識庫內容');
            return;
        }

        // 更新知識庫
        const kbRef = database.ref(`agents/${currentNotificationAgentId}/knowledgeBases/${kbId}`);
        await kbRef.update({
            title: title,
            content: content,
            keywords: keywords,
            aiGenerated: false, // 標記為人工編輯
            lastUpdated: Date.now()
        });

        // 標記通知為已完成
        const notificationRef = database.ref(`agents/${currentNotificationAgentId}/notifications/${notificationId}`);
        await notificationRef.update({
            status: 'completed',
            completedAt: Date.now(),
            completedBy: 'admin',
            knowledgeBaseUpdated: true
        });

        alert('知識庫已更新，通知已標記為已完成');
        closeKnowledgeBaseEditModal();
        loadNotifications(); // 重新載入通知列表

    } catch (error) {
        console.error('儲存知識庫失敗:', error);
        alert('儲存知識庫失敗');
    }
}

// 關閉知識庫編輯對話框
function closeKnowledgeBaseEditModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.remove();
    }
}

// 從通知編輯聯絡資訊
async function editContactInfoFromNotification(notificationId) {
    try {
        // 獲取通知詳情
        const notificationRef = database.ref(`agents/${currentNotificationAgentId}/notifications/${notificationId}`);
        const notificationSnapshot = await notificationRef.once('value');
        const notification = notificationSnapshot.val();

        if (!notification || notification.type !== 'contact_info_collection') {
            alert('此通知不是聯絡資訊收集需求');
            return;
        }

        // 顯示聯絡資訊編輯對話框
        showContactInfoEditModal(notification, notificationId);

    } catch (error) {
        console.error('載入聯絡資訊失敗:', error);
        alert('載入聯絡資訊失敗');
    }
}

// 顯示聯絡資訊編輯對話框
function showContactInfoEditModal(notification, notificationId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';

    const contactInfo = notification.contactInfo || {};

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>編輯聯絡資訊</h3>
                <span class="close" onclick="closeContactInfoEditModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="contactName">姓名</label>
                    <input type="text" id="contactName" class="form-control" value="${contactInfo.name || ''}" placeholder="輸入姓名">
                </div>
                
                <div class="form-group">
                    <label for="contactPhone">電話</label>
                    <input type="tel" id="contactPhone" class="form-control" value="${contactInfo.phone || ''}" placeholder="輸入電話號碼">
                </div>
                
                <div class="form-group">
                    <label for="contactEmail">電子郵件</label>
                    <input type="email" id="contactEmail" class="form-control" value="${contactInfo.email || ''}" placeholder="輸入電子郵件">
                </div>
                
                <div class="form-group">
                    <label for="contactTime">偏好時間</label>
                    <input type="text" id="contactTime" class="form-control" value="${contactInfo.preferredTime || ''}" placeholder="輸入偏好時間">
                </div>
                
                <div class="form-group">
                    <label for="contactPurpose">參訪目的</label>
                    <textarea id="contactPurpose" class="form-control" rows="3" placeholder="輸入參訪目的">${contactInfo.purpose || ''}</textarea>
                </div>
                
                <div class="notification-info">
                    <h4>原始查詢資訊</h4>
                    <p><strong>原始訊息：</strong>${notification.originalMessage || '無'}</p>
                    <p><strong>AI 關鍵字：</strong>${(notification.aiKeywords || []).join(', ') || '無'}</p>
                    <p><strong>通知時間：</strong>${new Date(notification.createdAt).toLocaleString()}</p>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeContactInfoEditModal()">取消</button>
                <button class="btn btn-primary" onclick="saveContactInfoFromNotification('${notificationId}')">儲存聯絡資訊</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// 儲存聯絡資訊並完成通知
async function saveContactInfoFromNotification(notificationId) {
    try {
        const name = document.getElementById('contactName').value.trim();
        const phone = document.getElementById('contactPhone').value.trim();
        const email = document.getElementById('contactEmail').value.trim();
        const preferredTime = document.getElementById('contactTime').value.trim();
        const purpose = document.getElementById('contactPurpose').value.trim();

        if (!name && !phone && !email) {
            alert('請至少提供姓名、電話或電子郵件其中一項');
            return;
        }

        // 更新聯絡資訊
        const updatedContactInfo = {
            name: name || null,
            phone: phone || null,
            email: email || null,
            preferredTime: preferredTime || null,
            purpose: purpose || null,
            lastUpdated: Date.now(),
            completed: true
        };

        // 更新通知中的聯絡資訊
        const notificationRef = database.ref(`agents/${currentNotificationAgentId}/notifications/${notificationId}`);
        await notificationRef.update({
            contactInfo: updatedContactInfo,
            status: 'completed',
            completedAt: Date.now(),
            completedBy: 'admin',
            contactInfoUpdated: true
        });

        alert('聯絡資訊已更新，通知已標記為已完成');
        closeContactInfoEditModal();
        loadNotifications(); // 重新載入通知列表

    } catch (error) {
        console.error('儲存聯絡資訊失敗:', error);
        alert('儲存聯絡資訊失敗');
    }
}

// 關閉聯絡資訊編輯對話框
function closeContactInfoEditModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.remove();
    }
}

// 在頁面載入時初始化人物誌功能
document.addEventListener('DOMContentLoaded', function () {
    // 現有的初始化代碼...

    // 添加人物誌功能初始化
    setTimeout(() => {
        loadProfileAgentOptions();
    }, 1000);
});
// ==================== 用戶管理功能 ====================

// 初始化預設管理員（在 userRoles 中設置）
function initializeDefaultAdmin() {
    const defaultAdminEmail = 'kenson@stu.edu.tw';
    const userRolesRef = database.ref('userRoles');

    // 設置預設管理員角色
    userRolesRef.child(defaultAdminEmail.replace(/\./g, '_')).once('value').then((snapshot) => {
        if (!snapshot.exists()) {
            // 創建預設管理員角色
            userRolesRef.child(defaultAdminEmail.replace(/\./g, '_')).set({
                email: defaultAdminEmail,
                role: 'admin',
                isDefault: true,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }).then(() => {
                console.log('預設管理員角色已設置:', defaultAdminEmail);
            }).catch((error) => {
                console.error('設置預設管理員角色失敗:', error);
            });
        } else {
            // 確保角色為管理員
            const currentRole = snapshot.val();
            if (currentRole.role !== 'admin') {
                userRolesRef.child(defaultAdminEmail.replace(/\./g, '_')).update({
                    role: 'admin',
                    isDefault: true,
                    updatedAt: Date.now()
                }).then(() => {
                    console.log('預設管理員角色已更新:', defaultAdminEmail);
                }).catch((error) => {
                    console.error('更新預設管理員角色失敗:', error);
                });
            }
        }
    }).catch((error) => {
        console.error('檢查預設管理員失敗:', error);
    });
}

// 檢查當前用戶是否為管理員
async function isCurrentUserAdmin() {
    if (!currentUser || !currentUser.email) {
        return false;
    }

    try {
        // 檢查預設管理員
        if (currentUser.email === 'kenson@stu.edu.tw') {
            return true;
        }

        // 從 userRoles 檢查角色
        const emailKey = currentUser.email.replace(/\./g, '_');
        const userRoleRef = database.ref(`userRoles/${emailKey}`);
        const snapshot = await userRoleRef.once('value');
        const userRole = snapshot.val();

        if (userRole && userRole.role === 'admin') {
            return true;
        }

        return false;
    } catch (error) {
        console.error('檢查管理員權限失敗:', error);
        return false;
    }
}

// 添加用戶角色
async function addUserRole() {
    const emailInput = document.getElementById('userEmailInput');
    const roleSelect = document.getElementById('userRoleSelect');

    if (!emailInput || !roleSelect) {
        alert('找不到輸入元素');
        return;
    }

    const email = emailInput.value.trim();
    const role = roleSelect.value;

    if (!email) {
        alert('請輸入用戶 Email');
        return;
    }

    // 驗證 Email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('請輸入有效的 Email 地址');
        return;
    }

    // 檢查是否為管理員
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
        alert('只有管理員可以添加用戶角色');
        emailInput.value = '';
        roleSelect.value = 'user';
        return;
    }

    try {
        // 使用 email 作為 key（將 . 替換為 _）
        const emailKey = email.replace(/\./g, '_');
        const userRoleRef = database.ref(`userRoles/${emailKey}`);

        // 檢查是否已存在
        const snapshot = await userRoleRef.once('value');
        const existing = snapshot.val();

        if (existing) {
            // 更新現有用戶的角色
            await userRoleRef.update({
                role: role,
                updatedAt: Date.now()
            });
            alert(`用戶 ${email} 的角色已更新為 ${role === 'admin' ? '管理員' : '普通用戶'}`);
        } else {
            // 創建新用戶角色
            await userRoleRef.set({
                email: email,
                role: role,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            alert(`用戶 ${email} 已添加，角色為 ${role === 'admin' ? '管理員' : '普通用戶'}`);
        }

        // 清空輸入框
        emailInput.value = '';
        roleSelect.value = 'user';

        // 重新載入用戶列表
        loadUserList();

    } catch (error) {
        console.error('添加用戶角色失敗:', error);
        alert('添加用戶角色失敗: ' + error.message);
    }
}

// 載入用戶列表（從 userRoles 讀取）
async function loadUserList() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) {
        console.error('找不到 usersTableBody 元素');
        return;
    }

    tableBody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-muted-dark">載入中...</td></tr>';

    // 檢查是否為管理員（用於決定是否顯示操作按鈕）
    const isAdmin = await isCurrentUserAdmin();

    try {
        const userRolesRef = database.ref('userRoles');
        const snapshot = await userRolesRef.once('value');
        const userRoles = snapshot.val() || {};

        console.log('載入的用戶角色數據:', userRoles);

        // 確保預設管理員在列表中
        const defaultAdminEmail = 'kenson@stu.edu.tw';
        const defaultAdminKey = defaultAdminEmail.replace(/\./g, '_');
        if (!userRoles[defaultAdminKey]) {
            userRoles[defaultAdminKey] = {
                email: defaultAdminEmail,
                role: 'admin',
                isDefault: true,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        }

        const usersArray = Object.entries(userRoles).map(([key, userRole]) => ({
            key: key,
            email: userRole.email || key.replace(/_/g, '.'),
            role: userRole.role || 'user',
            isDefault: userRole.isDefault || userRole.email === 'kenson@stu.edu.tw',
            createdAt: userRole.createdAt || Date.now(),
            updatedAt: userRole.updatedAt || Date.now()
        }));

        console.log('處理後的用戶數組:', usersArray);

        if (usersArray.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-muted-dark">尚無用戶</td></tr>';
            return;
        }

        // 按創建時間排序
        usersArray.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // 生成表格行
        tableBody.innerHTML = usersArray.map(user => {
            const role = user.role || 'user';
            const roleText = role === 'admin' ? '管理員' : '普通用戶';
            const roleClass = role === 'admin'
                ? 'bg-purple-900/40 text-purple-300'
                : 'bg-gray-700/50 text-gray-300';
            const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleString('zh-TW') : '未知';
            const isDefault = user.isDefault || user.email === 'kenson@stu.edu.tw';
            const canDelete = isAdmin && !isDefault; // 只有管理員可以刪除，且預設管理員不能刪除

            return `
                <tr>
                    <td class="whitespace-nowrap px-6 py-4 font-medium text-gray-50">
                        ${user.email || '未知'}
                        ${isDefault ? '<span class="ml-2 text-xs text-muted-dark">(預設)</span>' : ''}
                    </td>
                    <td class="whitespace-nowrap px-6 py-4">
                        <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleClass}">${roleText}</span>
                    </td>
                    <td class="whitespace-nowrap px-6 py-4 text-muted-dark">${user.key ? (user.key.length > 20 ? user.key.substring(0, 20) + '...' : user.key) : 'N/A'}</td>
                    <td class="whitespace-nowrap px-6 py-4 text-muted-dark">${createdAt}</td>
                    <td class="whitespace-nowrap px-6 py-4 text-right">
                        ${canDelete ? `
                            <button onclick="removeUserRole('${user.key}', '${user.email}')" class="p-2 text-muted-dark hover:text-red-400 transition-colors" title="移除用戶">
                                <span class="material-symbols-outlined text-base">delete</span>
                            </button>
                        ` : `
                            <span class="text-xs text-muted-dark">${isDefault ? '不可刪除' : (isAdmin ? '' : '需管理員權限')}</span>
                        `}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('載入用戶列表失敗:', error);
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-400">載入用戶列表失敗: ${error.message}</td></tr>`;
    }
}

// 移除用戶角色
async function removeUserRole(userKey, email) {
    if (!confirm(`確定要移除用戶 ${email} 的角色嗎？`)) {
        return;
    }

    // 檢查是否為管理員
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
        alert('只有管理員可以移除用戶角色');
        return;
    }

    // 檢查是否為預設管理員
    if (email === 'kenson@stu.edu.tw') {
        alert('無法移除預設管理員');
        return;
    }

    try {
        await database.ref(`userRoles/${userKey}`).remove();
        alert(`用戶 ${email} 的角色已移除`);
        loadUserList();
    } catch (error) {
        console.error('移除用戶角色失敗:', error);
        alert('移除用戶角色失敗: ' + error.message);
    }
}

// 當切換到用戶管理頁面時，載入用戶列表
// 注意：switchTab 函數在 admin.html 中定義，這裡只是添加用戶管理頁面的載入邏輯
// 需要在 admin.html 的 switchTab 函數中添加對 user-management 的處理
