const express = require('express');
const cors = require('cors');
const axios = require('axios'); // AI 엔진과 통신
const app = express();
app.use(express.json());
app.use(cors());

// AI 1이 구축한 API 서버 주소
const AI_ENGINE_URL = 'http://localhost:8000'; // ai/main.py

// --- 가짜 DB (실제로는 MongoDB/PostgreSQL 사용) ---
const db = {
  scenarios: {}, // { "s_123": { rules: {...} } }
  scenario_states: {}, // { "s_123": { patience: 10, emotion: 'Neutral' } }
  chat_logs: {} // { "s_123": [ { sender: 'user', text: '...' } ] }
};

// --- API 1: (Phase 1) 시나리오 생성 ---
app.post('/api/scenario/create', (req, res) => {
  const scenarioId = `s_${Date.now()}`;
  const { scene_description, core_emotion, actor_name, actor_rules } = req.body;
  
  // 1. 규칙 저장
  db.scenarios[scenarioId] = {
    character_name: actor_name,
    scene_description: scene_description,
    core_emotion: core_emotion,
    behavior_rules: actor_rules, // AI 2가 깎은 '기본 행동 규칙'과 조합됨
  };
  // 2. 초기 상태 저장
  db.scenario_states[scenarioId] = {
    patience: 10,
    emotion: 'Neutral'
  };
  // 3. 로그 초기화
  db.chat_logs[scenarioId] = [];
  
  console.log("BE: 새 시나리오 생성:", scenarioId);
  res.json({ scenario_id: scenarioId });
});

// --- API 2: (Phase 3) 채팅 응답 (핵심!) ---
app.post('/api/chat/:scenarioId/response', async (req, res) => {
  const { scenarioId } = req.params;
  const { message } = req.body;
  
  try {
    const currentState = db.scenario_states[scenarioId];
    const rules = db.scenarios[scenarioId];
    db.chat_logs[scenarioId].push({ sender: 'user', text: message });
    
    // AI 1에게 'JSON 명세'대로 요청
    const aiResponse = await axios.post(`${AI_ENGINE_URL}/ai/generate_simulation`, {
      current_state: currentState,
      rules: rules,
      user_message: message
    });
    
    const { thought_process, state_update, response } = aiResponse.data;
    
    // (핵심!) DB에 '새 상태' 갱신
    db.scenario_states[scenarioId] = state_update;
    db.chat_logs[scenarioId].push({ sender: 'ai', text: response });
    
    console.log("BE: 상태 갱신:", scenarioId, state_update);
    
    // FE 2에게 응답 (게이밍 요소 없음)
    res.json({ ai_response: response });
    
  } catch (error) {
    console.error("BE -> AI 엔진 통신 오류 (Simulation):", error.message);
    res.status(500).json({ error: "AI 엔진이 응답하지 않습니다." });
  }
});

// --- API 3: (Phase 3 - 힌트) 실시간 코칭 ---
app.post('/api/chat/:scenarioId/coaching_hint', async (req, res) => {
  const { scenarioId } = req.params;
  const currentLog = db.chat_logs[scenarioId];
  
  try {
    // AI 1에게 '분석' 요청
    const aiResponse = await axios.post(`${AI_ENGINE_URL}/ai/generate_analysis`, {
      analysis_type: 'hint',
      full_log: currentLog,
      rules: db.scenarios[scenarioId]
    });
    
    res.json({ hint: aiResponse.data.hint });

  } catch (error) {
    console.error("BE -> AI 엔진 통신 오류 (Hint):", error.message);
    res.status(500).json({ error: "AI 분석 엔진이 응답하지 않습니다." });
  }
});

// --- (API 4: 리플렉션, API 5: 리포트 생성 ... 생략) ---

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`BACKEND(BE 1) 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
