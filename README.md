# AI Agent 與 RAG 系客服系統

一個基於 Firebase 的智能客服系統，支援多種 LLM 提供商，可輕鬆嵌入任何網站。具備先進的 AI 意圖分析、動態知識庫管理、智能人物誌系統、YouTube 內嵌播放、LINE Bot 整合等企業級功能。

## 🚀 功能特色

### 核心功能
- 🤖 **多代理管理**：建立多個專業客服代理，每個都有獨特的知識庫和 System Prompt
- 🔗 **輕鬆嵌入**：一行代碼即可在任何網站上添加 AI 客服功能
- ⚡ **多 LLM 支援**：支援 OpenAI、Google Gemini (Flash Lite) 和自訂 API
- 📱 **響應式設計**：完美適配桌面和行動裝置，手機端全螢幕體驗
- 🎨 **自訂樣式**：可自訂外觀以符合品牌風格
- 🔐 **Google 登入**：使用 Google 帳號安全登入管理後台

### 進階功能
- 🧠 **AI 意圖分析**：使用 AI 分析用戶問題意圖，智能匹配最相關的知識庫
- 🔑 **AI 關鍵字生成**：自動為知識庫生成關鍵字，提升匹配精度
- 💬 **多知識庫支援**：每個代理可擁有多份知識庫，支援從對話內容建立新知識庫
- 🎯 **自訂頭像**：支援自訂代理頭像圖片
- 🔄 **智能重試**：自動處理 API 錯誤和網路問題，提供更穩定的服務
- 📝 **Markdown 支援**：支援 Markdown 格式的對話內容顯示
- 🧹 **對話管理**：支援清空對話歷史和上下文管理
- 👤 **動態人物誌**：自動建立和更新用戶人物檔案，包含基本資訊、聯絡方式、教育背景等
- 📊 **人物誌分析**：管理後台提供完整的人物誌分析和管理功能
- 🎬 **動畫提示**：智能動畫提示功能，桌面端自動開啟，手機端僅顯示提示
- 📱 **手機優化**：手機端全螢幕對話框，支援滑動關閉手勢
- 🎥 **YouTube 內嵌**：自動識別 YouTube 連結並內嵌為播放器
- 📊 **儀表板統計**：完整的數據統計和分析功能
- 🔢 **Token 使用統計**：自動追蹤和統計 LLM Token 使用量，支援每日和總計統計
- 🔔 **通知管理**：智能通知系統，包括知識庫補全和聯絡資訊收集
- 📱 **LINE Bot 整合**：支援 LINE Bot 功能，可為每個代理設定獨立的 LINE Bot

## 🏗️ 系統架構

### 後端/資料儲存
- **Firebase Hosting**：部署前端 HTML5
- **Firebase Realtime Database**：儲存代理配置、知識庫、對話歷史、人物誌資料、通知、Token 使用統計
- **Firebase Authentication**：Google 登入認證
- **Firebase Functions**：處理 LINE Bot Webhook 和後端邏輯

### 前端功能
- **管理後台**：建立和管理 AI 代理，包含人物誌分析、通知管理功能
- **嵌入 Widget**：可嵌入任意網頁的對話組件
- **即時聊天**：支援即時對話和歷史記錄
- **動態人物誌系統**：自動分析對話內容，建立用戶檔案
- **YouTube 內嵌播放**：自動識別並內嵌 YouTube 影片
- **LINE Bot 測試**：測試 LINE Bot 功能和訊息處理

### LLM 支援
- **OpenAI API**：使用 GPT 模型
- **Google Gemini API**：使用 Gemini Flash Lite 模型
- **自訂 API**：支援自訂 LLM 端點

## 🚀 快速開始

### 1. 部署到 Firebase

```bash
# 安裝 Firebase CLI
npm install -g firebase-tools

# 登入 Firebase
firebase login

# 初始化專案
firebase init

# 部署
firebase deploy
```

### 2. 設定 Firebase 配置

在 `public/admin.js` 和 `public/ai-convai-widget-standalone.js` 中更新 Firebase 配置：

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

### 3. 部署 Firebase Functions（LINE Bot 功能）

```bash
# 進入 functions 目錄
cd functions

# 安裝依賴
npm install

# 部署 Functions
firebase deploy --only functions
```

### 4. 登入管理後台

1. 前往登入頁面：`https://your-domain.web.app/login`
2. 使用 Google 帳號登入
3. 登入成功後會自動跳轉到管理後台

### 5. 建立第一個代理

1. 在管理後台點擊「建立代理」
2. 填寫代理資訊：
   - 代理名稱
   - System Prompt（代理的行為描述和角色設定）
   - 知識庫內容（支援多份知識庫）
   - LLM 提供商和 API Key
   - 自訂頭像圖片（可選）
3. 儲存代理

### 6. 設定 LINE Bot（可選）

如需使用 LINE Bot 功能：

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立新的 Provider 和 Channel
3. 記錄 Channel ID、Channel Secret 和 Access Token
4. 在管理後台為代理啟用 LINE Bot 功能
5. 設定 Webhook URL：`https://your-project-id.cloudfunctions.net/lineWebhook?agentId=YOUR_AGENT_ID`

### 7. 嵌入到網站

複製生成的嵌入代碼到您的網站：

```html
<!-- 基本使用 -->
<ai-convai agent-id="YOUR_AGENT_ID"></ai-convai>
<script src="https://your-domain.web.app/ai-convai-widget-standalone.js" async type="text/javascript"></script>

<!-- 帶自訂頭像 -->
<ai-convai agent-id="YOUR_AGENT_ID" avatar-image-url="https://example.com/avatar.jpg"></ai-convai>
<script src="https://your-domain.web.app/ai-convai-widget-standalone.js" async type="text/javascript"></script>

<!-- 禁用動畫提示 -->
<ai-convai agent-id="YOUR_AGENT_ID" data-prompt="false"></ai-convai>
<script src="https://your-domain.web.app/ai-convai-widget-standalone.js" async type="text/javascript"></script>
```

## 📖 使用指南

### 管理後台功能

#### 儀表板
- **統計概覽**：查看總代理數、總對話數、總通知數
- **對話統計**：今天、昨天、前天的對話數量
- **Token 統計**：總 Token 使用量、今日 Token 使用量、總請求數
- **通知統計**：待處理通知、知識庫補全通知
- **快速操作**：快速導航到各功能模組
- **系統狀態**：系統運行狀態、數據庫連接、最後更新時間

#### 代理管理
- 建立新代理
- 編輯現有代理
- 刪除代理
- 複製嵌入代碼
- **測試代理效果**：即時測試 AI 代理的回應

#### 代理設定
- **基本資訊**：名稱、System Prompt
- **知識庫管理**：多份知識庫支援，AI 自動生成關鍵字
- **LLM 配置**：選擇提供商和設定 API Key
- **自訂頭像**：上傳代理頭像圖片

#### 知識庫管理
- **多知識庫支援**：每個代理可擁有多份知識庫
- **AI 關鍵字生成**：自動為知識庫生成相關關鍵字
- **手動關鍵字管理**：支援手動添加和刪除關鍵字
- **從對話匯入**：可從對話內容建立新知識庫
- **智能匹配**：基於 AI 意圖分析和關鍵字匹配選擇最相關的知識庫

#### 人物誌分析
- **查看人物誌**：查看所有用戶的人物誌資料
- **對話記錄**：查看對應 session 的完整對話記錄
- **人物誌詳情**：包含基本資訊、聯絡方式、教育背景、職業資訊等
- **管理功能**：刪除人物誌、重新整理資料
- **自動載入**：選擇代理後自動載入人物誌資料

#### 通知管理
- **通知列表**：查看所有系統通知
- **通知分類**：知識庫補全、聯絡資訊收集等
- **狀態管理**：標記為已讀/未讀、完成/待處理
- **通知詳情**：查看詳細的通知內容和相關資訊
- **自動載入**：選擇代理後自動載入通知資料

#### 代理測試
- **即時對話**：與 AI 代理進行真實對話測試
- **多 LLM 支援**：測試不同 LLM 提供商的效果
- **知識庫驗證**：確認代理是否正確使用知識庫
- **回應品質評估**：評估 AI 回應的準確性和有用性

#### LINE Bot 管理
- **啟用 LINE Bot**：為代理啟用 LINE Bot 功能
- **LINE Bot 設定**：設定 Channel ID、Secret 和 Access Token
- **Webhook 配置**：自動生成 Webhook URL
- **LINE Bot 測試**：使用測試頁面模擬 LINE Bot 訊息
- **多代理支援**：每個代理可設定獨立的 LINE Bot

### 嵌入 Widget

#### 基本嵌入
```html
<ai-convai agent-id="agent_123456"></ai-convai>
<script src="https://your-domain.web.app/ai-convai-widget-standalone.js" async type="text/javascript"></script>
```

#### 帶自訂頭像
```html
<ai-convai agent-id="agent_123456" avatar-image-url="https://example.com/avatar.jpg"></ai-convai>
<script src="https://your-domain.web.app/ai-convai-widget-standalone.js" async type="text/javascript"></script>
```

#### 禁用動畫提示
```html
<ai-convai agent-id="agent_123456" data-prompt="false"></ai-convai>
<script src="https://your-domain.web.app/ai-convai-widget-standalone.js" async type="text/javascript"></script>
```

#### Widget 技術特色

**自包含設計**：
- 自動載入 Firebase SDK，無需額外依賴
- 獨立運行，不與宿主網站衝突
- 支援跨域嵌入

**智能功能**：
- AI 意圖分析：分析用戶問題意圖，提取關鍵字
- 智能知識庫選擇：基於 AI 分析結果選擇最相關的知識庫
- 動態人物誌：自動建立和更新用戶檔案
- 智能引導：AI 在適當時機引導用戶提供個人資訊

**YouTube 內嵌播放**：
- 自動識別 YouTube 影片連結
- 支援多種 YouTube 連結格式
- 響應式內嵌播放器
- 智能跳過頻道連結，避免重複處理

**動畫提示**：
- 桌面端：3秒後自動開啟對話框
- 手機端：僅顯示動畫提示，不自動開啟
- 可透過 `data-prompt="false"` 禁用

**智能錯誤處理**：
- 自動重試機制（503 錯誤、網路問題）
- 詳細的錯誤訊息和狀態回饋
- 優雅的降級處理

**對話管理**：
- 自動載入對話歷史
- 支援清空對話功能
- 上下文感知的 AI 回應
- 對話次數管理，避免重複介紹

**Markdown 支援**：
- 支援標題、列表、代碼塊
- 自動連結識別
- 安全的 HTML 渲染
- YouTube 影片內嵌

**手機端優化**：
- 全螢幕對話框
- 滑動關閉手勢
- 響應式設計
- 觸控優化

#### 自訂樣式
可以透過 CSS 自訂 widget 外觀：

```css
.ai-convai-button {
    background: linear-gradient(135deg, #your-color1, #your-color2);
    width: 70px;
    height: 60px;
}

.ai-convai-chat {
    border-radius: 15px;
    width: 380px;
    height: 520px;
}

/* 自訂訊息樣式 */
.ai-convai-message.user {
    background: #your-brand-color;
}

.ai-convai-message.assistant {
    background: #your-assistant-color;
}

/* YouTube 內嵌樣式 */
.ai-convai-youtube-embed {
    margin: 12px 0;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 手機端樣式 */
@media (max-width: 768px) {
    .ai-convai-chat {
        width: 100vw;
        height: 100vh;
        border-radius: 0;
    }
    
    .ai-convai-youtube-embed iframe {
        height: 180px;
    }
}
```

## 🧠 RAG (檢索增強生成) 詳細實現

### RAG 架構概述

本系統採用先進的 RAG 架構，結合 AI 意圖分析、智能知識庫檢索和上下文感知生成，提供精準的客服回應。

### 🔍 檢索階段 (Retrieval)

#### 1. AI 意圖分析
```javascript
// 分析用戶問題意圖，提取關鍵字
async function analyzeUserIntent(message, apiKey, llmProvider) {
    const prompt = `請分析以下用戶問題的意圖，提取相關的關鍵字用於知識庫匹配：
    
對話上下文：${recentHistory}
當前用戶問題：${message}

請考慮對話上下文，提取相關的關鍵字，包括：
1. 當前問題的關鍵字
2. 對話上下文中提到的相關概念
3. 可能的查詢詞
4. 中英文關鍵字

直接返回 JSON 陣列格式：
["關鍵字1", "關鍵字2", "keyword3", "關鍵字4"]`;
}
```

#### 2. 多層次知識庫檢索

**第一層：預載入相關知識庫**
```javascript
// 從 Firebase 預載入可能相關的知識庫
async function preloadRelevantKnowledge(message, database) {
    // 基於訊息內容快速篩選
    // 使用標題和關鍵字進行初步匹配
}
```

**第二層：AI 關鍵字智能匹配**
```javascript
// 使用 AI 分析的關鍵字進行精準匹配
function selectRelevantKnowledge(message, knowledgeBases, aiKeywords) {
    // 計算相關性分數
    const scoredKBs = knowledgeBases.map(kb => {
        let score = 0;
        
        // AI 關鍵字匹配（最高優先級）
        if (aiKeywords && aiKeywords.length > 0) {
            aiKeywords.forEach(aiKeyword => {
                if (titleLower.includes(aiKeywordLower)) {
                    score += 6; // AI 關鍵字在標題中權重最高
                }
                if (contentLower.includes(aiKeywordLower)) {
                    score += 5; // AI 關鍵字在內容中權重很高
                }
            });
        }
        
        // 知識庫關鍵字匹配
        if (kb.keywords && Array.isArray(kb.keywords)) {
            kb.keywords.forEach(keyword => {
                if (messageLower.includes(keywordLower)) {
                    score += 4; // 關鍵字匹配權重很高
                }
            });
        }
        
        return { kb, score };
    });
}
```

**第三層：智能過濾和排序**
```javascript
// 基於相關性分數和對話歷史的智能過濾
async function filterRelevantKnowledgeBases(knowledgeBases, message, conversationHistory, aiKeywords) {
    const scoredKBs = knowledgeBases.map(kb => {
        let score = 0;
        
        // 標題匹配權重最高
        if (titleLower.includes(messageLower)) {
            score += 10;
        }
        
        // AI 關鍵字匹配（新增）
        if (aiKeywords && Array.isArray(aiKeywords)) {
            aiKeywords.forEach(aiKeyword => {
                if (titleLower.includes(aiKeywordLower)) {
                    score += 12; // AI 關鍵字匹配權重更高
                }
            });
        }
        
        // 基於對話歷史的權重調整
        const hasRecentRelevance = recentMessages.some(msg => {
            // 檢查對話歷史中是否有與知識庫相關的內容
            return checkRelevanceWithHistory(msg, kb);
        });
        
        if (hasRecentRelevance) {
            score += 5; // 提高對話歷史相關性的權重
        }
        
        return { kb, score };
    });
}
```

### 🎯 關鍵字權重系統

#### 權重映射表（教育服務型 AI 優化版）
```javascript
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
```

#### 分數計算邏輯
```javascript
// 標題匹配權重更高
if (titleLower.includes(messageLower)) {
    score += 5;
}

// 內容匹配
if (contentLower.includes(messageLower)) {
    score += 3;
}

// AI 關鍵字匹配（最高優先級）
if (aiKeywords && aiKeywords.length > 0) {
    aiKeywords.forEach(aiKeyword => {
        if (titleLower.includes(aiKeywordLower)) {
            score += 6; // AI 關鍵字在標題中權重最高
        }
        if (contentLower.includes(aiKeywordLower)) {
            score += 5; // AI 關鍵字在內容中權重很高
        }
    });
}

// 知識庫關鍵字匹配
if (kb.keywords && Array.isArray(kb.keywords)) {
    kb.keywords.forEach(keyword => {
        if (messageLower.includes(keywordLower)) {
            score += 4; // 關鍵字匹配權重很高
        }
    });
}
```

### 🧠 生成階段 (Generation)

#### 1. 上下文構建
```javascript
// 構建完整的上下文提示
const systemPrompt = `${agentDescription}

相關知識庫：
${knowledgeContent}

對話歷史：
${conversationContext}

請基於以上知識庫內容回答用戶問題，如果知識庫中沒有相關資訊，請誠實告知並建議用戶聯繫客服。`;
```

#### 2. 智能知識庫選擇策略
```javascript
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
```

### 📊 性能優化

#### 1. 知識庫快取機制
```javascript
// localStorage 快取管理
const CACHE_PREFIX = 'ai_convai_kb_';
const CACHE_VERSION = '1.0';
const CACHE_EXPIRY_DAYS = 7; // 快取過期天數

// 從 localStorage 載入知識庫快取
function loadKnowledgeFromCache(kbId) {
    const cacheKey = getCacheKey(kbId);
    const cachedData = localStorage.getItem(cacheKey);
    
    if (cachedData) {
        const parsed = JSON.parse(cachedData);
        
        // 檢查是否過期
        if (isCacheExpired(parsed.timestamp)) {
            localStorage.removeItem(cacheKey);
            return null;
        }
        
        return parsed.data;
    }
    return null;
}
```

#### 2. 對話歷史優化
```javascript
// 優化對話歷史長度，避免 Token 超限
function optimizeConversationHistory(history, maxMessages = 10) {
    if (history.length <= maxMessages) {
        return history;
    }
    
    // 保留最近的訊息
    const recentHistory = history.slice(-maxMessages);
    return recentHistory;
}
```

### 🔄 RAG 流程圖

```
用戶問題
    ↓
AI 意圖分析 (analyzeUserIntent)
    ↓
提取關鍵字和意圖
    ↓
多層次知識庫檢索
    ├── 預載入相關知識庫 (preloadRelevantKnowledge)
    ├── AI 關鍵字智能匹配 (selectRelevantKnowledge)
    └── 智能過濾和排序 (filterRelevantKnowledgeBases)
    ↓
選擇最相關的知識庫 (最多3個)
    ↓
構建上下文提示
    ↓
LLM 生成回應
    ↓
返回給用戶
```

### 🎓 教育服務型 AI 優化

#### 教育場景關鍵字權重設計

本系統特別針對教育服務場景進行了優化，重新設計了關鍵字權重系統：

**核心教育服務 (權重: 4)**
- 報名、註冊、入學、招生相關
- 學費、費用、收費、學雜費相關
- 課程、科目、學科、課表相關
- 考試、測驗、成績、分數相關
- 畢業、學位、證書、文憑相關

**重要教育資訊 (權重: 3)**
- 申請、報考、入學考試相關
- 系所、科系、專業選擇相關
- 師資、老師、教授資訊相關
- 宿舍、住宿、生活設施相關
- 獎學金、助學金、補助相關
- 實習、就業、職涯發展相關
- 圖書館、實驗室、設備相關
- 社團、活動、課外活動相關

**一般教育服務 (權重: 2)**
- 時間、時程、日期相關
- 流程、步驟、程序相關
- 問題、疑問、困難相關
- 聯絡、聯繫、服務相關

**一般查詢 (權重: 1)**
- 資訊、資料、說明相關
- 幫助、協助、查詢相關

#### 教育場景 AI 意圖分析優化

```javascript
// 教育場景專用的 AI 意圖分析提示
const educationalPrompt = `請分析以下學生/家長問題的意圖，提取相關的教育關鍵字：

對話上下文：${recentHistory}
當前問題：${message}

請特別關注以下教育相關概念：
1. 入學申請相關：報名、註冊、入學、招生、申請
2. 學費相關：學費、費用、收費、價錢、學雜費
3. 課程相關：課程、科目、學科、課表、選課
4. 考試相關：考試、測驗、成績、分數、評量
5. 畢業相關：畢業、學位、證書、文憑
6. 生活相關：宿舍、住宿、社團、活動
7. 就業相關：實習、就業、工作、職涯

直接返回 JSON 陣列格式：
["關鍵字1", "關鍵字2", "education_keyword3", "關鍵字4"]`;
```

#### 教育知識庫結構建議

**入學申請知識庫**
- 報名流程、申請條件、所需文件
- 入學考試資訊、錄取標準
- 申請截止日期、重要時程

**學費相關知識庫**
- 學費標準、收費方式、繳費期限
- 獎學金申請、助學金資訊
- 退費政策、分期付款

**課程資訊知識庫**
- 科系介紹、課程規劃、選課系統
- 師資陣容、教學特色
- 實習機會、就業前景

**校園生活知識庫**
- 宿舍申請、住宿資訊
- 社團活動、校園設施
- 圖書館、實驗室使用

### 🎯 RAG 特色功能

#### 1. 智能知識庫補全
```javascript
// 如果沒有找到相關知識庫，建立空白記錄供維護人員補充
if (filteredKBs.length === 0 && message.trim().length > 3) {
    console.log('未找到相關知識庫，建立空白記錄供維護人員補充');
    await createEmptyKnowledgeBase(message, aiKeywords);
}
```

#### 2. 對話歷史感知
```javascript
// 基於對話歷史的權重調整
const hasRecentRelevance = recentMessages.some(msg => {
    // 檢查對話歷史中是否有與知識庫相關的內容
    return checkRelevanceWithHistory(msg, kb);
});

if (hasRecentRelevance) {
    score += 5; // 提高對話歷史相關性的權重
}
```

#### 3. 多語言關鍵字支援
- 支援中英文關鍵字匹配
- 智能處理嵌套關鍵字陣列
- 部分關鍵字匹配提高召回率

#### 4. 動態權重調整
- 基於對話歷史動態調整權重
- 考慮用戶意圖和上下文
- 智能過濾低相關性知識庫

### 📈 效能監控

#### 知識庫使用統計
```javascript
// 記錄知識庫使用統計
console.log('使用的知識庫:', allRelevantKBs.map(kb => kb.title));
console.log('AI 關鍵字匹配結果:', aiKeywords);
console.log('知識庫過濾結果:', {
    '原始數量': knowledgeBases.length,
    '過濾後數量': filteredKBs.length,
    '使用的知識庫': filteredKBs.map(kb => kb.title),
    '分數分佈': scoredKBs.map(item => ({ title: item.kb.title, score: item.score }))
});
```

## 📊 API 參考

### 代理資料結構

```javascript
{
  "agentId": {
    "name": "代理名稱",
    "description": "System Prompt - 代理的行為描述和角色設定",
    "avatarImageUrl": "https://example.com/avatar.jpg", // 可選：自訂頭像
    "knowledgeBases": [ // 多份知識庫支援
      {
        "id": "kb_001",
        "title": "產品資訊",
        "content": "產品相關知識內容...",
        "keywords": ["產品", "功能", "特色"], // AI 生成的關鍵字
        "aiGenerated": true // 標記是否為 AI 生成
      },
      {
        "id": "kb_002", 
        "title": "常見問題",
        "content": "FAQ 內容...",
        "keywords": ["FAQ", "問題", "解答"],
        "aiGenerated": true
      }
    ],
    "knowledgeBase": "舊格式知識庫內容", // 向後相容
    "llmConfig": {
      "provider": "openai|gemini|custom",
      "apiKey": "API_KEY",
      "customUrl": "自訂API_URL" // 僅custom時需要
    },
    "ownerId": "user_id", // 代理擁有者 ID
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
}
```

### 對話資料結構

```javascript
{
  "conversationId": {
    "agentId": "代理ID",
    "sessionId": "session_id", // 關聯到人物誌
    "messages": {
      "messageId": {
        "role": "user|assistant",
        "content": "訊息內容",
        "timestamp": 1234567890
      }
    },
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
}
```

### 人物誌資料結構

```javascript
{
  "profileId": {
    "sessionId": "session_id",
    "agentId": "代理ID",
    "profile": {
      "basic": {
        "name": "用戶姓名",
        "age": "年齡",
        "gender": "性別",
        "location": "居住地"
      },
      "contact": {
        "phone": "電話",
        "email": "電子郵件",
        "line": "LINE ID" // 新增 LINE 欄位
      },
      "education": {
        "school": "學校",
        "major": "科系",
        "examGroup": "考試類群" // 新增考試類群欄位
      },
      "career": {
        "job": "職業",
        "company": "公司",
        "industry": "行業"
      },
      "interests": {
        "hobbies": "興趣愛好"
      },
      "personality": {
        "traits": "性格特質"
      },
      "lifestyle": {
        "habits": "生活習慣"
      }
    },
    "suggestions": ["建議問題1", "建議問題2"], // AI 生成的建議問題
    "metadata": {
      "confidence": 8.5, // 信心度 (0-10)
      "totalInteractions": 15, // 總互動次數
      "lastUpdated": 1234567890 // 最後更新時間
    },
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
}
```

### 通知資料結構

```javascript
{
  "notificationId": {
    "title": "通知標題",
    "message": "通知內容",
    "type": "knowledge_base_needed|contact_info_collection|general",
    "status": "pending|completed",
    "priority": "high|medium|low",
    "agentId": "代理ID",
    "sessionId": "session_id", // 關聯到人物誌
    "knowledgeBaseId": "知識庫ID", // 知識庫相關通知
    "knowledgeBaseTitle": "知識庫標題",
    "keywords": ["關鍵字1", "關鍵字2"],
    "contactInfo": { // 聯絡資訊收集通知
      "name": "姓名",
      "phone": "電話",
      "email": "電子郵件",
      "preferredTime": "偏好時間"
    },
    "originalMessage": "原始用戶訊息",
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
}
```

### Token 使用統計資料結構

```javascript
{
  "agents": {
    "agentId": {
      "tokenStats": {
        "2025-01-03": { // 每日統計
          "totalTokens": 1500,
          "requestCount": 25,
          "lastUpdated": 1234567890
        },
        "2025-01-04": { // 另一天
          "totalTokens": 2000,
          "requestCount": 30,
          "lastUpdated": 1234567890
        },
        "total": { // 總計統計
          "totalTokens": 3500,
          "totalRequests": 55,
          "lastUpdated": 1234567890
        }
      }
    }
  }
}
```

## 🔧 技術規格

### Widget 技術規格

**檔案大小**：~60KB (gzipped)
**支援瀏覽器**：Chrome 60+, Firefox 55+, Safari 12+, Edge 79+
**依賴**：Firebase SDK 10.7.1 (自動載入)
**框架**：原生 JavaScript (ES6+)

**核心功能**：
- 自包含設計，無需額外依賴
- 自動 Firebase SDK 載入
- 智能錯誤處理和重試機制
- 支援多種 LLM 提供商
- Markdown 內容渲染
- YouTube 影片內嵌
- 響應式設計
- AI 意圖分析
- 動態人物誌系統

**API 支援**：
- OpenAI GPT-3.5-turbo
- Google Gemini Flash Lite
- 自訂 API 端點

**安全特性**：
- XSS 防護
- HTML 內容轉義
- 安全的 Firebase 規則
- API Key 加密傳輸

### 部署說明

#### Firebase Hosting 部署

1. 確保已安裝 Firebase CLI
2. 在專案根目錄執行：
   ```bash
   firebase deploy
   ```

#### 自訂域名

在 `firebase.json` 中設定自訂域名：

```json
{
  "hosting": {
    "public": "public",
    "site": "your-custom-domain"
  }
}
```

#### 環境變數設定

建議使用環境變數管理敏感資訊：

```bash
# Firebase 配置
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_domain
FIREBASE_DATABASE_URL=your_database_url
FIREBASE_PROJECT_ID=your_project_id

# API Keys
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
```

## 🔒 安全考量

### API Key 安全
- 建議使用環境變數儲存敏感資訊
- 定期輪換 API Key
- 限制 API Key 權限

### 資料庫安全
- 設定適當的 Firebase 安全規則
- 限制資料庫存取權限
- 定期備份重要資料

### 用戶隱私
- 人物誌資料加密儲存
- 支援 GDPR 合規
- 用戶可要求刪除個人資料

## 🛠️ 故障排除

### 常見問題

1. **Widget 無法載入**
   - 檢查 Firebase 配置是否正確
   - 確認網路連線正常
   - 查看瀏覽器控制台錯誤訊息
   - 確認 `agent-id` 屬性設定正確

2. **AI 回應錯誤**
   - 檢查 API Key 是否有效
   - 確認 LLM 提供商設定正確
   - 查看 API 使用額度
   - 檢查 System Prompt 設定是否正確

3. **對話歷史遺失**
   - 檢查 Firebase 資料庫連線
   - 確認資料庫規則設定正確
   - 檢查對話 ID 是否正確

4. **Widget 重複出現**
   - 確保頁面中只有一個 `<ai-convai>` 元素
   - 檢查是否重複載入腳本
   - 清除瀏覽器快取

5. **頭像圖片不顯示**
   - 確認圖片 URL 可正常存取
   - 檢查圖片格式是否支援（JPG、PNG、GIF）
   - 確認圖片尺寸比例為 1:1

6. **Markdown 格式不正確**
   - 檢查內容是否包含特殊字符
   - 確認 Markdown 語法是否正確
   - 查看是否有 HTML 標籤衝突

7. **人物誌功能異常**
   - 檢查 Firebase 資料庫連線
   - 確認人物誌管理器是否正確載入
   - 查看瀏覽器控制台錯誤訊息

8. **AI 關鍵字生成失敗**
   - 確認 LLM 提供商和 API Key 設定正確
   - 檢查知識庫內容是否足夠
   - 查看 API 使用額度

9. **YouTube 影片無法播放**
   - 檢查 YouTube 連結格式是否正確
   - 確認影片是否為公開狀態
   - 查看是否有網路連線問題

10. **通知功能異常**
    - 檢查 Firebase 資料庫連線
    - 確認通知權限設定正確
    - 查看瀏覽器控制台錯誤訊息

11. **LINE Bot 無法接收訊息**
    - 檢查 Firebase Functions 是否正確部署
    - 確認 Webhook URL 設定正確
    - 查看 Functions 日誌：`firebase functions:log`
    - 確認代理的 LINE Bot 設定是否正確

12. **LINE Bot 回應錯誤**
    - 檢查代理的 LLM 設定和 API Key
    - 確認 LINE Bot 憑證是否有效
    - 使用測試頁面模擬 LINE Bot 訊息
    - 查看 Functions 日誌中的錯誤訊息

### 除錯模式

在瀏覽器控制台中啟用除錯模式：

```javascript
localStorage.setItem('ai-convai-debug', 'true');
```

### Widget 除錯

檢查 Widget 狀態：

```javascript
// 檢查 Widget 是否已載入
console.log('Widget 元素:', document.querySelector('.ai-convai-widget'));

// 檢查代理資料
console.log('當前代理:', window.currentAgent);

// 檢查對話歷史
console.log('對話歷史:', window.conversationHistory);

// 檢查人物誌管理器
console.log('人物誌管理器:', window.profileManager);
```

### 性能優化

1. **減少重複初始化**
   - 確保頁面中只有一個 Widget
   - 避免重複載入腳本

2. **優化載入速度**
   - 使用 CDN 加速腳本載入
   - 預載入 Firebase SDK

3. **記憶體管理**
   - 定期清理對話歷史
   - 避免記憶體洩漏

4. **Token 優化**
   - 智能知識庫選擇減少 Token 使用
   - 優化對話歷史長度
   - 使用 AI 意圖分析提升匹配精度
   - 自動統計 Token 使用量，監控成本

## 🤝 貢獻指南

歡迎提交 Issue 和 Pull Request 來改善這個專案。

### 開發環境設定

1. 複製專案
2. 安裝依賴
3. 設定 Firebase 配置
4. 啟動開發伺服器

## 📄 授權

MIT License

## 📝 更新日誌

### v4.0.0 (最新版本)

**新增功能**：
- ✅ **YouTube 內嵌播放**：自動識別 YouTube 連結並內嵌為播放器
- ✅ **儀表板統計**：完整的數據統計和分析功能
- ✅ **Token 使用統計**：自動追蹤和統計 LLM Token 使用量，支援每日和總計統計
- ✅ **通知管理系統**：智能通知系統，包括知識庫補全和聯絡資訊收集
- ✅ **人物誌欄位擴展**：新增 LINE 聯絡方式和考試類群欄位
- ✅ **自動載入功能**：人物誌分析和通知管理自動載入資料
- ✅ **直接 DOM 操作**：刪除和更新操作直接操作 DOM，無需重新載入
- ✅ **現代化 UI**：玻璃質感設計，響應式佈局
- ✅ **智能跳過邏輯**：避免重複處理已轉換的連結
- ✅ **LINE Bot 整合**：支援 LINE Bot 功能，可為每個代理設定獨立的 LINE Bot
- ✅ **Firebase Functions**：後端處理 LINE Bot Webhook 和訊息

**技術改進**：
- 🔧 優化 YouTube 連結處理邏輯
- 🔧 改善 HTML 標籤檢測算法
- 🔧 增強人物誌系統穩定性
- 🔧 優化通知管理功能
- 🔧 改善錯誤處理和重試機制
- 🔧 優化儀表板統計功能
- 🔧 新增 Firebase Functions 支援
- 🔧 優化 LINE Bot Webhook 處理
- 🔧 新增 Token 使用統計功能
- 🔧 升級 Node.js 版本至 20
- 🔧 優化 Firebase Functions SDK

**向後相容**：
- 📦 保持舊格式知識庫支援
- 📦 維持現有 API 結構
- 📦 無需修改現有嵌入代碼

### v3.0.0

**新增功能**：
- ✅ **AI 意圖分析**：使用 AI 分析用戶問題意圖，智能匹配知識庫
- ✅ **AI 關鍵字生成**：自動為知識庫生成相關關鍵字
- ✅ **動態人物誌系統**：自動建立和更新用戶人物檔案
- ✅ **人物誌分析**：管理後台提供完整的人物誌分析功能
- ✅ **動畫提示功能**：智能動畫提示，桌面端自動開啟，手機端僅顯示
- ✅ **手機端優化**：全螢幕對話框，滑動關閉手勢
- ✅ **智能引導**：AI 在適當時機引導用戶提供個人資訊
- ✅ **多知識庫智能匹配**：基於 AI 分析結果選擇最相關的知識庫

**技術改進**：
- 🔧 優化 AI 意圖分析算法
- 🔧 改善知識庫匹配精度
- 🔧 增強人物誌系統穩定性
- 🔧 優化手機端用戶體驗
- 🔧 改善錯誤處理和重試機制

**向後相容**：
- 📦 保持舊格式知識庫支援
- 📦 維持現有 API 結構
- 📦 無需修改現有嵌入代碼

### v2.0.0

**新增功能**：
- ✅ 多知識庫支援：每個代理可擁有多份知識庫
- ✅ 自訂頭像：支援自訂代理頭像圖片
- ✅ 從對話建立知識庫：可從對話內容建立新知識庫
- ✅ Markdown 支援：完整的 Markdown 格式支援
- ✅ 智能重試機制：自動處理 API 錯誤和網路問題
- ✅ 對話管理：支援清空對話和上下文管理
- ✅ 優化的 UI：簡約專業的對話界面設計

**技術改進**：
- 🔧 修復重複初始化問題
- 🔧 優化 API 錯誤處理
- 🔧 改善對話排版和可讀性
- 🔧 增強安全性和 XSS 防護

### v1.0.0

**初始版本**：
- 基本代理管理功能
- 單一知識庫支援
- 基本 Widget 嵌入
- OpenAI 和 Gemini 支援

## 📞 支援

如有問題，請透過以下方式聯繫：

- 建立 GitHub Issue
- 發送郵件至支援信箱

---

**注意**：使用前請確保已正確設定 Firebase 專案和相關 API Key。