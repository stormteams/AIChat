const functions = require('firebase-functions');
const admin = require('firebase-admin');
const line = require('@line/bot-sdk');


// 初始化 Firebase Admin
admin.initializeApp();

const db = admin.database();

/**
 * LINE Bot Webhook 處理器
 * 接收 agentId 參數，找到對應的代理，並將訊息原封不動地回傳
 */
exports.lineWebhook = functions.https.onRequest(async (req, res) => {
  // 只處理 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 從 URL 參數獲取 agent ID
    const agentId = req.query.agentId;
    console.log('收到 agentId:', agentId);
    if (!agentId) {
      console.log('LINE Webhook: 缺少 agentId 參數');
      res.status(400).send('Missing agentId parameter');
      return;
    }

    // 從資料庫中查找對應的代理
    const agent = await getAgentConfig(agentId);
    if (!agent) {
      console.log('LINE Webhook: 找不到代理 ID:', agentId);
      res.status(404).send('Agent not found');
      return;
    }

    console.log('找到代理:', agent.name);

    const events = req.body.events;

    // 檢查 events 是否存在且為陣列
    if (!events || !Array.isArray(events)) {
      console.log('LINE Webhook: 無效的 events 資料', req.body);
      res.status(200).send('OK');
      return;
    }

    // 處理每個事件，使用智能知識庫比對算法
    for (const event of events) {
      await handleLineEventSimple(event, agent, agentId);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('LINE Webhook 處理錯誤:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * 智能事件處理 - 使用知識庫比對算法
 * @param {Object} event LINE 事件物件
 * @param {Object} agent 代理配置
 * @param {string} agentId 代理 ID
 */
async function handleLineEventSimple(event, agent, agentId) {
  try {
    console.log('處理事件類型:', event.type);
    // 處理不同類型的事件
    if (event.type === 'message') {
      await handleMessageEventSimple(event, agent, agentId);
    } else if (event.type === 'follow') {
      await handleFollowEventSimple(event, agent);
    } else if (event.type === 'postback') {
      await handlePostbackEventSimple(event, agent, agentId);
    } else {
      console.log('未處理的事件類型:', event.type);
    }
  } catch (error) {
    console.error('處理 LINE 事件錯誤:', error);
  }
}

/**
 * 簡化的訊息處理 - 使用智能知識庫比對算法
 * @param {Object} event LINE 訊息事件
 * @param {Object} agent 代理配置
 */
async function handleMessageEventSimple(event, agent, agentId) {
  const {replyToken, message} = event;

  console.log('收到用戶訊息:', message);

  // 檢查代理是否有 LINE Bot 配置
  if (!agent.lineBot || !agent.lineBot.enabled) {
    console.log('代理未啟用 LINE Bot');
    return;
  }

  // 建立 LINE 客戶端
  const client = new line.Client({
    channelAccessToken: agent.lineBot.accessToken,
  });

  // 智能處理文字訊息，使用 AI 和知識庫比對
  let replyMessage = '';

  if (message.type === 'text') {
    const userMessage = message.text;
    const userId = event.source.userId;
    console.log('LINE Bot 收到文字訊息:', userMessage, '用戶ID:', userId);

    try {
      // 檢查是否為查詢預約的訊息
      if (isAppointmentQuery(userMessage)) {
        console.log('檢測到查詢預約意圖');
        replyMessage = await handleAppointmentQuery(agentId, userId, userMessage);
      } else {
      // 記錄用戶互動統計
        await recordLineBotUserInteraction(agentId, userId, userMessage, 'text');

        // 載入對話歷史
        const conversationHistory = await loadLineBotConversationHistory(agentId, userId);

        // 使用統一的 AI 回應處理邏輯
        const result = await getUnifiedAIResponse(
          agentId, userMessage, agent.description || '', userId, 'linebot', conversationHistory);

        // 檢查是否為 Flex Message
        if (result.isFlexMessage) {
          // 直接使用 Flex Message，不需要處理格式
          replyMessage = result.response;
        } else {
          // 處理 LINE Bot 回應格式
          replyMessage = await processLineBotResponse(result.response, userMessage, result.aiKeywords);
        }

        // 記錄 AI 回應統計
        await recordLineBotAIResponse(agentId, userId, replyMessage, result);

        // 保存對話歷史
        await saveLineBotConversationHistory(agentId, userId, userMessage, replyMessage);

        // 人物誌處理已整合到統一函數中

        // 記錄知識庫匹配結果
        if (result.knowledgeBases && result.knowledgeBases.length > 0) {
          console.log(`LINE Bot 知識庫匹配成功: ${result.knowledgeBases.join(', ')}`);
        }
        if (result.aiKeywords && result.aiKeywords.length > 0) {
          console.log(`LINE Bot AI 關鍵字: ${result.aiKeywords.join(', ')}`);
        }
      }
    } catch (error) {
      console.error('LINE Bot AI 處理錯誤:', error);
      replyMessage = '抱歉，我現在無法處理您的訊息，請稍後再試。';

      // 記錄錯誤統計
      await recordLineBotError(agentId, userId, error.message);
    }
  } else if (message.type === 'image') {
    replyMessage = '感謝您分享圖片！不過我目前只能處理文字訊息，請用文字描述您的問題。';
  } else if (message.type === 'sticker') {
    replyMessage = '收到您的貼圖！😊 請用文字告訴我您需要什麼幫助。';
  } else if (message.type === 'location') {
    replyMessage = `感謝您分享位置資訊！請用文字告訴我您需要什麼幫助。`;
  } else {
    replyMessage = '感謝您的訊息！請用文字告訴我您需要什麼幫助。';
  }

  console.log('LINE Bot 回傳訊息:', replyMessage);

  // 回覆用戶
  if (typeof replyMessage === 'object' && replyMessage.type === 'flex') {
    // Flex Message
    await client.replyMessage(replyToken, replyMessage);
  } else {
    // 文字訊息
    await client.replyMessage(replyToken, {
      type: 'text',
      text: replyMessage,
    });
  }
}

/**
 * 處理 Postback 事件
 * @param {Object} event LINE Postback 事件
 * @param {Object} agent 代理配置
 * @param {string} agentId 代理 ID
 */
async function handlePostbackEventSimple(event, agent, agentId) {
  const {replyToken, postback} = event;
  const userId = event.source.userId;

  console.log('收到 Postback 事件:', postback);

  // 檢查代理是否有 LINE Bot 配置
  if (!agent.lineBot || !agent.lineBot.enabled) {
    console.log('代理未啟用 LINE Bot');
    return;
  }

  // 建立 LINE 客戶端
  const client = new line.Client({
    channelAccessToken: agent.lineBot.accessToken,
  });

  try {
    const data = postback.data;
    console.log('Postback 資料:', data);

    // 解析 postback 資料
    const params = new URLSearchParams(data);
    const action = params.get('action');

    console.log('Postback 動作:', action);

    let replyMessage = '';

    switch (action) {
    case 'confirm_appointment':
      replyMessage = await handleConfirmAppointment(agentId, userId, params);
      break;
    case 'modify_appointment':
      replyMessage = await handleModifyAppointment(agentId, userId, params);
      break;
    default:
      replyMessage = '抱歉，我不太理解您的操作，請重新嘗試。';
      break;
    }

    // 回覆用戶
    await client.replyMessage(replyToken, {
      type: 'text',
      text: replyMessage,
    });

    console.log('Postback 回應已發送:', replyMessage);
  } catch (error) {
    console.error('處理 Postback 事件錯誤:', error);

    // 發送錯誤訊息
    await client.replyMessage(replyToken, {
      type: 'text',
      text: '抱歉，處理您的請求時發生錯誤，請稍後再試。',
    });
  }
}

/**
 * 處理確認預約
 * @param {string} agentId 代理 ID
 * @param {string} userId 用戶 ID
 * @param {URLSearchParams} params 參數
 * @return {string} 回應訊息
 */
async function handleConfirmAppointment(agentId, userId, params) {
  try {
    console.log('=== 處理確認預約 ===');
    console.log('Agent ID:', agentId);
    console.log('User ID:', userId);

    // 直接從用戶 profile 中查找 'currentAppointment'
    const appointmentId = 'currentAppointment';
    const appointmentRef = db.ref(`agents/${agentId}/profiles/linebot_${userId}/appointments/${appointmentId}`);
    const snapshot = await appointmentRef.once('value');
    const appointment = snapshot.val();

    if (!appointment) {
      return '抱歉，找不到您的預約記錄。請重新預約。';
    }

    // 檢查是否為待確認狀態
    if (appointment.status !== 'pending') {
      return `您的預約狀態為 *${getStatusText(appointment.status)}*，無需再次確認。`;
    }

    // 使用統一狀態更新函數
    await updateAppointmentStatus(appointmentId, 'confirmed', agentId, userId, appointment.notificationId);

    console.log('✅ 預約已確認:', appointmentId);

    const confirmationMessage = [
      '✅ 預約已確認！',
      '',
      '📅 預約資訊：',
      `👤 姓名：${appointment.name}`,
      `📞 電話：${appointment.phone}`,
      `🕐 時間：${appointment.appointmentTime}`,
      '',
      '我們會盡快與您聯繫安排參訪時間。',
    ].join('\n');
    return confirmationMessage;
  } catch (error) {
    console.error('確認預約失敗:', error);
    return '抱歉，確認預約時發生錯誤，請稍後再試。';
  }
}

/**
 * 處理修改預約
 * @param {string} agentId 代理 ID
 * @param {string} userId 用戶 ID
 * @param {URLSearchParams} params 參數
 * @return {string} 回應訊息
 */
async function handleModifyAppointment(agentId, userId, params) {
  try {
    console.log('=== 處理修改預約 ===');
    console.log('Agent ID:', agentId);
    console.log('User ID:', userId);

    // 直接從用戶 profile 中查找 'currentAppointment'
    const appointmentId = 'currentAppointment';
    const appointmentRef = db.ref(`agents/${agentId}/profiles/linebot_${userId}/appointments/${appointmentId}`);
    const snapshot = await appointmentRef.once('value');
    const appointment = snapshot.val();

    if (!appointment) {
      return '抱歉，找不到您的預約記錄。請重新預約。';
    }

    // 使用統一狀態更新函數
    await updateAppointmentStatus(appointmentId, 'cancelled', agentId, userId, appointment.notificationId);

    console.log('✅ 預約已取消:', appointmentId);

    return `✅ 預約已取消！\n\n如需重新預約，請提供以下資訊：\n• 姓名\n• 電話\n• 希望參訪的時間\n\n請直接回覆訊息，例如：「我叫陳大大，電話是0912345678，想預約下週六下午參訪」`;
  } catch (error) {
    console.error('修改預約失敗:', error);
    return '抱歉，修改預約時發生錯誤，請稍後再試。';
  }
}

/**
 * 獲取代理配置
 * @param {string} agentId 代理 ID
 * @return {Object|null} 代理配置
 */
async function getAgentConfig(agentId) {
  const agentRef = db.ref(`agents/${agentId}`);
  const snapshot = await agentRef.once('value');
  return snapshot.val();
}


/**
 * 簡化的關注事件處理
 * @param {Object} event LINE 關注事件
 * @param {Object} agent 代理配置
 */
async function handleFollowEventSimple(event, agent) {
  console.log('用戶關注了代理:', agent.name);

  // 檢查代理是否有 LINE Bot 配置
  if (!agent.lineBot || !agent.lineBot.enabled) {
    console.log('代理未啟用 LINE Bot');
    return;
  }

  // 建立 LINE 客戶端
  const client = new line.Client({
    channelAccessToken: agent.lineBot.accessToken,
  });

  // 發送歡迎訊息
  const welcomeMessage = (agent.lineBot.settings && agent.lineBot.settings.welcomeMessage) || `歡迎使用 ${agent.name}！`;
  console.log('發送歡迎訊息:', welcomeMessage);

  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: welcomeMessage,
  });
}

/**
 * 安全的 LLM API 代理
 * 從資料庫讀取 API 金鑰，避免前端暴露
 */
exports.getAIResponse = functions.https.onCall(async (data, context) => {
  try {
    const {agentId, message, systemPrompt, userId = null, conversationHistory = []} = data;

    // 使用統一的 AI 回應處理邏輯
    const result = await getUnifiedAIResponse(agentId, message, systemPrompt, userId, 'widget', conversationHistory);
    return result;
  } catch (error) {
    console.error('統一 LLM API 錯誤:', error);
    throw new functions.https.HttpsError('internal', 'LLM API 呼叫失敗');
  }
});

/**
 * 呼叫 LLM API
 */
async function callLLM(message, systemPrompt, provider, apiKey, customUrl = null) {
  const prompt = systemPrompt ? `${systemPrompt}\n\n用戶訊息：${message}` : `請回覆以下訊息：${message}`;

  if (provider === 'gemini') {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
        'gemini-flash-lite-latest:generateContent?key=' + apiKey;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt,
          }],
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API 錯誤: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;

    // 使用 Gemini API 回應中的準確 Token 數量
    let tokensUsed = 0;
    if (data.usageMetadata) {
      // 使用 totalTokenCount 作為總 Token 使用量
      tokensUsed = data.usageMetadata.totalTokenCount || 0;
      console.log('Gemini Token 使用詳情:', {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        candidatesTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount || 0,
      });
    } else {
      // 如果沒有 usageMetadata，使用粗略估算
      tokensUsed = Math.ceil(prompt.length / 4) + Math.ceil(responseText.length / 4);
      console.log('Gemini 使用估算 Token 數量:', tokensUsed);
    }

    return {
      response: responseText,
      tokensUsed: tokensUsed,
    };
  } else if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: prompt,
        }],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API 錯誤:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`OpenAI API 錯誤: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;
    const tokensUsed = data.usage ? (data.usage.prompt_tokens + data.usage.completion_tokens) : 0;

    return {
      response: responseText,
      tokensUsed: tokensUsed,
    };
  } else if (provider === 'custom') {
    if (!customUrl) {
      throw new Error('自訂 API 需要提供 URL');
    }
    const response = await fetch(customUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: prompt,
        }],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('自訂 API 錯誤:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`自訂 API 錯誤: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;
    const tokensUsed = data.usage ? (data.usage.prompt_tokens + data.usage.completion_tokens) : 0;

    return {
      response: responseText,
      tokensUsed: tokensUsed,
    };
  }

  throw new Error('不支援的 LLM 提供商');
}

/**
 * AI 意圖分析 - 提取關鍵字
 */
async function analyzeUserIntent(message, agentId) {
  try {
    // 獲取代理資料
    const agentRef = db.ref(`agents/${agentId}`);
    const agentSnapshot = await agentRef.once('value');
    const agent = agentSnapshot.val();

    if (!agent) {
      throw new Error('代理不存在');
    }

    const {llmConfig} = agent;
    const {provider, apiKey, customUrl} = llmConfig;

    if (!apiKey) {
      throw new Error('API Key 未設定');
    }

    const prompt = `請分析以下用戶問題的意圖，提取相關的關鍵字用於知識庫匹配：

當前用戶問題：${message}

請考慮對話上下文，提取相關的關鍵字，包括：
1. 當前問題的關鍵字
2. 可能的查詢詞
3. 中英文關鍵字

直接返回 JSON 陣列格式：
["關鍵字1", "關鍵字2", "keyword3", "關鍵字4"]`;

    // 呼叫 LLM API 進行意圖分析
    const result = await callLLM(prompt, '', provider, apiKey, customUrl);

    // 解析 JSON 回應
    try {
      let jsonText = result.response;

      // 處理 markdown 格式的 JSON 代碼塊
      const jsonCodeBlockMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonCodeBlockMatch) {
        jsonText = jsonCodeBlockMatch[1].trim();
      }

      const keywords = JSON.parse(jsonText);
      if (Array.isArray(keywords)) {
        return keywords;
      }
    } catch (parseError) {
      console.warn('AI 意圖分析回應格式錯誤，使用備用解析:', parseError);

      // 備用解析：提取引號內的內容
      const keywordMatches = result.response.match(/"([^"]+)"/g);
      if (keywordMatches) {
        return keywordMatches.map((match) => match.replace(/"/g, ''));
      }
    }

    return [];
  } catch (error) {
    console.error('AI 意圖分析失敗:', error);
    return [];
  }
}

/**
 * 智能知識庫比對算法
 */
async function selectRelevantKnowledge(message, knowledgeBases, aiKeywords = []) {
  if (!knowledgeBases || knowledgeBases.length === 0) return [];

  const messageLower = message.toLowerCase();

  // 教育服務型關鍵字權重系統
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
    '查詢': 1, '詢問': 1, 'inquiry': 1, 'question': 1,
  };

  // 計算每個知識庫的相關性分數
  const scoredKBs = knowledgeBases.map((kb) => {
    if (!kb.content || !kb.title) return {kb, score: 0};

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

    // AI 關鍵字匹配（最高優先級）
    if (aiKeywords && aiKeywords.length > 0) {
      aiKeywords.forEach((aiKeyword) => {
        const aiKeywordLower = aiKeyword.toLowerCase();
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
      kb.keywords.forEach((keyword) => {
        const keywordLower = keyword.toLowerCase();
        if (messageLower.includes(keywordLower)) {
          score += 4; // 關鍵字匹配權重很高
        }
      });
    }

    // 權重關鍵字匹配
    Object.keys(keywordWeights).forEach((keyword) => {
      const keywordLower = keyword.toLowerCase();
      if (messageLower.includes(keywordLower)) {
        const weight = keywordWeights[keyword];
        if (titleLower.includes(keywordLower)) {
          score += weight * 2; // 標題中的權重關鍵字權重加倍
        }
        if (contentLower.includes(keywordLower)) {
          score += weight; // 內容中的權重關鍵字
        }
      }
    });

    return {kb, score};
  });

  // 按分數排序，過濾掉分數為 0 的
  const relevantKBs = scoredKBs
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  // 動態決定返回數量（基於相關性分數）
  if (relevantKBs.length === 0) {
    return []; // 沒有相關的，不載入任何知識庫
  } else if (relevantKBs.length <= 3) {
    return relevantKBs; // 相關的知識庫不多，全部返回
  } else {
    return relevantKBs.slice(0, 3); // 相關的知識庫很多，返回前 3 個最相關的
  }
}


/**
 * 載入 LINE Bot 對話歷史
 */
async function loadLineBotConversationHistory(agentId, userId) {
  try {
    const historyRef = db.ref(`agents/${agentId}/lineBotConversations/${userId}`);
    const snapshot = await historyRef.once('value');
    const history = snapshot.val() || [];

    console.log(`LINE Bot 載入對話歷史: Agent ${agentId}, User ${userId}, 歷史數量: ${history.length}`);
    return history;
  } catch (error) {
    console.error('載入 LINE Bot 對話歷史失敗:', error);
    return [];
  }
}

/**
 * 保存 LINE Bot 對話歷史
 */
async function saveLineBotConversationHistory(agentId, userId, userMessage, assistantMessage) {
  try {
    const historyRef = db.ref(`agents/${agentId}/lineBotConversations/${userId}`);
    const snapshot = await historyRef.once('value');
    const history = snapshot.val() || [];

    // 添加新的對話
    history.push({
      userMessage: userMessage,
      assistantMessage: assistantMessage,
      timestamp: Date.now(),
    });

    // 只保留最近 20 輪對話
    const trimmedHistory = history.slice(-20);

    await historyRef.set(trimmedHistory);

    console.log(`LINE Bot 對話歷史已保存: Agent ${agentId}, User ${userId}`);
  } catch (error) {
    console.error('保存 LINE Bot 對話歷史失敗:', error);
  }
}

/**
 * 記錄 LINE Bot 用戶互動統計
 */
async function recordLineBotUserInteraction(agentId, userId, message, messageType) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();

    // 記錄用戶互動
    const interactionRef = db.ref(`agents/${agentId}/lineBotAnalytics/users/${userId}`);
    const userSnapshot = await interactionRef.once('value');
    const userData = userSnapshot.val() || {
      firstInteraction: timestamp,
      lastInteraction: timestamp,
      totalMessages: 0,
      messageTypes: {},
      dailyStats: {},
    };

    // 更新用戶統計
    userData.lastInteraction = timestamp;
    userData.totalMessages += 1;
    userData.messageTypes[messageType] = (userData.messageTypes[messageType] || 0) + 1;

    // 更新每日統計
    if (!userData.dailyStats[today]) {
      userData.dailyStats[today] = {messages: 0, firstMessage: timestamp};
    }
    userData.dailyStats[today].messages += 1;
    userData.dailyStats[today].lastMessage = timestamp;

    await interactionRef.set(userData);

    // 記錄代理總體統計
    const agentStatsRef = db.ref(`agents/${agentId}/lineBotAnalytics/agentStats/${today}`);
    const agentStatsSnapshot = await agentStatsRef.once('value');
    const agentStats = agentStatsSnapshot.val() || {
      totalMessages: 0,
      uniqueUsers: new Set(),
      messageTypes: {},
      firstMessage: timestamp,
      lastMessage: timestamp,
    };

    agentStats.totalMessages += 1;
    agentStats.lastMessage = timestamp;
    agentStats.messageTypes[messageType] = (agentStats.messageTypes[messageType] || 0) + 1;

    await agentStatsRef.set(agentStats);

    console.log(`LINE Bot 用戶互動已記錄: Agent ${agentId}, User ${userId}, Type ${messageType}`);
  } catch (error) {
    console.error('記錄 LINE Bot 用戶互動失敗:', error);
  }
}

/**
 * 記錄 LINE Bot AI 回應統計
 */
async function recordLineBotAIResponse(agentId, userId, response, aiData) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();

    // 記錄 AI 回應統計
    const aiStatsRef = db.ref(`agents/${agentId}/lineBotAnalytics/aiStats/${today}`);
    const aiStatsSnapshot = await aiStatsRef.once('value');
    const aiStats = aiStatsSnapshot.val() || {
      totalResponses: 0,
      knowledgeBaseMatches: 0,
      aiKeywordsUsed: 0,
      responseLength: 0,
      firstResponse: timestamp,
      lastResponse: timestamp,
    };

    aiStats.totalResponses += 1;
    aiStats.lastResponse = timestamp;
    aiStats.responseLength += response.length;

    if (aiData.knowledgeBases && aiData.knowledgeBases.length > 0) {
      aiStats.knowledgeBaseMatches += 1;
    }
    if (aiData.aiKeywords && aiData.aiKeywords.length > 0) {
      aiStats.aiKeywordsUsed += 1;
    }

    await aiStatsRef.set(aiStats);

    console.log(`LINE Bot AI 回應已記錄: Agent ${agentId}, User ${userId}`);
  } catch (error) {
    console.error('記錄 LINE Bot AI 回應失敗:', error);
  }
}

/**
 * 記錄 LINE Bot 錯誤統計
 */
async function recordLineBotError(agentId, userId, errorMessage) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();

    // 記錄錯誤統計
    const errorStatsRef = db.ref(`agents/${agentId}/lineBotAnalytics/errorStats/${today}`);
    const errorStatsSnapshot = await errorStatsRef.once('value');
    const errorStats = errorStatsSnapshot.val() || {
      totalErrors: 0,
      errorTypes: {},
      firstError: timestamp,
      lastError: timestamp,
    };

    errorStats.totalErrors += 1;
    errorStats.lastError = timestamp;

    // 簡單的錯誤分類
    const errorType = errorMessage.includes('API') ? 'API_ERROR' :
      errorMessage.includes('network') ? 'NETWORK_ERROR' : 'OTHER_ERROR';
    errorStats.errorTypes[errorType] = (errorStats.errorTypes[errorType] || 0) + 1;

    await errorStatsRef.set(errorStats);

    console.log(`LINE Bot 錯誤已記錄: Agent ${agentId}, User ${userId}, Error: ${errorMessage}`);
  } catch (error) {
    console.error('記錄 LINE Bot 錯誤失敗:', error);
  }
}

/**
 * 更新 Token 使用統計
 */
async function updateTokenUsage(agentId, tokensUsed) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const statsRef = db.ref(`agents/${agentId}/tokenStats/${today}`);

    // 獲取當天的統計
    const snapshot = await statsRef.once('value');
    const currentStats = snapshot.val() || {totalTokens: 0, requestCount: 0};

    // 更新統計
    const updatedStats = {
      totalTokens: currentStats.totalTokens + tokensUsed,
      requestCount: currentStats.requestCount + 1,
      lastUpdated: Date.now(),
    };

    await statsRef.set(updatedStats);

    // 更新總計統計
    const totalStatsRef = db.ref(`agents/${agentId}/tokenStats/total`);
    const totalSnapshot = await totalStatsRef.once('value');
    const totalStats = totalSnapshot.val() || {totalTokens: 0, totalRequests: 0};

    const updatedTotalStats = {
      totalTokens: totalStats.totalTokens + tokensUsed,
      totalRequests: totalStats.totalRequests + 1,
      lastUpdated: Date.now(),
    };

    await totalStatsRef.set(updatedTotalStats);

    console.log(`Token 統計已更新: Agent ${agentId}, 今日使用: ${tokensUsed} tokens`);
  } catch (error) {
    console.error('更新 Token 統計失敗:', error);
    // 不拋出錯誤，避免影響主要功能
  }
}


/**
 * 分析 LINE Bot 訊息並提取人物誌資訊
 * @param {string} userMessage 用戶訊息
 * @param {string} assistantMessage AI 回應
 * @return {Object} 人物誌資料
 */
// eslint-disable-next-line no-unused-vars
function analyzeLineBotMessageForProfile(userMessage, assistantMessage) {
  const profileData = {
    basic: {},
    contact: {},
    education: {},
    career: {},
    interests: {},
    personality: {},
    lifestyle: {},
  };

  const message = userMessage.toLowerCase();

  // 基本資訊
  if (message.includes('我叫') || message.includes('我是') || message.includes('名字')) {
    const nameMatch = userMessage.match(/(?:我叫|我是|名字是?)([^，。！？\s]+)/);
    if (nameMatch) {
      profileData.basic.name = nameMatch[1];
    }
  }

  if (message.includes('歲') || message.includes('年齡')) {
    const ageMatch = userMessage.match(/(\d+)[歲年]/);
    if (ageMatch) {
      profileData.basic.age = parseInt(ageMatch[1]);
    }
  }

  // 聯絡資訊
  if (message.includes('電話') || message.includes('手機')) {
    const phoneMatch = userMessage.match(/(\d{4}[\s-]?\d{3}[\s-]?\d{3})/);
    if (phoneMatch) {
      profileData.contact.phone = phoneMatch[1];
    }
  }

  if (message.includes('email') || message.includes('信箱') || message.includes('@')) {
    const emailMatch = userMessage.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      profileData.contact.email = emailMatch[1];
    }
  }

  // 教育背景
  if (message.includes('學校') || message.includes('大學') || message.includes('科系')) {
    profileData.education.school = '已提及學校相關資訊';
  }

  if (message.includes('年級') || message.includes('大') || message.includes('碩') || message.includes('博')) {
    const gradeMatch = userMessage.match(/(大[一二三四]|碩[一二]|博[一二三四五六七八九十])/);
    if (gradeMatch) {
      profileData.education.grade = gradeMatch[1];
    }
  }

  // 興趣
  if (message.includes('喜歡') || message.includes('興趣') || message.includes('愛好')) {
    profileData.interests.hobbies = '已表達興趣愛好';
  }

  // 個性特質
  if (message.includes('個性') || message.includes('性格')) {
    profileData.personality.traits = '已討論個性相關話題';
  }

  return profileData;
}

/**
 * 合併 LINE Bot 人物誌資料
 * @param {Object} existingProfile 現有人物誌
 * @param {Object} newProfileData 新人物誌資料
 * @return {Object} 合併後的人物誌
 */
// eslint-disable-next-line no-unused-vars
function mergeLineBotProfileData(existingProfile, newProfileData) {
  const merged = JSON.parse(JSON.stringify(existingProfile));

  const categories = ['basic', 'contact', 'education', 'career', 'interests', 'personality', 'lifestyle'];

  categories.forEach((category) => {
    if (newProfileData[category] && Object.keys(newProfileData[category]).length > 0) {
      if (!merged[category]) {
        merged[category] = {};
      }
      Object.assign(merged[category], newProfileData[category]);
    }
  });

  return merged;
}

/**
 * 計算 LINE Bot 人物誌信心度
 * @param {Object} profile 人物誌資料
 * @return {number} 信心度 (0-10)
 */
// eslint-disable-next-line no-unused-vars
function calculateLineBotProfileConfidence(profile) {
  let confidence = 0;
  const categories = ['basic', 'contact', 'education', 'career', 'interests', 'personality', 'lifestyle'];

  let categoryCount = 0;
  categories.forEach((category) => {
    if (profile[category] && Object.keys(profile[category]).length > 0) {
      categoryCount++;
    }
  });

  // 基礎信心度
  confidence = categoryCount * 1.5;

  // 額外加分
  if (profile.basic && profile.basic.name) confidence += 1;
  if ((profile.contact && profile.contact.phone) ||
      (profile.contact && profile.contact.email)) confidence += 1;
  if ((profile.education && profile.education.school) ||
      (profile.education && profile.education.grade)) confidence += 1;

  return Math.min(confidence, 10);
}

/**
 * 統一的 AI 回應處理函數
 * 支援 Widget 和 LINE Bot，包含動態人物誌功能
 * @param {string} agentId 代理 ID
 * @param {string} message 用戶訊息
 * @param {string} systemPrompt 系統提示詞
 * @param {string} userId 用戶 ID（LINE Bot 使用）
 * @param {string} source 來源（widget/linebot）
 * @return {Object} AI 回應結果
 */
async function getUnifiedAIResponse(agentId, message, systemPrompt, userId = null,
  source = 'widget', conversationHistory = []) {
  try {
    // 從資料庫讀取代理配置
    const agentRef = db.ref(`agents/${agentId}`);
    const agentSnapshot = await agentRef.once('value');
    const agent = agentSnapshot.val();

    if (!agent) {
      throw new Error('代理不存在');
    }

    const {llmConfig} = agent;
    const {provider, apiKey, customUrl} = llmConfig;

    if (!apiKey) {
      throw new Error('LLM API Key 未設定');
    }

    console.log('統一 AI 回應處理:', {
      agentId,
      source,
      provider,
      hasApiKey: !!apiKey,
      userId: userId || 'N/A',
    });

    // 1. AI 意圖分析 - 提取關鍵字
    console.log('開始 AI 意圖分析...');
    const aiKeywords = await analyzeUserIntent(message, agentId);
    console.log('AI 分析出的關鍵字:', aiKeywords);

    // 2. 智能知識庫比對
    console.log('開始知識庫比對...');
    const relevantKBs = await selectRelevantKnowledge(message, agent.knowledgeBases || [], aiKeywords);
    console.log('匹配到的知識庫:', relevantKBs.map((item) => ({
      title: item.kb.title,
      score: item.score,
    })));

    // 3. 構建知識庫內容
    let knowledgeContent = '';
    if (relevantKBs.length > 0) {
      knowledgeContent = relevantKBs.map((item, index) =>
        `知識庫 ${index + 1} (${item.kb.title}):\n${item.kb.content}`,
      ).join('\n\n');
    } else {
      knowledgeContent = '無相關知識庫內容';
    }

    // 4. 載入現有人物誌（動態結構）
    const currentProfile = await loadDynamicProfile(agentId, userId, source);

    // 5. 構建動態人物誌提示
    const profilePrompt = buildDynamicProfilePrompt(currentProfile, source);

    // 6. 構建完整的系統提示
    let enhancedSystemPrompt = `${systemPrompt}

相關知識庫：
${knowledgeContent}

${profilePrompt}

請基於以上知識庫內容回答用戶問題，如果知識庫中沒有相關資訊，請誠實告知並建議用戶聯繫客服。`;

    // 7. 添加用戶ID到系統提示中
    if (userId) {
      enhancedSystemPrompt += `\n\n【用戶識別】\n用戶ID: ${userId}\n`;
    }

    // 8. 添加當前時間
    const now = new Date();
    const currentTimeString = now.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Taipei',
    });
    enhancedSystemPrompt += `\n\n【當前時間】\n${currentTimeString} (請根據此時間提供相關建議)\n`;

    // 8. 添加對話歷史上下文
    if (conversationHistory && conversationHistory.length > 0) {
      enhancedSystemPrompt += '\n\n【重要對話記憶指示】\n';
      enhancedSystemPrompt += '⚠️ 這不是第一次對話！用戶已經與你交談過多次！\n';
      enhancedSystemPrompt += '❌ 絕對不要像第一次見面一樣打招呼（如：你好、早安、很高興認識你等）\n';
      enhancedSystemPrompt += '❌ 絕對不要使用用戶的姓名（如：蔣大戈同學、同學等）\n';
      enhancedSystemPrompt += '❌ 如果用戶明確要求不要叫名字，絕對不要再使用姓名\n';
      enhancedSystemPrompt += '✅ 要基於之前的對話內容進行連續性回應\n';
      enhancedSystemPrompt += '✅ 如果用戶之前已經提供過個人資訊，請記住並在回應中體現\n';
      enhancedSystemPrompt += '✅ 不要重複之前已經問過的問題或建議\n';
      enhancedSystemPrompt += '✅ 延伸問題要基於當前對話內容，不要重，最多一個\n';
      enhancedSystemPrompt += '✅ 回應要自然，像朋友之間的對話，不要過於正式\n\n';

      enhancedSystemPrompt += '對話歷史：\n';

      if (source === 'widget') {
        // Widget 格式：role/content
        conversationHistory.forEach((msg, index) => {
          if (index < 10) { // 只保留最近 10 輪對話
            const role = msg.role === 'user' ? '用戶' : '助手';
            enhancedSystemPrompt += `${role}：${msg.content}\n`;
          }
        });
      } else if (source === 'linebot') {
        // LINE Bot 格式：userMessage/assistantMessage
        conversationHistory.forEach((msg, index) => {
          if (index < 10) { // 只保留最近 10 輪對話
            enhancedSystemPrompt += `用戶：${msg.userMessage}\n`;
            enhancedSystemPrompt += `助手：${msg.assistantMessage}\n`;
          }
        });
      }

      enhancedSystemPrompt += '\n當前用戶訊息：' + message;
      enhancedSystemPrompt += '\n\n【重要回應指示】\n';
      enhancedSystemPrompt += '1. 基於以上對話歷史，提供連續性的回應\n';
      enhancedSystemPrompt += '2. 不要重複之前的問題或建議\n';
      enhancedSystemPrompt += '3. 延伸問題要基於當前對話內容，避免重複，最多一個\n';
      enhancedSystemPrompt += '4. 如果用戶已經回答過某個問題，不要再問相同的問題\n';
      enhancedSystemPrompt += '5. 回應要自然流暢，體現對話的連續性\n';
      enhancedSystemPrompt += '6. 如果用戶明確要求不要叫名字，絕對不要再使用姓名\n';
      enhancedSystemPrompt += '7. 回應要像朋友之間的對話，不要過於正式或客套';
    } else {
      enhancedSystemPrompt += '\n\n當前用戶訊息：' + message;
      enhancedSystemPrompt += '\n\n【重要】這是第一次對話，請建立良好的第一印象。';
    }

    // 9. 呼叫 LLM API
    const result = await callLLM(enhancedSystemPrompt, '', provider, apiKey, customUrl);

    // 10. 更新 token 使用統計
    await updateTokenUsage(agentId, result.tokensUsed || 0);

    // 11. 處理人物誌更新（僅 LINE Bot）
    if (source === 'linebot' && userId) {
      await processDynamicProfileUpdate(agentId, userId, message, result.response, currentProfile);
    }

    // 12. 處理預約參訪通知（僅 LINE Bot）
    if (source === 'linebot' && userId) {
      const appointmentResult = await processAppointmentNotification(
        agentId, userId, message, result.response, result.aiKeywords);
      if (appointmentResult) {
        // 如果有 Flex Message 回傳，直接返回
        return {
          response: appointmentResult,
          knowledgeBases: relevantKBs.map((item) => item.kb.title),
          aiKeywords: aiKeywords,
          profile: currentProfile,
          isFlexMessage: true,
        };
      }
    }

    return {
      response: result.response,
      knowledgeBases: relevantKBs.map((item) => item.kb.title),
      aiKeywords: aiKeywords,
      profile: currentProfile, // 返回現有人物誌供前端使用
    };
  } catch (error) {
    console.error('統一 AI 回應處理錯誤:', error);
    throw error;
  }
}

/**
 * 載入動態人物誌
 * @param {string} agentId 代理 ID
 * @param {string} userId 用戶 ID
 * @param {string} source 來源
 * @return {Object} 人物誌資料
 */
async function loadDynamicProfile(agentId, userId, source) {
  try {
    if (source === 'linebot' && userId) {
      // LINE Bot: 從資料庫載入
      const profileRef = db.ref(`agents/${agentId}/profiles/linebot_${userId}`);
      const profileSnapshot = await profileRef.once('value');
      return profileSnapshot.val() || {};
    } else {
      // Widget: 返回空物件，由前端處理 localStorage
      return {};
    }
  } catch (error) {
    console.error('載入動態人物誌失敗:', error);
    return {};
  }
}

/**
 * 構建動態人物誌提示
 * @param {Object} currentProfile 現有人物誌
 * @param {string} source 來源
 * @return {string} 人物誌提示
 */
function buildDynamicProfilePrompt(currentProfile, source) {
  let prompt = '';

  if (source === 'linebot') {
    // LINE Bot: 要求 JSON 格式回應
    prompt += '\n【重要】每次回覆必須按照以下格式：\n';
    prompt += '1. 先回答用戶的問題，不要超過100字\n';
    prompt += '2. 然後在回覆最後添加以下 JSON 格式：\n';
    prompt += '```json\n';
    prompt += '{\n';
    prompt += '  "profile": {\n';
    prompt += '    // 動態生成欄位，根據用戶對話內容分析\n';
    prompt += '    // 例如：{"name": "陳大大", "hobbies": ["打籃球"], "interests": ["電競營運", "轉播後勤"]}\n';
    prompt += '  },\n';
    prompt += '  "suggestions": [\n';
    prompt += '    "用戶角度提出問題1"\n';
    prompt += '  ],\n';
    prompt += '  "appointmentData": {\n';
    prompt += '    "name": "用戶姓名",\n';
    prompt += '    "phone": "用戶電話",\n';
    prompt += '    "appointmentTime": "預約時間"\n';
    prompt += '  }\n';
    prompt += '}\n';
    prompt += '```\n';

    // 明確指示要為用戶建立人物誌
    prompt += '\n【重要】人物誌是為用戶建立的，不是為你自己建立的！\n';
    prompt += '請分析用戶的訊息內容，提取用戶的個人資訊來建立人物誌。\n';

    prompt += '\n【動態人物誌生成規則】\n';
    prompt += '1. 根據用戶對話內容，動態生成相應的欄位\n';
    prompt += '2. 欄位名稱要簡潔明確，使用英文或中文\n';
    prompt += '3. 欄位值可以是字串、陣列或物件\n';
    prompt += '4. 只包含用戶實際提到的資訊，不要猜測\n';
    prompt += '5. 如果用戶沒有提供某類資訊，不要建立該欄位\n';

    prompt += '\n【常見欄位範例】\n';
    prompt += '- name: 姓名（字串）\n';
    prompt += '- age: 年齡（字串或數字）\n';
    prompt += '- hobbies: 興趣愛好（陣列）\n';
    prompt += '- interests: 感興趣的領域（陣列）\n';
    prompt += '- education: 教育程度（字串）\n';
    prompt += '- location: 居住地（字串）\n';
    prompt += '- phone: 電話（字串）\n';
    prompt += '- email: 電子郵件（字串）\n';
    prompt += '- career: 職業或專業（字串）\n';
    prompt += '- personality: 個性特質（陣列）\n';

    if (currentProfile && Object.keys(currentProfile).length > 0) {
      prompt += '\n目前已有的人物誌資訊（用戶的個人資訊）：\n';
      prompt += JSON.stringify(currentProfile, null, 2);
      prompt += '\n\n請根據現有資訊和當前對話，動態更新用戶的人物誌。\n';
      prompt += '如果用戶提供了新資訊，請新增相應欄位；如果用戶更新了現有資訊，請更新對應欄位。\n';
      prompt += '保持現有資訊不變，只添加或更新用戶新提到的內容。';
    } else {
      prompt += '\n這是第一次對話，請根據用戶訊息分析並動態建立用戶的初始人物誌。\n';
      prompt += '只包含用戶實際提到的資訊，不要建立空欄位。';
    }

    prompt += '\n\n【特別注意】\n';
    prompt += '1. 仔細分析用戶的每一句話，提取所有相關的個人資訊\n';
    prompt += '2. 根據資訊類型選擇合適的欄位名稱（如：hobbies、interests、education等）\n';
    prompt += '3. 如果資訊是複數，使用陣列格式（如：["打籃球", "電競"]）\n';
    prompt += '4. 如果資訊是單一值，使用字串格式（如："陳大大"）\n';
    prompt += '5. 保持欄位名稱簡潔，避免過度巢狀結構\n';
    prompt += '6. 只包含用戶實際提到的資訊，不要推測或補充\n';

    prompt += '\n\n建議問題要：\n';
    prompt += '1. 以用戶為出發點，符合用戶需求\n';
    prompt += '2. 引導用戶提供更多個人資訊\n';
    prompt += '3. 與當前對話內容相關\n';
    prompt += '4. 問題要具體且容易回答\n';
    prompt += '\n重要：\n';
    prompt += '- 人物誌是記錄用戶的個人資訊，不是你的資訊\n';
    prompt += '- 請以純文字格式回應，不要使用 Markdown 格式\n';
    prompt += '- 如果用戶沒有提供個人資訊，profile 欄位保持空白';
  } else {
    // Widget: 簡化提示
    prompt += '\n你具備智能引導功能，能夠在適當的時機引導用戶提供個人資訊來建立人物誌。';
  }

  return prompt;
}

/**
 * 處理動態人物誌更新（僅 LINE Bot）
 * @param {string} agentId 代理 ID
 * @param {string} userId 用戶 ID
 * @param {string} userMessage 用戶訊息
 * @param {string} aiResponse AI 回應
 * @param {Object} currentProfile 現有人物誌
 */
async function processDynamicProfileUpdate(agentId, userId, userMessage, aiResponse, currentProfile) {
  try {
    console.log('=== 開始處理動態人物誌更新 ===');
    console.log('Agent ID:', agentId);
    console.log('User ID:', userId);
    console.log('User Message:', userMessage);
    console.log('Current Profile:', currentProfile);
    console.log('AI Response Length:', aiResponse.length);

    // 解析 AI 回應中的 JSON
    const profileData = await parseLineBotAIResponse(aiResponse);
    console.log('解析到的 Profile Data:', profileData);

    if (profileData && profileData.profile) {
      console.log('找到 profile 資料:', profileData.profile);

      // 檢查是否有實際的人物誌內容（非空字串）
      const hasValidContent = checkProfileHasValidContent(profileData.profile);
      console.log('Profile 是否有有效內容:', hasValidContent);

      if (hasValidContent) {
        console.log('開始合併人物誌...');

        // 動態合併人物誌
        const mergedProfile = mergeDynamicProfile(currentProfile, profileData.profile);
        console.log('合併後的人物誌:', mergedProfile);

        // 計算信心度
        const confidence = calculateDynamicProfileConfidence(mergedProfile);
        console.log('計算的信心度:', confidence);

        // 更新人物誌
        const updatedProfile = {
          ...mergedProfile,
          metadata: {
            confidence: confidence,
            lastUpdated: Date.now(),
            totalInteractions: (currentProfile.metadata && currentProfile.metadata.totalInteractions || 0) + 1,
            source: 'linebot',
            updatedByAI: true,
          },
        };

        const profileRef = db.ref(`agents/${agentId}/profiles/linebot_${userId}`);
        console.log('準備寫入資料庫，路徑:', `agents/${agentId}/profiles/linebot_${userId}`);
        console.log('寫入的資料:', updatedProfile);

        await profileRef.set(updatedProfile);
        console.log('✅ 資料庫寫入成功！');

        console.log(`動態人物誌已更新: Agent ${agentId}, User ${userId}, 信心度: ${confidence}`);
        console.log('更新的人物誌內容:', updatedProfile);
      } else {
        console.log('❌ AI 回應中的人物誌內容為空，跳過更新');
        console.log('原始 profile 資料:', profileData.profile);
      }
    } else {
      console.log('❌ AI 回應中沒有找到有效的人物誌資料');
      console.log('Profile Data:', profileData);
    }

    console.log('=== 動態人物誌更新處理完成 ===');
  } catch (error) {
    console.error('❌ 處理動態人物誌更新失敗:', error);
    console.error('錯誤詳情:', error.stack);
  }
}

/**
 * 檢查人物誌是否有有效內容
 * @param {Object} profile 人物誌資料
 * @return {boolean} 是否有有效內容
 */
function checkProfileHasValidContent(profile) {
  if (!profile || typeof profile !== 'object') {
    return false;
  }

  // 檢查動態扁平結構是否有有效內容
  for (const key in profile) {
    if (Object.prototype.hasOwnProperty.call(profile, key)) {
      const value = profile[key];

      // 檢查值是否為非空字串
      if (value && typeof value === 'string' && value.trim() !== '') {
        return true;
      }

      // 檢查值是否為非空陣列
      if (Array.isArray(value) && value.length > 0) {
        return true;
      }

      // 檢查值是否為非空物件
      if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
        return true;
      }

      // 檢查值是否為非零數字
      if (typeof value === 'number' && value !== 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 動態合併人物誌
 * @param {Object} existingProfile 現有人物誌
 * @param {Object} newProfileData 新人物誌資料
 * @return {Object} 合併後的人物誌
 */
function mergeDynamicProfile(existingProfile, newProfileData) {
  const merged = JSON.parse(JSON.stringify(existingProfile || {}));

  // 動態合併所有欄位（支援扁平結構）
  Object.keys(newProfileData).forEach((key) => {
    const newValue = newProfileData[key];

    // 如果新值是陣列，合併到現有陣列
    if (Array.isArray(newValue)) {
      if (!merged[key]) {
        merged[key] = [];
      }
      // 合併陣列，避免重複
      newValue.forEach((item) => {
        if (!merged[key].includes(item)) {
          merged[key].push(item);
        }
      });
    } else if (typeof newValue === 'object' && newValue !== null) {
      // 如果新值是物件，遞歸合併
      if (!merged[key]) {
        merged[key] = {};
      }
      Object.assign(merged[key], newValue);
    } else {
      // 如果新值是基本類型，直接覆蓋
      merged[key] = newValue;
    }
  });

  return merged;
}

/**
 * 計算動態人物誌信心度
 * @param {Object} profile 人物誌資料
 * @return {number} 信心度 (0-10)
 */
function calculateDynamicProfileConfidence(profile) {
  let confidence = 0;
  let fieldCount = 0;

  // 計算有效欄位數量
  Object.keys(profile).forEach((key) => {
    if (key !== 'metadata') {
      const value = profile[key];

      // 檢查是否有有效內容
      if (value && typeof value === 'string' && value.trim() !== '') {
        fieldCount++;
      } else if (Array.isArray(value) && value.length > 0) {
        fieldCount++;
      } else if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
        fieldCount++;
      } else if (typeof value === 'number' && value !== 0) {
        fieldCount++;
      }
    }
  });

  // 基礎信心度
  confidence = fieldCount * 1.0;

  // 額外加分
  if (profile.name) confidence += 1;
  if (profile.hobbies && Array.isArray(profile.hobbies) && profile.hobbies.length > 0) confidence += 1;
  if (profile.interests && Array.isArray(profile.interests) && profile.interests.length > 0) confidence += 1;
  if (profile.education) confidence += 1;
  if (profile.phone || profile.email) confidence += 1;

  return Math.min(confidence, 10);
}

/**
 * 解析 LINE Bot AI 回應中的 JSON
 * @param {string} aiResponse AI 回應
 * @return {Object|null} 解析的 JSON 資料
 */
async function parseLineBotAIResponse(aiResponse) {
  try {
    console.log('=== 開始解析 AI 回應 ===');
    console.log('AI 回應內容:', aiResponse);

    // 尋找 JSON 區塊（支援多種格式）
    let jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);

    // 如果沒有找到 markdown 格式，嘗試尋找純 JSON
    if (!jsonMatch) {
      jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    }

    if (!jsonMatch) {
      console.log('❌ LINE Bot AI 回應中沒有找到 JSON 格式');
      console.log('回應內容:', aiResponse);
      return null;
    }

    // 提取 JSON 字串
    const jsonString = jsonMatch[1] || jsonMatch[0];
    console.log('找到的 JSON 字串:', jsonString);

    const profileData = JSON.parse(jsonString);
    console.log('✅ LINE Bot 解析到的人物誌資料:', profileData);
    console.log('=== 解析完成 ===');

    return profileData;
  } catch (error) {
    console.error('❌ 解析 LINE Bot AI 回應 JSON 失敗:', error);
    console.error('錯誤詳情:', error.stack);
    return null;
  }
}

/**
 * 處理 LINE Bot 回應格式
 * 提取 JSON 中的建議問題並整合到回應中
 * @param {string} aiResponse AI 原始回應
 * @return {string} 處理後的回應
 */
async function processLineBotResponse(aiResponse, userMessage, aiKeywords) {
  try {
    console.log('=== 開始處理 LINE Bot 回應格式 ===');
    console.log('原始 AI 回應:', aiResponse);

    // 尋找 JSON 區塊（支援多種格式）
    let jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);

    // 如果沒有找到 markdown 格式，嘗試尋找純 JSON
    if (!jsonMatch) {
      jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    }

    if (!jsonMatch) {
      console.log('沒有找到 JSON 格式，直接返回原始回應');
      return aiResponse;
    }

    console.log('找到 JSON 格式，開始處理...');

    // 提取 JSON 字串
    const jsonString = jsonMatch[1] || jsonMatch[0];
    console.log('提取的 JSON 字串:', jsonString);

    let profileData;
    try {
      profileData = JSON.parse(jsonString);
      console.log('解析的 Profile Data:', profileData);
    } catch (parseError) {
      console.error('解析 JSON 失敗:', parseError);
      // JSON 解析失敗，移除 JSON 部分並返回
      return aiResponse.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
    }

    // 提取主要回應（移除所有 JSON 部分）
    let mainResponse = aiResponse;

    // 移除 markdown JSON 格式
    mainResponse = mainResponse.replace(/```json\s*[\s\S]*?\s*```/, '').trim();

    // 移除純 JSON 格式
    mainResponse = mainResponse.replace(/\{[\s\S]*\}/, '').trim();

    console.log('處理後的主要回應:', mainResponse);

    // 提取建議問題
    const suggestions = profileData.suggestions || [];
    console.log('提取的建議問題:', suggestions);

    if (suggestions.length > 0) {
      // 將建議問題整合到回應中（統一格式）
      mainResponse += '\n\n';
      mainResponse += '💡 延伸問題：\n';

      suggestions.forEach((suggestion, index) => {
        mainResponse += `${index + 1}. *${suggestion}*\n`;
      });
    }

    // 檢查是否有預約資料（直接由 LLM JSON 判別）
    const appointmentData = profileData.appointmentData;
    if (appointmentData && appointmentData.name && appointmentData.phone && appointmentData.appointmentTime) {
      console.log('檢測到完整預約資料:', appointmentData);
      console.log('將在後續處理中顯示 Flex Message');
      // 不直接返回 Flex Message，讓 AI 回應先被處理
      // Flex Message 會在 processAppointmentNotification 中處理
    }

    console.log('最終處理後的回應:', mainResponse);
    console.log('=== LINE Bot 回應格式處理完成 ===');

    return mainResponse;
  } catch (error) {
    console.error('處理 LINE Bot 回應格式失敗:', error);
    console.error('錯誤詳情:', error.stack);
    // 發生錯誤時，移除 JSON 部分並返回
    return aiResponse.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
  }
}

/**
 * 處理預約參訪通知（僅 LINE Bot）
 * @param {string} agentId 代理 ID
 * @param {string} userId 用戶 ID
 * @param {string} userMessage 用戶訊息
 * @param {string} aiResponse AI 回應
 * @param {Array} aiKeywords AI 關鍵字
 */
async function processAppointmentNotification(agentId, userId, userMessage, aiResponse, aiKeywords) {
  try {
    console.log('=== 開始處理預約參訪通知 ===');
    console.log('Agent ID:', agentId);
    console.log('User ID:', userId);
    console.log('User Message:', userMessage);
    console.log('AI Response:', aiResponse);

    // 解析 AI 回應中的 JSON
    const responseData = await parseLineBotAIResponse(aiResponse);
    console.log('解析的 AI 回應資料:', responseData);

    if (responseData && responseData.appointmentData) {
      const appointmentData = responseData.appointmentData;
      console.log('檢測到預約資料:', appointmentData);

      // 檢查預約資料是否完整（直接由 LLM JSON 判別）
      if (appointmentData.name && appointmentData.phone && appointmentData.appointmentTime) {
        console.log('預約資料完整，建立通知...');

        // 直接建立通知（不再檢查預約意圖）
        await createAppointmentNotification(agentId, userId, userMessage, aiResponse, aiKeywords, appointmentData);
        console.log('✅ 預約參訪通知已建立');

        // 返回 Flex Message 用於顯示
        return createAppointmentConfirmationFlexMessage(appointmentData, aiResponse);
      } else {
        console.log('❌ 預約資料不完整:', appointmentData);
      }
    } else {
      console.log('AI 回應中沒有預約資料');
    }

    console.log('=== 預約參訪通知處理完成 ===');
  } catch (error) {
    console.error('❌ 處理預約參訪通知失敗:', error);
    console.error('錯誤詳情:', error.stack);
  }
}

/**
 * 建立統一預約記錄
 * @param {string} agentId 代理 ID
 * @param {string} userId 用戶 ID
 * @param {Object} appointmentData 預約資料
 * @param {string} notificationId 通知 ID
 * @return {string} 預約 ID
 */
async function createUnifiedAppointment(agentId, userId, appointmentData, notificationId = null) {
  try {
    console.log('=== 建立統一預約記錄 ===');
    console.log('Agent ID:', agentId);
    console.log('User ID:', userId);
    console.log('Appointment Data:', appointmentData);
    console.log('Notification ID:', notificationId);

    // 將預約記錄存儲在固定的 'currentAppointment' 鍵下，確保只有一筆
    const appointmentId = 'currentAppointment';
    const appointmentRef = db.ref(`agents/${agentId}/profiles/linebot_${userId}/appointments/${appointmentId}`);

    await appointmentRef.set({
      id: appointmentId, // 固定為 'currentAppointment'
      agentId: agentId,
      userId: userId,
      notificationId: notificationId, // 可能為 null
      appointmentData: appointmentData,
      status: 'pending',
      createdAt: Date.now(),
      confirmedAt: null,
      cancelledAt: null,
      source: 'linebot',
    });

    console.log('✅ 統一預約記錄已建立/更新:', appointmentId);
    return appointmentId;
  } catch (error) {
    console.error('建立統一預約記錄失敗:', error);
    throw error;
  }
}

/**
 * 更新預約狀態（統一管理）
 * @param {string} appointmentId 預約 ID
 * @param {string} status 狀態
 * @param {string} agentId 代理 ID
 * @param {string} notificationId 通知 ID
 */
async function updateAppointmentStatus(appointmentId, status, agentId, userId, notificationId) {
  try {
    console.log('=== 更新預約狀態 ===');
    console.log('Appointment ID:', appointmentId);
    console.log('Status:', status);
    console.log('Agent ID:', agentId);
    console.log('User ID:', userId);
    console.log('Notification ID:', notificationId);

    const updates = {};
    const timestamp = Date.now();

    // 更新預約記錄（在 profile 中）
    updates[`agents/${agentId}/profiles/linebot_${userId}/appointments/${appointmentId}/status`] = status;
    updates[`agents/${agentId}/profiles/linebot_${userId}/appointments/${appointmentId}/${status}At`] = timestamp;

    // 不再更新通知記錄，因為不再建立通知

    // 同步更新 profile 中的 appointment status
    await syncAppointmentStatusToProfile(agentId, appointmentId, status);

    await db.ref().update(updates);

    console.log('✅ 預約狀態已更新:', status);
  } catch (error) {
    console.error('更新預約狀態失敗:', error);
    throw error;
  }
}

/**
 * 同步預約狀態到 profile
 * @param {string} agentId 代理 ID
 * @param {string} userId 用戶 ID
 * @param {string} appointmentId 預約 ID
 * @param {string} status 狀態
 */
async function syncAppointmentStatusToProfile(agentId, appointmentId, status) {
  try {
    console.log('=== 同步預約狀態到 profile ===');
    console.log('Agent ID:', agentId);
    console.log('Appointment ID:', appointmentId);
    console.log('Status:', status);

    // 從用戶 profile 中的預約記錄獲取用戶 ID
    const appointmentRef = db.ref(`agents/${agentId}/profiles`)
      .orderByChild(`appointments/${appointmentId}/id`)
      .equalTo(appointmentId);
    const appointmentSnapshot = await appointmentRef.once('value');
    const profiles = appointmentSnapshot.val();

    if (!profiles) {
      console.log('❌ 找不到預約記錄');
      return;
    }

    // 找到包含該預約的用戶
    let userId = null;
    for (const [profileUserId, profile] of Object.entries(profiles)) {
      if (profile.appointments && profile.appointments[appointmentId]) {
        userId = profileUserId;
        break;
      }
    }

    if (!userId) {
      console.log('❌ 找不到包含該預約的用戶');
      return;
    }

    // 載入用戶 profile
    const profileRef = db.ref(`agents/${agentId}/profiles/linebot_${userId}`);
    const profileSnapshot = await profileRef.once('value');
    const profile = profileSnapshot.val();

    if (profile && profile.appointment) {
      // 更新 profile 中的 appointment status
      await profileRef.update({
        'appointment.status': status,
        'appointment.updatedAt': Date.now(),
      });

      console.log('✅ Profile 中的預約狀態已更新:', status);
    } else {
      console.log('❌ Profile 中沒有預約資料');
    }
  } catch (error) {
    console.error('同步預約狀態到 profile 失敗:', error);
  }
}


/**
 * 建立預約參訪通知
 * @param {string} agentId 代理 ID
 * @param {string} userId 用戶 ID
 * @param {string} userMessage 用戶訊息
 * @param {string} aiResponse AI 回應
 * @param {Array} aiKeywords AI 關鍵字
 * @param {Object} appointmentData 預約資料
 */
async function createAppointmentNotification(agentId, userId, userMessage, aiResponse, aiKeywords, appointmentData) {
  try {
    console.log('=== 建立預約記錄（不建立通知）===');
    console.log('Agent ID:', agentId);
    console.log('User ID:', userId);
    console.log('User Message:', userMessage);
    console.log('Appointment Data:', appointmentData);

    // 直接建立預約記錄，不建立通知
    const appointmentId = await createUnifiedAppointment(agentId, userId, appointmentData, null);

    console.log('已建立預約記錄:', {
      appointmentId: appointmentId,
      agentId: agentId,
      userId: userId,
      userMessage: userMessage,
      appointmentData: appointmentData,
    });

    return appointmentId;
  } catch (error) {
    console.error('建立預約記錄失敗:', error);
    throw error;
  }
}

/**
 * 檢查是否為查詢預約的訊息
 * @param {string} message 用戶訊息
 * @return {boolean} 是否為查詢預約
 */
function isAppointmentQuery(message) {
  const messageLower = message.toLowerCase();

  const queryKeywords = [
    '查詢預約', '我的預約', '預約查詢', '預約狀態', '預約記錄',
    '查預約', '看預約', '預約時間', '我的參訪', '參訪查詢',
    'appointment query', 'check appointment', 'my appointment',
  ];

  return queryKeywords.some((keyword) =>
    messageLower.includes(keyword.toLowerCase()),
  );
}

/**
 * 處理預約查詢
 * @param {string} agentId 代理 ID
 * @param {string} userId 用戶 ID
 * @param {string} userMessage 用戶訊息
 * @return {string} 查詢結果
 */
async function handleAppointmentQuery(agentId, userId, userMessage) {
  try {
    console.log('=== 開始處理預約查詢 ===');
    console.log('Agent ID:', agentId);
    console.log('User ID:', userId);
    console.log('User Message:', userMessage);

    const database = db;

    // 直接從用戶 profile 中查詢 'currentAppointment'
    const appointmentId = 'currentAppointment';
    const appointmentRef = database.ref(`agents/${agentId}/profiles/linebot_${userId}/appointments/${appointmentId}`);
    const snapshot = await appointmentRef.once('value');
    const appointment = snapshot.val();

    if (!appointment) {
      console.log('用戶沒有預約記錄');
      return '您目前沒有預約記錄。如需預約參訪，請提供您的姓名、電話和希望參訪的時間。';
    }

    // 格式化預約記錄
    let response = '📅 您的預約記錄：\n\n';

    const appointmentData = appointment.appointmentData || {};
    response += `*預約資訊*\n`;
    response += `   👤 姓名：${appointmentData.name || '未提供'}\n`;
    response += `   📞 電話：${appointmentData.phone || '未提供'}\n`;
    response += `   🕐 預約時間：${appointmentData.appointmentTime || '未提供'}\n`;
    response += `   📊 狀態：${getStatusText(appointment.status)}\n`;
    response += `   📅 申請時間：${new Date(appointment.createdAt).toLocaleString('zh-TW')}\n`;

    console.log('預約查詢完成:', response);
    return response;
  } catch (error) {
    console.error('處理預約查詢失敗:', error);
    return '抱歉，查詢預約記錄時發生錯誤，請稍後再試。';
  }
}

/**
 * 取得狀態文字
 * @param {string} status 狀態
 * @return {string} 狀態文字
 */
function getStatusText(status) {
  const statusMap = {
    'pending': '⏳ 待處理',
    'confirmed': '✅ 已確認',
    'cancelled': '❌ 已取消',
    'completed': '✅ 已完成',
  };

  return statusMap[status] || '❓ 未知狀態';
}


/**
 * 創建預約確認 Flex Message
 * @param {Object} appointmentData 預約資料
 * @param {string} aiResponse AI 回應內容
 * @return {Object} Flex Message
 */
function createAppointmentConfirmationFlexMessage(appointmentData, aiResponse = '') {
  return {
    type: 'flex',
    altText: '預約參訪確認',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '📅 預約參訪確認',
            weight: 'bold',
            size: 'xl',
            color: '#1DB446',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: (aiResponse ?
              aiResponse.replace(/```json\s*[\s\S]*?\s*```/, '').replace(/\{[\s\S]*\}/, '').trim() :
              '') || '您的預約資訊已確認，我們會盡快與您聯繫安排參訪時間。',
            wrap: true,
            margin: 'md',
          },
          {
            type: 'separator',
            margin: 'lg',
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: '👤 姓名',
                    size: 'sm',
                    color: '#666666',
                    flex: 0,
                  },
                  {
                    type: 'text',
                    text: appointmentData.name || '未提供',
                    size: 'sm',
                    color: '#111111',
                    flex: 0,
                    margin: 'sm',
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: '📞 電話',
                    size: 'sm',
                    color: '#666666',
                    flex: 0,
                  },
                  {
                    type: 'text',
                    text: appointmentData.phone || '未提供',
                    size: 'sm',
                    color: '#111111',
                    flex: 0,
                    margin: 'sm',
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: '🕐 預約時間',
                    size: 'sm',
                    color: '#666666',
                    flex: 0,
                  },
                  {
                    type: 'text',
                    text: appointmentData.appointmentTime || '未提供',
                    size: 'sm',
                    color: '#111111',
                    flex: 0,
                    margin: 'sm',
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  };
}
