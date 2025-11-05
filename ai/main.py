import json
import uvicorn
import os
import re
import google.generativeai as genai
from dotenv import load_dotenv
import asyncio
from fastapi import FastAPI, HTTPException, Request, status
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

# --- 1. .env 파일에서 환경 변수 로드 ---
load_dotenv()

# --- 2. 프롬프트 템플릿 로드 ---
# (파일 로드 함수)
def load_prompt_template(filename: str) -> str:
    filepath = os.path.join(os.path.dirname(__file__), filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"FATAL ERROR: 프롬프트 파일 '{filename}'을(를) 찾을 수 없습니다. ai/ 폴더에 파일이 있는지 확인하세요.")
        raise
    except Exception as e:
        print(f"FATAL ERROR: 프롬프트 파일 '{filename}' 로드 중 오류 발생: {e}")
        raise

# (모든 프롬프트 템플릿 로드)
try:
    INITIAL_SIMULATION_PROMPT = load_prompt_template("master_prompt_initial_simulation.txt")
    SIMULATION_PROMPT = load_prompt_template("master_prompt_simulation.txt")
    HINT_PROMPT = load_prompt_template("master_prompt_hint.txt")
    REFLECTION_GUIDE_PROMPT = load_prompt_template("master_prompt_reflection_guide.txt")
    FINAL_REPORT_PROMPT = load_prompt_template("master_prompt_final_report.txt")
except Exception as e:
    print(f"프롬프트 파일 로드 실패: {e}. 서버를 중지합니다.")
    exit()
# --- 프롬프트 로드 끝 ---


app = FastAPI()

# --- 3. (★ 핵심 ★) '진짜 LLM' 설정 ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("FATAL: GEMINI_API_KEY 환경 변수가 .env 파일에 설정되지 않았습니다.")
    # 실제로는 여기서 서버가 시작되지 않도록 처리해야 함
    
genai.configure(api_key=GEMINI_API_KEY)

# (★ 중요 ★) 사용자님이 조회한, 사용 가능한 모델 이름으로 설정
# 'models/gemini-2.5-pro' 또는 'models/gemini-pro-latest' 등
MODEL_NAME = 'models/gemini-2.5-pro' 
try:
    model = genai.GenerativeModel(MODEL_NAME)
    print(f"성공: Gemini 모델 '{MODEL_NAME}'을(를) 로드했습니다.")
except Exception as e:
    print(f"FATAL: Gemini 모델 '{MODEL_NAME}' 로드 실패. API 키 또는 모델 이름을 확인하세요. 오류: {e}")
    exit()


# --- 4. BE 1과 약속한 'JSON 명세' (Pydantic 모델) ---

# (공용 모델)
class EmotionState(BaseModel):
    # (★ v8.0: LLM이 뱉는 6가지 감정으로 변경 ★)
    anger: int = Field(..., ge=0, le=100)
    disgust: int = Field(..., ge=0, le=100)
    fear: int = Field(..., ge=0, le=100)
    joy: int = Field(..., ge=0, le=100)
    sadness: int = Field(..., ge=0, le=100)
    surprise: int = Field(..., ge=0, le=100)

class Rules(BaseModel):
    # (★ back/server.js 에서 보내는 4가지 키 ★)
    scene_description: str
    core_emotion: str
    actor_name: str
    actor_rules: str

class Message(BaseModel):
    sender: str
    text: str
    timestamp: Optional[str] = None 

# (API 1 - 시나리오 생성용)
class InitialSimulationRequest(BaseModel): # (★ back/server.js의 API 1과 일치 ★)
    scenario_description: str
    character_name: str
    character_personality: str

class EmotionChange(BaseModel):
    new_emotion_state: EmotionState
    reasoning: str

class InitialSimulationResponse(BaseModel): # (★ LLM 프롬프트의 JSON 양식과 일치 ★)
    action: str
    emotion_change: EmotionChange 
    decision_points: List[str]
    dialogue_analysis: str

# (API 2 - 채팅 응답용)
class SimulationRequest(BaseModel): # (★ back/server.js의 API 2와 일치 ★)
    current_state: EmotionState 
    rules: Rules
    user_message: str
    chat_log: List[Message] 

class SimulationResponse(BaseModel): # (★ LLM 프롬프트의 JSON 양식과 일치 ★)
    action: str
    emotion_change: EmotionChange
    decision_points: List[str]
    empathy_score_change: int
    logic_score_change: int
    negotiation_score_change: int
    adaptability_score_change: int
    self_control_score_change: int
    critical_thinking_score_change: int
    dialogue_analysis: str

# (API 3 - 힌트용)
class HintRequest(BaseModel): # (★ back/server.js의 API 3과 일치 ★)
    chat_log: List[Message]
    current_state: EmotionState
    rules: Rules

class HintResponse(BaseModel): # (★ LLM 프롬프트의 JSON 양식과 일치 ★)
    hint: str # (master_prompt_hint.txt 의 JSON 키와 일치)

# (API 4/5 - 성찰/리포트용)
class AnalysisRequest(BaseModel): # (★ back/server.js의 API 4/5와 일치 ★)
    analysis_type: str 
    chat_log: List[Message]
    initial_state: EmotionState
    final_state: EmotionState
    user_reflection: Optional[str] = ""
    rules: Rules

class Feedback(BaseModel):
    emotional_intelligence: str
    communication_skills: str
    problem_solving_abilities: str

class AnalysisResultReport(BaseModel): # (리포트용 세부 명세)
    overall_assessment: str
    feedback: Feedback
    strengths: List[str]
    areas_for_improvement: List[str]
    conclusion: str

class ReflectionGuideResponse(BaseModel):
    reflection_guide: List[str]

class AnalysisResponse(BaseModel): # (★ back/server.js의 API 4/5와 일치 ★)
    # 성찰가이드는 List[str], 리포트는 AnalysisResultReport 객체
    analysis_result: List[str] | AnalysisResultReport 


# --- 5. (★ 핵심 ★) LLM JSON 파싱 및 재시도 로직 ---
async def call_llm_with_retry(prompt: str, response_model: BaseModel, max_retries: int = 3, retry_delay: int = 2):
    llm_output_text = None 
    for attempt in range(max_retries):
        try:
            print(f"--- [AI Engine] LLM 호출 시도 {attempt + 1} ---")
            response = await asyncio.to_thread(model.generate_content, prompt)
            llm_output_text = response.text

            if not llm_output_text or not llm_output_text.strip():
                print(f"DEBUG: LLM 응답이 비어있습니다 (시도 {attempt + 1}). 재시도합니다...")
                await asyncio.sleep(retry_delay)
                continue

            match = re.search(r'```json\s*(\{.*?\})\s*```', llm_output_text, re.DOTALL)
            if match:
                json_str = match.group(1)
            else:
                if llm_output_text.strip().startswith('{'):
                    json_str = llm_output_text
                else: 
                    raise json.JSONDecodeError("No JSON block found", llm_output_text, 0)

            parsed_json = json.loads(json_str)
            
            validated_response = response_model.model_validate(parsed_json)
            return validated_response 

        except json.JSONDecodeError as e:
            print(f"DEBUG: JSON 파싱 실패 (시도 {attempt + 1}): {e}")
            print(f"DEBUG: 원본 LLM 응답:\n{llm_output_text}")
            await asyncio.sleep(retry_delay)
        except Exception as e: 
            print(f"DEBUG: LLM 호출/검증 오류 (Pydantic/404 등) (시도 {attempt + 1}): {e}")
            if llm_output_text:
                print(f"DEBUG: 원본 LLM 응답:\n{llm_output_text}")
            await asyncio.sleep(retry_delay)
    
    raise HTTPException(status_code=500, detail="AI 엔진이 유효한 JSON 응답 생성에 실패했습니다 (3회 재시도).")


# --- 6. API 엔드포인트 ---

# (API 1) 시나리오 생성
@app.post("/ai/generate_initial_simulation", response_model=InitialSimulationResponse)
async def generate_initial_simulation(request: InitialSimulationRequest):
    try:
        final_prompt = INITIAL_SIMULATION_PROMPT.format(
            scenario_description=request.scenario_description,
            character_name=request.character_name,
            character_personality=request.character_personality,
        )

        print(f"DEBUG: Initial Simulation Prompt (요약):\n{final_prompt[:300]}...\n---")
        
        response_data = await call_llm_with_retry(
            final_prompt,
            response_model=InitialSimulationResponse 
        )

        return response_data
    except Exception as e:
        print(f"ERROR: generate_initial_simulation 실패: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate initial simulation: {str(e)}")


# (API 2) 채팅 응답 (★ 'KeyError' 및 'SyntaxError' 수정 ★)
@app.post("/ai/generate_simulation", response_model=SimulationResponse)
async def generate_simulation(request: SimulationRequest):
    try: 
        chat_history_str = "\n".join([f"{msg.sender}: {msg.text}" for msg in request.chat_log])

        # (★ 최종 수정: back/에서 보낸 키를 프롬프트에 전달 ★)
        final_prompt = SIMULATION_PROMPT.format(
            # (1) <Situation>
            scenario_description=request.rules.scene_description, 
            
            # (2) <Your Role>
            character_name=request.rules.actor_name,
            current_character_emotions=request.current_state.model_dump_json(), 
            character_personality=request.rules.actor_rules,
            
            # (3) <Applicant's Previous Action>
            user_input=request.user_message,
            
            # (4) <Conversation History>
            conversation_history=chat_history_str,
            
            # (5) <Your Thought Process>
            thought_process="" # (이건 AI가 생성할 것이므로, 템플릿상 빈칸으로 둠)
        )

        print(f"DEBUG: Simulation Prompt (요약):\n{final_prompt[:500]}...\n---")

        response_data = await call_llm_with_retry(
            final_prompt,
            response_model=SimulationResponse
        )
        return response_data
        
    except Exception as e: 
        print(f"ERROR: generate_simulation 실패: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate simulation response: {str(e)}")


# (API 3) 힌트 요청
@app.post("/ai/generate_hint", response_model=HintResponse)
async def generate_hint(request: HintRequest):
    try:
        chat_history_str = "\n".join([f"{msg.sender}: {msg.text}" for msg in request.chat_log])

        # (★ v8.0 프롬프트 키와 일치시키기 ★)
        final_prompt = HINT_PROMPT.format(
            scenario_description=request.rules.scene_description,
            character_name=request.rules.actor_name,
            character_personality=request.rules.actor_rules,
            current_character_emotions=request.current_state.model_dump_json(),
            user_input=request.chat_log[-1].text if request.chat_log else "", # 마지막 사용자 입력
            conversation_history=chat_history_str,
            thought_process=""
        )
        
        print(f"DEBUG: Hint Prompt (요약):\n{final_prompt[:300]}...\n---")

        response_data = await call_llm_with_retry(
            final_prompt,
            response_model=HintResponse
        )
        return response_data
    except Exception as e:
        print(f"ERROR: generate_hint 실패: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate hint: {str(e)}")


# (API 4/5) 성찰/리포트
@app.post("/ai/generate_analysis", response_model=AnalysisResponse)
async def generate_analysis(request: AnalysisRequest):
    try:
        chat_history_str = "\n".join([f"{msg.sender}: {msg.text}" for msg in request.chat_log])

        if request.analysis_type == "reflection_guide":
            prompt_template = REFLECTION_GUIDE_PROMPT
            response_pydantic_model = ReflectionGuideResponse # (★ v8.0 수정 ★)
        elif request.analysis_type == "final_report":
            prompt_template = FINAL_REPORT_PROMPT
            response_pydantic_model = AnalysisResultReport
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효하지 않은 analysis_type입니다.")

        # (★ v8.0 프롬프트 키와 일치시키기 ★)
        final_prompt = prompt_template.format(
            scenario_description=request.rules.scene_description,
            character_name=request.rules.actor_name,
            character_personality=request.rules.actor_rules,
            current_character_emotions=request.final_state.model_dump_json(), # (★ final_state로 변경 ★)
            user_input=request.chat_log[-1].text if request.chat_log else "", # 마지막 사용자 입력
            conversation_history=chat_history_str,
            thought_process="" # (사용자 성찰 내용을 thought_process 대신 사용)
            # (★ 참고: 프롬프트에 {USER_REFLECTION} 키가 필요하면 추가해야 함)
        )
        
        print(f"DEBUG: Analysis Prompt ({request.analysis_type}) (요약):\n{final_prompt[:300]}...\n---")

        response_data = await call_llm_with_retry(
            final_prompt,
            response_model=response_pydantic_model
        )
        
        # (★ v8.0 수정: 응답 형식을 AnalysisResponse로 통일 ★)
        if request.analysis_type == "reflection_guide":
            return AnalysisResponse(analysis_result=response_data.reflection_guide)
        else: 
            return AnalysisResponse(analysis_result=response_data)
            
    except Exception as e:
        print(f"ERROR: generate_analysis 실패: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate analysis: {str(e)}")


if __name__ == "__main__":
    print(f"AI ENGINE(AI 1) 서버가 포트 8000에서 실행 중입니다. (모델: {MODEL_NAME})")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
