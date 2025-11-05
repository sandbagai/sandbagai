const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config(); // .env 파일 로드

const app = express();
app.use(express.json());
app.use(cors()); 

// --- 1. 환경 변수 및 상수 ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/opsrc_project_db';
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';
const PORT = process.env.PORT || 3001;

// --- 2. MongoDB 연결 ---
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  });

// --- 3. DB 스키마 정의 (★ v8.0: AI의 6가지 감정 상태와 일치 ★) ---
const StateSchema = new mongoose.Schema({
  anger: { type: Number, default: 0, min: 0, max: 100 },
  disgust: { type: Number, default: 0, min: 0, max: 100 },
  fear: { type: Number, default: 0, min: 0, max: 100 },
  joy: { type: Number, default: 0, min: 0, max: 100 },
  sadness: { type: Number, default: 0, min: 0, max: 100 },
  surprise: { type: Number, default: 0, min: 0, max: 100 },
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true }, // 'user' 또는 'ai' (또는 actor_name)
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

// (★ v8.0: front/ 에서 보낸 4가지 규칙 저장 ★)
const RulesSchema = new mongoose.Schema({
  scene_description: { type: String, required: true },
  core_emotion: { type: String, required: true },
  actor_name: { type: String, required: true },
  actor_rules: { type: String, required: true },
}, { _id: false });

const ScenarioSchema = new mongoose.Schema({
  rules: RulesSchema,
  initialState: StateSchema,
  currentState: StateSchema,
  chatLog: [MessageSchema],
  reflection: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const Scenario = mongoose.model('Scenario', ScenarioSchema);

// --- 4. API 엔드포인트 ---

// (API 1: 시나리오 생성 - ★ v8.0 최종본 ★)
app.post('/api/scenario/create', async (req, res) => {
  try {
    // 1. FE가 보낸 '이름표' 그대로 받기
    const { scene_description, core_emotion, actor_name, actor_rules } = req.body;

    // 2. FE가 보낸 데이터 유효성 검사
    if (!scene_description || !core_emotion || !actor_name || !actor_rules) {
      return res.status(400).json({ error: "모든 시나리오 필드를 입력해야 합니다." });
    }

    // 3. AI 엔진(InitialSimulationRequest)이 알아듣는 '이름표'로 '번역'
    const initialSimulationData = {
      scenario_description: scene_description,   
      character_name: actor_name,              
      character_personality: actor_rules       
    };

    console.log("BE: AI 엔진(/ai/generate_initial_simulation)에 요청 전송...");
    
    // 4. AI 엔진 호출
    const aiResponse = await axios.post(
      `${AI_ENGINE_URL}/ai/generate_initial_simulation`, 
      initialSimulationData 
    );

    // 5. AI 응답 수신 (★ v8.0 양식 ★)
    const { action, emotion_change, decision_points, dialogue_analysis } = aiResponse.data;

    // 6. DB에 저장
    const newScenario = new Scenario({
      rules: { scene_description, core_emotion, actor_name, actor_rules },
      initialState: emotion_change.new_emotion_state, // AI가 계산한 초기 상태
      currentState: emotion_change.new_emotion_state, // 현재 상태 = 초기 상태
      chatLog: [{ sender: 'ai', text: action, timestamp: Date.now() }] // AI의 첫 마디
    });
    
    await newScenario.save();
    
    // 7. FE에 최종 응답
    res.status(201).json({ 
      scenario_id: newScenario._id, 
      initial_message: action 
    });

  } catch (error) {
    console.error("API /api/scenario/create 오류:", error.message);
    if (error.response) {
      console.error("AI 엔진 응답 오류 (422 또는 500):", error.response.data);
      return res.status(500).json({ 
        error: "AI 엔진 처리 중 오류가 발생했습니다.", 
        ai_details: error.response.data 
      });
    }
    res.status(500).json({ error: "시나리오 생성 중 서버 오류가 발생했습니다." });
  }
});

// (API 1.5: FE 2용 - 채팅방 초기 상태 로드)
app.get('/api/scenario/:scenarioId/initial_state', async (req, res) => {
  try {
    const scenario = await Scenario.findById(req.params.scenarioId);
    if (!scenario) return res.status(404).json({ error: "시나리오를 찾을 수 없습니다." });
    
    res.json({ 
      initial_state: scenario.currentState, 
      actor_name: scenario.rules.actor_name,
      initial_message: scenario.chatLog[0]?.text // AI의 첫 마디
    });
  } catch (error) {
    res.status(500).json({ error: "초기 상태 로드 실패" });
  }
});

// (API 2: 채팅 응답 - ★ v8.0 최종본 ★)
app.post('/api/chat/:scenarioId/response', async (req, res) => {
  const { scenarioId } = req.params;
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "메시지를 입력해야 합니다." });
  }

  try {
    const scenario = await Scenario.findById(scenarioId);
    if (!scenario) return res.status(404).json({ error: "시나리오를 찾을 수 없습니다." });

    scenario.chatLog.push({ sender: 'user', text: message, timestamp: Date.now() });
    const chat_history_str = scenario.chatLog.map(log => `${log.sender}: ${log.text}`).join('\n');

    // 3. (★ v8.0: AI 엔진에 보낼 데이터 조립 - SimulationRequest 기준 ★)
    const dataForAiEngine = {
        scenario_description: scenario.rules.scene_description,
        character_name: scenario.rules.actor_name,
        character_personality: scenario.rules.actor_rules,
        current_character_emotions: scenario.currentState, // (DB의 현재 상태)
        user_input: message,
        conversation_history: chat_history_str,
        thought_process: "" // (이전 턴의 thought_process를 저장했다가 넘겨줄 수도 있음)
    };

    console.log("BE: AI 엔진(/ai/generate_simulation)에 요청 전송...");

    // 4. AI 엔진 호출
    const aiResponse = await axios.post(
      `${AI_ENGINE_URL}/ai/generate_simulation`, 
      dataForAiEngine 
    );
    
    // 5. AI 응답 수신 (★ v8.0 양식 ★)
    const { action, emotion_change, dialogue_analysis } = aiResponse.data;
    
    // 6. DB에 '새 상태'와 'AI 응답 로그' 갱신
    scenario.currentState = emotion_change.new_emotion_state; 
    scenario.chatLog.push({ sender: 'ai', text: action, timestamp: Date.now() });
    
    await scenario.save();
    
    console.log("BE: AI 상태 갱신 완료. FE로 응답 전송.");
    
    // 7. FE에 'AI 응답'과 '갱신된 감정 상태' 전송
    res.json({
      ai_response: action, // (★ v8.0: 'response' -> 'action' ★)
      updated_state: emotion_change.new_emotion_state // (★ v8.0 양식 ★)
    });
    
  } catch (error) {
    console.error("API /api/chat/:scenarioId/response 오류:", error.message);
    if (error.response) {
      console.error("AI 엔진 응답 오류:", error.response.data);
      return res.status(500).json({ 
        error: "AI 엔진 처리 중 오류가 발생했습니다.", 
        ai_details: error.response.data 
      });
    }
    res.status(500).json({ error: "채팅 응답 처리 중 서버 오류가 발생했습니다." });
  }
});

// (API 3: 힌트 요청 - ★ v8.0 최종본 ★)
app.get('/api/chat/:scenarioId/hint', async (req, res) => {
  const { scenarioId } = req.params;
  try {
    const scenario = await Scenario.findById(scenarioId);
    if (!scenario) return res.status(404).json({ error: "시나리오를 찾을 수 없습니다." });

    const chat_history_str = scenario.chatLog.map(log => `${log.sender}: ${log.text}`).join('\n');

    const dataForAiEngine = {
        scenario_description: scenario.rules.scene_description,
        character_name: scenario.rules.actor_name,
        character_personality: scenario.rules.actor_rules,
        current_character_emotions: scenario.currentState,
        user_input: scenario.chatLog.slice(-1)[0]?.text || "", // 마지막 메시지
        conversation_history: chat_history_str,
        thought_process: "" 
    };

    const aiResponse = await axios.post(
      `${AI_ENGINE_URL}/ai/generate_hint`, 
      dataForAiEngine
    );

    res.json({ hint_message: aiResponse.data.hint }); // (ai/main.py의 HintResponse와 일치)
  } catch (error) {
    res.status(500).json({ error: "힌트 생성 중 오류 발생" });
  }
});

// (API 4: 성찰 가이드 요청 - ★ v8.0 최종본 ★)
app.get('/api/reflect/:scenarioId', async (req, res) => {
  const { scenarioId } = req.params;
  try {
    const scenario = await Scenario.findById(scenarioId);
    if (!scenario) return res.status(404).json({ error: "시나리오를 찾을 수 없습니다." });

    const chat_history_str = scenario.chatLog.map(log => `${log.sender}: ${log.text}`).join('\n');

    const dataForAiEngine = {
        analysis_type: "reflection_guide",
        scenario_description: scenario.rules.scene_description,
        character_name: scenario.rules.actor_name,
        character_personality: scenario.rules.actor_rules,
        initial_state: scenario.initialState,
        final_state: scenario.currentState,
        user_reflection: scenario.reflection,
        conversation_history: chat_history_str,
        user_input: scenario.chatLog.slice(-1)[0]?.text || "",
        thought_process: "" 
    };
    
    const aiResponse = await axios.post(
      `${AI_ENGINE_URL}/ai/generate_analysis`, 
      dataForAiEngine
    );

    res.json({ reflection_guide: aiResponse.data.analysis_result });
  } catch (error) {
    res.status(500).json({ error: "성찰 가이드 생성 중 오류 발생" });
  }
});

// (API 4.5: 사용자 성찰 저장 - 4주차 완성본)
app.post('/api/reflect/:scenarioId/save', async (req, res) => {
  const { scenarioId } = req.params;
  const { user_reflection } = req.body;

  if (!user_reflection) {
    return res.status(400).json({ error: "성찰 내용을 입력해야 합니다." });
  }

  try {
    await Scenario.findByIdAndUpdate(scenarioId, { 
      reflection: user_reflection 
    });
    res.status(200).json({ message: "성찰 내용이 저장되었습니다." });
  } catch (error) {
    res.status(500).json({ error: "성찰 내용 저장 실패" });
  }
});

// (API 5: 최종 리포트 요청 - ★ v8.0 최종본 ★)
app.get('/api/report/:scenarioId', async (req, res) => {
  const { scenarioId } = req.params;
  try {
    const scenario = await Scenario.findById(scenarioId);
    if (!scenario) return res.status(4404).json({ error: "시나리오를 찾을 수 없습니다." });

    const chat_history_str = scenario.chatLog.map(log => `${log.sender}: ${log.text}`).join('\n');

    const dataForAiEngine = {
        analysis_type: "final_report",
        scenario_description: scenario.rules.scene_description,
        character_name: scenario.rules.actor_name,
        character_personality: scenario.rules.actor_rules,
        initial_state: scenario.initialState,
        final_state: scenario.currentState,
        user_reflection: scenario.reflection,
        conversation_history: chat_history_str,
        user_input: scenario.chatLog.slice(-1)[0]?.text || "",
        thought_process: "" 
    };

    const aiResponse = await axios.post(
      `${AI_ENGINE_URL}/ai/generate_analysis`, 
      dataForAiEngine
    );
    
    res.json({ report: aiResponse.data.analysis_result });
  } catch (error) {
    res.status(500).json({ error: "리포트 생성 중 오류 발생" });
  }
});


// --- 5. 서버 실행 ---
app.listen(PORT, () => {
  console.log(`BE 서버가 포트 ${PORT}에서 실행 중입니다.`);
});
