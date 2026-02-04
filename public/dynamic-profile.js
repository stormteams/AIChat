/**
 * 動態人物誌系統
 * 基於 AI 對話內容自動建立和更新用戶人物檔案
 */

class DynamicProfile {
    constructor(agentId) {
        this.agentId = agentId;
        this.storageKey = `ai-convai-profile-${agentId}`;
        this.profile = this.loadProfile();
        
        // 人物誌屬性定義
        this.profileAttributes = {
            // 基本資訊
            basic: {
                name: { patterns: [/我叫([^，。！？\s]{2,10})/g, /我是([^，。！？\s]{2,10})/g], weight: 10 },
                age: { patterns: [/我(\d{1,2})歲/g, /今年(\d{1,2})歲/g], weight: 8 },
                gender: { patterns: [/我是(男|女)生/g, /我是(男|女)性/g], weight: 7 },
                location: { patterns: [/我住在([^，。！？\s]{2,20})/g, /住在([^，。！？\s]{2,20})/g], weight: 8 }
            },
            
            // 聯絡資訊
            contact: {
                phone: { patterns: [/(\d{2,4}[-－]\d{3,4}[-－]\d{3,4})/g, /(\d{8,11})/g], weight: 9 },
                email: { patterns: [/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g], weight: 9 },
                address: { patterns: [/地址[：:]\s*([^，。！？\s]{5,50})/g], weight: 6 }
            },
            
            // 教育背景
            education: {
                school: { patterns: [/就讀於([^，。！？\s]{2,20})/g, /在([^，。！？\s]{2,20})上學/g], weight: 8 },
                major: { patterns: [/主修([^，。！？\s]{2,20})/g, /讀([^，。！？\s]{2,20})系/g], weight: 7 },
                grade: { patterns: [/我(大一|大二|大三|大四|研一|研二)/g], weight: 6 }
            },
            
            // 職業資訊
            career: {
                company: { patterns: [/在([^，。！？\s]{2,20})工作/g, /公司[：:]\s*([^，。！？\s]{2,20})/g], weight: 8 },
                position: { patterns: [/我是([^，。！？\s]{2,20})/g, /擔任([^，。！？\s]{2,20})/g], weight: 7 },
                industry: { patterns: [/從事([^，。！？\s]{2,20})行業/g, /在([^，。！？\s]{2,20})領域工作/g], weight: 6 }
            },
            
            // 興趣愛好
            interests: {
                hobbies: { patterns: [/我喜歡([^，。！？\s]{2,20})/g, /愛好([^，。！？\s]{2,20})/g], weight: 5 },
                sports: { patterns: [/我打([^，。！？\s]{2,10})/g, /喜歡([^，。！？\s]{2,10})運動/g], weight: 4 },
                entertainment: { patterns: [/我聽([^，。！？\s]{2,20})音樂/g, /看([^，。！？\s]{2,20})電影/g], weight: 3 }
            },
            
            // 個性特質
            personality: {
                traits: { patterns: [/我比較([^，。！？\s]{2,10})/g, /我是一個([^，。！？\s]{2,10})的人/g], weight: 4 },
                values: { patterns: [/我重視([^，。！？\s]{2,20})/g, /我相信([^，。！？\s]{2,20})/g], weight: 5 }
            },
            
            // 生活狀況
            lifestyle: {
                family: { patterns: [/我有([^，。！？\s]{2,10})個孩子/g, /我(已婚|單身)/g], weight: 6 },
                pets: { patterns: [/我養([^，。！？\s]{2,10})/g, /我有([^，。！？\s]{2,10})寵物/g], weight: 3 },
                health: { patterns: [/我有([^，。！？\s]{2,20})問題/g, /我(健康|不健康)/g], weight: 7 }
            }
        };
    }
    
    // 載入現有人物誌
    loadProfile() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : {
                basic: {},
                contact: {},
                education: {},
                career: {},
                interests: {},
                personality: {},
                lifestyle: {},
                metadata: {
                    createdAt: Date.now(),
                    lastUpdated: Date.now(),
                    confidence: 0,
                    totalInteractions: 0
                }
            };
        } catch (error) {
            console.error('載入人物誌失敗:', error);
            return this.getEmptyProfile();
        }
    }
    
    // 儲存人物誌
    saveProfile() {
        try {
            this.profile.metadata.lastUpdated = Date.now();
            localStorage.setItem(this.storageKey, JSON.stringify(this.profile));
            return true;
        } catch (error) {
            console.error('儲存人物誌失敗:', error);
            return false;
        }
    }
    
    // 分析對話內容並更新人物誌
    analyzeAndUpdate(text) {
        const extractedInfo = this.extractInformation(text);
        const updated = this.updateProfile(extractedInfo);
        
        if (updated) {
            this.profile.metadata.totalInteractions++;
            this.calculateConfidence();
            this.saveProfile();
        }
        
        return extractedInfo;
    }
    
    // 提取資訊
    extractInformation(text) {
        const extracted = {};
        
        Object.keys(this.profileAttributes).forEach(category => {
            extracted[category] = {};
            
            Object.keys(this.profileAttributes[category]).forEach(attribute => {
                const config = this.profileAttributes[category][attribute];
                const values = [];
                
                config.patterns.forEach(pattern => {
                    const matches = text.match(pattern);
                    if (matches) {
                        matches.forEach(match => {
                            const value = match.replace(pattern, '$1').trim();
                            if (value && value.length > 0) {
                                values.push({
                                    value: value,
                                    confidence: config.weight,
                                    extractedAt: Date.now()
                                });
                            }
                        });
                    }
                });
                
                if (values.length > 0) {
                    extracted[category][attribute] = values;
                }
            });
        });
        
        return extracted;
    }
    
    // 更新人物誌
    updateProfile(extractedInfo) {
        let hasUpdates = false;
        
        Object.keys(extractedInfo).forEach(category => {
            if (!this.profile[category]) {
                this.profile[category] = {};
            }
            
            Object.keys(extractedInfo[category]).forEach(attribute => {
                const newValues = extractedInfo[category][attribute];
                const existingValues = this.profile[category][attribute] || [];
                
                newValues.forEach(newValue => {
                    // 檢查是否已存在相同值
                    const exists = existingValues.some(existing => 
                        existing.value === newValue.value
                    );
                    
                    if (!exists) {
                        existingValues.push(newValue);
                        hasUpdates = true;
                    } else {
                        // 更新信心度（取最高值）
                        const existing = existingValues.find(existing => 
                            existing.value === newValue.value
                        );
                        if (existing && newValue.confidence > existing.confidence) {
                            existing.confidence = newValue.confidence;
                            existing.extractedAt = newValue.extractedAt;
                            hasUpdates = true;
                        }
                    }
                });
                
                this.profile[category][attribute] = existingValues;
            });
        });
        
        return hasUpdates;
    }
    
    // 計算人物誌信心度
    calculateConfidence() {
        let totalWeight = 0;
        let totalAttributes = 0;
        
        Object.keys(this.profileAttributes).forEach(category => {
            if (this.profile[category]) {
                Object.keys(this.profile[category]).forEach(attribute => {
                    const values = this.profile[category][attribute];
                    if (values && values.length > 0) {
                        const maxConfidence = Math.max(...values.map(v => v.confidence));
                        totalWeight += maxConfidence;
                        totalAttributes++;
                    }
                });
            }
        });
        
        this.profile.metadata.confidence = totalAttributes > 0 ? 
            Math.round((totalWeight / totalAttributes) * 10) / 10 : 0;
    }
    
    // 獲取人物誌摘要
    getProfileSummary() {
        const summary = {
            basic: this.getCategorySummary('basic'),
            contact: this.getCategorySummary('contact'),
            education: this.getCategorySummary('education'),
            career: this.getCategorySummary('career'),
            interests: this.getCategorySummary('interests'),
            personality: this.getCategorySummary('personality'),
            lifestyle: this.getCategorySummary('lifestyle'),
            metadata: this.profile.metadata
        };
        
        return summary;
    }
    
    // 獲取分類摘要
    getCategorySummary(category) {
        if (!this.profile[category]) return {};
        
        const summary = {};
        Object.keys(this.profile[category]).forEach(attribute => {
            const values = this.profile[category][attribute];
            if (values && values.length > 0) {
                // 取信心度最高的值
                const bestValue = values.reduce((best, current) => 
                    current.confidence > best.confidence ? current : best
                );
                summary[attribute] = {
                    value: bestValue.value,
                    confidence: bestValue.confidence,
                    alternatives: values.length > 1 ? values.length - 1 : 0
                };
            }
        });
        
        return summary;
    }
    
    // 生成人物誌描述
    generateProfileDescription() {
        const summary = this.getProfileSummary();
        let description = '';
        
        // 基本資訊
        if (summary.basic.name) {
            description += `姓名：${summary.basic.name.value}\n`;
        }
        if (summary.basic.age) {
            description += `年齡：${summary.basic.age.value}歲\n`;
        }
        if (summary.basic.location) {
            description += `居住地：${summary.basic.location.value}\n`;
        }
        
        // 教育背景
        if (summary.education.school) {
            description += `學校：${summary.education.school.value}\n`;
        }
        if (summary.education.major) {
            description += `專業：${summary.education.major.value}\n`;
        }
        
        // 職業資訊
        if (summary.career.company) {
            description += `公司：${summary.career.company.value}\n`;
        }
        if (summary.career.position) {
            description += `職位：${summary.career.position.value}\n`;
        }
        
        // 興趣愛好
        if (summary.interests.hobbies) {
            description += `興趣：${summary.interests.hobbies.value}\n`;
        }
        
        return description.trim();
    }
    
    // 清空人物誌
    clearProfile() {
        this.profile = this.getEmptyProfile();
        this.saveProfile();
    }
    
    // 獲取空的人物誌
    getEmptyProfile() {
        return {
            basic: {},
            contact: {},
            education: {},
            career: {},
            interests: {},
            personality: {},
            lifestyle: {},
            metadata: {
                createdAt: Date.now(),
                lastUpdated: Date.now(),
                confidence: 0,
                totalInteractions: 0
            }
        };
    }
    
    // 匯出人物誌
    exportProfile() {
        return {
            profile: this.profile,
            summary: this.getProfileSummary(),
            description: this.generateProfileDescription(),
            exportDate: new Date().toISOString()
        };
    }
    
    // 匯入人物誌
    importProfile(profileData) {
        try {
            this.profile = profileData.profile || this.getEmptyProfile();
            this.saveProfile();
            return true;
        } catch (error) {
            console.error('匯入人物誌失敗:', error);
            return false;
        }
    }
}

// 全域人物誌管理器
class ProfileManager {
    constructor() {
        this.profiles = new Map();
    }
    
    // 獲取或創建人物誌
    getProfile(agentId) {
        if (!this.profiles.has(agentId)) {
            this.profiles.set(agentId, new DynamicProfile(agentId));
        }
        return this.profiles.get(agentId);
    }
    
    // 分析對話並更新人物誌
    analyzeConversation(agentId, text) {
        const profile = this.getProfile(agentId);
        return profile.analyzeAndUpdate(text);
    }
    
    // 獲取人物誌摘要
    getProfileSummary(agentId) {
        const profile = this.getProfile(agentId);
        return profile.getProfileSummary();
    }
    
    // 生成人物誌描述
    generateProfileDescription(agentId) {
        const profile = this.getProfile(agentId);
        return profile.generateProfileDescription();
    }
    
    // 清空人物誌
    clearProfile(agentId) {
        const profile = this.getProfile(agentId);
        profile.clearProfile();
    }
    
    // 匯出所有人物誌
    exportAllProfiles() {
        const exportData = {};
        this.profiles.forEach((profile, agentId) => {
            exportData[agentId] = profile.exportProfile();
        });
        return exportData;
    }
}

// 建立全域人物誌管理器實例
window.profileManager = new ProfileManager();

// 匯出類別供外部使用
window.DynamicProfile = DynamicProfile;
window.ProfileManager = ProfileManager;
