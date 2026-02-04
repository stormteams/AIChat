(function () {
    'use strict';

    // Console Log Control
    // Only allow logs if debug mode is enabled
    const isDebug = localStorage.getItem('ai-convai-debug') === 'true';
    const originalConsole = window.console;

    // Shadow the global console object within this scope
    const console = {
        ...originalConsole,
        log: (...args) => isDebug && originalConsole.log(...args),
        info: (...args) => isDebug && originalConsole.info(...args),
        warn: (...args) => isDebug && originalConsole.warn(...args),
        error: (...args) => isDebug && originalConsole.error(...args),
        table: (...args) => isDebug && originalConsole.table(...args),
        group: (...args) => isDebug && originalConsole.group(...args),
        groupEnd: (...args) => isDebug && originalConsole.groupEnd(...args),
        debug: (...args) => isDebug && originalConsole.debug(...args),
    };
    const firebaseConfig = {
        apiKey: "",
        authDomain: "",
        databaseURL: "",
        projectId: "",
        storageBucket: "",
        messagingSenderId: "",
        appId: ""
    };
    // 載入 Firebase SDK（修復載入順序問題）
    function loadFirebaseSDK() {
        return new Promise((resolve, reject) => {
            // 如果 Firebase 已經載入
            if (typeof firebase !== 'undefined') {
                try {
                    if (!firebase.apps.length) {
                        firebase.initializeApp(firebaseConfig);
                    }
                    resolve(firebase.database());
                    return;
                } catch (error) {
                    if (error.code === 'app/duplicate-app') {
                        resolve(firebase.database());
                        return;
                    }
                    reject(error);
                    return;
                }
            }

            // 按順序載入 Firebase SDK，確保依賴關係正確
            const scripts = [
                'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
                'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
                'https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js',
                'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions-compat.js'
            ];

            let currentIndex = 0;

            function loadNextScript() {
                if (currentIndex >= scripts.length) {
                    // 所有腳本載入完成，初始化 Firebase
                    try {
                        if (!firebase.apps.length) {
                            firebase.initializeApp(firebaseConfig);
                        }

                        // 檢查所有必要的模組是否正確載入
                        if (!firebase.functions) {
                            console.error('Firebase Functions 未正確載入');
                            reject(new Error('Firebase Functions 未正確載入'));
                            return;
                        }

                        if (!firebase.database) {
                            console.error('Firebase Database 未正確載入');
                            reject(new Error('Firebase Database 未正確載入'));
                            return;
                        }

                        console.log('Firebase SDK 載入完成');
                        resolve(firebase.database());
                    } catch (error) {
                        if (error.code === 'app/duplicate-app') {
                            resolve(firebase.database());
                        } else {
                            console.error('Firebase 初始化失敗:', error);
                            reject(error);
                        }
                    }
                    return;
                }

                const script = document.createElement('script');
                script.src = scripts[currentIndex];
                script.onload = () => {
                    console.log(`Firebase 模組載入完成: ${scripts[currentIndex]}`);
                    currentIndex++;
                    // 添加小延遲確保模組完全初始化
                    setTimeout(loadNextScript, 50);
                };
                script.onerror = () => {
                    console.error(`無法載入 Firebase SDK: ${scripts[currentIndex]}`);
                    reject(new Error(`無法載入 Firebase SDK: ${scripts[currentIndex]}`));
                };
                document.head.appendChild(script);
            }

            // 開始載入第一個腳本
            loadNextScript();
        });
    }

    // 全域變數
    let currentAgent = null;
    let currentConversation = null;
    let isOpen = false;
    let currentAgentId = null;
    let conversationHistory = []; // 對話歷史
    let tokenUsageStats = { // Token 使用統計
        totalRequests: 0,
        totalTokens: 0,
        averageTokensPerRequest: 0
    };

    // 對話管理相關常數
    const STORAGE_KEYS = {
        CONVERSATION_COUNT: 'ai-convai-conversation-count',
        AGENT_INTRODUCTIONS: 'ai-convai-agent-introductions',
        LAST_AGENT_ID: 'ai-convai-last-agent-id',
        USER_INFO: 'ai-convai-user-info'
    };

    // 個人資訊提取模式
    const INFO_PATTERNS = {
        name: [
            /我叫([^，。！？\s]{2,10})/g,
            /我是([^，。！？\s]{2,10})/g,
            /姓名[：:]\s*([^，。！？\s]{2,10})/g,
            /名字[：:]\s*([^，。！？\s]{2,10})/g
        ],
        phone: [
            /(\d{2,4}[-－]\d{3,4}[-－]\d{3,4})/g,
            /(\d{8,11})/g,
            /電話[：:]\s*(\d{2,4}[-－]\d{3,4}[-－]\d{3,4})/g,
            /手機[：:]\s*(\d{8,11})/g
        ],
        email: [
            /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
            /信箱[：:]\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
            /email[：:]\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
        ],
        school: [
            /就讀於([^，。！？\s]{2,20})/g,
            /在([^，。！？\s]{2,20})上學/g,
            /學校[：:]\s*([^，。！？\s]{2,20})/g,
            /大學[：:]\s*([^，。！？\s]{2,20})/g
        ],
        company: [
            /在([^，。！？\s]{2,20})工作/g,
            /公司[：:]\s*([^，。！？\s]{2,20})/g,
            /任職於([^，。！？\s]{2,20})/g
        ]
    };

    // 檢查是否在測試環境中
    function isTestEnvironment() {
        return document.querySelector('#widgetContainer') !== null;
    }

    // 獲取對話輪數
    function getConversationCount(agentId) {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.CONVERSATION_COUNT);
            const counts = data ? JSON.parse(data) : {};
            return counts[agentId] || 0;
        } catch (error) {
            console.error('獲取對話輪數失敗:', error);
            return 0;
        }
    }


    // 獲取當前 session 的對話數量
    async function getCurrentSessionConversationCount(agentId) {
        try {
            if (!agentId) return 0;

            const database = await loadFirebaseSDK();
            const currentSessionId = getSessionId();
            const conversationsRef = database.ref(`agents/${agentId}/conversations`);
            const snapshot = await conversationsRef.once('value');
            const conversations = snapshot.val() || {};

            // 計算當前 session 的對話數量
            let sessionMessages = 0;
            Object.values(conversations).forEach(conversation => {
                if (conversation.sessionId === currentSessionId && conversation.messages) {
                    sessionMessages += Object.keys(conversation.messages).length;
                }
            });

            return sessionMessages;
        } catch (error) {
            console.error('獲取當前 session 對話數量失敗:', error);
            return 0;
        }
    }

    // 增加對話輪數
    function incrementConversationCount(agentId) {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.CONVERSATION_COUNT);
            const counts = data ? JSON.parse(data) : {};
            counts[agentId] = (counts[agentId] || 0) + 1;
            localStorage.setItem(STORAGE_KEYS.CONVERSATION_COUNT, JSON.stringify(counts));
            return counts[agentId];
        } catch (error) {
            console.error('增加對話輪數失敗:', error);
            return 0;
        }
    }

    // 檢查是否已介紹過代理
    function hasAgentBeenIntroduced(agentId) {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.AGENT_INTRODUCTIONS);
            const introductions = data ? JSON.parse(data) : {};
            return introductions[agentId] || false;
        } catch (error) {
            console.error('檢查代理介紹狀態失敗:', error);
            return false;
        }
    }

    // 標記代理已介紹
    function markAgentAsIntroduced(agentId) {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.AGENT_INTRODUCTIONS);
            const introductions = data ? JSON.parse(data) : {};
            introductions[agentId] = true;
            localStorage.setItem(STORAGE_KEYS.AGENT_INTRODUCTIONS, JSON.stringify(introductions));
        } catch (error) {
            console.error('標記代理介紹失敗:', error);
        }
    }

    // 檢查是否為新代理
    function isNewAgent(agentId) {
        try {
            const lastAgentId = localStorage.getItem(STORAGE_KEYS.LAST_AGENT_ID);
            return lastAgentId !== agentId;
        } catch (error) {
            console.error('檢查新代理失敗:', error);
            return true;
        }
    }

    // 更新最後使用的代理
    function updateLastAgent(agentId) {
        try {
            localStorage.setItem(STORAGE_KEYS.LAST_AGENT_ID, agentId);
        } catch (error) {
            console.error('更新最後代理失敗:', error);
        }
    }

    // 載入人物誌管理器
    async function loadProfileManager() {
        return new Promise((resolve, reject) => {
            if (window.profileManager) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://ees-ai.web.app/dynamic-profile.js';

            script.onload = () => {
                console.log('動態人物誌系統已載入');
                resolve();
            };

            script.onerror = () => {
                console.warn('動態人物誌系統載入失敗，嘗試備用路徑');
                // 嘗試備用路徑
                const backupScript = document.createElement('script');
                backupScript.src = './dynamic-profile.js';
                backupScript.onload = () => {
                    console.log('動態人物誌系統已載入（備用路徑）');
                    resolve();
                };
                backupScript.onerror = () => {
                    console.error('動態人物誌系統載入完全失敗');
                    reject(new Error('無法載入人物誌系統'));
                };
                document.head.appendChild(backupScript);
            };

            document.head.appendChild(script);
        });
    }





    // 顯示人物誌
    async function showProfile() {
        if (!window.profileManager) {
            // 嘗試重新載入人物誌系統
            loadProfileManager().then(() => {
                showProfile(); // 遞歸調用
            }).catch(() => {
                alert('人物誌功能載入失敗，請重新整理頁面');
            });
            return;
        }

        try {
            const profileSummary = window.profileManager.getProfileSummary(currentAgentId);
            const description = window.profileManager.generateProfileDescription(currentAgentId);

            if (!description) {
                alert('目前沒有建立人物誌，請先進行對話');
                return;
            }

            let profileText = '📋 動態人物誌\n\n';
            profileText += description;
            profileText += '\n\n';
            profileText += `信心度：${profileSummary.metadata.confidence}/10\n`;
            profileText += `互動次數：${profileSummary.metadata.totalInteractions}\n`;
            profileText += `最後更新：${new Date(profileSummary.metadata.lastUpdated).toLocaleString()}\n\n`;

            // 檢查是否已自動存儲
            const lastStoredKey = `ai-convai-last-stored-${currentAgentId}`;
            const lastStored = localStorage.getItem(lastStoredKey);
            if (lastStored) {
                const lastStoredTime = new Date(parseInt(lastStored)).toLocaleString();
                profileText += `✅ 已自動存儲到資料庫\n`;
                profileText += `存儲時間：${lastStoredTime}\n\n`;
            } else {
                profileText += `⏳ 尚未達到自動存儲條件\n`;
                profileText += `需要信心度 ≥ 6.0 且至少 2 個資訊類別\n\n`;
            }

            profileText += '是否要手動儲存到資料庫？';

            if (confirm(profileText)) {
                // 手動儲存人物誌到資料庫（使用 session 版本）
                const sessionId = getSessionId();
                await saveProfileToDatabase(profileSummary, sessionId);
            }
        } catch (error) {
            console.error('顯示人物誌失敗:', error);
            alert('人物誌功能發生錯誤，請檢查控制台');
        }
    }

    // 舊版 saveProfileToDatabase 函數已移除，統一使用 session 版本

    // 自動檢查並更新人物誌到資料庫
    async function checkAndUpdateProfileToDatabase() {
        if (!window.profileManager) return;

        try {
            const profileSummary = window.profileManager.getProfileSummary(currentAgentId);

            // 舊版自動存儲邏輯已移除，統一使用 session 版本
        } catch (error) {
            console.error('自動檢查人物誌失敗:', error);
        }
    }

    // 判斷是否應該更新人物誌到資料庫
    function shouldUpdateProfileToDatabase(profileSummary) {
        // 檢查信心度是否達到閾值
        const confidenceThreshold = 6.0; // 信心度閾值
        if (profileSummary.metadata.confidence < confidenceThreshold) {
            return false;
        }

        // 檢查是否有足夠的資訊類別
        const minCategories = 2; // 最少需要2個類別的資訊
        let categoryCount = 0;

        Object.keys(profileSummary).forEach(category => {
            if (category !== 'metadata' && Object.keys(profileSummary[category]).length > 0) {
                categoryCount++;
            }
        });

        if (categoryCount < minCategories) {
            return false;
        }

        // 檢查是否已經存儲過（避免重複存儲）
        const lastStoredKey = `ai-convai-last-stored-${currentAgentId}`;
        const lastStored = localStorage.getItem(lastStoredKey);
        const now = Date.now();

        // 如果距離上次存儲不到5分鐘，不重複存儲
        if (lastStored && (now - parseInt(lastStored)) < 5 * 60 * 1000) {
            return false;
        }

        return true;
    }

    // 舊版自動儲存函數已移除，統一使用 session 版本

    // 生成人物誌引導提示詞
    async function generateProfileGuidancePrompt() {
        if (!window.profileManager) {
            return '';
        }

        try {
            const profileSummary = window.profileManager.getProfileSummary(currentAgentId);
            const confidence = profileSummary.metadata?.confidence || 0;
            const interactions = profileSummary.metadata?.totalInteractions || 0;

            // 如果信心度已經很高，不需要引導
            if (confidence >= 8.0) {
                return '';
            }

            // 根據對話輪數決定引導策略
            const conversationCount = getConversationCount(currentAgentId);

            let guidancePrompt = '';

            // 第2-3輪對話：引導基本資訊
            if (conversationCount >= 2 && conversationCount <= 3) {
                const hasBasicInfo = profileSummary.basic && Object.keys(profileSummary.basic).length > 0;
                if (!hasBasicInfo) {
                    guidancePrompt += '\n\n引導策略：在回答用戶問題的同時，自然地詢問用戶的姓名或稱呼，例如："請問我該如何稱呼您呢？"';
                }
            }

            // 第4-6輪對話：引導聯絡方式（高優先級）
            else if (conversationCount >= 4 && conversationCount <= 6) {
                const hasContactInfo = profileSummary.contact && Object.keys(profileSummary.contact).length > 0;
                if (!hasContactInfo) {
                    guidancePrompt += '\n\n【重要】引導策略：聯絡方式是必須收集的關鍵資訊！在回答用戶問題的同時，務必主動詢問聯絡方式，例如："為了提供更好的服務，方便留下您的姓名、電話號碼或 email 嗎？" 或 "如果後續有相關資訊，要如何聯絡您呢？" 這是高優先級任務！';
                }
            }

            // 第7-10輪對話：引導職業資訊
            else if (conversationCount >= 7 && conversationCount <= 10) {
                const hasCareerInfo = profileSummary.career && Object.keys(profileSummary.career).length > 0;
                if (!hasCareerInfo) {
                    guidancePrompt += '\n\n引導策略：自然地詢問用戶的職業或工作領域，例如："請問您從事什麼行業呢？"';
                }
            }

            // 第11輪以上：引導興趣愛好
            else if (conversationCount >= 11) {
                const hasInterests = profileSummary.interests && Object.keys(profileSummary.interests).length > 0;
                if (!hasInterests) {
                    guidancePrompt += '\n\n引導策略：詢問用戶的興趣愛好，例如："您平時有什麼興趣愛好嗎？"';
                }
            }

            // 添加引導原則
            if (guidancePrompt) {
                guidancePrompt += '\n\n引導原則：\n';
                guidancePrompt += '1. 引導要自然，不要生硬\n';
                guidancePrompt += '2. 在回答用戶問題的同時進行引導\n';
                guidancePrompt += '3. 如果用戶不願意提供資訊，不要強迫\n';
                guidancePrompt += '4. 引導問題要與當前對話內容相關\n';
                guidancePrompt += '5. 一次只引導一個類別的資訊\n';
            }

            return guidancePrompt;
        } catch (error) {
            console.error('生成引導提示詞失敗:', error);
            return '';
        }
    }

    // 智能引導分析（根據用戶訊息內容決定引導策略）
    function analyzeUserMessageForGuidance(message) {
        const guidanceHints = [];

        // 分析用戶訊息中的關鍵詞
        const messageLower = message.toLowerCase();

        // 檢查是否提到姓名相關
        if (messageLower.includes('我叫') || messageLower.includes('我是') || messageLower.includes('姓名') || messageLower.includes('名字')) {
            guidanceHints.push('用戶可能願意提供姓名資訊');
        }

        // 檢查是否提到聯絡方式（高優先級檢測）
        if (messageLower.includes('電話') || messageLower.includes('手機') || messageLower.includes('email') || messageLower.includes('信箱') || messageLower.includes('聯絡') || messageLower.includes('line') || messageLower.includes('whatsapp') || messageLower.includes('微信')) {
            guidanceHints.push('【高優先級】用戶可能願意提供聯絡方式，務必把握機會收集！');
        }

        // 檢查是否提到工作相關
        if (messageLower.includes('工作') || messageLower.includes('公司') || messageLower.includes('職業') || messageLower.includes('行業') || messageLower.includes('職位')) {
            guidanceHints.push('用戶可能願意提供職業資訊');
        }

        // 檢查是否提到興趣相關
        if (messageLower.includes('喜歡') || messageLower.includes('興趣') || messageLower.includes('愛好') || messageLower.includes('運動') || messageLower.includes('音樂')) {
            guidanceHints.push('用戶可能願意提供興趣資訊');
        }

        return guidanceHints;
    }

    // 生成情境化引導提示
    function generateContextualGuidance(message, conversationCount) {
        const messageLower = message.toLowerCase();
        let contextualGuidance = '';

        // 根據用戶問題類型提供不同的引導策略（特別強調聯絡方式）
        if (messageLower.includes('產品') || messageLower.includes('服務') || messageLower.includes('價格')) {
            contextualGuidance = '在介紹產品或服務時，務必把握機會收集聯絡方式！例如："為了提供更詳細的產品資訊，方便留下您的聯絡方式嗎？" 聯絡方式是關鍵資訊！';
        }
        else if (messageLower.includes('技術') || messageLower.includes('問題') || messageLower.includes('故障')) {
            contextualGuidance = '在解決技術問題時，主動詢問聯絡方式！例如："如果後續有技術支援，要如何聯絡您呢？" 聯絡方式收集是優先任務！';
        }
        else if (messageLower.includes('時間') || messageLower.includes('安排') || messageLower.includes('預約')) {
            contextualGuidance = '在安排時間時，必須收集聯絡方式！例如："為了確認時間安排，方便留下您的電話或 email 嗎？" 聯絡方式是必須的！';
        }
        else if (messageLower.includes('推薦') || messageLower.includes('建議') || messageLower.includes('選擇')) {
            contextualGuidance = '在提供建議時，主動收集聯絡方式！例如："為了提供更適合的建議，方便留下聯絡方式嗎？" 聯絡方式收集是重點！';
        }
        else {
            // 通用情況也要強調聯絡方式
            contextualGuidance = '無論什麼話題，都要把握機會收集聯絡方式！例如："為了提供更好的服務，方便留下您的聯絡方式嗎？" 聯絡方式是必須收集的關鍵資訊！';
        }

        return contextualGuidance;
    }

    // 生成人物誌 JSON 並更新 session 存儲
    async function generateAndSaveProfileJSON(message) {
        try {
            // 分析用戶訊息，提取人物誌資訊
            const profileData = analyzeMessageForProfile(message);

            if (Object.keys(profileData).length > 0) {
                // 更新 session 人物誌
                const hasChanges = await updateSessionProfile(profileData);

                if (hasChanges) {
                    if (localStorage.getItem('ai-convai-debug') === 'true') {
                        console.log('基於用戶訊息的 session 人物誌已更新:', profileData);
                    }
                } else {
                    if (localStorage.getItem('ai-convai-debug') === 'true') {
                        console.log('基於用戶訊息的 session 人物誌無異動，跳過更新');
                    }
                }
            }
        } catch (error) {
            console.error('生成人物誌 JSON 失敗:', error);
        }
    }

    // 分析訊息並提取人物誌資訊
    function analyzeMessageForProfile(message) {
        const profileData = {
            basic: {},
            contact: {},
            education: {},
            career: {},
            interests: {},
            personality: {},
            lifestyle: {},
            metadata: {
                confidence: 0,
                totalInteractions: 1,
                lastUpdated: Date.now()
            }
        };

        const messageLower = message.toLowerCase();

        // 基本資訊提取
        const nameMatch = message.match(/(?:我叫|我是|姓名[：:]\s*|名字[：:]\s*)([^，。！？\s]{2,10})/);
        if (nameMatch) {
            profileData.basic.name = nameMatch[1];
            profileData.metadata.confidence += 2;
        }

        const ageMatch = message.match(/(?:今年|年齡|歲|歲數)[：:]\s*(\d{1,3})/);
        if (ageMatch) {
            profileData.basic.age = parseInt(ageMatch[1]);
            profileData.metadata.confidence += 1;
        }

        // 聯絡方式提取
        const phoneMatch = message.match(/(?:電話|手機|聯絡)[：:]\s*([0-9\-\s\+\(\)]{8,15})/);
        if (phoneMatch) {
            profileData.contact.phone = phoneMatch[1];
            profileData.metadata.confidence += 2;
        }

        const emailMatch = message.match(/(?:email|信箱|電子郵件)[：:]\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
            profileData.contact.email = emailMatch[1];
            profileData.metadata.confidence += 2;
        }

        // 教育背景提取
        const schoolMatch = message.match(/(?:學校|大學|學院|就讀)[：:]\s*([^，。！？\s]{2,20})/);
        if (schoolMatch) {
            profileData.education.school = schoolMatch[1];
            profileData.metadata.confidence += 1;
        }

        const majorMatch = message.match(/(?:科系|專業|主修)[：:]\s*([^，。！？\s]{2,20})/);
        if (majorMatch) {
            profileData.education.major = majorMatch[1];
            profileData.metadata.confidence += 1;
        }

        // 職業資訊提取
        const companyMatch = message.match(/(?:公司|工作|任職)[：:]\s*([^，。！？\s]{2,20})/);
        if (companyMatch) {
            profileData.career.company = companyMatch[1];
            profileData.metadata.confidence += 1;
        }

        const positionMatch = message.match(/(?:職位|職稱|工作)[：:]\s*([^，。！？\s]{2,20})/);
        if (positionMatch) {
            profileData.career.position = positionMatch[1];
            profileData.metadata.confidence += 1;
        }

        // 興趣愛好提取
        const hobbyMatch = message.match(/(?:興趣|愛好|喜歡|嗜好)[：:]\s*([^，。！？\s]{2,30})/);
        if (hobbyMatch) {
            profileData.interests.hobbies = hobbyMatch[1];
            profileData.metadata.confidence += 1;
        }

        // 個性特質提取
        const personalityMatch = message.match(/(?:個性|性格|特質)[：:]\s*([^，。！？\s]{2,30})/);
        if (personalityMatch) {
            profileData.personality.traits = personalityMatch[1];
            profileData.metadata.confidence += 1;
        }

        // 生活狀況提取
        const lifestyleMatch = message.match(/(?:生活|作息|習慣)[：:]\s*([^，。！？\s]{2,30})/);
        if (lifestyleMatch) {
            profileData.lifestyle.habits = lifestyleMatch[1];
            profileData.metadata.confidence += 1;
        }

        // 計算總信心度
        profileData.metadata.confidence = Math.min(profileData.metadata.confidence, 10);

        // 只返回有內容的資料
        const filteredData = {};
        Object.keys(profileData).forEach(key => {
            if (key === 'metadata' || Object.keys(profileData[key]).length > 0) {
                filteredData[key] = profileData[key];
            }
        });

        return filteredData;
    }

    // 儲存人物誌到資料庫（基於用戶ID）
    async function saveProfileToDatabase(profileData, sessionId) {
        try {
            const database = await loadFirebaseSDK();
            const userId = getUserId();

            // 使用用戶ID作為主要key，sessionId作為輔助識別
            const profileKey = `user_${userId}_${sessionId}`;
            const lastProfileRef = database.ref(`agents/${currentAgentId}/profiles/${profileKey}`);
            const lastProfileSnapshot = await lastProfileRef.once('value');
            const lastProfile = lastProfileSnapshot.val();

            // 比較人物誌內容
            const isDifferent = !lastProfile || hasProfileChanged(lastProfile, profileData);

            if (isDifferent) {
                // 使用用戶ID和sessionID組合作為key
                await lastProfileRef.set({
                    ...profileData,
                    createdAt: Date.now(),
                    agentId: currentAgentId,
                    userId: userId,
                    sessionId: sessionId,
                    metadata: {
                        source: 'widget',
                        userId: userId,
                        sessionId: sessionId,
                        lastUpdated: Date.now()
                    }
                });

                console.log('人物誌已更新到資料庫 (用戶ID:', userId, ', Session ID:', sessionId, ')');

                if (localStorage.getItem('ai-convai-debug') === 'true') {
                    console.log('人物誌異動詳情:', {
                        userId: userId,
                        sessionId: sessionId,
                        agentId: currentAgentId,
                        hasLastProfile: !!lastProfile,
                        profileData: profileData
                    });
                }
            } else {
                console.log('人物誌無異動，跳過資料庫更新');
            }
        } catch (error) {
            console.error('儲存人物誌到資料庫失敗:', error);
        }
    }

    // 解析 AI 回覆中的 JSON 並更新 session 人物誌
    async function parseAndSaveProfileFromAIResponse(aiResponse) {
        try {
            // 尋找 JSON 區塊
            const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) {
                if (localStorage.getItem('ai-convai-debug') === 'true') {
                    console.log('AI 回覆中未找到 JSON 區塊');
                }
                return aiResponse; // 沒有 JSON 時返回原始回覆
            }

            const jsonString = jsonMatch[1].trim();
            const responseData = JSON.parse(jsonString);

            if (responseData.profile) {
                // 轉換為標準格式
                const newProfileData = {
                    basic: responseData.profile.basic || {},
                    contact: responseData.profile.contact || {},
                    education: responseData.profile.education || {},
                    career: responseData.profile.career || {},
                    interests: responseData.profile.interests || {},
                    personality: responseData.profile.personality || {},
                    lifestyle: responseData.profile.lifestyle || {},
                    metadata: {
                        confidence: calculateProfileConfidence(responseData.profile),
                        totalInteractions: await getCurrentSessionConversationCount(currentAgentId),
                        lastUpdated: Date.now(),
                        source: 'ai_response' // 標記來源為 AI 回覆
                    }
                };

                // 更新 session 人物誌
                const hasChanges = await updateSessionProfile(newProfileData);

                if (hasChanges) {
                    if (localStorage.getItem('ai-convai-debug') === 'true') {
                        console.log('Session 人物誌有異動，已更新');
                    }
                } else {
                    if (localStorage.getItem('ai-convai-debug') === 'true') {
                        console.log('Session 人物誌無異動，跳過更新');
                    }
                }
            }

            // 處理建議問題
            if (responseData.suggestions && Array.isArray(responseData.suggestions)) {
                displaySuggestions(responseData.suggestions);
            }

            // 返回去除 JSON 後的純文字回覆
            const cleanResponse = aiResponse.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
            return cleanResponse;
        } catch (error) {
            console.error('解析 AI 回覆中的 JSON 失敗:', error);
            return aiResponse; // 解析失敗時返回原始回覆
        }
    }

    // 計算人物誌信心度
    function calculateProfileConfidence(profile) {
        let confidence = 0;
        const categories = ['basic', 'contact', 'education', 'career', 'interests', 'personality', 'lifestyle'];

        // 計算有內容的類別數量
        let categoryCount = 0;
        let totalAttributes = 0;

        categories.forEach(category => {
            if (profile[category] && Object.keys(profile[category]).length > 0) {
                categoryCount++;
                totalAttributes += Object.keys(profile[category]).length;
            }
        });

        // 基於類別數量和屬性數量計算信心度
        if (categoryCount === 0) return 0;

        // 信心度 = 類別數量 * 2 + 屬性數量 * 0.5，最高 10 分
        confidence = Math.min((categoryCount * 2) + (totalAttributes * 0.5), 10);

        return Math.round(confidence * 10) / 10; // 保留一位小數
    }

    // 顯示建議問題
    function displaySuggestions(suggestions) {
        try {
            const suggestionsContainer = document.getElementById('suggestionsContainer');
            const suggestionsList = document.getElementById('suggestionsList');

            if (!suggestionsContainer || !suggestionsList) {
                console.error('找不到建議問題容器');
                return;
            }

            // 清空現有內容
            suggestionsList.innerHTML = '';

            if (suggestions.length === 0) {
                suggestionsContainer.style.display = 'none';
                return;
            }

            // 生成可點擊的建議問題列表
            suggestions.forEach((suggestion, index) => {
                const suggestionItem = document.createElement('div');
                suggestionItem.className = 'ai-convai-suggestion-item';
                suggestionItem.textContent = suggestion;
                suggestionItem.style.cursor = 'pointer';
                suggestionItem.style.transition = 'all 0.2s ease';

                // 添加點擊事件
                suggestionItem.addEventListener('click', () => {
                    handleSuggestionClick(suggestion, suggestionItem);
                });

                // 添加懸停效果
                suggestionItem.addEventListener('mouseenter', () => {
                    suggestionItem.style.backgroundColor = '#f0f8ff';
                    suggestionItem.style.transform = 'translateX(5px)';
                });

                suggestionItem.addEventListener('mouseleave', () => {
                    suggestionItem.style.backgroundColor = '';
                    suggestionItem.style.transform = '';
                });

                suggestionsList.appendChild(suggestionItem);
            });

            // 顯示建議問題區域
            suggestionsContainer.style.display = 'block';

            if (localStorage.getItem('ai-convai-debug') === 'true') {
                console.log('顯示建議問題:', suggestions);
            }
        } catch (error) {
            console.error('顯示建議問題失敗:', error);
        }
    }

    // 處理建議問題點擊
    function handleSuggestionClick(suggestion, suggestionItem) {
        try {
            // 添加點擊效果
            suggestionItem.style.backgroundColor = '#e3f2fd';
            suggestionItem.style.transform = 'scale(0.98)';

            setTimeout(() => {
                suggestionItem.style.backgroundColor = '';
                suggestionItem.style.transform = '';
            }, 150);

            // 顯示專用輸入對話框
            showSuggestionInputModal(suggestion);

            // 隱藏建議問題區域
            hideSuggestions();

            console.log('用戶點擊建議問題:', suggestion);

        } catch (error) {
            console.error('處理建議問題點擊失敗:', error);
        }
    }

    // 顯示建議問題專用輸入對話框
    function showSuggestionInputModal(suggestion) {
        // 創建遮罩層
        const overlay = document.createElement('div');
        overlay.className = 'ai-convai-suggestion-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(15, 23, 42, 0.4);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });

        // 創建對話框
        const modal = document.createElement('div');
        modal.className = 'ai-convai-suggestion-modal';
        modal.style.cssText = `
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-radius: 20px;
            padding: 24px;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.5);
            position: relative;
            transform: scale(0.95);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        // 觸發動畫
        requestAnimationFrame(() => {
            modal.style.transform = 'scale(1)';
            modal.style.opacity = '1';
        });

        modal.innerHTML = `
            <div class="ai-convai-suggestion-modal-header" style="margin-bottom: 20px; text-align: center;">
                <div style="width: 48px; height: 48px; background: #e0f2fe; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #0284c7;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                </div>
                <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 18px; font-weight: 600;">回答問題</h3>
                <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">${suggestion}</p>
            </div>
            
            <div class="ai-convai-suggestion-modal-body">
                <div class="form-group" style="margin-bottom: 24px;">
                    <textarea 
                        id="suggestionAnswer" 
                        placeholder="請輸入您的回答..." 
                        rows="4" 
                        style="width: 100%; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 15px; resize: vertical; font-family: inherit; outline: none; transition: all 0.2s ease; color: #334155; display: block; box-sizing: border-box;"
                        onfocus="this.style.borderColor='#6366f1'; this.style.boxShadow='0 0 0 3px rgba(99, 102, 241, 0.1)';"
                        onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none';"
                    ></textarea>
                </div>
            </div>
            
            <div class="ai-convai-suggestion-modal-footer" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <button 
                    onclick="closeSuggestionModal()" 
                    style="padding: 12px; border: 1px solid #e2e8f0; background: white; color: #475569; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease;"
                    onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1';"
                    onmouseout="this.style.background='white'; this.style.borderColor='#e2e8f0';"
                >
                    取消
                </button>
                <button 
                    onclick="submitSuggestionAnswer('${suggestion.replace(/'/g, "\\'")}')" 
                    style="padding: 12px; border: none; background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); color: white; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);"
                    onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 16px rgba(99, 102, 241, 0.4)';"
                    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(99, 102, 241, 0.3)';"
                >
                    提交回答
                </button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 聚焦到輸入框
        setTimeout(() => {
            const textarea = document.getElementById('suggestionAnswer');
            if (textarea) {
                textarea.focus();
            }
        }, 100);

        // 點擊遮罩層關閉對話框
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeSuggestionModal();
            }
        });
    }

    // 關閉建議問題對話框
    window.closeSuggestionModal = function () {
        const overlay = document.querySelector('.ai-convai-suggestion-overlay');
        if (overlay) {
            overlay.remove();
        }
    };

    // 提交建議問題回答
    window.submitSuggestionAnswer = async function (question) {
        try {
            const answer = document.getElementById('suggestionAnswer').value.trim();

            if (!answer) {
                alert('請輸入您的回答');
                return;
            }

            // 關閉對話框
            closeSuggestionModal();

            // 將問題和回答組合成完整的訊息
            const fullMessage = `${question}\n\n我的回答：${answer}`;

            // 添加到對話中
            addMessage(fullMessage, 'user');

            // 儲存到 Firebase
            await saveMessage(fullMessage, 'user');

            // 更新人物誌
            await updateProfileWithSuggestionAnswer(question, answer);

            // 獲取 AI 回應
            const aiResponse = await getAIResponse(fullMessage);

            // 顯示 AI 回應
            addMessage(aiResponse.response, 'assistant', false, aiResponse.usedKnowledgeBases);

            // 儲存 AI 回應到 Firebase
            await saveMessage(aiResponse.response, 'assistant');

            console.log('建議問題回答已提交:', { question, answer });

        } catch (error) {
            console.error('提交建議問題回答失敗:', error);
            alert('提交失敗，請稍後再試');
        }
    };

    // 更新人物誌 - 添加建議問題回答
    async function updateProfileWithSuggestionAnswer(question, answer) {
        try {
            const database = await loadFirebaseSDK();
            const sessionId = getSessionId();

            // 獲取當前人物誌
            const profileRef = database.ref(`agents/${currentAgentId}/profiles/${sessionId}`);
            const profileSnapshot = await profileRef.once('value');
            const currentProfile = profileSnapshot.val() || {};

            // 分析問題類型並更新相應欄位
            const updatedProfile = { ...currentProfile };

            // 根據問題內容更新不同的人物誌欄位
            if (question.includes('年級') || question.includes('學校') || question.includes('背景')) {
                updatedProfile.education = {
                    ...currentProfile.education,
                    background: answer,
                    lastUpdated: Date.now()
                };
            } else if (question.includes('興趣') || question.includes('愛好')) {
                updatedProfile.interests = {
                    ...currentProfile.interests,
                    hobbies: answer,
                    lastUpdated: Date.now()
                };
            } else if (question.includes('個性') || question.includes('特質')) {
                updatedProfile.personality = {
                    ...currentProfile.personality,
                    traits: answer,
                    lastUpdated: Date.now()
                };
            } else if (question.includes('職業') || question.includes('工作') || question.includes('公司')) {
                updatedProfile.career = {
                    ...currentProfile.career,
                    details: answer,
                    lastUpdated: Date.now()
                };
            } else {
                // 通用回答存儲
                updatedProfile.additionalInfo = {
                    ...currentProfile.additionalInfo,
                    [question]: answer,
                    lastUpdated: Date.now()
                };
            }

            // 更新元數據
            updatedProfile.metadata = {
                ...currentProfile.metadata,
                lastUpdated: Date.now(),
                totalInteractions: (currentProfile.metadata?.totalInteractions || 0) + 1,
                suggestionAnswers: (currentProfile.metadata?.suggestionAnswers || 0) + 1
            };

            // 儲存更新後的人物誌
            await profileRef.set(updatedProfile);

            console.log('人物誌已更新建議問題回答:', {
                sessionId: sessionId,
                question: question,
                answer: answer
            });

        } catch (error) {
            console.error('更新人物誌建議問題回答失敗:', error);
            // 不拋出錯誤，避免影響回答提交
        }
    }

    // 隱藏建議問題
    function hideSuggestions() {
        try {
            const suggestionsContainer = document.getElementById('suggestionsContainer');
            if (suggestionsContainer) {
                suggestionsContainer.style.display = 'none';
            }
        } catch (error) {
            console.error('隱藏建議問題失敗:', error);
        }
    }

    // 獲取本地人物誌（基於用戶ID）
    function getLocalProfile(agentId) {
        try {
            const userId = getUserId();
            const newKey = `ai-convai-profile-${agentId}-${userId}`;
            const oldKey = `ai-convai-profile-${agentId}`;

            // 先嘗試獲取新格式的人物誌
            let profileData = localStorage.getItem(newKey);
            if (profileData) {
                // 如果新格式存在，清理可能存在的舊格式
                const oldProfileData = localStorage.getItem(oldKey);
                if (oldProfileData) {
                    console.log('發現重複的舊格式人物誌，正在清理...');
                    localStorage.removeItem(oldKey);
                    console.log('已清理舊格式人物誌:', oldKey);
                }
                return JSON.parse(profileData);
            }

            // 如果新格式不存在，檢查是否有舊格式的資料
            const oldProfileData = localStorage.getItem(oldKey);
            if (oldProfileData) {
                console.log('發現舊格式人物誌，正在遷移...');
                const oldProfile = JSON.parse(oldProfileData);

                // 遷移舊資料到新格式
                localStorage.setItem(newKey, oldProfileData);

                // 清理舊格式資料
                localStorage.removeItem(oldKey);

                console.log('人物誌已從舊格式遷移到新格式');
                return oldProfile;
            }

            return null;
        } catch (error) {
            console.error('獲取本地人物誌失敗:', error);
            return null;
        }
    }

    // 更新本地人物誌（基於用戶ID）
    async function updateLocalProfile(newProfileData) {
        try {
            const userId = getUserId();
            const currentProfile = getLocalProfile(currentAgentId);
            let hasChanges = false;

            if (!currentProfile) {
                // 第一次建立人物誌
                hasChanges = true;
                const key = `ai-convai-profile-${currentAgentId}-${userId}`;
                localStorage.setItem(key, JSON.stringify(newProfileData));

                if (localStorage.getItem('ai-convai-debug') === 'true') {
                    console.log('建立新的人物誌 (用戶ID:', userId, '):', newProfileData);
                }
            } else {
                // 比較並合併資料
                const mergedProfile = mergeProfileData(currentProfile, newProfileData);

                // 檢查是否有異動
                hasChanges = hasProfileChanged(currentProfile, mergedProfile);

                if (hasChanges) {
                    const key = `ai-convai-profile-${currentAgentId}-${userId}`;
                    localStorage.setItem(key, JSON.stringify(mergedProfile));

                    if (localStorage.getItem('ai-convai-debug') === 'true') {
                        console.log('人物誌已更新 (用戶ID:', userId, '):', mergedProfile);
                    }
                }
            }

            // 如果有異動，寫入資料庫
            if (hasChanges) {
                const sessionId = getSessionId();
                await saveProfileToDatabase(newProfileData, sessionId);
            }

            return hasChanges;
        } catch (error) {
            console.error('更新本地人物誌失敗:', error);
            return false;
        }
    }

    // 基於用戶提問更新人物誌（僅分析用戶訊息）
    async function updateProfileFromUserMessage(userMessage) {
        try {
            const userId = getUserId();
            const currentProfile = getLocalProfile(currentAgentId);

            // 分析用戶訊息中的人物誌資訊
            const profileUpdates = analyzeUserMessageForProfile(userMessage);

            if (Object.keys(profileUpdates).length > 0) {
                console.log('從用戶提問中提取的人物誌資訊:', profileUpdates);

                // 合併到現有人物誌
                const mergedProfile = currentProfile ?
                    mergeProfileData(currentProfile, profileUpdates) :
                    profileUpdates;

                // 更新本地人物誌
                const key = `ai-convai-profile-${currentAgentId}-${userId}`;
                localStorage.setItem(key, JSON.stringify(mergedProfile));

                // 保存到資料庫
                const sessionId = getSessionId();
                await saveProfileToDatabase(mergedProfile, sessionId);

                if (localStorage.getItem('ai-convai-debug') === 'true') {
                    console.log('人物誌已更新 (基於用戶提問):', mergedProfile);
                }
            }
        } catch (error) {
            console.error('基於用戶提問更新人物誌失敗:', error);
        }
    }

    // 分析用戶訊息中的人物誌資訊
    function analyzeUserMessageForProfile(message) {
        const profileUpdates = {
            basic: {},
            contact: {},
            education: {},
            career: {},
            interests: {},
            personality: {},
            lifestyle: {}
        };

        const messageLower = message.toLowerCase();

        // 分析基本資訊
        const nameMatch = message.match(/(?:我是|我叫|姓名是|名字是|我叫做?)\s*([^\s，。！？,\.!?]+)/);
        if (nameMatch) {
            profileUpdates.basic.name = nameMatch[1].trim();
        }

        const ageMatch = message.match(/(?:我|年齡|歲數|年紀)(?:是|有)?\s*(\d+)\s*歲?/);
        if (ageMatch) {
            profileUpdates.basic.age = ageMatch[1];
        }

        // 分析聯絡方式
        const phoneMatch = message.match(/(?:電話|手機|聯絡電話|電話號碼)[:：]?\s*([0-9\-\s\(\)]+)/);
        if (phoneMatch) {
            profileUpdates.contact.phone = phoneMatch[1].trim();
        }

        const emailMatch = message.match(/(?:email|電子郵件|信箱)[:：]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
            profileUpdates.contact.email = emailMatch[1].trim();
        }

        const lineMatch = message.match(/(?:line|LINE|賴)[:：]?\s*([^\s，。！？,\.!?]+)/);
        if (lineMatch) {
            profileUpdates.contact.line = lineMatch[1].trim();
        }

        // 分析教育背景
        const schoolMatch = message.match(/(?:學校|就讀|畢業於)[:：]?\s*([^\s，。！？,\.!?]+)/);
        if (schoolMatch) {
            profileUpdates.education.school = schoolMatch[1].trim();
        }

        const majorMatch = message.match(/(?:科系|專業|主修|就讀)[:：]?\s*([^\s，。！？,\.!?]+)/);
        if (majorMatch) {
            profileUpdates.education.major = majorMatch[1].trim();
        }

        // 分析職業資訊
        const jobMatch = message.match(/(?:工作|職業|從事|任職)[:：]?\s*([^\s，。！？,\.!?]+)/);
        if (jobMatch) {
            profileUpdates.career.job = jobMatch[1].trim();
        }

        const companyMatch = message.match(/(?:公司|企業|任職於)[:：]?\s*([^\s，。！？,\.!?]+)/);
        if (companyMatch) {
            profileUpdates.career.company = companyMatch[1].trim();
        }

        // 分析興趣愛好
        const hobbiesMatch = message.match(/(?:興趣|愛好|喜歡|嗜好)[:：]?\s*([^\s，。！？,\.!?]+)/);
        if (hobbiesMatch) {
            profileUpdates.interests.hobbies = hobbiesMatch[1].trim();
        }

        // 分析個性特質
        const personalityMatch = message.match(/(?:個性|性格|特質|特點)[:：]?\s*([^\s，。！？,\.!?]+)/);
        if (personalityMatch) {
            profileUpdates.personality.traits = personalityMatch[1].trim();
        }

        // 過濾空值
        Object.keys(profileUpdates).forEach(key => {
            if (Object.keys(profileUpdates[key]).length === 0) {
                delete profileUpdates[key];
            }
        });

        return profileUpdates;
    }

    // 合併人物誌資料
    function mergeProfileData(currentProfile, newProfileData) {
        const merged = JSON.parse(JSON.stringify(currentProfile)); // 深拷貝

        // 合併各個類別的資料
        const categories = ['basic', 'contact', 'education', 'career', 'interests', 'personality', 'lifestyle'];

        categories.forEach(category => {
            if (newProfileData[category] && Object.keys(newProfileData[category]).length > 0) {
                if (!merged[category]) {
                    merged[category] = {};
                }

                // 合併該類別下的所有屬性
                Object.keys(newProfileData[category]).forEach(key => {
                    const newValue = newProfileData[category][key];
                    if (newValue && newValue.trim() !== '') {
                        merged[category][key] = newValue;
                    }
                });
            }
        });

        // 更新 metadata
        merged.metadata = {
            ...merged.metadata,
            ...newProfileData.metadata,
            lastUpdated: Date.now()
        };

        return merged;
    }

    // 檢查人物誌是否有異動
    function hasProfileChanged(oldProfile, newProfile) {
        try {
            // 比較各個類別的內容
            const categories = ['basic', 'contact', 'education', 'career', 'interests', 'personality', 'lifestyle'];

            for (const category of categories) {
                const oldData = oldProfile[category] || {};
                const newData = newProfile[category] || {};

                // 檢查是否有新增的屬性
                for (const key in newData) {
                    if (!oldData[key] || oldData[key] !== newData[key]) {
                        return true;
                    }
                }

                // 檢查是否有更新的屬性
                for (const key in oldData) {
                    if (newData[key] && oldData[key] !== newData[key]) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.error('檢查人物誌異動失敗:', error);
            return true; // 發生錯誤時視為有異動
        }
    }

    // 獲取或生成用戶ID（持久化）
    function getUserId() {
        try {
            let userId = localStorage.getItem('ai-convai-user-id');
            if (!userId) {
                userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('ai-convai-user-id', userId);
                console.log('生成新用戶ID:', userId);
            }
            return userId;
        } catch (error) {
            console.error('獲取用戶ID失敗:', error);
            return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
    }

    // 清理舊格式的人物誌資料
    function cleanupOldProfileData() {
        try {
            const userId = getUserId();
            const keysToRemove = [];
            const currentAgentId = getCurrentAgentId();

            // 遍歷所有 localStorage 項目
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);

                if (key && key.startsWith('ai-convai-profile-')) {
                    // 檢查是否為舊格式的人物誌（只有代理ID，沒有用戶ID）
                    if (!key.includes(`-${userId}`)) {
                        // 檢查是否包含當前代理ID但沒有用戶ID
                        if (key.includes(`-${currentAgentId}`) && !key.includes(`-${userId}`)) {
                            keysToRemove.push(key);
                            console.log('發現舊格式人物誌，將清理:', key);
                        }
                    }
                }
            }

            // 清理舊格式資料
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                console.log('已清理舊格式人物誌:', key);
            });

            if (keysToRemove.length > 0) {
                console.log(`已清理 ${keysToRemove.length} 個舊格式人物誌`);
            } else {
                console.log('沒有發現需要清理的舊格式人物誌');
            }
        } catch (error) {
            console.error('清理舊格式人物誌失敗:', error);
        }
    }

    // 獲取當前代理ID的輔助函數
    function getCurrentAgentId() {
        // 從 URL 參數或全域變數獲取代理ID
        const urlParams = new URLSearchParams(window.location.search);
        const agentIdFromUrl = urlParams.get('agentId');

        if (agentIdFromUrl) {
            return agentIdFromUrl;
        }

        // 如果沒有從URL獲取，嘗試從全域變數
        if (typeof currentAgentId !== 'undefined') {
            return currentAgentId;
        }

        // 如果都沒有，返回空字串
        return '';
    }

    // 獲取 session ID（會話級別）
    function getSessionId() {
        try {
            let sessionId = sessionStorage.getItem('ai-convai-session-id');
            if (!sessionId) {
                sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                sessionStorage.setItem('ai-convai-session-id', sessionId);
            }
            return sessionId;
        } catch (error) {
            console.error('獲取 session ID 失敗:', error);
            return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
    }

    // 收集裝置和瀏覽器資訊
    function collectDeviceInfo() {
        try {
            const userAgent = navigator.userAgent;
            const platform = navigator.platform;
            const language = navigator.language;
            const screenWidth = screen.width;
            const screenHeight = screen.height;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const timestamp = Date.now();

            // 收集頁面資訊
            const pageInfo = {
                url: window.location.href,
                hostname: window.location.hostname,
                pathname: window.location.pathname,
                search: window.location.search,
                hash: window.location.hash,
                protocol: window.location.protocol,
                port: window.location.port,
                title: document.title,
                referrer: document.referrer,
                domain: window.location.hostname,
                fullPath: window.location.pathname + window.location.search + window.location.hash
            };

            // 檢測裝置類型
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
            const isTablet = /iPad|Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
            const isDesktop = !isMobile && !isTablet;

            // 檢測作業系統
            let os = 'Unknown';
            if (/Windows/i.test(userAgent)) os = 'Windows';
            else if (/Mac/i.test(userAgent)) os = 'macOS';
            else if (/Linux/i.test(userAgent)) os = 'Linux';
            else if (/Android/i.test(userAgent)) os = 'Android';
            else if (/iPhone|iPad|iPod/i.test(userAgent)) os = 'iOS';

            // 檢測瀏覽器
            let browser = 'Unknown';
            if (/Chrome/i.test(userAgent) && !/Edge/i.test(userAgent)) browser = 'Chrome';
            else if (/Firefox/i.test(userAgent)) browser = 'Firefox';
            else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = 'Safari';
            else if (/Edge/i.test(userAgent)) browser = 'Edge';
            else if (/Opera/i.test(userAgent)) browser = 'Opera';

            return {
                userAgent,
                platform,
                language,
                screenWidth,
                screenHeight,
                windowWidth,
                windowHeight,
                timezone,
                timestamp,
                deviceType: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
                os,
                browser,
                isMobile,
                isTablet,
                isDesktop,
                pageInfo
            };
        } catch (error) {
            console.error('收集裝置資訊失敗:', error);
            return {
                userAgent: 'Unknown',
                platform: 'Unknown',
                language: 'Unknown',
                screenWidth: 0,
                screenHeight: 0,
                windowWidth: 0,
                windowHeight: 0,
                timezone: 'Unknown',
                timestamp: Date.now(),
                deviceType: 'unknown',
                os: 'Unknown',
                browser: 'Unknown',
                isMobile: false,
                isTablet: false,
                isDesktop: false,
                pageInfo: {
                    url: 'Unknown',
                    hostname: 'Unknown',
                    pathname: 'Unknown',
                    search: 'Unknown',
                    hash: 'Unknown',
                    protocol: 'Unknown',
                    port: 'Unknown',
                    title: 'Unknown',
                    referrer: 'Unknown',
                    domain: 'Unknown',
                    fullPath: 'Unknown'
                }
            };
        }
    }

    // 獲取 IP 和地理位置資訊
    async function getLocationInfo() {
        try {
            // 使用免費的 IP 地理位置 API
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();

            return {
                ip: data.ip,
                city: data.city,
                region: data.region,
                country: data.country_name,
                countryCode: data.country_code,
                latitude: data.latitude,
                longitude: data.longitude,
                timezone: data.timezone,
                isp: data.org,
                asn: data.asn,
                timestamp: Date.now()
            };
        } catch (error) {
            console.warn('無法獲取地理位置資訊:', error);
            return {
                ip: 'Unknown',
                city: 'Unknown',
                region: 'Unknown',
                country: 'Unknown',
                countryCode: 'Unknown',
                latitude: null,
                longitude: null,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                isp: 'Unknown',
                asn: 'Unknown',
                timestamp: Date.now()
            };
        }
    }

    // 保存 session 統計資訊到資料庫
    async function saveSessionAnalytics(sessionId, agentId, deviceInfo, locationInfo) {
        try {
            const database = await loadFirebaseSDK();
            const analyticsData = {
                sessionId,
                agentId,
                deviceInfo,
                locationInfo,
                pageInfo: deviceInfo.pageInfo || null,
                createdAt: Date.now(),
                lastActivity: Date.now()
            };

            const analyticsRef = database.ref(`agents/${agentId}/sessionAnalytics/${sessionId}`);
            await analyticsRef.set(analyticsData);

            console.log('Session 統計資訊已保存');
        } catch (error) {
            console.error('保存 session 統計資訊失敗:', error);
        }
    }

    // 更新 session 活動時間
    async function updateSessionActivity(sessionId, agentId) {
        try {
            const database = await loadFirebaseSDK();
            const activityRef = database.ref(`agents/${agentId}/sessionAnalytics/${sessionId}/lastActivity`);
            await activityRef.set(Date.now());
        } catch (error) {
            console.error('更新 session 活動時間失敗:', error);
        }
    }

    // 獲取 session 級別的人物誌
    function getSessionProfile() {
        try {
            const sessionId = getSessionId();
            const sessionKey = `ai-convai-session-profile-${sessionId}`;
            const profileData = sessionStorage.getItem(sessionKey);
            return profileData ? JSON.parse(profileData) : null;
        } catch (error) {
            console.error('獲取 session 人物誌失敗:', error);
            return null;
        }
    }

    // 更新 session 級別的人物誌
    async function updateSessionProfile(newProfileData) {
        try {
            const sessionId = getSessionId();
            const currentProfile = getSessionProfile();
            let hasChanges = false;

            if (!currentProfile) {
                // 第一次建立 session 人物誌
                hasChanges = true;
                const sessionKey = `ai-convai-session-profile-${sessionId}`;
                sessionStorage.setItem(sessionKey, JSON.stringify(newProfileData));

                if (localStorage.getItem('ai-convai-debug') === 'true') {
                    console.log('建立新的 session 人物誌:', newProfileData);
                }
            } else {
                // 比較並合併資料
                const mergedProfile = mergeProfileData(currentProfile, newProfileData);

                // 檢查是否有異動
                hasChanges = hasProfileChanged(currentProfile, mergedProfile);

                if (hasChanges) {
                    const sessionKey = `ai-convai-session-profile-${sessionId}`;
                    sessionStorage.setItem(sessionKey, JSON.stringify(mergedProfile));

                    if (localStorage.getItem('ai-convai-debug') === 'true') {
                        console.log('Session 人物誌已更新:', mergedProfile);
                    }
                }
            }

            // 如果有異動，寫入資料庫
            if (hasChanges) {
                // 確保使用相同的 sessionId
                const currentSessionId = getSessionId();
                console.log('儲存人物誌到資料庫，sessionId:', currentSessionId);
                await saveProfileToDatabase(newProfileData, currentSessionId);
            }

            return hasChanges;
        } catch (error) {
            console.error('更新 session 人物誌失敗:', error);
            return false;
        }
    }

    // 建立 widget 樣式
    function createStyles() {
        const style = document.createElement('style');
        const isTest = isTestEnvironment();

        style.textContent = `
            .ai-convai-widget {
            height: 70px;

                position: ${isTest ? 'relative' : 'fixed'};
                bottom: ${isTest ? 'auto' : '20px'};
                right: ${isTest ? 'auto' : '20px'};
                z-index: ${isTest ? '1000' : '10000'};
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                ${isTest ? 'margin: 20px auto;' : ''}
            }

            .ai-convai-button {

                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
                border: 1px solid rgba(255, 255, 255, 0.2);
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                color: white;
                font-size: 24px;
                overflow: hidden;
                ${isTest ? 'position: relative; margin: 20px auto;' : ''}
            }

            .ai-convai-button::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(to bottom, rgba(255,255,255,0.15), transparent);
                border-radius: 50%;
                pointer-events: none;
            }

            .ai-convai-button:hover {
                transform: scale(1.05) translateY(-2px);
                box-shadow: 0 8px 25px rgba(99, 102, 241, 0.5);
            }
            
            .ai-convai-button:active {
                transform: scale(0.95);
            }

            /* 動畫提示樣式 */
            .ai-convai-prompt .ai-convai-button {
                animation: ai-convai-pulse 2s infinite;
            }

            .ai-convai-prompt .ai-convai-button::after {
                content: '';
                position: absolute;
                top: -10px;
                left: -10px;
                right: -10px;
                bottom: -10px;
                border-radius: 50%;
                border: 3px solid #667eea;
                animation: ai-convai-ripple 2s infinite;
            }

            @keyframes ai-convai-pulse {
                0% {
                    transform: scale(1);
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                }
                50% {
                    transform: scale(1.05);
                    box-shadow: 0 6px 30px rgba(102, 126, 234, 0.4);
                }
                100% {
                    transform: scale(1);
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                }
            }

            @keyframes ai-convai-ripple {
                0% {
                    transform: scale(1);
                    opacity: 1;
                }
                100% {
                    transform: scale(1.3);
                    opacity: 0;
                }
            }

            /* 歡迎動畫 */
            .ai-convai-welcome-animation {
                animation: ai-convai-bounce-in 0.6s ease-out;
            }

            @keyframes ai-convai-bounce-in {
                0% {
                    transform: translateY(20px) scale(0.8);
                    opacity: 0;
                }
                50% {
                    transform: translateY(-5px) scale(1.05);
                    opacity: 0.8;
                }
                100% {
                    transform: translateY(0) scale(1);
                    opacity: 1;
                }
            }

            .ai-convai-avatar {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
                object-position: center;
                border: 2px solid rgba(255, 255, 255, 0.3);
                aspect-ratio: 1 / 1;
            }

            .ai-convai-chat {
                position: absolute;
                bottom: 80px;
                right: 0;
                width: 380px;
                height: 720px;
                background: rgba(255, 255, 255, 0.9);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.8);
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                transform: translateY(20px);
                opacity: 0;
                transition: all 0.3s ease;
                z-index: ${isTest ? '1001' : '10001'};
                pointer-events: none;
                max-height: calc(100vh - 110px);
            }

            .ai-convai-chat.open {
                transform: translateY(0);
                opacity: 1;
                pointer-events: auto;
            }

            .ai-convai-header {
                background: rgba(248, 250, 252, 0.8);
                color: #1f2937;
                padding: 16px 20px;
                border-bottom: 1px solid rgba(229, 231, 235, 0.5);
                display: flex;
                justify-content: space-between;
                align-items: center;
                backdrop-filter: blur(4px);
            }

            .ai-convai-header-info {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .ai-convai-header-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                object-fit: cover;
                border: 2px solid #e5e7eb;
                flex-shrink: 0;
            }

            .ai-convai-header-actions {
                display: flex;
                gap: 10px;
                align-items: center;
            }

            .ai-convai-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 500;
                color: #374151;
            }

            .ai-convai-close {
                background: rgba(0, 0, 0, 0.05);
                border: none;
                color: #64748b;
                cursor: pointer;
                padding: 6px;
                border-radius: 8px;
                transition: all 0.2s ease;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .ai-convai-close:hover {
                background: #f3f4f6;
                color: #374151;
            }



            .ai-convai-clear {
                background: rgba(0, 0, 0, 0.05);
                border: none;
                color: #64748b;
                cursor: pointer;
                padding: 6px;
                border-radius: 8px;
                transition: all 0.2s ease;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .ai-convai-clear:hover {
                background: #f3f4f6;
                color: #374151;
            }

            .ai-convai-messages {
                flex: 1;
                padding: 12px 16px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 8px;
                min-height: 0;
                background: transparent;
                scrollbar-width: thin;
                scrollbar-color: rgba(0,0,0,0.1) transparent;
            }

            .ai-convai-messages::-webkit-scrollbar {
                width: 6px;
            }

            .ai-convai-messages::-webkit-scrollbar-track {
                background: transparent;
            }

            .ai-convai-messages::-webkit-scrollbar-thumb {
                background-color: rgba(0,0,0,0.1);
                border-radius: 20px;
                border: 2px solid transparent;
                background-clip: content-box;
            }

            .ai-convai-messages::-webkit-scrollbar-thumb:hover {
                background-color: rgba(0,0,0,0.2);
            }

            .ai-convai-message {
                max-width: 85%;
                padding: 10px 14px;
                border-radius: 12px;
                word-wrap: break-word;
                line-height: 1.4;
                font-size: 14px;
                margin: 0;
                animation: messageSlideIn 0.3s cubic-bezier(0.2, 0, 0.2, 1);
            }

            @keyframes messageSlideIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .ai-convai-message.user {
                background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
                color: white;
                align-self: flex-end;
                border-radius: 12px 12px 2px 12px;
                box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
            }

            .ai-convai-message.assistant {
                background: white;
                color: #1f2937;
                align-self: flex-start;
                border: 1px solid #f1f5f9;
                border-radius: 12px 12px 12px 2px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
            }

            .ai-convai-suggestions {
                padding: 12px 16px;
                max-height: 140px;
                overflow-y: auto;
                background: transparent;
                margin-top: auto;
                scrollbar-width: thin;
                scrollbar-color: rgba(0,0,0,0.1) transparent;
            }

            .ai-convai-suggestions::-webkit-scrollbar {
                width: 4px;
            }
            
            .ai-convai-suggestions::-webkit-scrollbar-thumb {
                background-color: rgba(0,0,0,0.1);
                border-radius: 10px;
            }

            .ai-convai-suggestions-header {
                font-size: 12px;
                color: #64748b;
                font-weight: 500;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 6px;
                padding-left: 2px;
            }

            .ai-convai-suggestions-list {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            .ai-convai-suggestion-item {
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 20px;
                padding: 6px 14px;
                font-size: 13px;
                color: #475569;
                text-align: left;
                line-height: 1.4;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.2, 0, 0.2, 1);
                position: relative;
                display: inline-block;
                box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            }
            
            .ai-convai-suggestion-item:hover {
                background: #f8fafc;
                border-color: #6366f1;
                color: #6366f1;
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
            }
            
            .ai-convai-suggestion-item:active {
                transform: scale(0.96);
                background: #eff6ff;
            }
            
            /* 聯絡資訊確認按鍵樣式 */
            .ai-convai-contact-confirm-buttons button {
                transition: all 0.2s ease;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .ai-convai-contact-confirm-buttons button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.15);
            }
            
            .ai-convai-contact-confirm-buttons button:active {
                transform: translateY(0);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            /* Markdown 格式優化 */
            .ai-convai-message h1, .ai-convai-message h2, .ai-convai-message h3, 
            .ai-convai-message h4, .ai-convai-message h5, .ai-convai-message h6 {
                margin: 16px 0 8px 0;
                font-weight: 600;
                line-height: 1.3;
            }
            
            .ai-convai-message h1 { font-size: 1.5em; color: #1f2937; }
            .ai-convai-message h2 { font-size: 1.3em; color: #374151; }
            .ai-convai-message h3 { font-size: 1.2em; color: #4b5563; }
            .ai-convai-message h4 { font-size: 1.1em; color: #6b7280; }
            
            .ai-convai-message p {
                margin: 8px 0;
                line-height: 1.6;
                color: #374151;
            }
            
            .ai-convai-message strong {
                font-weight: 600;
                color: #1f2937;
            }
            
            .ai-convai-message em {
                font-style: italic;
                color: #6b7280;
            }
            
            .ai-convai-message ul, .ai-convai-message ol {
                margin: 8px 0;
                padding-left: 20px;
            }
            
            .ai-convai-message li {
                margin: 4px 0;
                line-height: 1.5;
            }
            
            .ai-convai-message blockquote {
                margin: 12px 0;
                padding: 8px 16px;
                border-left: 4px solid #e5e7eb;
                background: #f9fafb;
                border-radius: 0 6px 6px 0;
            }
            
            .ai-convai-message code {
                background: #f3f4f6;
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 0.9em;
                color: #dc2626;
            }
            
            .ai-convai-message pre {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 12px;
                margin: 12px 0;
                overflow-x: auto;
            }
            
            .ai-convai-message pre code {
                background: none;
                padding: 0;
                color: #1f2937;
            }

            .ai-convai-input-container {
                padding: 12px 16px;
                border-top: 1px solid rgba(229, 231, 235, 0.5);
                display: flex;
                gap: 8px;
                background: rgba(255, 255, 255, 0.6);
                backdrop-filter: blur(4px);
                flex-shrink: 0;
            }

            .ai-convai-input {
                flex: 1;
                padding: 10px 14px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                outline: none;
                font-size: 14px;
                background: #ffffff;
                color: #374151;
                transition: all 0.2s ease;
            }

            .ai-convai-input:focus {
                border-color: #6366f1;
                background: white;
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
            }

            .ai-convai-input:hover {
                border-color: #9ca3af;
            }

            .ai-convai-send {
                background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
                color: white;
                border: none;
                border-radius: 10px;
                width: 40px;
                height: 40px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                flex-shrink: 0;
                box-shadow: 0 2px 5px rgba(99, 102, 241, 0.3);
            }

            .ai-convai-send:hover {
                background: #2563eb;
                transform: translateY(-1px);
            }

            .ai-convai-send:active {
                transform: translateY(0);
            }

            .ai-convai-typing {
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 12px 16px;
                background: #f1f3f4;
                border-radius: 18px;
                align-self: flex-start;
                max-width: 80px;
            }

            .ai-convai-typing-dot {
                width: 8px;
                height: 8px;
                background: #999;
                border-radius: 50%;
                animation: typing 1.4s infinite;
            }

            .ai-convai-typing-dot:nth-child(2) {
                animation-delay: 0.2s;
            }

            .ai-convai-typing-dot:nth-child(3) {
                animation-delay: 0.4s;
            }

            @keyframes typing {
                0%, 60%, 100% {
                    transform: translateY(0);
                }
                30% {
                    transform: translateY(-10px);
                }
            }

            .ai-convai-error {
                background: #fef2f2;
                color: #dc2626;
                padding: 12px 16px;
                border-radius: 8px;
                border: 1px solid #fecaca;
                align-self: flex-start;
                max-width: 85%;
                font-size: 14px;
            }

            .welcome-message {
                text-align: center;
                color: #6b7280;
                font-size: 14px;
                padding: 12px;
                background: #f8fafc;
                border-radius: 8px;
                border: 1px solid #e5e7eb;
                margin: 0;
            }

            /* Markdown 樣式 */
            .ai-convai-message h1,
            .ai-convai-message h2,
            .ai-convai-message h3 {
                margin: 6px 0 3px 0;
                font-weight: 600;
                line-height: 1.3;
            }

            .ai-convai-message h1 {
                font-size: 16px;
                color: #1f2937;
                font-weight: 600;
            }

            .ai-convai-message h2 {
                font-size: 15px;
                color: #374151;
                font-weight: 600;
            }

            .ai-convai-message h3 {
                font-size: 14px;
                color: #4b5563;
                font-weight: 600;
            }

            .ai-convai-message strong {
                font-weight: 600;
                color: #1f2937;
            }

            .ai-convai-message em {
                font-style: italic;
                color: #4b5563;
            }

            .ai-convai-message code {
                background: #f3f4f6;
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
                font-size: 13px;
                color: #1f2937;
            }

            .ai-convai-message pre {
                background: #f8fafc;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 10px;
                margin: 4px 0;
                overflow-x: auto;
                font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
                font-size: 13px;
                line-height: 1.4;
            }

            .ai-convai-message pre code {
                background: none;
                padding: 0;
                color: #1f2937;
                border-radius: 0;
            }

            .ai-convai-message ul {
                margin: 4px 0;
                padding-left: 18px;
            }

            .ai-convai-message li {
                margin: 2px 0;
                line-height: 1.4;
            }

            .ai-convai-message a {
                color: #3b82f6;
                text-decoration: none;
                border-bottom: 1px solid transparent;
                transition: all 0.2s ease;
            }

            .ai-convai-message a:hover {
                color: #2563eb;
                border-bottom-color: #3b82f6;
            }

            .ai-convai-message p {
                margin: 3px 0;
                line-height: 1.4;
            }

            .ai-convai-message p:first-child {
                margin-top: 0;
            }

            .ai-convai-message p:last-child {
                margin-bottom: 0;
            }

            /* 知識庫來源顯示樣式 */
            .ai-convai-knowledge-source {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-top: 8px;
                padding: 4px 8px;
                background: rgba(59, 130, 246, 0.05);
                border: 1px solid rgba(59, 130, 246, 0.1);
                border-radius: 6px;
                font-size: 11px;
                color: #64748b;
                line-height: 1.3;
                opacity: 0.8;
            }

            .ai-convai-source-icon {
                font-size: 12px;
                flex-shrink: 0;
                opacity: 0.7;
            }

            .ai-convai-source-text {
                font-weight: 400;
                color: #64748b;
            }

            /* 用戶訊息中的知識庫來源樣式調整 */
            .ai-convai-message.user .ai-convai-knowledge-source {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.7);
                opacity: 0.7;
            }

            .ai-convai-message.user .ai-convai-source-text {
                color: rgba(255, 255, 255, 0.7);
            }

            /* 延伸資訊樣式 */
            .ai-convai-extended-info {
                background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
                border: 1px solid #0ea5e9;
                border-radius: 12px;
                padding: 16px;
                margin: 12px 0;
                box-shadow: 0 2px 8px rgba(14, 165, 233, 0.1);
            }

            .ai-convai-extended-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(14, 165, 233, 0.2);
            }

            .ai-convai-extended-icon {
                font-size: 16px;
                color: #0ea5e9;
            }

            .ai-convai-extended-title {
                font-weight: 600;
                color: #0c4a6e;
                font-size: 14px;
            }

            .ai-convai-extended-content {
                color: #0c4a6e;
                line-height: 1.5;
                font-size: 13px;
            }

            .ai-convai-extended-content ul {
                margin: 8px 0;
                padding-left: 20px;
            }

            .ai-convai-extended-content li {
                margin: 4px 0;
                color: #0369a1;
            }

            .ai-convai-extended-content strong {
                color: #0c4a6e;
                font-weight: 600;
            }

            /* 資訊項目樣式 */
            .ai-convai-info-item {
                background: #f8fafc;
                border-left: 3px solid #3b82f6;
                padding: 8px 12px;
                margin: 6px 0;
                border-radius: 0 6px 6px 0;
                font-size: 13px;
                color: #1e40af;
            }

            /* 聯絡資訊樣式 */
            .ai-convai-contact-info {
                background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                border: 1px solid #22c55e;
                border-radius: 12px;
                padding: 16px;
                margin: 12px 0;
                box-shadow: 0 2px 8px rgba(34, 197, 94, 0.1);
            }

            .ai-convai-contact-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(34, 197, 94, 0.2);
            }

            .ai-convai-contact-icon {
                font-size: 16px;
                color: #22c55e;
            }

            .ai-convai-contact-title {
                font-weight: 600;
                color: #14532d;
                font-size: 14px;
            }

            .ai-convai-contact-content {
                color: #14532d;
                line-height: 1.5;
                font-size: 13px;
            }

            .ai-convai-contact-content ul {
                margin: 8px 0;
                padding-left: 20px;
            }

            .ai-convai-contact-content li {
                margin: 4px 0;
                color: #166534;
            }

            .ai-convai-contact-content strong {
                color: #14532d;
                font-weight: 600;
            }

            /* 確保 Widget 層級正確 */
            .ai-convai-widget * {
                box-sizing: border-box;
            }

            /* 維護管理界面樣式 */
            .ai-convai-admin-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 300px;
                max-height: 400px;
                background: #ffffff;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                z-index: 10002;
                display: none;
                overflow-y: auto;
            }

            .ai-convai-admin-panel.open {
                display: block;
            }

            .ai-convai-admin-header {
                background: #f8fafc;
                padding: 12px 16px;
                border-bottom: 1px solid #e5e7eb;
                border-radius: 12px 12px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .ai-convai-admin-title {
                font-size: 14px;
                font-weight: 600;
                color: #374151;
                margin: 0;
            }

            .ai-convai-admin-close {
                background: none;
                border: none;
                color: #6b7280;
                font-size: 16px;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
            }

            .ai-convai-admin-close:hover {
                background: #f3f4f6;
            }

            .ai-convai-admin-content {
                padding: 12px;
            }

            .ai-convai-pending-kb {
                background: #fef3c7;
                border: 1px solid #f59e0b;
                border-radius: 8px;
                padding: 10px;
                margin-bottom: 8px;
                font-size: 12px;
            }

            .ai-convai-pending-kb-title {
                font-weight: 600;
                color: #92400e;
                margin-bottom: 4px;
            }

            .ai-convai-pending-kb-message {
                color: #a16207;
                margin-bottom: 4px;
            }

            .ai-convai-pending-kb-keywords {
                color: #d97706;
                font-size: 11px;
            }

            .ai-convai-pending-kb-status {
                color: #dc2626;
                font-size: 11px;
                font-weight: 500;
                margin-top: 2px;
            }

            /* 修復輸入框和按鈕的點擊問題 */
            .ai-convai-input-container * {
                pointer-events: auto;
            }

            /* 確保關閉按鈕的點擊區域 */
            .ai-convai-close:active {
                transform: scale(0.95);
            }

            /* 修復消息容器的滾動 */
            .ai-convai-messages::-webkit-scrollbar {
                width: 6px;
            }

            .ai-convai-messages::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 3px;
            }

            .ai-convai-messages::-webkit-scrollbar-thumb {
                background: #c1c1c1;
                border-radius: 3px;
            }

            .ai-convai-messages::-webkit-scrollbar-thumb:hover {
                background: #a8a8a8;
            }

            /* 手機端優化 */
            @media (max-width: 768px) {
                .ai-convai-widget {
                    bottom: 10px;
                    right: 10px;
                }
                
                .ai-convai-button {
                    height: 50px;
                    width: 50px;
                    font-size: 20px;
                }
                
                .ai-convai-chat {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    width: 100vw;
                    height: 100vh;
                    height: 100dvh;
                    border-radius: 0;
                    border: none;
                    z-index: 99999;
                    transform: translateY(100%);
                    transition: transform 0.3s ease;
                }
                
                .ai-convai-chat.open {
                    transform: translateY(0);
                }
                
                .ai-convai-header {
                    padding: 12px 16px;
                    padding-top: max(12px, env(safe-area-inset-top));
                    border-bottom: 1px solid #e5e7eb;
                    background: #f8fafc;
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }
                
                .ai-convai-header h3 {
                    font-size: 16px;
                    margin: 0;
                }
                
                .ai-convai-messages {
                    height: calc(100vh - 120px);
                    padding: 16px;
                }
                
                .ai-convai-input-container {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    padding: 12px 16px;
                    padding-bottom: max(12px, env(safe-area-inset-bottom));
                    background: white;
                    border-top: 1px solid #e5e7eb;
                    z-index: 1;
                }
                
                .ai-convai-input {
                    width: calc(100% - 60px);
                    padding: 12px 16px;
                    font-size: 16px;
                    border-radius: 24px;
                }
                
                .ai-convai-send {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    font-size: 18px;
                }
                
                .ai-convai-suggestions {
                    max-height: 150px;
                    margin-bottom: 8px;
                }
                
                .ai-convai-suggestion-item {
                    padding: 10px 12px;
                    font-size: 14px;
                    margin-bottom: 6px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .ai-convai-suggestion-item:hover {
                    background: #f0f8ff;
                    border-color: #007bff;
                    transform: translateX(2px);
                }
                
                .ai-convai-suggestion-item:active {
                    transform: scale(0.98);
                    background: #e3f2fd;
                }
                
                /* 手機端訊息樣式優化 */
                .ai-convai-message {
                    margin-bottom: 12px;
                    max-width: 85%;
                }
                
                .ai-convai-message.user {
                    margin-left: auto;
                    background: #3b82f6;
                    color: white;
                    border-radius: 18px 18px 4px 18px;
                    padding: 12px 16px;
                }
                
                .ai-convai-message.assistant {
                    margin-right: auto;
                    background: #f1f5f9;
                    color: #1e293b;
                    border-radius: 18px 18px 18px 4px;
                    padding: 12px 16px;
                }
                
                .ai-convai-message p {
                    margin: 0;
                    line-height: 1.4;
                    font-size: 14px;
                }
                
                .ai-convai-message strong {
                    font-weight: 600;
                }
                
                /* 手機端知識庫來源樣式優化 */
                .ai-convai-knowledge-source {
                    margin-top: 6px;
                    padding: 3px 6px;
                    font-size: 10px;
                    opacity: 0.7;
                }
                
                .ai-convai-source-icon {
                    font-size: 10px;
                    opacity: 0.6;
                }
                
                .ai-convai-message code {
                    background: rgba(0,0,0,0.1);
                    padding: 2px 4px;
                    border-radius: 3px;
                    font-family: monospace;
                    font-size: 12px;
                }
                
                /* 手機端關閉按鈕優化 */
                .ai-convai-close {
                    width: 40px;
                    height: 40px;
                    font-size: 20px;
                    border-radius: 50%;
                    background: #f3f4f6;
                    color: #6b7280;
                    margin-left: 8px;
                }
                
                .ai-convai-clear {
                    width: 40px;
                    height: 40px;
                    font-size: 16px;
                    border-radius: 50%;
                    background: #f3f4f6;
                    color: #6b7280;
                }
            }
            
            /* 超小螢幕優化 */
            @media (max-width: 360px) {
                .ai-convai-header {
                    padding: 10px 12px;
                }
                
                .ai-convai-messages {
                    height: calc(100vh - 100px);
                    padding: 12px;
                }
                
                .ai-convai-input-container {
                    padding: 10px 12px;
                }
                
                .ai-convai-input {
                    padding: 10px 14px;
                    font-size: 14px;
                }
                
                .ai-convai-send {
                    width: 40px;
                    height: 40px;
                    font-size: 16px;
                }
            }
            
            /* YouTube 內嵌樣式 */
            .ai-convai-youtube-embed {
                margin: 12px 0;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                background: #000;
            }
            
            .ai-convai-youtube-embed iframe {
                width: 100%;
                height: 200px;
                border: none;
                border-radius: 8px;
            }
            
            /* 響應式設計 */
            @media (max-width: 480px) {
                .ai-convai-youtube-embed iframe {
                    height: 180px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // 建立 widget HTML
    function createWidget(agentId, avatarImageUrl = null, agentName = 'AI 客服') {
        const widget = document.createElement('div');
        widget.className = 'ai-convai-widget';

        // 從原始元素中複製 data-prompt 屬性
        const originalElement = document.querySelector('ai-convai');
        if (originalElement && originalElement.hasAttribute('data-prompt')) {
            widget.setAttribute('data-prompt', originalElement.getAttribute('data-prompt'));
        }

        // 根據是否有頭像圖片決定按鈕內容
        const button = document.createElement('button');
        button.className = 'ai-convai-button';
        button.innerHTML = avatarImageUrl
            ? `<img src="${avatarImageUrl}" class="ai-convai-avatar" alt="Chat">`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;

        widget.innerHTML = `
            ${button.outerHTML}
            <div class="ai-convai-chat">
                <div class="ai-convai-header">
                    <div class="ai-convai-header-info">
                        <img src="${avatarImageUrl || 'https://www.stu.edu.tw/images/stulogo500px.png'}" alt="${agentName}" class="ai-convai-header-avatar">
                        <h3>${agentName}</h3>
                    </div>
                    <div class="ai-convai-header-actions">
                        <button class="ai-convai-clear" title="清空對話">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                        <button class="ai-convai-close" title="關閉">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
                
                <div class="ai-convai-messages" id="messages">
                    <!-- 歡迎訊息 -->
                    <div class="welcome-message">
                        <p>👋 您好！我是 AI 客服${agentName ? ' ' + agentName : ''}，請輸入您的問題開始對話。</p>
                    </div>
                </div>
                
                <!-- 建議問題區域 -->
                <div class="ai-convai-suggestions" id="suggestionsContainer" style="display: none;">
                    <div class="ai-convai-suggestions-header">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        <span>猜您想問...</span>
                    </div>
                    <div class="ai-convai-suggestions-list" id="suggestionsList"></div>
                </div>
                
                <div class="ai-convai-input-container">
                    <input type="text" class="ai-convai-input" id="messageInput" placeholder="輸入您的問題...">
                    <button class="ai-convai-send" id="sendMessage">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
            </div>
        `;
        return widget;
    }

    // 建立錯誤提示 widget
    function createErrorWidget(agentId, errorMessage) {
        createStyles();

        const widget = document.createElement('div');
        widget.className = 'ai-convai-widget';
        widget.innerHTML = `
            <button class="ai-convai-button" style="background: #ff6b6b;">
                ⚠️
            </button>
            <div class="ai-convai-chat">
                <div class="ai-convai-header">
                    <h3>AI 客服錯誤</h3>
                    <button class="ai-convai-close">×</button>
                </div>
                <div class="ai-convai-messages">
                    <div class="ai-convai-error">
                        <p>⚠️ AI 客服暫時無法使用</p>
                        <p>錯誤：${errorMessage}</p>
                        <p>請稍後再試或聯繫管理員</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(widget);
    }

    // 切換聊天視窗
    // 檢查用戶是否手動關閉過聊天視窗
    function isChatManuallyClosed() {
        return localStorage.getItem('ai-convai-chat-manually-closed') === 'true';
    }

    // 記錄用戶手動關閉聊天視窗
    function setChatManuallyClosed(closed) {
        if (closed) {
            localStorage.setItem('ai-convai-chat-manually-closed', 'true');
        } else {
            localStorage.removeItem('ai-convai-chat-manually-closed');
        }
    }

    function toggleChat() {
        console.log('toggleChat 被調用，當前狀態:', isOpen);
        const currentWidget = document.querySelector('.ai-convai-widget');
        const chat = currentWidget ? currentWidget.querySelector('.ai-convai-chat') : null;

        if (!chat) {
            console.error('找不到聊天視窗元素');
            return;
        }

        isOpen = !isOpen;
        console.log('切換後狀態:', isOpen);

        if (isOpen) {
            chat.classList.add('open');
            // 用戶手動開啟，清除關閉記錄
            setChatManuallyClosed(false);
            console.log('聊天視窗已開啟，類別:', chat.className);
            console.log('聊天視窗樣式:', {
                transform: getComputedStyle(chat).transform,
                opacity: getComputedStyle(chat).opacity,
                pointerEvents: getComputedStyle(chat).pointerEvents
            });
            // 延遲聚焦，確保元素完全顯示
            setTimeout(() => {
                const messageInput = currentWidget.querySelector('#messageInput');
                if (messageInput) {
                    messageInput.focus();
                    console.log('輸入框已聚焦');
                } else {
                    console.error('找不到輸入框');
                }
            }, 100);
        } else {
            chat.classList.remove('open');
            // 用戶手動關閉，記錄狀態
            setChatManuallyClosed(true);
            console.log('聊天視窗已關閉，類別:', chat.className);
        }
    }

    // 處理按鍵事件
    function handleKeyPress(event) {
        if (event.key === 'Enter') {
            sendMessage();
        }
    }

    // 發送訊息
    async function sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();

        if (!message) return;

        input.value = '';

        // 增加對話次數
        incrementConversationCount(currentAgentId);

        // 更新 session 活動時間
        const sessionId = getSessionId();
        await updateSessionActivity(sessionId, currentAgentId);

        // 隱藏建議問題
        hideSuggestions();

        // 基於用戶提問更新人物誌（僅分析用戶訊息，不包含AI回應）
        await updateProfileFromUserMessage(message);

        // 動態人物誌分析（僅基於用戶提問）
        if (window.profileManager) {
            try {
                const profileUpdates = window.profileManager.analyzeConversation(currentAgentId, message);
                if (Object.keys(profileUpdates).length > 0) {
                    // 在除錯模式下顯示人物誌更新
                    if (localStorage.getItem('ai-convai-debug') === 'true') {
                        console.log('基於用戶提問的人物誌更新:', profileUpdates);
                    }

                    // 自動檢查是否需要更新到資料庫
                    checkAndUpdateProfileToDatabase();
                }
            } catch (error) {
                console.error('人物誌分析失敗:', error);
            }
        } else {
            // 如果人物誌管理器未載入，嘗試重新載入
            console.warn('人物誌管理器未載入，嘗試重新載入');
            loadProfileManager().catch(error => {
                console.error('重新載入人物誌管理器失敗:', error);
            });
        }

        // 顯示使用者訊息
        addMessage(message, 'user');

        // 顯示載入動畫
        showTyping();

        try {
            // 取得 AI 回應
            const aiResult = await getAIResponse(message);
            const { response, usedKnowledgeBases } = aiResult;

            // 隱藏載入動畫
            hideTyping();

            // 解析 AI 回覆中的 JSON 並寫入資料庫，獲取去除 JSON 後的純文字回覆
            const cleanResponse = await parseAndSaveProfileFromAIResponse(response);

            // 顯示 AI 回應（使用去除 JSON 後的純文字）並包含使用的知識庫信息
            addMessage(cleanResponse, 'assistant', false, usedKnowledgeBases);

            // 更新對話歷史（使用原始回覆以保持完整性）
            conversationHistory.push({ role: 'user', content: message });
            conversationHistory.push({ role: 'assistant', content: response });

            // 儲存對話到 Firebase
            await saveMessage(message, 'user');
            await saveMessage(response, 'assistant');

        } catch (error) {
            console.error('AI 回應錯誤:', error);
            hideTyping();

            // 根據錯誤類型顯示不同的訊息
            let errorMessage = '抱歉，我暫時無法回應。';

            if (error.message.includes('API 錯誤: 401')) {
                errorMessage = 'API Key 無效，請聯繫管理員。';
            } else if (error.message.includes('API 錯誤: 403')) {
                errorMessage = 'API 權限不足，請聯繫管理員。';
            } else if (error.message.includes('API 錯誤: 404')) {
                errorMessage = 'API 服務暫時不可用，請稍後再試。';
            } else if (error.message.includes('API 錯誤: 429')) {
                errorMessage = '服務繁忙，請稍後再試。';
            } else if (error.message.includes('API 錯誤: 500')) {
                errorMessage = '服務器內部錯誤，請稍後再試。';
            } else if (error.message.includes('API 錯誤: 503')) {
                errorMessage = 'AI 服務暫時不可用，請稍後再試。我們已經自動重試，如果問題持續，請聯繫管理員。';
            }

            addMessage(errorMessage, 'assistant', true);
        }
    }

    // AI 意圖分析功能
    async function analyzeUserIntent(message, apiKey, llmProvider) {
        if (!message || message.trim().length < 3) {
            return [];
        }

        try {
            // 獲取最近的對話歷史作為上下文
            const recentHistory = conversationHistory.slice(-3).map(msg =>
                `${msg.role === 'user' ? '用戶' : 'AI'}: ${msg.content}`
            ).join('\n');

            const prompt = `請分析以下用戶問題的意圖，提取相關的關鍵字用於知識庫匹配：

對話上下文：
${recentHistory}

當前用戶問題：${message}

請考慮對話上下文，提取相關的關鍵字，包括：
1. 當前問題的關鍵字
2. 對話上下文中提到的相關概念
3. 可能的查詢詞
4. 中英文關鍵字

直接返回 JSON 陣列格式：
["關鍵字1", "關鍵字2", "keyword3", "關鍵字4"]`;

            // 使用 Firebase Functions 安全代理
            if (typeof firebase === 'undefined' || !firebase.functions) {
                throw new Error('Firebase Functions 未載入，請重新整理頁面');
            }

            const functions = firebase.functions();
            const getAIResponse = functions.httpsCallable('getAIResponse');

            const result = await getAIResponse({
                agentId: currentAgentId,
                message: prompt,
                llmProvider: llmProvider
            });

            const generatedText = result.data.response;

            // 解析 JSON 回應
            try {
                let jsonText = generatedText;

                // 處理 markdown 格式的 JSON 代碼塊
                const jsonCodeBlockMatch = generatedText.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonCodeBlockMatch) {
                    jsonText = jsonCodeBlockMatch[1].trim();
                }

                const keywords = JSON.parse(jsonText);
                if (Array.isArray(keywords)) {
                    // 扁平化嵌套陣列
                    const flattenedKeywords = [];
                    keywords.forEach(keyword => {
                        if (Array.isArray(keyword)) {
                            flattenedKeywords.push(...keyword);
                        } else if (typeof keyword === 'string') {
                            flattenedKeywords.push(keyword);
                        }
                    });
                    return flattenedKeywords;
                }
            } catch (parseError) {
                console.warn('AI 意圖分析回應格式錯誤，使用備用解析:', parseError);

                // 備用解析：提取引號內的內容
                const keywordMatches = generatedText.match(/"([^"]+)"/g);
                if (keywordMatches) {
                    return keywordMatches.map(match => match.replace(/"/g, ''));
                }
            }

            return [];
        } catch (error) {
            console.error('AI 意圖分析失敗:', error);
            throw new Error('AI 意圖分析服務暫時無法使用，請重新整理頁面');
        }
    }

    // 智能選擇相關知識庫（優化版）
    function selectRelevantKnowledge(message, knowledgeBases, aiKeywords = []) {
        if (!knowledgeBases || !Array.isArray(knowledgeBases)) {
            return [];
        }

        const messageLower = message.toLowerCase();

        // 定義關鍵字權重映射（教育服務型 AI 優化版）
        const keywordWeights = {
            // 高權重關鍵字 (權重: 4) - 核心教育服務
            '報名': 4, '註冊': 4, '入學': 4, '招生': 4, 'enrollment': 4, 'registration': 4,
            '學費': 4, '費用': 4, '收費': 4, '價錢': 4, '學雜費': 4, 'tuition': 4, 'fee': 4,
            '課程': 4, '科目': 4, '學科': 4, '課表': 4, 'schedule': 4, 'course': 4, 'subject': 4,
            '考試': 4, '測驗': 4, '成績': 4, '分數': 4, 'exam': 4, 'test': 4, 'grade': 4,
            '畢業': 4, '學位': 4, '證書': 4, '文憑': 4, 'graduation': 4, 'degree': 4, 'certificate': 4,

            // 高權重關鍵字 (權重: 3) - 重要教育資訊
            '申請': 3, '報考': 3, '報到': 3, '入學考試': 3, '聯考': 3, '統測': 3, '學測': 3,
            '系所': 3, '科系': 3, '專業': 3, 'major': 3, 'department': 3, 'program': 3,
            '師資': 3, '老師': 3, '教授': 3, '導師': 3, 'teacher': 3, 'professor': 3, 'instructor': 3,
            '宿舍': 3, '住宿': 3, '寢室': 3, 'dormitory': 3, 'housing': 3, 'accommodation': 3,
            '獎學金': 3, '助學金': 3, '補助': 3, 'scholarship': 3, 'financial aid': 3, 'grant': 3,
            '實習': 3, '實習機會': 3, '就業': 3, '工作': 3, 'internship': 3, 'job': 3, 'career': 3,
            '圖書館': 3, '實驗室': 3, '設備': 3, '設施': 3, 'library': 3, 'lab': 3, 'facility': 3,
            '社團': 3, '活動': 3, '社團活動': 3, 'clubs': 3, 'activities': 3, 'extracurricular': 3,

            // 中權重關鍵字 (權重: 2) - 一般教育服務
            '時間': 2, '時程': 2, '日期': 2, 'deadline': 2, 'due date': 2,
            '流程': 2, '步驟': 2, '程序': 2, 'process': 2, 'procedure': 2,
            '問題': 2, '疑問': 2, '困難': 2, 'issue': 2, 'problem': 2,
            '聯絡': 2, '聯繫': 2, '電話': 2, 'email': 2, '地址': 2, 'contact': 2,
            '服務': 2, '功能': 2, 'service': 2, 'feature': 2,
            '使用': 2, '操作': 2, '教學': 2, 'instruction': 2, 'tutorial': 2,
            '設定': 2, '配置': 2, 'setup': 2, 'configuration': 2,
            '安裝': 2, '下載': 2, 'install': 2, 'download': 2,

            // 低權重關鍵字 (權重: 1) - 一般查詢
            '資訊': 1, '資料': 1, 'information': 1, 'data': 1,
            '說明': 1, '介紹': 1, 'description': 1, 'introduction': 1,
            '幫助': 1, '協助': 1, 'help': 1, 'assistance': 1,
            '查詢': 1, '詢問': 1, 'inquiry': 1, 'question': 1
        };

        // 計算每個知識庫的相關性分數
        const scoredKBs = knowledgeBases.map(kb => {
            if (!kb.content || !kb.title) return { kb, score: 0 };

            let score = 0;
            const titleLower = kb.title.toLowerCase();
            const contentLower = kb.content.toLowerCase();

            // 標題匹配權重更高
            if (titleLower.includes(messageLower)) {
                score += 5;
            }

            // 內容匹配
            if (contentLower.includes(messageLower)) {
                score += 3;
            }

            // AI 分析關鍵字匹配（最高優先級）
            if (aiKeywords && aiKeywords.length > 0) {
                aiKeywords.forEach(aiKeyword => {
                    // 處理嵌套陣列的情況
                    let keywordArray = [];
                    if (Array.isArray(aiKeyword)) {
                        keywordArray = aiKeyword;
                    } else if (typeof aiKeyword === 'string') {
                        keywordArray = [aiKeyword];
                    } else {
                        return; // 跳過無效的關鍵字
                    }

                    keywordArray.forEach(keyword => {
                        if (typeof keyword !== 'string') return;

                        const aiKeywordLower = keyword.toLowerCase();

                        // 檢查知識庫標題和內容是否包含 AI 關鍵字
                        if (titleLower.includes(aiKeywordLower)) {
                            score += 6; // AI 關鍵字在標題中權重最高
                        }
                        if (contentLower.includes(aiKeywordLower)) {
                            score += 5; // AI 關鍵字在內容中權重很高
                        }

                        // 檢查知識庫的關鍵字是否與 AI 關鍵字匹配
                        if (kb.keywords && Array.isArray(kb.keywords)) {
                            kb.keywords.forEach(kbKeyword => {
                                const kbKeywordLower = kbKeyword.toLowerCase();
                                if (kbKeywordLower.includes(aiKeywordLower) || aiKeywordLower.includes(kbKeywordLower)) {
                                    score += 7; // AI 關鍵字與知識庫關鍵字匹配權重最高
                                }
                            });
                        }
                    });
                });
            }

            // 知識庫關鍵字匹配
            if (kb.keywords && Array.isArray(kb.keywords)) {
                kb.keywords.forEach(keyword => {
                    const keywordLower = keyword.toLowerCase();
                    if (messageLower.includes(keywordLower)) {
                        score += 4; // 關鍵字匹配權重很高
                    }
                    // 檢查部分關鍵字匹配
                    const keywordWords = keywordLower.split(/\s+/);
                    keywordWords.forEach(word => {
                        if (word.length > 2 && messageLower.includes(word)) {
                            score += 2;
                        }
                    });
                });
            }

            // 關鍵字權重匹配
            Object.keys(keywordWeights).forEach(keyword => {
                if (messageLower.includes(keyword)) {
                    const weight = keywordWeights[keyword];
                    if (titleLower.includes(keyword)) {
                        score += weight * 2; // 標題中的關鍵字權重更高
                    }
                    if (contentLower.includes(keyword)) {
                        score += weight;
                    }
                }
            });

            // 檢查部分匹配（提高召回率）
            const messageWords = messageLower.split(/\s+/).filter(word => word.length > 2);
            messageWords.forEach(word => {
                if (titleLower.includes(word)) score += 1;
                if (contentLower.includes(word)) score += 0.5;
            });

            return { kb, score };
        });

        // 按分數排序，只返回有分數的知識庫
        const relevantKBs = scoredKBs
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.kb);

        // 動態決定返回數量（基於相關性分數）
        if (relevantKBs.length === 0) {
            // 沒有相關的，不載入任何知識庫
            return [];
        } else if (relevantKBs.length <= 3) {
            // 相關的知識庫不多，全部返回
            return relevantKBs;
        } else {
            // 相關的知識庫很多，返回前 3 個最相關的
            return relevantKBs.slice(0, 3);
        }
    }

    // 知識庫緩存和動態載入
    const knowledgeCache = new Map();
    const knowledgeUsageStats = new Map();

    // localStorage 快取管理
    const CACHE_PREFIX = 'ai_convai_kb_';
    const CACHE_VERSION = '1.0';
    const CACHE_EXPIRY_DAYS = 7; // 快取過期天數

    // 生成快取鍵值
    function getCacheKey(kbId) {
        return `${CACHE_PREFIX}${kbId}_${CACHE_VERSION}`;
    }

    // 檢查快取是否過期
    function isCacheExpired(timestamp) {
        const now = Date.now();
        const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // 轉換為毫秒
        return (now - timestamp) > expiryTime;
    }

    // 從 localStorage 載入知識庫快取
    function loadKnowledgeFromCache(kbId) {
        try {
            const cacheKey = getCacheKey(kbId);
            const cachedData = localStorage.getItem(cacheKey);

            if (cachedData) {
                const parsed = JSON.parse(cachedData);

                // 檢查是否過期
                if (isCacheExpired(parsed.timestamp)) {
                    console.log(`知識庫 ${kbId} 快取已過期，將重新載入`);
                    localStorage.removeItem(cacheKey);
                    return null;
                }

                console.log(`從本地快取載入知識庫: ${kbId}`);
                return parsed.data;
            }
        } catch (error) {
            console.error('載入本地快取失敗:', error);
        }
        return null;
    }

    // 將知識庫保存到 localStorage
    function saveKnowledgeToCache(kbId, data) {
        try {
            const cacheKey = getCacheKey(kbId);
            const cacheData = {
                data: data,
                timestamp: Date.now(),
                version: CACHE_VERSION
            };

            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            console.log(`知識庫 ${kbId} 已保存到本地快取`);
        } catch (error) {
            console.error('保存到本地快取失敗:', error);
            // 如果 localStorage 空間不足，清理舊快取
            if (error.name === 'QuotaExceededError') {
                cleanupOldCache();
                // 重試保存
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
                } catch (retryError) {
                    console.error('重試保存快取失敗:', retryError);
                }
            }
        }
    }

    // 清理過期的本地快取
    function cleanupOldCache() {
        try {
            const keysToRemove = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(CACHE_PREFIX)) {
                    try {
                        const cachedData = JSON.parse(localStorage.getItem(key));
                        if (isCacheExpired(cachedData.timestamp)) {
                            keysToRemove.push(key);
                        }
                    } catch (error) {
                        // 如果解析失敗，也標記為刪除
                        keysToRemove.push(key);
                    }
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
            console.log(`清理了 ${keysToRemove.length} 個過期快取`);
        } catch (error) {
            console.error('清理本地快取失敗:', error);
        }
    }

    // 獲取本地快取統計
    function getLocalCacheStats() {
        try {
            let totalSize = 0;
            let cacheCount = 0;
            const cacheDetails = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(CACHE_PREFIX)) {
                    const data = localStorage.getItem(key);
                    if (data) {
                        totalSize += data.length;
                        cacheCount++;

                        try {
                            const parsed = JSON.parse(data);
                            cacheDetails.push({
                                key: key,
                                size: data.length,
                                timestamp: parsed.timestamp,
                                isExpired: isCacheExpired(parsed.timestamp)
                            });
                        } catch (error) {
                            // 忽略解析錯誤
                        }
                    }
                }
            }

            return {
                count: cacheCount,
                totalSize: totalSize,
                details: cacheDetails
            };
        } catch (error) {
            console.error('獲取快取統計失敗:', error);
            return { count: 0, totalSize: 0, details: [] };
        }
    }

    // 清除所有知識庫快取
    function clearAllKnowledgeCache() {
        try {
            const keysToRemove = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(CACHE_PREFIX)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
            console.log(`清除了 ${keysToRemove.length} 個知識庫快取`);
            return keysToRemove.length;
        } catch (error) {
            console.error('清除知識庫快取失敗:', error);
            return 0;
        }
    }

    // 初始化快取管理
    function initializeCacheManagement() {
        try {
            // 清理過期快取
            cleanupOldCache();

            // 顯示快取統計
            const cacheStats = getLocalCacheStats();
            if (cacheStats.count > 0) {
                const sizeKB = Math.round(cacheStats.totalSize / 1024);
                console.log(`📊 知識庫快取初始化完成: ${cacheStats.count} 個項目 (${sizeKB}KB)`);
            }
        } catch (error) {
            console.error('快取管理初始化失敗:', error);
        }
    }

    // 動態載入知識庫內容（優化版：優先使用 localStorage 快取）
    async function loadKnowledgeBaseContent(kbId, database) {
        // 1. 首先檢查記憶體快取
        if (knowledgeCache.has(kbId)) {
            const cached = knowledgeCache.get(kbId);
            // 更新使用統計
            knowledgeUsageStats.set(kbId, (knowledgeUsageStats.get(kbId) || 0) + 1);
            console.log(`從記憶體快取載入知識庫: ${kbId}`);
            return cached;
        }

        // 2. 檢查 localStorage 快取
        const localCached = loadKnowledgeFromCache(kbId);
        if (localCached) {
            // 將本地快取載入到記憶體快取
            knowledgeCache.set(kbId, localCached);
            knowledgeUsageStats.set(kbId, 1);
            return localCached;
        }

        // 3. 從資料庫載入（僅在本地快取不存在時）
        try {
            console.log(`從資料庫載入知識庫: ${kbId}`);
            const kbRef = database.ref(`agents/${currentAgentId}/knowledgeBases/${kbId}`);
            const snapshot = await kbRef.once('value');
            const kbData = snapshot.val();

            if (kbData) {
                // 同時保存到記憶體快取和 localStorage
                knowledgeCache.set(kbId, kbData);
                knowledgeUsageStats.set(kbId, 1);
                saveKnowledgeToCache(kbId, kbData);
                return kbData;
            }
        } catch (error) {
            console.error('載入知識庫失敗:', error);
        }

        return null;
    }

    // 智能知識庫預載入（優化版：更精確的匹配）
    async function preloadRelevantKnowledge(message, database) {
        if (!currentAgent || !currentAgent.knowledgeBases) return [];

        const messageLower = message.toLowerCase();
        const preloadPromises = [];

        // 更精確的緊急關鍵字匹配
        const urgentKeywords = ['價格', '費用', '聯繫', '電話', 'email', '服務', '功能'];
        const hasUrgentKeyword = urgentKeywords.some(keyword => messageLower.includes(keyword));

        if (hasUrgentKeyword) {
            // 只載入標題完全匹配的知識庫，避免過度載入
            currentAgent.knowledgeBases.forEach(kb => {
                if (kb.title && kb.title.toLowerCase().includes(messageLower)) {
                    preloadPromises.push(loadKnowledgeBaseContent(kb.id, database));
                }
            });
        }

        // 並行載入相關知識庫
        const relevantKBs = await Promise.all(preloadPromises);
        return relevantKBs.filter(kb => kb !== null);
    }

    // 智能過濾相關知識庫（基於相關性分數和對話歷史）
    async function filterRelevantKnowledgeBases(knowledgeBases, message, conversationHistory, aiKeywords = []) {
        if (!knowledgeBases || knowledgeBases.length === 0) return [];

        const messageLower = message.toLowerCase();
        const maxKnowledgeBases = 3; // 最多使用 3 個知識庫

        // 計算每個知識庫的相關性分數
        const scoredKBs = knowledgeBases.map(kb => {
            let score = 0;
            const titleLower = (kb.title || '').toLowerCase();
            const contentLower = (kb.content || '').toLowerCase();

            // 標題匹配權重最高
            if (titleLower.includes(messageLower)) {
                score += 10;
            }

            // 內容匹配權重中等
            if (contentLower.includes(messageLower)) {
                score += 5;
            }

            // 關鍵字匹配
            if (kb.keywords && Array.isArray(kb.keywords)) {
                kb.keywords.forEach(keyword => {
                    const keywordLower = keyword.toLowerCase();
                    if (messageLower.includes(keywordLower)) {
                        score += 8;
                    }
                });
            }

            // AI 關鍵字匹配（新增）
            if (aiKeywords && Array.isArray(aiKeywords)) {
                aiKeywords.forEach(aiKeyword => {
                    if (typeof aiKeyword === 'string') {
                        const aiKeywordLower = aiKeyword.toLowerCase();
                        // 檢查知識庫標題是否包含 AI 關鍵字
                        if (titleLower.includes(aiKeywordLower)) {
                            score += 12; // AI 關鍵字匹配權重更高
                        }
                        // 檢查知識庫內容是否包含 AI 關鍵字
                        if (contentLower.includes(aiKeywordLower)) {
                            score += 8;
                        }
                        // 檢查知識庫關鍵字是否包含 AI 關鍵字
                        if (kb.keywords && Array.isArray(kb.keywords)) {
                            kb.keywords.forEach(kbKeyword => {
                                const kbKeywordLower = kbKeyword.toLowerCase();
                                if (kbKeywordLower.includes(aiKeywordLower) || aiKeywordLower.includes(kbKeywordLower)) {
                                    score += 10;
                                }
                            });
                        }
                    }
                });
            }

            // 基於對話歷史的權重調整
            const recentMessages = conversationHistory.slice(-5); // 最近 5 條訊息

            // 檢查對話歷史中是否有與知識庫相關的內容
            const hasRecentRelevance = recentMessages.some(msg => {
                if (!msg.content) return false;
                const msgContent = msg.content.toLowerCase();

                // 檢查知識庫標題是否包含在對話中
                if (titleLower && titleLower.length > 2 && msgContent.includes(titleLower)) {
                    return true;
                }

                // 檢查知識庫關鍵字是否包含在對話中
                if (kb.keywords && Array.isArray(kb.keywords)) {
                    return kb.keywords.some(keyword => {
                        const keywordLower = keyword.toLowerCase();
                        return keywordLower.length > 2 && msgContent.includes(keywordLower);
                    });
                }

                // 檢查知識庫內容是否包含對話中的關鍵詞
                if (contentLower && contentLower.length > 10) {
                    const msgWords = msgContent.split(/\s+/).filter(word => word.length > 2);
                    return msgWords.some(word => contentLower.includes(word));
                }

                return false;
            });

            if (hasRecentRelevance) {
                score += 5; // 提高對話歷史相關性的權重
            }

            return { kb, score };
        });

        // 按分數排序，只返回有分數且分數較高的知識庫
        const filteredKBs = scoredKBs
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxKnowledgeBases)
            .map(item => item.kb);

        console.log('知識庫過濾結果:', {
            '原始數量': knowledgeBases.length,
            '過濾後數量': filteredKBs.length,
            '使用的知識庫': filteredKBs.map(kb => kb.title),
            '分數分佈': scoredKBs.map(item => ({ title: item.kb.title, score: item.score })),
            'AI 關鍵字': aiKeywords,
            '用戶訊息': message
        });

        // 如果沒有找到相關知識庫，建立空白知識庫記錄供維護人員補充
        if (filteredKBs.length === 0 && message.trim().length > 3) {
            console.log('未找到相關知識庫，建立空白記錄供維護人員補充');
            await createEmptyKnowledgeBase(message, aiKeywords);
        }

        return filteredKBs;
    }

    // 獲取下一個知識庫數字 ID
    async function getNextKnowledgeBaseId(database) {
        try {
            const kbRef = database.ref(`agents/${currentAgentId}/knowledgeBases`);
            const snapshot = await kbRef.once('value');
            const knowledgeBases = snapshot.val() || {};

            // 找出現有的數字 ID
            const existingIds = Object.keys(knowledgeBases)
                .filter(id => /^\d+$/.test(id)) // 只取純數字 ID
                .map(id => parseInt(id))
                .sort((a, b) => a - b);

            // 返回下一個可用的數字 ID
            if (existingIds.length === 0) {
                return 0;
            }

            // 找到第一個空缺的數字，或返回最大數字 + 1
            for (let i = 0; i < existingIds.length; i++) {
                if (existingIds[i] !== i) {
                    return i;
                }
            }

            return existingIds[existingIds.length - 1] + 1;
        } catch (error) {
            console.error('獲取知識庫 ID 失敗:', error);
            return 0; // 預設從 0 開始
        }
    }

    // 建立空白知識庫記錄供維護人員補充
    async function createEmptyKnowledgeBase(message, aiKeywords = []) {
        try {
            const database = await loadFirebaseSDK();

            // 從用戶訊息中提取關鍵字作為標題
            const messageWords = message.split(/\s+/).filter(word => word.length > 1);
            const suggestedTitle = messageWords.slice(0, 5).join(' ') || '新知識庫';

            // 獲取下一個數字 ID
            const nextId = await getNextKnowledgeBaseId(database);

            // 建立新的知識庫記錄（使用數字 ID）
            const kbRef = database.ref(`agents/${currentAgentId}/knowledgeBases/${nextId}`);

            const emptyKnowledgeBase = {
                aiGenerated: true,
                content: '', // 空白內容，供維護人員補充
                id: `kb_${nextId}`,
                keywords: aiKeywords.length > 0 ? aiKeywords : messageWords.slice(0, 3),
                title: suggestedTitle,
                createdAt: Date.now(),
                lastUpdated: Date.now()
            };

            await kbRef.set(emptyKnowledgeBase);

            console.log('已建立空白知識庫記錄:', {
                id: `kb_${nextId}`,
                numericId: nextId,
                title: suggestedTitle,
                keywords: emptyKnowledgeBase.keywords
            });

            // 發送通知給維護人員，傳遞數字 ID 用於關聯
            await notifyMaintainers(emptyKnowledgeBase, nextId, message);

        } catch (error) {
            console.error('建立空白知識庫記錄失敗:', error);
        }
    }

    // 通知維護人員有新知識庫需要補充
    async function notifyMaintainers(knowledgeBase, numericId, originalMessage) {
        try {
            const database = await loadFirebaseSDK();

            // 建立維護通知記錄
            const notificationRef = database.ref(`agents/${currentAgentId}/notifications`).push();
            await notificationRef.set({
                id: notificationRef.key,
                type: 'knowledge_base_needed',
                title: '新知識庫需要補充內容',
                message: `系統已建立空白知識庫「${knowledgeBase.title}」，需要補充內容`,
                knowledgeBaseId: numericId, // 使用數字 ID 用於關聯
                knowledgeBaseTitle: knowledgeBase.title,
                keywords: knowledgeBase.keywords || [],
                originalMessage: originalMessage, // 保留原始用戶訊息
                aiKeywords: knowledgeBase.keywords, // AI 分析的關鍵字
                createdAt: Date.now(),
                status: 'pending',
                priority: 'medium',
                // 額外的關聯資訊
                knowledgeBasePath: `agents/${currentAgentId}/knowledgeBases/${numericId}`,
                widgetGenerated: true // 標記為 widget 生成
            });

            console.log('已發送維護通知:', {
                notificationId: notificationRef.key,
                knowledgeBaseId: numericId,
                title: knowledgeBase.title
            });
        } catch (error) {
            console.error('發送維護通知失敗:', error);
        }
    }

    // 檢測預約意圖
    function detectAppointmentIntent(message, aiKeywords) {
        const messageLower = message.toLowerCase();

        // 預約相關關鍵字
        const appointmentKeywords = [
            '預約', '預約參訪', '預約參觀', '預約時間', '預約細節',
            '參訪', '參觀', '校園導覽', '導覽', '參觀校園',
            'appointment', 'visit', 'tour', 'schedule', 'booking'
        ];

        // 檢查訊息中是否包含預約關鍵字
        const hasAppointmentKeyword = appointmentKeywords.some(keyword =>
            messageLower.includes(keyword.toLowerCase())
        );

        // 檢查 AI 關鍵字中是否包含預約相關詞彙
        const hasAppointmentAIKeyword = aiKeywords.some(keyword => {
            if (typeof keyword === 'string') {
                return appointmentKeywords.some(appKeyword =>
                    keyword.toLowerCase().includes(appKeyword.toLowerCase())
                );
            }
            return false;
        });

        return hasAppointmentKeyword || hasAppointmentAIKeyword;
    }

    // 檢測參訪資訊更新/確認指令
    function detectContactUpdateIntent(message) {
        const messageLower = message.toLowerCase();

        // 更新指令關鍵字
        const updateKeywords = [
            '更新參訪資訊', '更新資訊', '修改參訪', '重新填寫',
            'update contact', 'update info', 'modify appointment'
        ];

        // 確認指令關鍵字
        const confirmKeywords = [
            '確認參訪資訊', '確認資訊', '確認無誤', '資訊正確',
            'confirm contact', 'confirm info', 'information correct'
        ];

        // 檢查更新指令
        const hasUpdateKeyword = updateKeywords.some(keyword =>
            messageLower.includes(keyword.toLowerCase())
        );

        // 檢查確認指令
        const hasConfirmKeyword = confirmKeywords.some(keyword =>
            messageLower.includes(keyword.toLowerCase())
        );

        if (hasUpdateKeyword) {
            return 'update';
        } else if (hasConfirmKeyword) {
            return 'confirm';
        }

        return null;
    }

    // 檢查參訪表單提交狀態（以 session 為主）
    async function checkAppointmentFormStatus() {
        try {
            const sessionId = getSessionId();

            // 檢查 session 中是否有參訪表單提交記錄
            const sessionKey = `ai-convai-appointment-submitted-${sessionId}`;
            const hasSubmitted = sessionStorage.getItem(sessionKey) === 'true';

            if (hasSubmitted) {
                console.log('Session 中已記錄參訪表單提交');
                return true;
            }

            // 檢查當前會話是否已經處理過預約意圖
            const intentKey = `ai-convai-appointment-intent-${sessionId}`;
            const hasProcessedIntent = sessionStorage.getItem(intentKey) === 'true';

            if (hasProcessedIntent) {
                console.log('當前會話已處理過預約意圖，避免重複處理');
                return true;
            }

            // 檢查用戶是否已經確認過參訪資訊
            const confirmKey = `ai-convai-appointment-confirmed-${sessionId}`;
            const hasConfirmed = sessionStorage.getItem(confirmKey) === 'true';

            if (hasConfirmed) {
                console.log('用戶已確認參訪資訊，避免重複顯示');
                return true;
            }

            // 檢查 localStorage 中是否有聯絡資訊
            const localContactInfo = loadContactInfoFromLocalStorage();
            if (localContactInfo && localContactInfo.name && localContactInfo.phone) {
                console.log('localStorage 中有聯絡資訊:', {
                    name: localContactInfo.name,
                    phone: localContactInfo.phone,
                    savedAt: new Date(localContactInfo.savedAt).toLocaleString(),
                    confirmed: localContactInfo.confirmed
                });

                // 如果已經確認過，直接返回 true
                if (localContactInfo.confirmed) {
                    console.log('聯絡資訊已確認，避免重複顯示');
                    return true;
                }

                return true;
            }

            // 備用檢查：檢查人物誌中的聯絡資訊
            const database = await loadFirebaseSDK();
            const profileRef = database.ref(`agents/${currentAgentId}/profiles/${sessionId}`);
            const profileSnapshot = await profileRef.once('value');
            const profile = profileSnapshot.val();

            if (profile && profile.contact && profile.contact.name && profile.contact.phone) {
                console.log('人物誌中有聯絡資訊:', {
                    name: profile.contact.name,
                    phone: profile.contact.phone
                });
                return true;
            }

            return false;
        } catch (error) {
            console.error('檢查參訪表單狀態失敗:', error);
            return false; // 發生錯誤時允許顯示表單
        }
    }

    // 收集聯絡資訊
    async function collectContactInfo(message, aiKeywords) {
        try {
            const sessionId = getSessionId();
            const database = await loadFirebaseSDK();

            // 檢查是否已經為當前會話建立過聯絡資訊通知
            const notificationKey = `ai-convai-contact-notification-${sessionId}`;
            const existingNotificationId = sessionStorage.getItem(notificationKey);

            if (existingNotificationId) {
                console.log('當前會話已建立過聯絡資訊通知，避免重複建立');
                return null;
            }

            // 從訊息中提取可能的聯絡資訊
            const contactInfo = extractContactInfo(message);

            // 建立聯絡資訊通知
            const notificationRef = database.ref(`agents/${currentAgentId}/notifications`).push();
            await notificationRef.set({
                id: notificationRef.key,
                type: 'contact_info_collection',
                title: '預約參訪聯絡資訊收集',
                message: `用戶表達預約參訪意圖，需要收集完整聯絡資訊`,
                originalMessage: message,
                aiKeywords: aiKeywords,
                contactInfo: contactInfo,
                createdAt: Date.now(),
                status: 'pending',
                priority: 'high',
                widgetGenerated: true,
                requiresFollowUp: true,
                sessionId: sessionId // 添加會話 ID 用於追蹤
            });

            // 記錄已建立的通知 ID
            sessionStorage.setItem(notificationKey, notificationRef.key);

            console.log('已建立聯絡資訊收集通知:', {
                notificationId: notificationRef.key,
                contactInfo: contactInfo,
                sessionId: sessionId
            });

            return contactInfo;
        } catch (error) {
            console.error('收集聯絡資訊失敗:', error);
            return null;
        }
    }

    // 從訊息中提取聯絡資訊
    function extractContactInfo(message) {
        const contactInfo = {
            name: null,
            phone: null,
            email: null,
            preferredTime: null,
            purpose: null,
            extracted: false
        };

        // 提取電話號碼
        const phoneRegex = /(\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}|\d{8,10})/g;
        const phoneMatches = message.match(phoneRegex);
        if (phoneMatches) {
            contactInfo.phone = phoneMatches[0];
        }

        // 提取電子郵件
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emailMatches = message.match(emailRegex);
        if (emailMatches) {
            contactInfo.email = emailMatches[0];
        }

        // 提取時間資訊
        const timeKeywords = ['時間', '時段', '日期', '幾點', '上午', '下午', '晚上'];
        const hasTimeInfo = timeKeywords.some(keyword => message.includes(keyword));
        if (hasTimeInfo) {
            contactInfo.preferredTime = '用戶提及時間偏好';
        }

        // 提取姓名（簡單的姓名模式）
        const namePatterns = [
            /我是\s*([^\s，,。！!？?]+)/,
            /我叫\s*([^\s，,。！!？?]+)/,
            /姓名[：:]\s*([^\s，,。！!？?]+)/
        ];

        for (const pattern of namePatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                contactInfo.name = match[1].trim();
                break;
            }
        }

        return contactInfo;
    }

    // 生成聯絡資訊表單
    function generateContactForm() {
        const formId = `contact-form-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return `
        <div class="ai-convai-contact-form" data-form-id="${formId}" style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <h4 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">📋 預約參訪聯絡資訊</h4>
            
            <div class="contact-form-fields" style="display: grid; gap: 12px;">
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">姓名 *</label>
                    <input type="text" id="contactName-${formId}" placeholder="請輸入您的姓名" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>
                
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">電話 *</label>
                    <input type="tel" id="contactPhone-${formId}" placeholder="請輸入您的電話號碼" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>
                
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">偏好時間 *</label>
                    <input type="text" id="contactTime-${formId}" placeholder="例如：週一上午、週三下午等" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>
                
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">參訪目的（選填）</label>
                    <textarea id="contactPurpose-${formId}" placeholder="請簡述您想了解或參觀的內容" rows="2" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; resize: vertical;"></textarea>
                </div>
            </div>
            
            <div class="form-actions" style="margin-top: 15px; display: flex; gap: 10px;">
                <button onclick="submitContactForm('${formId}')" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;">提交預約</button>
                <button onclick="cancelContactForm('${formId}')" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;">取消</button>
            </div>
            
            <p style="margin: 10px 0 0 0; color: #666; font-size: 12px;">* 為必填欄位，我們會盡快與您聯繫安排參訪時間。</p>
        </div>`;
    }

    // 生成預填聯絡資訊表單
    function generateContactFormWithData(existingData) {
        const formId = `contact-form-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const name = existingData?.name || '';
        const phone = existingData?.phone || '';
        const preferredTime = existingData?.preferredTime || '';
        const purpose = existingData?.purpose || '';

        return `
        <div class="ai-convai-contact-form" data-form-id="${formId}" style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <h4 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">📝 更新參訪聯絡資訊</h4>
            <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">請修改您的參訪聯絡資訊：</p>
            
            <div class="contact-form-fields" style="display: grid; gap: 12px;">
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">姓名 *</label>
                    <input type="text" id="contactName-${formId}" value="${name}" placeholder="請輸入您的姓名" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>
                
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">電話 *</label>
                    <input type="tel" id="contactPhone-${formId}" value="${phone}" placeholder="請輸入您的電話號碼" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>
                
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">偏好時間 *</label>
                    <input type="text" id="contactTime-${formId}" value="${preferredTime}" placeholder="例如：週一上午、週三下午等" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                </div>
                
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #333;">參訪目的（選填）</label>
                    <textarea id="contactPurpose-${formId}" placeholder="請簡述您想了解或參觀的內容" rows="2" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; resize: vertical;">${purpose}</textarea>
                </div>
            </div>
            
            <div class="form-actions" style="margin-top: 15px; display: flex; gap: 10px;">
                <button onclick="submitContactForm('${formId}')" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;">更新預約</button>
                <button onclick="cancelContactForm('${formId}')" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;">取消</button>
            </div>
            
            <p style="margin: 10px 0 0 0; color: #666; font-size: 12px;">* 為必填欄位，我們會盡快與您聯繫安排參訪時間。</p>
        </div>`;
    }

    // 生成聯絡資訊確認（按鍵界面）
    async function generateContactConfirmText() {
        try {
            // 優先從 localStorage 載入聯絡資訊
            const localContactInfo = loadContactInfoFromLocalStorage();
            if (localContactInfo && localContactInfo.name && localContactInfo.phone) {
                const savedDate = new Date(localContactInfo.savedAt).toLocaleString('zh-TW');

                return `✅ **您的參訪資訊**

以下是您已填寫的參訪聯絡資訊：

**姓名：** ${localContactInfo.name || '未填寫'}
**電話：** ${localContactInfo.phone || '未填寫'}
**偏好時間：** ${localContactInfo.preferredTime || '未填寫'}
${localContactInfo.purpose ? `**參訪目的：** ${localContactInfo.purpose}` : ''}

*保存時間：${savedDate}*

<div class="ai-convai-contact-confirm-buttons" style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
    <button onclick="updateContactInfoFromConfirm()" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">📝 更新資訊</button>
    <button onclick="confirmContactInfoFromConfirm()" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">✅ 確認無誤</button>
    <button onclick="cancelContactConfirmFromConfirm()" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">❌ 取消</button>
</div>

<p style="margin: 10px 0 0 0; color: #666; font-size: 12px;">請選擇您的操作：更新資訊、確認無誤或取消。</p>`;
            }

            // 備用：從人物誌載入
            const database = await loadFirebaseSDK();
            const sessionId = getSessionId();
            const profileRef = database.ref(`agents/${currentAgentId}/profiles/${sessionId}`);
            const profileSnapshot = await profileRef.once('value');
            const profile = profileSnapshot.val();

            if (!profile || !profile.contact) {
                return '⚠️ 找不到您的聯絡資訊，請重新填寫參訪表單。';
            }

            const contact = profile.contact;
            const submittedAt = profile.metadata?.appointmentFormSubmittedAt;
            const submittedDate = submittedAt ? new Date(submittedAt).toLocaleString('zh-TW') : '未知';

            return `✅ **您的參訪資訊**

以下是您已填寫的參訪聯絡資訊：

**姓名：** ${contact.name || '未填寫'}
**電話：** ${contact.phone || '未填寫'}
**偏好時間：** ${contact.preferredTime || '未填寫'}
${contact.purpose ? `**參訪目的：** ${contact.purpose}` : ''}

*填寫時間：${submittedDate}*

<div class="ai-convai-contact-confirm-buttons" style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
    <button onclick="updateContactInfoFromConfirm()" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">📝 更新資訊</button>
    <button onclick="confirmContactInfoFromConfirm()" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">✅ 確認無誤</button>
    <button onclick="cancelContactConfirmFromConfirm()" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">❌ 取消</button>
</div>

<p style="margin: 10px 0 0 0; color: #666; font-size: 12px;">請選擇您的操作：更新資訊、確認無誤或取消。</p>`;

        } catch (error) {
            console.error('生成聯絡資訊確認失敗:', error);
            return '❌ 載入聯絡資訊失敗，請稍後再試。';
        }
    }

    // 提交聯絡資訊表單（全局函數）
    window.submitContactForm = async function (formId) {
        try {
            let name, phone, time, purpose;

            // 如果沒有提供 formId，使用舊的方式（向後兼容）
            if (!formId) {
                name = document.getElementById('contactName').value.trim();
                phone = document.getElementById('contactPhone').value.trim();
                time = document.getElementById('contactTime').value.trim();
                purpose = document.getElementById('contactPurpose').value.trim();
            } else {
                // 使用指定的表單 ID 獲取元素
                name = document.getElementById(`contactName-${formId}`).value.trim();
                phone = document.getElementById(`contactPhone-${formId}`).value.trim();
                time = document.getElementById(`contactTime-${formId}`).value.trim();
                purpose = document.getElementById(`contactPurpose-${formId}`).value.trim();
            }

            // 驗證必填欄位
            if (!name) {
                alert('請輸入您的姓名');
                if (formId) {
                    document.getElementById(`contactName-${formId}`).focus();
                } else {
                    document.getElementById('contactName').focus();
                }
                return;
            }

            if (!phone) {
                alert('請輸入您的電話號碼');
                if (formId) {
                    document.getElementById(`contactPhone-${formId}`).focus();
                } else {
                    document.getElementById('contactPhone').focus();
                }
                return;
            }

            if (!time) {
                alert('請輸入您的偏好時間');
                if (formId) {
                    document.getElementById(`contactTime-${formId}`).focus();
                } else {
                    document.getElementById('contactTime').focus();
                }
                return;
            }

            // 收集完整的聯絡資訊
            const contactInfo = {
                name: name,
                phone: phone,
                email: null, // 表單中沒有電子郵件欄位
                preferredTime: time,
                purpose: purpose || null,
                extracted: true,
                formSubmitted: true,
                submittedAt: Date.now()
            };

            // 建立聯絡資訊通知
            await createContactInfoNotification(contactInfo);

            // 更新人物誌 - 添加聯絡資訊
            await updateProfileWithContactInfo(contactInfo);

            // 標記用戶已填寫過參訪表單
            await markAppointmentFormSubmitted();

            // 在 session 中標記已提交
            const sessionId = getSessionId();
            const sessionKey = `ai-convai-appointment-submitted-${sessionId}`;
            sessionStorage.setItem(sessionKey, 'true');

            // 保存聯絡資訊到 localStorage
            await saveContactInfoToLocalStorage(contactInfo);

            // 顯示成功訊息
            const successMessage = `✅ 預約資訊已提交！\n\n姓名：${name}\n電話：${phone}\n偏好時間：${time}${purpose ? `\n參訪目的：${purpose}` : ''}\n\n我們會盡快與您聯繫安排參訪時間。`;

            // 移除表單
            const contactForm = document.querySelector('.ai-convai-contact-form');
            if (contactForm) {
                contactForm.remove();
            }

            // 添加成功訊息到對話
            addMessage(successMessage, 'assistant');

        } catch (error) {
            console.error('提交聯絡資訊失敗:', error);
            alert('提交失敗，請稍後再試');
        }
    }

    // 取消聯絡資訊表單（全局函數）
    window.cancelContactForm = function (formId) {
        if (formId) {
            // 移除指定的表單
            const contactForm = document.querySelector(`[data-form-id="${formId}"]`);
            if (contactForm) {
                contactForm.remove();
            }
        } else {
            // 向後兼容：移除第一個找到的表單
            const contactForm = document.querySelector('.ai-convai-contact-form');
            if (contactForm) {
                contactForm.remove();
            }
        }
    }

    // 更新聯絡資訊（全局函數）
    window.updateContactInfo = function () {
        // 移除確認資訊，顯示表單
        const confirmInfo = document.querySelector('.ai-convai-contact-confirm');
        if (confirmInfo) {
            confirmInfo.remove();
        }

        // 顯示聯絡資訊表單
        const contactForm = generateContactForm();
        const messagesContainer = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'ai-convai-message assistant';
        messageDiv.innerHTML = contactForm;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 確認聯絡資訊（全局函數）
    window.confirmContactInfo = async function () {
        try {
            // 移除確認資訊
            const confirmInfo = document.querySelector('.ai-convai-contact-confirm');
            if (confirmInfo) {
                confirmInfo.remove();
            }

            // 顯示確認成功訊息
            const successMessage = '✅ 參訪資訊已確認！我們會根據您提供的資訊安排參訪時間。';
            addMessage(successMessage, 'assistant');

            // 建立確認通知
            await createContactConfirmNotification();

            console.log('參訪資訊已確認');

        } catch (error) {
            console.error('確認參訪資訊失敗:', error);
            alert('確認失敗，請稍後再試');
        }
    }

    // 取消聯絡資訊確認（全局函數）
    window.cancelContactConfirm = function () {
        const confirmInfo = document.querySelector('.ai-convai-contact-confirm');
        if (confirmInfo) {
            confirmInfo.remove();
        }
    }

    // 從確認界面更新聯絡資訊（全局函數）
    window.updateContactInfoFromConfirm = function () {
        // 移除確認按鍵
        const confirmButtons = document.querySelector('.ai-convai-contact-confirm-buttons');
        if (confirmButtons) {
            confirmButtons.remove();
        }

        // 載入現有聯絡資訊
        const existingContactInfo = loadContactInfoFromLocalStorage();

        // 顯示預填聯絡資訊表單
        const contactForm = generateContactFormWithData(existingContactInfo);
        const messagesContainer = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'ai-convai-message assistant';
        messageDiv.innerHTML = contactForm;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 從確認界面確認聯絡資訊（全局函數）
    window.confirmContactInfoFromConfirm = async function () {
        try {
            // 移除確認按鍵
            const confirmButtons = document.querySelector('.ai-convai-contact-confirm-buttons');
            if (confirmButtons) {
                confirmButtons.remove();
            }

            // 顯示確認成功訊息
            const successMessage = '✅ 參訪資訊已確認！我們會根據您提供的資訊安排參訪時間。';
            addMessage(successMessage, 'assistant');

            // 建立確認通知
            await createContactConfirmNotification();

            // 標記用戶已確認參訪資訊
            const sessionId = getSessionId();
            const confirmKey = `ai-convai-appointment-confirmed-${sessionId}`;
            sessionStorage.setItem(confirmKey, 'true');

            // 更新 localStorage 中的確認狀態
            const contactInfo = loadContactInfoFromLocalStorage();
            if (contactInfo) {
                contactInfo.confirmed = true;
                contactInfo.confirmedAt = Date.now();
                localStorage.setItem('ai-convai-contact-info', JSON.stringify(contactInfo));
            }

            console.log('參訪資訊已確認');

        } catch (error) {
            console.error('確認參訪資訊失敗:', error);
            alert('確認失敗，請稍後再試');
        }
    }

    // 從確認界面取消聯絡資訊確認（全局函數）
    window.cancelContactConfirmFromConfirm = function () {
        // 移除確認按鍵
        const confirmButtons = document.querySelector('.ai-convai-contact-confirm-buttons');
        if (confirmButtons) {
            confirmButtons.remove();
        }
    }

    // 建立聯絡資訊通知
    async function createContactInfoNotification(contactInfo) {
        try {
            const database = await loadFirebaseSDK();

            // 建立聯絡資訊通知
            const notificationRef = database.ref(`agents/${currentAgentId}/notifications`).push();
            await notificationRef.set({
                id: notificationRef.key,
                type: 'contact_info_collection',
                title: '預約參訪聯絡資訊收集',
                message: `用戶已提交預約參訪聯絡資訊，需要安排參訪時間`,
                originalMessage: '用戶透過表單提交預約資訊',
                aiKeywords: ['預約', '參訪', '聯絡資訊'],
                contactInfo: contactInfo,
                createdAt: Date.now(),
                status: 'pending',
                priority: 'high',
                widgetGenerated: true,
                requiresFollowUp: true,
                formSubmitted: true
            });

            console.log('已建立聯絡資訊收集通知:', {
                notificationId: notificationRef.key,
                contactInfo: contactInfo
            });

        } catch (error) {
            console.error('建立聯絡資訊通知失敗:', error);
            throw error;
        }
    }

    // 建立聯絡資訊確認通知
    async function createContactConfirmNotification() {
        try {
            const database = await loadFirebaseSDK();
            const sessionId = getSessionId();

            // 獲取當前聯絡資訊
            const profileRef = database.ref(`agents/${currentAgentId}/profiles/${sessionId}`);
            const profileSnapshot = await profileRef.once('value');
            const profile = profileSnapshot.val();

            if (!profile || !profile.contact) {
                console.log('找不到聯絡資訊，跳過建立確認通知');
                return;
            }

            const notificationRef = database.ref(`agents/${currentAgentId}/notifications`).push();

            await notificationRef.set({
                id: notificationRef.key,
                type: 'contact_info_confirmed',
                title: '參訪資訊確認',
                message: `用戶已確認參訪聯絡資訊，可以開始安排參訪時間`,
                originalMessage: '用戶確認參訪資訊',
                aiKeywords: ['確認', '參訪', '聯絡資訊'],
                contactInfo: profile.contact,
                confirmedAt: Date.now(),
                createdAt: Date.now(),
                status: 'pending',
                priority: 'medium',
                widgetGenerated: true,
                requiresFollowUp: true,
                infoConfirmed: true
            });

            console.log('已建立聯絡資訊確認通知:', {
                notificationId: notificationRef.key,
                contactInfo: profile.contact
            });

        } catch (error) {
            console.error('建立聯絡資訊確認通知失敗:', error);
        }
    }

    // 更新人物誌 - 添加聯絡資訊
    async function updateProfileWithContactInfo(contactInfo) {
        try {
            const database = await loadFirebaseSDK();
            const sessionId = getSessionId();

            // 獲取當前人物誌
            const profileRef = database.ref(`agents/${currentAgentId}/profiles/${sessionId}`);
            const profileSnapshot = await profileRef.once('value');
            const currentProfile = profileSnapshot.val() || {};

            // 更新聯絡資訊
            const updatedProfile = {
                ...currentProfile,
                contact: {
                    name: contactInfo.name,
                    phone: contactInfo.phone,
                    email: contactInfo.email || null,
                    preferredTime: contactInfo.preferredTime,
                    purpose: contactInfo.purpose || null,
                    lastUpdated: Date.now()
                },
                metadata: {
                    ...currentProfile.metadata,
                    lastUpdated: Date.now(),
                    totalInteractions: (currentProfile.metadata?.totalInteractions || 0) + 1,
                    hasContactInfo: true,
                    contactInfoSource: 'appointment_form'
                }
            };

            // 儲存更新後的人物誌
            await profileRef.set(updatedProfile);

            console.log('人物誌已更新聯絡資訊:', {
                sessionId: sessionId,
                contactInfo: contactInfo
            });

        } catch (error) {
            console.error('更新人物誌聯絡資訊失敗:', error);
            // 不拋出錯誤，避免影響表單提交
        }
    }

    // 標記參訪表單已提交
    async function markAppointmentFormSubmitted() {
        try {
            const database = await loadFirebaseSDK();
            const sessionId = getSessionId();

            // 在人物誌中標記已提交參訪表單
            const profileRef = database.ref(`agents/${currentAgentId}/profiles/${sessionId}`);
            const profileSnapshot = await profileRef.once('value');
            const currentProfile = profileSnapshot.val() || {};

            const updatedProfile = {
                ...currentProfile,
                metadata: {
                    ...currentProfile.metadata,
                    appointmentFormSubmitted: true,
                    appointmentFormSubmittedAt: Date.now(),
                    lastUpdated: Date.now()
                }
            };

            await profileRef.set(updatedProfile);

            console.log('已標記參訪表單提交狀態');

        } catch (error) {
            console.error('標記參訪表單提交狀態失敗:', error);
        }
    }

    // 保存聯絡資訊到 localStorage
    async function saveContactInfoToLocalStorage(contactInfo) {
        try {
            const sessionId = getSessionId();
            const contactData = {
                ...contactInfo,
                sessionId: sessionId,
                agentId: currentAgentId,
                savedAt: Date.now(),
                lastUpdated: Date.now()
            };

            // 保存到 localStorage
            const contactKey = `ai-convai-contact-info-${sessionId}`;
            localStorage.setItem(contactKey, JSON.stringify(contactData));

            // 同時保存到全局聯絡資訊列表
            const globalContactKey = 'ai-convai-global-contact-info';
            const existingContacts = JSON.parse(localStorage.getItem(globalContactKey) || '[]');

            // 檢查是否已存在相同 session 的記錄
            const existingIndex = existingContacts.findIndex(contact => contact.sessionId === sessionId);
            if (existingIndex >= 0) {
                existingContacts[existingIndex] = contactData;
            } else {
                existingContacts.push(contactData);
            }

            // 只保留最近 10 筆記錄
            const recentContacts = existingContacts
                .sort((a, b) => b.savedAt - a.savedAt)
                .slice(0, 10);

            localStorage.setItem(globalContactKey, JSON.stringify(recentContacts));

            console.log('聯絡資訊已保存到 localStorage:', {
                sessionId: sessionId,
                contactInfo: contactInfo
            });

        } catch (error) {
            console.error('保存聯絡資訊到 localStorage 失敗:', error);
        }
    }

    // 從 localStorage 載入聯絡資訊
    function loadContactInfoFromLocalStorage() {
        try {
            const sessionId = getSessionId();
            const contactKey = `ai-convai-contact-info-${sessionId}`;
            const contactData = localStorage.getItem(contactKey);

            if (contactData) {
                const parsed = JSON.parse(contactData);
                console.log('從 localStorage 載入聯絡資訊:', parsed);
                return parsed;
            }

            return null;
        } catch (error) {
            console.error('從 localStorage 載入聯絡資訊失敗:', error);
            return null;
        }
    }

    // 獲取所有保存的聯絡資訊
    function getAllSavedContactInfo() {
        try {
            const globalContactKey = 'ai-convai-global-contact-info';
            const allContacts = JSON.parse(localStorage.getItem(globalContactKey) || '[]');

            console.log('所有保存的聯絡資訊:', allContacts);
            return allContacts;
        } catch (error) {
            console.error('獲取所有聯絡資訊失敗:', error);
            return [];
        }
    }

    // 顯示維護管理界面
    async function showAdminPanel() {
        try {
            const database = await loadFirebaseSDK();

            // 檢查是否已存在管理面板
            let adminPanel = document.querySelector('.ai-convai-admin-panel');
            if (adminPanel) {
                adminPanel.classList.toggle('open');
                return;
            }

            // 建立管理面板
            adminPanel = document.createElement('div');
            adminPanel.className = 'ai-convai-admin-panel open';

            // 載入待補充的知識庫
            const pendingKBs = await loadPendingKnowledgeBases(database);

            adminPanel.innerHTML = `
                <div class="ai-convai-admin-header">
                    <h3 class="ai-convai-admin-title">待補充知識庫 (${pendingKBs.length})</h3>
                    <button class="ai-convai-admin-close">×</button>
                </div>
                <div class="ai-convai-admin-content">
                    ${pendingKBs.length > 0 ?
                    pendingKBs.map(kb => `
                            <div class="ai-convai-pending-kb">
                                <div class="ai-convai-pending-kb-title">${kb.title || '未命名知識庫'}</div>
                                <div class="ai-convai-pending-kb-message">系統自動建立的空白知識庫</div>
                                <div class="ai-convai-pending-kb-keywords">關鍵字: ${(kb.keywords || []).join(', ') || '無'}</div>
                                <div class="ai-convai-pending-kb-status">狀態: 待補充內容</div>
                            </div>
                        `).join('') :
                    '<div style="text-align: center; color: #6b7280; padding: 20px;">暫無待補充的知識庫</div>'
                }
                </div>
            `;

            document.body.appendChild(adminPanel);

            // 添加關閉事件
            adminPanel.querySelector('.ai-convai-admin-close').addEventListener('click', () => {
                adminPanel.classList.remove('open');
            });

        } catch (error) {
            console.error('顯示管理界面失敗:', error);
        }
    }

    // 載入待補充的知識庫
    async function loadPendingKnowledgeBases(database) {
        try {
            const kbRef = database.ref(`agents/${currentAgentId}/knowledgeBases`);
            const snapshot = await kbRef.once('value');
            const knowledgeBases = snapshot.val() || {};

            // 過濾出待補充的知識庫（空白內容的知識庫）
            const pendingKBs = Object.values(knowledgeBases).filter(kb =>
                kb.aiGenerated === true && (!kb.content || kb.content.trim() === '')
            );

            return pendingKBs;
        } catch (error) {
            console.error('載入待補充知識庫失敗:', error);
            return [];
        }
    }

    // 清理知識庫緩存（包含 localStorage）
    function clearKnowledgeCache() {
        knowledgeCache.clear();
        knowledgeUsageStats.clear();
        clearAllKnowledgeCache();
        console.log('已清理所有知識庫快取（記憶體 + localStorage）');
    }

    // 獲取知識庫使用統計
    function getKnowledgeUsageStats() {
        return Array.from(knowledgeUsageStats.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([id, count]) => ({ id, count }));
    }

    // 知識庫優化建議（包含 localStorage 快取統計）
    function getKnowledgeOptimizationSuggestions() {
        const stats = getKnowledgeUsageStats();
        const localCacheStats = getLocalCacheStats();
        const suggestions = [];

        if (stats.length === 0) {
            suggestions.push('📊 尚未有知識庫使用統計');
        } else {
            // 分析使用模式
            const totalUsage = stats.reduce((sum, stat) => sum + stat.count, 0);
            const avgUsage = totalUsage / stats.length;

            // 找出高使用和低使用的知識庫
            const highUsage = stats.filter(stat => stat.count > avgUsage * 2);
            const lowUsage = stats.filter(stat => stat.count < avgUsage * 0.5);

            if (highUsage.length > 0) {
                suggestions.push(`🔥 高使用知識庫: ${highUsage.map(s => s.id).join(', ')}`);
            }

            if (lowUsage.length > 0) {
                suggestions.push(`❄️ 低使用知識庫: ${lowUsage.map(s => s.id).join(', ')} (考慮優化或移除)`);
            }

            // 緩存效率分析
            const cacheHitRate = knowledgeCache.size / (knowledgeCache.size + stats.length);
            if (cacheHitRate > 0.8) {
                suggestions.push('✅ 知識庫緩存效率良好');
            } else {
                suggestions.push('⚠️ 知識庫緩存效率可改善');
            }
        }

        // localStorage 快取統計
        if (localCacheStats.count > 0) {
            const sizeKB = Math.round(localCacheStats.totalSize / 1024);
            suggestions.push(`💾 本地快取: ${localCacheStats.count} 個知識庫 (${sizeKB}KB)`);

            // 檢查過期快取
            const expiredCount = localCacheStats.details.filter(d => d.isExpired).length;
            if (expiredCount > 0) {
                suggestions.push(`⏰ 有 ${expiredCount} 個過期快取，建議清理`);
            }
        } else {
            suggestions.push('💾 本地快取: 無快取資料');
        }

        return suggestions;
    }

    // 清理過期緩存（包含 localStorage）
    function cleanupKnowledgeCache() {
        const maxCacheSize = 50; // 最大緩存數量
        let cleanedCount = 0;

        // 清理記憶體快取
        if (knowledgeCache.size > maxCacheSize) {
            // 移除最少使用的知識庫
            const sortedStats = getKnowledgeUsageStats();
            const toRemove = sortedStats.slice(-Math.floor(maxCacheSize * 0.2));
            toRemove.forEach(stat => {
                knowledgeCache.delete(stat.id);
                knowledgeUsageStats.delete(stat.id);
            });
            cleanedCount += toRemove.length;
            console.log('清理記憶體快取:', toRemove.length, '個項目');
        }

        // 清理 localStorage 過期快取
        cleanupOldCache();

        return cleanedCount;
    }

    // 估算 token 數量（粗略估算）
    function estimateTokens(text) {
        // 中文字符約 1.5 tokens，英文約 0.75 tokens
        const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const englishChars = text.length - chineseChars;
        return Math.ceil(chineseChars * 1.5 + englishChars * 0.75);
    }

    // 更新 token 使用統計
    function updateTokenStats(promptTokens) {
        tokenUsageStats.totalRequests++;
        tokenUsageStats.totalTokens += promptTokens;
        tokenUsageStats.averageTokensPerRequest = Math.round(tokenUsageStats.totalTokens / tokenUsageStats.totalRequests);

        // 在開發模式下顯示統計和優化建議
        if (localStorage.getItem('ai-convai-debug') === 'true') {
            console.log('Token 使用統計:', {
                '本次使用': promptTokens,
                '總請求數': tokenUsageStats.totalRequests,
                '總 Token': tokenUsageStats.totalTokens,
                '平均每請求': tokenUsageStats.averageTokensPerRequest
            });

            // 提供優化建議
            if (promptTokens > 2000) {
                console.warn('⚠️ Token 使用量較高，建議：');
                console.warn('- 減少知識庫內容');
                console.warn('- 縮短對話歷史');
                console.warn('- 簡化 System Prompt');
            }
        }
    }

    // 優化對話歷史，只保留最近的相關對話
    function optimizeConversationHistory(history, maxMessages = 10) {
        if (history.length <= maxMessages) {
            return history;
        }

        // 保留最近的對話，但優先保留包含關鍵字的對話
        const recentHistory = history.slice(-maxMessages);
        return recentHistory;
    }

    // 取得 AI 回應
    async function getAIResponse(message) {
        if (!currentAgent) {
            throw new Error('代理未載入');
        }

        // 載入 Firebase 資料庫
        const database = await loadFirebaseSDK();

        // 載入最新的對話歷史
        await loadConversationHistory(database);

        const { llmConfig, knowledgeBases, knowledgeBase, description } = currentAgent;

        // 獲取對話輪數和代理介紹狀態
        const conversationCount = getConversationCount(currentAgentId);
        const hasBeenIntroduced = hasAgentBeenIntroduced(currentAgentId);
        const isNewAgentSession = isNewAgent(currentAgentId);

        // 根據對話輪數和介紹狀態建立 System Prompt
        let systemPrompt = '[重要]回答精簡,不要超過100字,講重點,' + description;

        // 添加人物誌引導功能
        systemPrompt += '\n\n你具備智慧引導功能，能夠在適當的時機引導用戶提供個人資訊來建立人物誌，更重要的是邀請到校參訪。';

        // 對話次數管理
        if (conversationCount === 0) {
            systemPrompt += '\n\n這是第一次對話，請簡潔地介紹自己。';
        } else if (conversationCount === 1) {
            systemPrompt += '\n\n這是第二次對話，直接回答問題，不要重複介紹自己和打招呼。';
        } else {
            systemPrompt += '\n\n這是第' + (conversationCount + 1) + '次對話，直接回答問題，不要重複介紹自己和打招呼，對話精簡重要。';
        }

        // 添加智能引導邏輯
        const guidancePrompt = await generateProfileGuidancePrompt();
        systemPrompt += guidancePrompt;

        // 分析用戶訊息，提供額外的引導提示
        const guidanceHints = analyzeUserMessageForGuidance(message);
        if (guidanceHints.length > 0) {
            systemPrompt += '\n\n用戶訊息分析：' + guidanceHints.join('，') + '。可以根據這些線索進行更精準的引導。';
        }

        // 添加情境化引導
        const contextualGuidance = generateContextualGuidance(message, conversationCount);
        if (contextualGuidance) {
            systemPrompt += '\n\n情境化引導：' + contextualGuidance;
        }

        // 獲取當前用戶的人物誌（基於用戶ID）
        const currentProfile = getLocalProfile(currentAgentId);
        const userId = getUserId();

        // 添加用戶人物誌到系統提示
        if (currentProfile) {
            systemPrompt += '\n\n【用戶人物誌資訊】\n';
            systemPrompt += '以下是當前用戶的已知資訊，請在對話中參考這些資訊提供更個人化的回應：\n';

            if (currentProfile.basic && Object.keys(currentProfile.basic).some(key => currentProfile.basic[key])) {
                systemPrompt += `基本資訊：${JSON.stringify(currentProfile.basic, null, 2)}\n`;
            }
            if (currentProfile.contact && Object.keys(currentProfile.contact).some(key => currentProfile.contact[key])) {
                systemPrompt += `聯絡方式：${JSON.stringify(currentProfile.contact, null, 2)}\n`;
            }
            if (currentProfile.education && Object.keys(currentProfile.education).some(key => currentProfile.education[key])) {
                systemPrompt += `教育背景：${JSON.stringify(currentProfile.education, null, 2)}\n`;
            }
            if (currentProfile.career && Object.keys(currentProfile.career).some(key => currentProfile.career[key])) {
                systemPrompt += `職業資訊：${JSON.stringify(currentProfile.career, null, 2)}\n`;
            }
            if (currentProfile.interests && Object.keys(currentProfile.interests).some(key => currentProfile.interests[key])) {
                systemPrompt += `興趣愛好：${JSON.stringify(currentProfile.interests, null, 2)}\n`;
            }
            if (currentProfile.personality && Object.keys(currentProfile.personality).some(key => currentProfile.personality[key])) {
                systemPrompt += `個性特質：${JSON.stringify(currentProfile.personality, null, 2)}\n`;
            }
            if (currentProfile.lifestyle && Object.keys(currentProfile.lifestyle).some(key => currentProfile.lifestyle[key])) {
                systemPrompt += `生活習慣：${JSON.stringify(currentProfile.lifestyle, null, 2)}\n`;
            }

            systemPrompt += `\n用戶ID：${userId}\n`;
            systemPrompt += '請基於以上人物誌資訊，提供更個人化和相關的回應。\n';
        } else {
            systemPrompt += '\n\n【新用戶】\n';
            systemPrompt += '這是新用戶，請在對話中適當地引導用戶提供個人資訊來建立人物誌。\n';
            systemPrompt += `用戶ID：${userId}\n`;
        }

        // 檢查是否有保存的聯絡資訊
        const savedContactInfo = loadContactInfoFromLocalStorage();
        if (savedContactInfo && savedContactInfo.name) {
            systemPrompt += `\n\n【重要】用戶已提供參訪聯絡資訊：
姓名：${savedContactInfo.name}
電話：${savedContactInfo.phone || '未提供'}
偏好時間：${savedContactInfo.preferredTime || '未提供'}
${savedContactInfo.purpose ? `參訪目的：${savedContactInfo.purpose}` : ''}
保存時間：${new Date(savedContactInfo.savedAt).toLocaleString('zh-TW')}

在對話中可以主動提及這些資訊，並詢問是否需要更新或確認參訪安排。`;
        }

        // 強制要求回傳特定格式
        systemPrompt += '\n\n【重要】每次回覆必須按照以下格式：\n';
        systemPrompt += '1. 先回答用戶的問題, 不要太長, 精簡回答\n';
        systemPrompt += '2. 然後在回覆最後添加以下 JSON 格式：\n';
        systemPrompt += '```json\n';
        systemPrompt += '{\n';
        systemPrompt += '  "profile": {\n';
        systemPrompt += '    "basic": {"name": "", "age": ""},\n';
        systemPrompt += '    "contact": {"phone": "", "email": "", "line": ""}, // 【重要】聯絡方式是必須收集的關鍵資訊！\n';
        systemPrompt += '    "education": {"school": "", "major": "", "examGroup": ""},\n';
        systemPrompt += '    "career": {"company": "", "position": ""},\n';
        systemPrompt += '    "interests": {"hobbies": ""},\n';
        systemPrompt += '    "personality": {"traits": ""},\n';
        systemPrompt += '    "lifestyle": {"habits": ""}\n';
        systemPrompt += '  },\n';
        systemPrompt += '  "suggestions": [\n';
        systemPrompt += '    "用戶角度提出問題1"\n';

        systemPrompt += '  ]\n';
        systemPrompt += '}\n';
        systemPrompt += '```\n';

        if (currentProfile) {
            systemPrompt += '\n目前已有的人物誌資訊：\n';
            if (currentProfile.basic && Object.keys(currentProfile.basic).length > 0) {
                systemPrompt += `基本資訊：${JSON.stringify(currentProfile.basic)}\n`;
            }
            if (currentProfile.contact && Object.keys(currentProfile.contact).length > 0) {
                systemPrompt += `聯絡方式：${JSON.stringify(currentProfile.contact)}\n`;
            }
            if (currentProfile.career && Object.keys(currentProfile.career).length > 0) {
                systemPrompt += `職業資訊：${JSON.stringify(currentProfile.career)}\n`;
            }
            if (currentProfile.education && Object.keys(currentProfile.education).length > 0) {
                systemPrompt += `教育背景：${JSON.stringify(currentProfile.education)}\n`;
            }
            if (currentProfile.interests && Object.keys(currentProfile.interests).length > 0) {
                systemPrompt += `興趣愛好：${JSON.stringify(currentProfile.interests)}\n`;
            }
            if (currentProfile.personality && Object.keys(currentProfile.personality).length > 0) {
                systemPrompt += `個性特質：${JSON.stringify(currentProfile.personality)}\n`;
            }
            if (currentProfile.lifestyle && Object.keys(currentProfile.lifestyle).length > 0) {
                systemPrompt += `生活狀況：${JSON.stringify(currentProfile.lifestyle)}\n`;
            }
            systemPrompt += '\n請根據現有資訊和當前對話，更新人物誌並建議1個延伸問題來建立更完整的人物誌。';
        } else {
            systemPrompt += '\n這是第一次對話，請根據用戶訊息分析並建立初始人物誌，並建議1個延伸問題。';
        }

        systemPrompt += '\n\n建議問題要：\n';
        systemPrompt += '1. 以用戶為出發點，符合用戶需求\n';
        systemPrompt += '2. 引導用戶提供更多個人資訊\n';
        systemPrompt += '3. 與當前對話內容相關\n';
        systemPrompt += '4. 問題要具體且容易回答';

        // 智能選擇相關知識庫
        // AI 意圖分析 + 智能知識庫選擇
        let knowledgeContent = '';
        let allRelevantKBs = []; // 初始化變數
        let appointmentIntent = false; // 預約意圖標記

        if (knowledgeBases && Array.isArray(knowledgeBases)) {
            try {
                // 注意：AI 意圖分析現在在 Firebase Functions 中處理，不在客戶端進行
                console.log('使用 Firebase Functions 進行 AI 處理...');
                const aiKeywords = []; // 空陣列，AI 分析在後端進行

                // 檢測預約意圖
                appointmentIntent = detectAppointmentIntent(message, aiKeywords);
                if (appointmentIntent) {
                    // 檢查是否已經填寫過參訪表單
                    const hasSubmittedAppointment = await checkAppointmentFormStatus();
                    if (hasSubmittedAppointment) {
                        // 檢查是否已經確認過
                        const sessionId = getSessionId();
                        const confirmKey = `ai-convai-appointment-confirmed-${sessionId}`;
                        const hasConfirmed = sessionStorage.getItem(confirmKey) === 'true';

                        if (hasConfirmed) {
                            console.log('用戶已確認參訪資訊，顯示已確認狀態');
                            appointmentIntent = 'already_confirmed'; // 標記為已確認模式
                        } else {
                            console.log('用戶已填寫過參訪表單，將顯示確認資訊');
                            appointmentIntent = 'confirm'; // 標記為確認模式
                        }
                    } else {
                        console.log('檢測到預約意圖，將收集聯絡資訊');
                        // 標記當前會話有預約意圖，避免重複處理
                        sessionStorage.setItem(`ai-convai-appointment-intent-${getSessionId()}`, 'true');
                    }
                }

                // 檢測參訪資訊更新/確認指令（保留文字指令支援）
                const updateIntent = detectContactUpdateIntent(message);
                if (updateIntent === 'update') {
                    console.log('用戶要求更新參訪資訊');
                    appointmentIntent = true; // 顯示表單
                } else if (updateIntent === 'confirm') {
                    console.log('用戶確認參訪資訊');
                    appointmentIntent = 'confirm_action'; // 執行確認動作
                }

                // 2. 預載入相關知識庫
                const database = await loadFirebaseSDK();
                const preloadedKBs = await preloadRelevantKnowledge(message, database);

                // 3. 使用 AI 關鍵字進行智能知識庫選擇
                const relevantKBs = selectRelevantKnowledge(message, knowledgeBases, aiKeywords);

                // 4. 智能合併和過濾知識庫
                const combinedKBs = [...new Set([...preloadedKBs, ...relevantKBs])];

                // 基於相關性分數和對話歷史智能過濾
                allRelevantKBs = await filterRelevantKnowledgeBases(combinedKBs, message, conversationHistory, aiKeywords);

                if (allRelevantKBs.length > 0) {
                    knowledgeContent = allRelevantKBs.map((kb, index) =>
                        `${kb.title || `知識${index + 1}`}:\n${kb.content}`
                    ).join('\n\n');

                    // 記錄知識庫使用統計
                    console.log('使用的知識庫:', allRelevantKBs.map(kb => kb.title));
                    console.log('AI 關鍵字匹配結果:', aiKeywords);
                }

                // 如果檢測到預約意圖，不立即收集，等待用戶填寫表單
                if (appointmentIntent) {
                    console.log('檢測到預約意圖，將顯示聯絡資訊表單');
                }
            } catch (error) {
                console.error('AI 意圖分析或知識庫載入失敗，使用備用方案:', error);
                // 備用方案：使用原有的選擇邏輯
                const relevantKBs = selectRelevantKnowledge(message, knowledgeBases);
                allRelevantKBs = relevantKBs; // 設置備用方案的結果
                if (relevantKBs.length > 0) {
                    knowledgeContent = relevantKBs.map((kb, index) =>
                        `${kb.title || `知識${index + 1}`}:\n${kb.content}`
                    ).join('\n\n');
                }
            }
        } else if (knowledgeBase) {
            // 舊格式：單一知識庫
            knowledgeContent = knowledgeBase;
        }

        // 建立優化的提示詞
        const fullSystemPrompt = knowledgeContent.trim()
            ? `${systemPrompt}\n\n相關資訊：\n${knowledgeContent}`
            : systemPrompt;

        // 估算 token 使用量
        const estimatedTokens = estimateTokens(fullSystemPrompt + message);
        updateTokenStats(estimatedTokens);

        // 增加對話輪數
        const newConversationCount = incrementConversationCount(currentAgentId);

        // 更新代理狀態
        updateLastAgent(currentAgentId);

        // 使用 Firebase Functions 安全代理
        let response;

        // 檢查 Firebase Functions 是否可用
        if (typeof firebase === 'undefined' || !firebase.functions) {
            throw new Error('Firebase Functions 未載入，請重新整理頁面');
        }

        const functions = firebase.functions();
        const getAIResponse = functions.httpsCallable('getAIResponse');

        const result = await getAIResponse({
            agentId: currentAgentId,
            message: message,
            systemPrompt: fullSystemPrompt,
            userId: null,
            source: 'widget',
            conversationHistory: conversationHistory
        });

        response = result.data.response;

        // 如果回應包含自我介紹，標記為已介紹
        if (response && (response.includes('我是') || response.includes('你好') || response.includes('您好'))) {
            markAgentAsIntroduced(currentAgentId);
        }

        // 在除錯模式下顯示對話管理資訊
        if (localStorage.getItem('ai-convai-debug') === 'true') {
            console.log('對話管理資訊:', {
                '代理ID': currentAgentId,
                '對話輪數': newConversationCount,
                '已介紹': hasBeenIntroduced,
                '新代理': isNewAgentSession,
                '引導提示': guidancePrompt ? '已生成' : '未生成',
                '用戶訊息分析': guidanceHints.length > 0 ? guidanceHints : '無',
                '情境化引導': contextualGuidance ? '已生成' : '未生成'
            });
        }

        // 解析 AI 回應中的 JSON 並更新人物誌
        const cleanResponse = await parseAndSaveProfileFromAIResponse(response);

        // 處理預約意圖
        if (appointmentIntent === true) {
            // 新用戶，顯示聯絡資訊表單
            const contactForm = generateContactForm();
            response = cleanResponse + '\n\n' + contactForm;
        } else if (appointmentIntent === 'confirm') {
            // 已填寫過，顯示確認資訊（文字訊息）
            const confirmInfo = await generateContactConfirmText();
            response = cleanResponse + '\n\n' + confirmInfo;
        } else if (appointmentIntent === 'already_confirmed') {
            // 已經確認過，顯示已確認狀態
            const localContactInfo = loadContactInfoFromLocalStorage();
            if (localContactInfo && localContactInfo.name && localContactInfo.phone) {
                const confirmedDate = localContactInfo.confirmedAt ? new Date(localContactInfo.confirmedAt).toLocaleString('zh-TW') : '未知時間';
                response = cleanResponse + `\n\n✅ **您的參訪資訊已確認**\n\n我們已收到您的參訪申請，確認資訊如下：\n\n**姓名：** ${localContactInfo.name}\n**電話：** ${localContactInfo.phone}\n**偏好時間：** ${localContactInfo.preferredTime || '未指定'}\n**參訪目的：** ${localContactInfo.purpose || '未指定'}\n\n*確認時間：${confirmedDate}*\n\n我們會根據您提供的資訊安排參訪時間，請耐心等待我們的聯繫。`;
            } else {
                response = cleanResponse + '\n\n✅ 您的參訪資訊已確認，我們會盡快與您聯繫安排參訪時間。';
            }
        } else if (appointmentIntent === 'confirm_action') {
            // 執行確認動作
            await createContactConfirmNotification();
            response = cleanResponse + '\n\n✅ 參訪資訊已確認！我們會根據您提供的資訊安排參訪時間。';
        } else {
            response = cleanResponse;
        }

        // 返回包含回應和使用的知識庫信息的對象
        return {
            response: response,
            usedKnowledgeBases: allRelevantKBs || [],
            appointmentIntent: appointmentIntent
        };
    }

    // 呼叫 OpenAI API
    async function callOpenAI(message, systemPrompt, apiKey, retryCount = 0) {
        const maxRetries = 2;
        const retryDelay = 1000 * (retryCount + 1); // 遞增延遲：1s, 2s, 3s
        // 建立訊息陣列，包含對話歷史
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // 優化對話歷史，只保留最近的相關對話
        const recentHistory = optimizeConversationHistory(conversationHistory, 6);
        messages.push(...recentHistory);

        // 添加當前訊息
        messages.push({ role: 'user', content: message });

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: messages,
                    max_tokens: 1000,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                // 如果是 503 錯誤且還有重試次數，則重試
                if (response.status === 503 && retryCount < maxRetries) {
                    console.log(`OpenAI API 503 錯誤，${retryDelay}ms 後重試 (${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    return await callOpenAI(message, systemPrompt, apiKey, retryCount + 1);
                }
                throw new Error(`OpenAI API 錯誤: ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            // 如果是網路錯誤且還有重試次數，則重試
            if (error.name === 'TypeError' && retryCount < maxRetries) {
                console.log(`網路錯誤，${retryDelay}ms 後重試 (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return await callOpenAI(message, systemPrompt, apiKey, retryCount + 1);
            }

            throw error;
        }
    }

    // 呼叫 Gemini API
    async function callGemini(message, systemPrompt, apiKey, retryCount = 0) {
        const maxRetries = 2;
        const retryDelay = 1000 * (retryCount + 1); // 遞增延遲：1s, 2s, 3s

        try {
            // 建立完整的提示詞，包含對話歷史
            let fullPrompt = systemPrompt + '\n\n';

            // 優化對話歷史，只保留最近的相關對話
            const recentHistory = optimizeConversationHistory(conversationHistory, 6);
            if (recentHistory.length > 0) {
                fullPrompt += '對話：\n';
                recentHistory.forEach(msg => {
                    const role = msg.role === 'user' ? '用戶' : '客服';
                    fullPrompt += `${role}: ${msg.content}\n`;
                });
                fullPrompt += '\n';
            }

            fullPrompt += `問題：${message}\n回答：`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: fullPrompt
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
                    return await callGemini(message, systemPrompt, apiKey, retryCount + 1);
                }

                // 根據錯誤狀態碼提供具體的錯誤訊息
                let userMessage = 'Gemini API 服務暫時不可用';

                switch (response.status) {
                    case 400:
                        userMessage = 'API 錯誤: 400 - 請求格式錯誤';
                        break;
                    case 401:
                        userMessage = 'API 錯誤: 401 - API Key 無效';
                        break;
                    case 403:
                        userMessage = 'API 錯誤: 403 - API 權限不足';
                        break;
                    case 404:
                        userMessage = 'API 錯誤: 404 - API 端點不存在';
                        break;
                    case 429:
                        userMessage = 'API 錯誤: 429 - 請求過於頻繁';
                        break;
                    case 500:
                        userMessage = 'API 錯誤: 500 - 服務器內部錯誤';
                        break;
                    case 503:
                        userMessage = 'API 錯誤: 503 - 服務暫時不可用';
                        break;
                    default:
                        userMessage = `API 錯誤: ${response.status} - ${errorMessage}`;
                }

                throw new Error(userMessage);
            }

            const data = await response.json();

            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Gemini API 回應格式錯誤');
            }

            return data.candidates[0].content.parts[0].text;

        } catch (error) {
            // 如果是網路錯誤且還有重試次數，則重試
            if (error.name === 'TypeError' && retryCount < maxRetries) {
                console.log(`網路錯誤，${retryDelay}ms 後重試 (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return await callGemini(message, systemPrompt, apiKey, retryCount + 1);
            }

            throw error;
        }
    }

    // 呼叫自訂 API
    async function callCustomAPI(message, systemPrompt, apiKey, customUrl, retryCount = 0) {
        const maxRetries = 2;
        const retryDelay = 1000 * (retryCount + 1); // 遞增延遲：1s, 2s, 3s
        // 建立訊息陣列，包含對話歷史
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // 優化對話歷史，只保留最近的相關對話
        const recentHistory = optimizeConversationHistory(conversationHistory, 6);
        messages.push(...recentHistory);

        // 添加當前訊息
        messages.push({ role: 'user', content: message });

        try {
            const response = await fetch(customUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    messages: messages
                })
            });

            if (!response.ok) {
                // 如果是 503 錯誤且還有重試次數，則重試
                if (response.status === 503 && retryCount < maxRetries) {
                    console.log(`自訂 API 503 錯誤，${retryDelay}ms 後重試 (${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    return await callCustomAPI(message, systemPrompt, apiKey, customUrl, retryCount + 1);
                }
                throw new Error(`自訂 API 錯誤: ${response.status}`);
            }

            const data = await response.json();
            return data.response || data.message || data.content;
        } catch (error) {
            // 如果是網路錯誤且還有重試次數，則重試
            if (error.name === 'TypeError' && retryCount < maxRetries) {
                console.log(`網路錯誤，${retryDelay}ms 後重試 (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return await callCustomAPI(message, systemPrompt, apiKey, customUrl, retryCount + 1);
            }

            throw error;
        }
    }

    // 新增訊息到聊天視窗
    // 優化的 Markdown 解析器
    function parseMarkdown(text) {
        if (!text) return '';

        // 先處理 Markdown 格式連結，但跳過 YouTube 影片連結（避免與內嵌處理衝突）
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (match, linkText, url) {
            // 檢查是否為 YouTube 影片連結
            if (url.includes('youtube.com/watch?v=') || url.includes('youtu.be/')) {
                // 如果是 YouTube 影片連結，先提取 videoId，稍後處理
                return match; // 暫時保留原始格式，稍後處理
            }
            // 其他連結正常處理
            return `<a href="${url}" target="_blank" rel="noopener">${linkText}</a>`;
        });

        // 處理延伸資訊區塊（特殊格式）
        text = text.replace(/延伸資訊與聯繫方式：\s*\n([\s\S]*?)(?=\n\n|\n$|$)/g, function (match, content) {
            return `<div class="ai-convai-extended-info">
                <div class="ai-convai-extended-header">
                    <span class="ai-convai-extended-icon">💡</span>
                    <span class="ai-convai-extended-title">延伸資訊與聯繫方式</span>
                </div>
                <div class="ai-convai-extended-content">${content.trim()}</div>
            </div>`;
        });

        // 處理其他類型的資訊區塊
        text = text.replace(/職稱：\s*([^\n]+)/g, '<div class="ai-convai-info-item"><strong>職稱：</strong>$1</div>');
        text = text.replace(/專業領域：\s*([^\n]+)/g, '<div class="ai-convai-info-item"><strong>專業領域：</strong>$1</div>');
        text = text.replace(/聯絡資訊：\s*\n([\s\S]*?)(?=\n\n|\n$|$)/g, function (match, content) {
            return `<div class="ai-convai-contact-info">
                <div class="ai-convai-contact-header">
                    <span class="ai-convai-contact-icon">📞</span>
                    <span class="ai-convai-contact-title">聯絡資訊</span>
                </div>
                <div class="ai-convai-contact-content">${content.trim()}</div>
            </div>`;
        });

        // 處理代碼塊（優先處理，避免被其他規則影響）
        text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // 處理行內代碼
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 處理粗體（優先處理，避免與斜體衝突）
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // 處理斜體（只處理單個星號，避免與粗體衝突）
        text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // 處理標題
        text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');

        // 處理無序列表
        text = text.replace(/^[\*\-\+] (.+)$/gm, '<li>$1</li>');

        // 處理有序列表
        text = text.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

        // 包裝連續的列表項
        text = text.replace(/(<li>.*<\/li>)(\s*<li>.*<\/li>)*/g, function (match) {
            return '<ul>' + match + '</ul>';
        });

        // 優化換行處理：減少多餘的換行
        // 先處理連續的換行，最多保留兩個
        text = text.replace(/\n{3,}/g, '\n\n');

        // 將換行轉換為 <br>，但避免在已有 HTML 標籤的地方添加
        text = text.replace(/\n/g, '<br>');

        // 處理 YouTube 影片連結內嵌（只處理真正的影片連結）
        text = text.replace(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})(?:&[^&\s]*)?/g, function (match, videoId) {
            return `<div class="ai-convai-youtube-embed"><iframe width="100%" height="200" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        });

        // 處理 YouTube 短連結
        text = text.replace(/(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?[^&\s]*)?/g, function (match, videoId) {
            return `<div class="ai-convai-youtube-embed"><iframe width="100%" height="200" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        });

        // 處理剩餘的 Markdown 格式 YouTube 連結
        text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]*youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})[^)]*)\)/g, function (match, linkText, url, videoId) {
            return `<div class="ai-convai-youtube-embed"><iframe width="100%" height="200" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        });

        text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]*youtu\.be\/([a-zA-Z0-9_-]{11})[^)]*)\)/g, function (match, linkText, url, videoId) {
            return `<div class="ai-convai-youtube-embed"><iframe width="100%" height="200" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        });

        // 處理一般 URL 連結（包括 YouTube 頻道連結）
        // 只處理不在 HTML 標籤內的 URL
        text = text.replace(/(?<!<[^>]*)(https?:\/\/[^\s<>"{}|\\^`[\]]+)(?![^<]*>)/g, function (match, url) {
            // 跳過已經處理的 YouTube 影片連結
            if (url.includes('youtube.com/watch?v=') || url.includes('youtu.be/')) {
                return match;
            }

            // 跳過已經在 HTML 標籤內的 URL
            const matchIndex = text.indexOf(match);
            const beforeMatch = text.substring(0, matchIndex);

            // 檢查是否在 HTML 標籤內
            const lastOpenTag = beforeMatch.lastIndexOf('<');
            const lastCloseTag = beforeMatch.lastIndexOf('>');

            // 如果最後一個標籤是開標籤且沒有閉標籤，表示在 HTML 標籤內
            if (lastOpenTag > lastCloseTag) {
                return match;
            }

            return `<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
        });

        // 最後才轉義剩餘的 HTML 字符，避免影響已處理的 HTML 標籤
        // 只轉義不在 HTML 標籤內的 < 和 > 字符
        text = text.replace(/(?<!<[^>]*)(<|>)(?![^<]*>)/g, function (match, char) {
            return char === '<' ? '&lt;' : '&gt;';
        });

        // 清理多餘的 <br> 標籤
        text = text.replace(/(<br>\s*){3,}/g, '<br><br>');

        // 清理段落開頭和結尾的多餘 <br>
        text = text.replace(/^(<br>\s*)+/g, '');
        text = text.replace(/(<br>\s*)+$/g, '');

        return text;
    }

    function addMessage(content, role, isError = false, knowledgeBases = []) {
        const messagesContainer = document.getElementById('messages');
        const messageDiv = document.createElement('div');

        if (isError) {
            messageDiv.className = 'ai-convai-error';
            messageDiv.textContent = content;
        } else {
            messageDiv.className = `ai-convai-message ${role}`;

            // 檢查是否包含 HTML 內容
            if (content.includes('ai-convai-contact-form')) {
                // 純 HTML 表單，直接設置
                messageDiv.innerHTML = content;
            } else if (content.includes('ai-convai-contact-confirm-buttons')) {
                // 包含按鍵的混合內容，需要分別處理 Markdown 和 HTML
                const buttonStartIndex = content.indexOf('<div class="ai-convai-contact-confirm-buttons">');
                const markdownPart = content.substring(0, buttonStartIndex);
                const htmlPart = content.substring(buttonStartIndex);

                // 先解析 Markdown 部分，再添加 HTML 部分
                messageDiv.innerHTML = parseMarkdown(markdownPart) + htmlPart;
            } else {
                // 純 Markdown 內容，正常解析
                messageDiv.innerHTML = parseMarkdown(content);
            }

            // 如果是 AI 回覆且有使用的知識庫，添加知識庫來源顯示
            if (role === 'assistant' && knowledgeBases && knowledgeBases.length > 0) {
                const knowledgeSourceDiv = document.createElement('div');
                knowledgeSourceDiv.className = 'ai-convai-knowledge-source';

                const sourceIcon = document.createElement('span');
                sourceIcon.className = 'ai-convai-source-icon';
                sourceIcon.textContent = '📚';

                const sourceText = document.createElement('span');
                sourceText.className = 'ai-convai-source-text';
                sourceText.textContent = `參考來源: ${knowledgeBases.map(kb => kb.title || kb.id).join(', ')}`;

                knowledgeSourceDiv.appendChild(sourceIcon);
                knowledgeSourceDiv.appendChild(sourceText);
                messageDiv.appendChild(knowledgeSourceDiv);
            }
        }

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 顯示載入動畫
    function showTyping() {
        const messagesContainer = document.getElementById('messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-convai-typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="ai-convai-typing-dot"></div>
            <div class="ai-convai-typing-dot"></div>
            <div class="ai-convai-typing-dot"></div>
        `;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 隱藏載入動畫
    function hideTyping() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    // 儲存訊息到 Firebase（包含用戶ID和人物誌資訊）
    async function saveMessage(content, role) {
        try {
            const database = await loadFirebaseSDK();
            const userId = getUserId();
            const sessionId = getSessionId();

            if (!currentConversation) {
                // 建立新對話，存儲在對應的 agent 中
                const conversationRef = database.ref(`agents/${currentAgentId}/conversations`).push();
                currentConversation = conversationRef.key;

                await conversationRef.set({
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    sessionId: sessionId,
                    userId: userId, // 添加用戶ID
                    messages: {}
                });
            }

            // 獲取當前用戶的人物誌
            const currentProfile = getLocalProfile(currentAgentId);

            // 新增訊息到對應的 agent 對話中
            const messageRef = database.ref(`agents/${currentAgentId}/conversations/${currentConversation}/messages`).push();
            await messageRef.set({
                role: role,
                content: content,
                timestamp: Date.now(),
                userId: userId, // 添加用戶ID
                profileSnapshot: currentProfile ? {
                    basic: currentProfile.basic || {},
                    contact: currentProfile.contact || {},
                    education: currentProfile.education || {},
                    career: currentProfile.career || {},
                    interests: currentProfile.interests || {},
                    personality: currentProfile.personality || {},
                    lifestyle: currentProfile.lifestyle || {}
                } : null // 添加人物誌快照
            });

            // 更新對話時間
            await database.ref(`agents/${currentAgentId}/conversations/${currentConversation}`).update({
                updatedAt: Date.now(),
                userId: userId,
                lastProfileUpdate: currentProfile ? Date.now() : null
            });
        } catch (error) {
            console.error('儲存訊息失敗:', error);
        }
    }

    // 載入代理資料（只載入公開資料，不包含敏感資訊）
    async function loadAgent(agentId, database) {
        try {
            console.log('正在載入代理:', agentId);

            // 只載入公開資料，不載入 llmConfig 等敏感資訊
            const [nameSnapshot, descriptionSnapshot, avatarSnapshot, knowledgeSnapshot] = await Promise.all([
                database.ref(`agents/${agentId}/name`).once('value'),
                database.ref(`agents/${agentId}/description`).once('value'),
                database.ref(`agents/${agentId}/avatarImageUrl`).once('value'),
                database.ref(`agents/${agentId}/knowledgeBases`).once('value')
            ]);

            const name = nameSnapshot.val();
            const description = descriptionSnapshot.val();
            const avatarImageUrl = avatarSnapshot.val();
            const knowledgeBases = knowledgeSnapshot.val();

            if (!name) {
                throw new Error('代理不存在或已被刪除');
            }

            // 只包含公開資料
            currentAgent = {
                name: name,
                description: description,
                avatarImageUrl: avatarImageUrl,
                knowledgeBases: knowledgeBases || []
            };

            console.log('代理資料載入成功（僅公開資料）:', {
                name: currentAgent.name,
                hasDescription: !!currentAgent.description,
                hasAvatar: !!currentAgent.avatarImageUrl,
                knowledgeBasesCount: currentAgent.knowledgeBases.length
            });

            return currentAgent;
        } catch (error) {
            console.error('載入代理失敗:', error);
            console.error('錯誤詳情:', {
                code: error.code,
                message: error.message,
                agentId: agentId
            });

            // 處理權限錯誤
            if (error.code === 'PERMISSION_DENIED') {
                throw new Error('無法存取代理資料，請檢查代理 ID 是否正確');
            }

            throw error;
        }
    }

    // 更新 Widget 顯示內容
    function updateWidgetDisplay() {
        if (!currentAgent) return;

        // 更新標題和頭像
        const headerTitle = document.querySelector('.ai-convai-header h3');
        if (headerTitle) {
            headerTitle.textContent = currentAgent.name;
        }

        // 更新頭像
        const headerAvatar = document.querySelector('.ai-convai-header-avatar');
        if (headerAvatar) {
            headerAvatar.src = currentAgent.avatarImageUrl || 'https://www.stu.edu.tw/images/stulogo500px.png';
            headerAvatar.alt = currentAgent.name;
        }

        // 更新歡迎訊息
        const welcomeMessage = document.querySelector('.welcome-message p');
        if (welcomeMessage) {
            // 優先使用 LINE Bot 的歡迎訊息
            let welcomeText = `🚀 嗨！我是${currentAgent.name}
想了解本系在 電競、設計、AI、數位內容與新媒體娛樂 領域嗎？
我可以針對你的需求，提供相關資訊，找出最適合你的選擇`;

            if (currentAgent.lineBot && currentAgent.lineBot.enabled && currentAgent.lineBot.settings && currentAgent.lineBot.settings.welcomeMessage) {
                welcomeText = currentAgent.lineBot.settings.welcomeMessage;
            }

            welcomeMessage.textContent = welcomeText;
        }

        // 更新頭像 alt 屬性
        const avatar = document.querySelector('.ai-convai-avatar');
        if (avatar) {
            avatar.alt = currentAgent.name;
        }
    }

    // 載入對話歷史
    async function loadConversationHistory(database) {
        try {
            if (!currentConversation) {
                // 如果沒有當前對話，使用現有的 conversationHistory
                console.log('使用現有對話歷史:', conversationHistory.length, '條訊息');
                return;
            }

            const messagesRef = database.ref(`agents/${currentAgentId}/conversations/${currentConversation}/messages`);
            const snapshot = await messagesRef.once('value');
            const messages = snapshot.val() || {};

            // 轉換為陣列並按時間排序
            conversationHistory = Object.values(messages)
                .sort((a, b) => a.timestamp - b.timestamp)
                .map(msg => ({
                    role: msg.role,
                    content: msg.content
                }));

            console.log('載入對話歷史:', conversationHistory.length, '條訊息');
        } catch (error) {
            console.error('載入對話歷史失敗:', error);
            // 發生錯誤時不清空現有的對話歷史
            console.log('保持現有對話歷史:', conversationHistory.length, '條訊息');
        }
    }

    // 添加動畫提示功能
    // 自動開啟聊天視窗（如果用戶沒有手動關閉過）
    function autoOpenChat() {
        // 檢查用戶是否手動關閉過
        if (isChatManuallyClosed()) {
            console.log('用戶之前手動關閉過聊天視窗，不自動開啟');
            return;
        }

        const currentWidget = document.querySelector('.ai-convai-widget');
        const chat = currentWidget ? currentWidget.querySelector('.ai-convai-chat') : null;

        if (!chat) {
            console.error('找不到聊天視窗元素，無法自動開啟');
            return;
        }

        // 檢查是否在測試環境
        if (isTestEnvironment()) {
            console.log('測試環境，不自動開啟');
            return;
        }

        // 檢查是否為手機端
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            console.log('手機端，不自動開啟對話框');
            return;
        }

        // 自動開啟聊天視窗
        if (!isOpen) {
            console.log('自動開啟聊天視窗');
            isOpen = true;
            chat.classList.add('open');

            // 延遲聚焦，確保元素完全顯示
            setTimeout(() => {
                const messageInput = currentWidget.querySelector('#messageInput');
                if (messageInput) {
                    messageInput.focus();
                    console.log('輸入框已聚焦');
                }
            }, 100);
        }
    }

    function addAnimationPrompt() {
        const widget = document.querySelector('.ai-convai-widget');
        if (!widget) return;

        // 檢查是否啟用動畫提示（預設啟用）
        const enablePrompt = widget.getAttribute('data-prompt') !== 'false';
        if (!enablePrompt) {
            console.log('動畫提示已禁用');
            return;
        }

        // 檢查是否已經有對話記錄，如果有則不顯示動畫提示
        // 註解掉此檢查，讓 widget 在所有路徑都自動開啟
        // const hasConversation = localStorage.getItem(`ai-convai-conversation-count-${currentAgentId}`);
        // if (hasConversation && parseInt(hasConversation) > 0) {
        //     console.log('已有對話記錄，跳過動畫提示');
        //     return;
        // }


        // 檢查是否在測試環境
        if (isTestEnvironment()) {
            console.log('測試環境，跳過動畫提示');
            return;
        }

        // 檢查是否為手機端
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            console.log('手機端，只顯示動畫提示，不自動開啟對話框');
            // 添加提示動畫類別
            widget.classList.add('ai-convai-prompt');

            // 5秒後移除動畫提示
            setTimeout(() => {
                widget.classList.remove('ai-convai-prompt');
                console.log('手機端動畫提示完成');
            }, 5000);
            return;
        }

        console.log('開始動畫提示');

        // 添加提示動畫類別
        widget.classList.add('ai-convai-prompt');

        // 5秒後移除動畫提示（不自動打開對話框）
        setTimeout(() => {
            widget.classList.remove('ai-convai-prompt');
            console.log('動畫提示完成');
        }, 5000);
    }

    // 初始化 widget
    async function initWidget(agentId, avatarImageUrl = null) {
        console.log('初始化 Widget，代理 ID:', agentId, '頭像:', avatarImageUrl);
        currentAgentId = agentId;

        try {
            // 檢查是否已經存在 Widget
            if (document.querySelector('.ai-convai-widget')) {
                console.log('Widget 已存在，跳過初始化');
                return;
            }

            // 清理舊格式的人物誌資料
            console.log('清理舊格式人物誌資料...');
            cleanupOldProfileData();

            console.log('載入 Firebase SDK...');
            // 載入 Firebase SDK（帶重試機制）
            let database;
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    database = await loadFirebaseSDK();
                    console.log('Firebase SDK 載入成功');
                    break;
                } catch (error) {
                    retryCount++;
                    console.warn(`Firebase SDK 載入失敗 (嘗試 ${retryCount}/${maxRetries}):`, error.message);

                    if (retryCount >= maxRetries) {
                        throw new Error(`Firebase SDK 載入失敗，已重試 ${maxRetries} 次: ${error.message}`);
                    }

                    // 等待一段時間後重試
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }

            // 載入動態人物誌系統
            if (!window.profileManager) {
                console.log('載入動態人物誌系統...');
                await loadProfileManager();
            }

            // 初始化快取管理
            console.log('初始化知識庫快取管理...');
            initializeCacheManagement();

            // 添加管理界面快捷鍵 (Ctrl+Shift+A)
            document.addEventListener('keydown', (event) => {
                if (event.ctrlKey && event.shiftKey && event.key === 'A') {
                    event.preventDefault();
                    showAdminPanel();
                }
            });

            // 建立樣式
            createStyles();

            // 建立 widget
            const widget = createWidget(agentId, avatarImageUrl);
            document.body.appendChild(widget);

            // 設定事件監聽器
            setupEventListeners();

            // 載入代理資料
            console.log('載入代理資料...');
            await loadAgent(agentId, database);

            // 收集和保存 session 統計資訊
            console.log('收集 session 統計資訊...');
            const sessionId = getSessionId();
            const deviceInfo = collectDeviceInfo();
            const locationInfo = await getLocationInfo();
            await saveSessionAnalytics(sessionId, agentId, deviceInfo, locationInfo);

            // 更新 Widget 標題和歡迎訊息
            updateWidgetDisplay();

            // 載入對話歷史
            await loadConversationHistory(database);

            // 添加動畫提示
            addAnimationPrompt();

            // 自動開啟聊天視窗（如果用戶沒有手動關閉過）
            setTimeout(() => {
                autoOpenChat();
            }, 500); // 延遲一點確保所有元素都已渲染

            // 定期清理知識庫緩存
            setInterval(cleanupKnowledgeCache, 300000); // 5分鐘清理一次

            console.log('AI 客服 widget 已載入');
        } catch (error) {
            console.error('載入 AI 客服失敗:', error);
            // 建立錯誤提示 widget
            createErrorWidget(agentId, error.message);
        }
    }

    // 設定事件監聽器
    function setupEventListeners() {
        // 延遲設定，確保 DOM 完全渲染
        setTimeout(() => {
            // 只為當前 Widget 設定事件監聽器
            const currentWidget = document.querySelector('.ai-convai-widget');
            if (!currentWidget) {
                console.error('找不到 Widget 元素');
                return;
            }

            const messageInput = currentWidget.querySelector('#messageInput');
            const sendButton = currentWidget.querySelector('.ai-convai-send');
            const toggleButton = currentWidget.querySelector('.ai-convai-button');
            const closeButton = currentWidget.querySelector('.ai-convai-close');
            const clearButton = currentWidget.querySelector('.ai-convai-clear');

            console.log('設定事件監聽器:', {
                messageInput: !!messageInput,
                sendButton: !!sendButton,
                toggleButton: !!toggleButton,
                closeButton: !!closeButton,
                clearButton: !!clearButton
            });

            if (messageInput) {
                messageInput.addEventListener('keypress', handleKeyPress);
                messageInput.addEventListener('click', handleInputClick);
                console.log('輸入框事件已設定');
            }

            if (sendButton) {
                sendButton.addEventListener('click', sendMessage);
                console.log('發送按鈕事件已設定');
            }

            if (toggleButton) {
                toggleButton.addEventListener('click', function (event) {
                    console.log('按鈕被點擊');
                    event.preventDefault();
                    event.stopPropagation();
                    toggleChat();
                });
                console.log('切換按鈕事件已設定');
            }

            if (closeButton) {
                closeButton.addEventListener('click', toggleChat);
                console.log('關閉按鈕事件已設定');
            }

            if (clearButton) {
                clearButton.addEventListener('click', clearConversation);
                console.log('清空按鈕事件已設定');
            }

            // 手機端手勢支援
            const chat = currentWidget.querySelector('.ai-convai-chat');
            if (chat && window.innerWidth <= 768) {
                let startY = 0;
                let currentY = 0;
                let isDragging = false;

                // 觸控開始
                chat.addEventListener('touchstart', (e) => {
                    startY = e.touches[0].clientY;
                    isDragging = true;
                }, { passive: true });

                // 觸控移動
                chat.addEventListener('touchmove', (e) => {
                    if (isDragging) {
                        currentY = e.touches[0].clientY;
                        const deltaY = currentY - startY;

                        // 只允許向下拖拽
                        if (deltaY > 0) {
                            chat.style.transform = `translateY(${Math.min(deltaY, 100)}px)`;
                        }
                    }
                }, { passive: true });

                // 觸控結束
                chat.addEventListener('touchend', (e) => {
                    if (isDragging) {
                        const deltaY = currentY - startY;

                        // 如果向下拖拽超過 100px，關閉對話框
                        if (deltaY > 100) {
                            toggleChat();
                        } else {
                            // 否則回到原位
                            chat.style.transform = 'translateY(0)';
                        }

                        isDragging = false;
                        chat.style.transform = '';
                    }
                }, { passive: true });

                console.log('手機端手勢支援已設定');
            }

            // 監聽視窗大小變化，重新設定手勢支援和動畫提示
            window.addEventListener('resize', () => {
                const chat = currentWidget.querySelector('.ai-convai-chat');
                if (chat) {
                    // 移除舊的手勢監聽器
                    chat.removeEventListener('touchstart', () => { });
                    chat.removeEventListener('touchmove', () => { });
                    chat.removeEventListener('touchend', () => { });

                    // 重新設定手勢支援
                    if (window.innerWidth <= 768) {
                        let startY = 0;
                        let currentY = 0;
                        let isDragging = false;

                        chat.addEventListener('touchstart', (e) => {
                            startY = e.touches[0].clientY;
                            isDragging = true;
                        }, { passive: true });

                        chat.addEventListener('touchmove', (e) => {
                            if (isDragging) {
                                currentY = e.touches[0].clientY;
                                const deltaY = currentY - startY;

                                if (deltaY > 0) {
                                    chat.style.transform = `translateY(${Math.min(deltaY, 100)}px)`;
                                }
                            }
                        }, { passive: true });

                        chat.addEventListener('touchend', (e) => {
                            if (isDragging) {
                                const deltaY = currentY - startY;

                                if (deltaY > 100) {
                                    toggleChat();
                                } else {
                                    chat.style.transform = 'translateY(0)';
                                }

                                isDragging = false;
                                chat.style.transform = '';
                            }
                        }, { passive: true });
                    }
                }

                // 檢查是否需要重新處理動畫提示
                const widget = document.querySelector('.ai-convai-widget');
                if (widget && widget.classList.contains('ai-convai-prompt')) {
                    const isMobile = window.innerWidth <= 768;
                    if (isMobile) {
                        console.log('螢幕旋轉到手機端，保持動畫提示但不自動開啟');
                    } else {
                        console.log('螢幕旋轉到桌面端，恢復自動開啟功能');
                    }
                }
            });

        }, 500);
    }

    // 處理輸入框點擊事件
    function handleInputClick(event) {
        event.stopPropagation();
        event.target.focus();
    }

    // 清空對話
    function clearConversation() {
        if (confirm('確定要清空對話歷史嗎？')) {
            // 清空對話歷史
            conversationHistory = [];

            // 清空聊天視窗
            const messagesContainer = document.getElementById('messages');
            const agentName = currentAgent ? currentAgent.name : 'AI 客服';

            // 優先使用 LINE Bot 的歡迎訊息
            let welcomeText = `👋 您好！我是 ${agentName}，請輸入您的問題開始對話。`;
            if (currentAgent && currentAgent.lineBot && currentAgent.lineBot.enabled && currentAgent.lineBot.settings && currentAgent.lineBot.settings.welcomeMessage) {
                welcomeText = currentAgent.lineBot.settings.welcomeMessage;
            }

            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <p>${welcomeText}</p>
                </div>
            `;

            // 重置對話 ID
            currentConversation = null;

            // 重置當前代理的對話輪數和介紹狀態
            if (currentAgentId) {
                try {
                    // 重置對話輪數
                    const data = localStorage.getItem(STORAGE_KEYS.CONVERSATION_COUNT);
                    const counts = data ? JSON.parse(data) : {};
                    counts[currentAgentId] = 0;
                    localStorage.setItem(STORAGE_KEYS.CONVERSATION_COUNT, JSON.stringify(counts));

                    // 重置介紹狀態
                    const introData = localStorage.getItem(STORAGE_KEYS.AGENT_INTRODUCTIONS);
                    const introductions = introData ? JSON.parse(introData) : {};
                    introductions[currentAgentId] = false;
                    localStorage.setItem(STORAGE_KEYS.AGENT_INTRODUCTIONS, JSON.stringify(introductions));

                    console.log('代理對話狀態已重置');
                } catch (error) {
                    console.error('重置代理狀態失敗:', error);
                }
            }

            console.log('對話已清空');
        }
    }

    // 將函數暴露到全域作用域
    window.toggleChat = toggleChat;
    window.handleKeyPress = handleKeyPress;
    window.sendMessage = sendMessage;
    window.clearConversation = clearConversation;
    window.getTokenStats = () => tokenUsageStats;
    window.resetTokenStats = () => {
        tokenUsageStats = { totalRequests: 0, totalTokens: 0, averageTokensPerRequest: 0 };
        console.log('Token 統計已重置');
    };

    // 對話管理相關的全域函數
    window.getConversationStats = (agentId) => {
        return {
            conversationCount: getConversationCount(agentId || currentAgentId),
            hasBeenIntroduced: hasAgentBeenIntroduced(agentId || currentAgentId),
            isNewAgent: isNewAgent(agentId || currentAgentId)
        };
    };

    window.resetAgentStats = (agentId) => {
        const targetAgentId = agentId || currentAgentId;
        if (!targetAgentId) {
            console.error('請提供代理 ID');
            return;
        }

        try {
            // 重置對話輪數
            const data = localStorage.getItem(STORAGE_KEYS.CONVERSATION_COUNT);
            const counts = data ? JSON.parse(data) : {};
            counts[targetAgentId] = 0;
            localStorage.setItem(STORAGE_KEYS.CONVERSATION_COUNT, JSON.stringify(counts));

            // 重置介紹狀態
            const introData = localStorage.getItem(STORAGE_KEYS.AGENT_INTRODUCTIONS);
            const introductions = introData ? JSON.parse(introData) : {};
            introductions[targetAgentId] = false;
            localStorage.setItem(STORAGE_KEYS.AGENT_INTRODUCTIONS, JSON.stringify(introductions));

            console.log(`代理 ${targetAgentId} 的統計已重置`);
        } catch (error) {
            console.error('重置代理統計失敗:', error);
        }
    };

    window.clearAllAgentStats = () => {
        try {
            localStorage.removeItem(STORAGE_KEYS.CONVERSATION_COUNT);
            localStorage.removeItem(STORAGE_KEYS.AGENT_INTRODUCTIONS);
            localStorage.removeItem(STORAGE_KEYS.LAST_AGENT_ID);
            console.log('所有代理統計已清空');
        } catch (error) {
            console.error('清空所有統計失敗:', error);
        }
    };


    // 人物誌管理相關的全域函數（僅供管理後台使用）
    window.getProfileSummary = (agentId) => {
        return window.profileManager ? window.profileManager.getProfileSummary(agentId) : null;
    };
    window.generateProfileDescription = (agentId) => {
        return window.profileManager ? window.profileManager.generateProfileDescription(agentId) : null;
    };

    // 本地人物誌管理函數
    window.getLocalProfile = getLocalProfile;
    window.updateLocalProfile = updateLocalProfile;
    window.hasProfileChanged = hasProfileChanged;

    // Session 人物誌管理函數
    window.getSessionId = getSessionId;
    window.getSessionProfile = getSessionProfile;
    window.updateSessionProfile = updateSessionProfile;

    // 建議問題管理函數
    window.displaySuggestions = displaySuggestions;
    window.hideSuggestions = hideSuggestions;

    // 調試函數：查看本地人物誌狀態
    window.showLocalProfileStatus = () => {
        if (!currentAgentId) {
            console.log('未載入代理');
            return;
        }

        const localProfile = getLocalProfile(currentAgentId);
        if (localProfile) {
            console.log('本地人物誌狀態:', {
                agentId: currentAgentId,
                profile: localProfile,
                lastUpdated: new Date(localProfile.metadata?.lastUpdated || 0).toLocaleString(),
                confidence: localProfile.metadata?.confidence || 0,
                totalInteractions: localProfile.metadata?.totalInteractions || 0
            });
        } else {
            console.log('本地無人物誌資料');
        }
    };

    // 調試函數：查看 session 人物誌狀態
    window.showSessionProfileStatus = () => {
        if (!currentAgentId) {
            console.log('未載入代理');
            return;
        }

        const sessionId = getSessionId();
        const sessionProfile = getSessionProfile();
        if (sessionProfile) {
            console.log('Session 人物誌狀態:', {
                sessionId: sessionId,
                agentId: currentAgentId,
                profile: sessionProfile,
                lastUpdated: new Date(sessionProfile.metadata?.lastUpdated || 0).toLocaleString(),
                confidence: sessionProfile.metadata?.confidence || 0,
                totalInteractions: sessionProfile.metadata?.totalInteractions || 0
            });
        } else {
            console.log('Session 無人物誌資料 (Session ID:', sessionId, ')');
        }
    };
    window.checkProfileManager = () => {
        if (window.profileManager) {
            console.log('人物誌管理器已載入');
            return true;
        } else {
            console.log('人物誌管理器未載入');
            return false;
        }
    };
    window.reloadProfileManager = loadProfileManager;

    // 自動存儲管理相關的全域函數
    window.checkAndUpdateProfileToDatabase = checkAndUpdateProfileToDatabase;
    window.shouldUpdateProfileToDatabase = shouldUpdateProfileToDatabase;

    // 自動初始化所有 ai-convai 元素
    function initializeWidgets() {
        console.log('開始初始化 Widget...');

        // 檢查是否已經有 Widget 存在
        if (document.querySelector('.ai-convai-widget')) {
            console.log('Widget 已存在，跳過初始化');
            return;
        }

        const elements = document.querySelectorAll('ai-convai');
        console.log(`找到 ${elements.length} 個 ai-convai 元素`);

        // 只處理第一個元素，避免重複初始化
        if (elements.length > 0) {
            const element = elements[0];
            const agentId = element.getAttribute('agent-id');
            const avatarImageUrl = element.getAttribute('avatar-image-url');

            console.log('準備初始化 Widget:', { agentId, avatarImageUrl });

            if (agentId) {
                // 添加小延遲確保頁面完全載入
                setTimeout(() => {
                    initWidget(agentId, avatarImageUrl);
                }, 100);
            } else {
                console.error('未找到 agent-id 屬性');
            }
        } else {
            console.log('未找到 ai-convai 元素');
        }
    }

    // 智能初始化：根據頁面狀態選擇最佳時機
    function smartInitialize() {
        if (document.readyState === 'loading') {
            console.log('頁面正在載入，等待 DOMContentLoaded 事件');
            document.addEventListener('DOMContentLoaded', () => {
                // 額外延遲確保所有腳本載入完成
                setTimeout(initializeWidgets, 200);
            });
        } else if (document.readyState === 'interactive') {
            console.log('頁面 DOM 已載入，等待額外時間後初始化');
            setTimeout(initializeWidgets, 300);
        } else {
            console.log('頁面已完全載入，立即初始化');
            setTimeout(initializeWidgets, 100);
        }
    }

    // 開始智能初始化
    smartInitialize();
})();
