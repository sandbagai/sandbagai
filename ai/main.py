from fastapi import FastAPI
from pydantic import BaseModel
import httpx # (가상 LLM API 호출용)
import json
import uvicorn

app = FastAPI()

# --- BE 1과 약속한 'JSON 명세' (Pydantic 모델) ---
# (1) Simulation
class SimCurrentState(BaseModel):
    patience: int
    emotion: str

class SimRules(BaseModel):
    character_name: str
    scene_description: str
    core_emotion: str
    behavior_rules: str # 유저가 입력한 규칙

class SimulationRequest(BaseModel): # BE -> AI
    current_state: SimCurrentState
    rules: SimRules
    user_message: str

class StateUpdate(BaseModel): # AI -> BE
    patience: int
    emotion: str

class SimulationResponse(BaseModel): # AI -> BE
    thought_process: str
    state_update: StateUpdate
    response: str

# (2) Analysis
class AnalysisRequest(BaseModel): # BE -> AI
    analysis_type: str # 'hint', 'reflection', 'report'
    full_log: list
    rules: SimRules

class HintResponse(BaseModel): # AI -> BE
    hint: str
    
# --- (AI 2) 프롬프트 로드 ---
try:
    with open("master_prompt_simulation.txt", "r", encoding="utf-8") as f:
        SIMULATION_PROMPT_TEMPLATE = f.read()
    with open("master_prompt_analysis.txt", "r", encoding="utf-8") as f:
        ANALYSIS_PROMPT_TEMPLATE = f.read()
except FileNotFoundError:
    print("FATAL: ai/ 폴더에 프롬프트(.txt) 파일이 없습니다. (AI 2 작업 필요)")
    exit()
    
# --- (가상 LLM API 호출 함수) ---
# (실제로는 genai.GenerativeModel(...).generate_content(prompt) 호출)
def call_llm(prompt: str) -> str:
    print(f"--- LLM에 프롬프트 전송 (길이: {len(prompt)}) ---")
    
    # (가상 응답 시뮬레이션)
    if "GENERATE_SIMULATION" in prompt:
        print("... (시뮬레이션 응답 생성 중) ...")
        # LLM이 이 JSON 문자열을 뱉었다고 가정
        return """
        {
          "thought_process": "사용자가 '논리적 대응'을 함. 'Patience' -3 적용.",
          "state_update": { "patience": 7, "emotion": "Flustered" },
          "response": "어... 그래? 그건 이따가 보고."
        }
        """
    elif "GENERATE_ANALYSIS" in prompt:
        print("... (분석/힌트 응답 생성 중) ...")
        # 'hint' 요청에 대한 가상 응답
        return """{ "hint": "AI가 '당황(Flustered)' 상태입니다. '논리'로 계속 밀어붙여 보세요." }"""
    return "{}"


# --- API 1: (Phase 3) 시뮬레이션 응답 생성 ---
@app.post("/ai/generate_simulation", response_model=SimulationResponse)
async def generate_simulation(request: SimulationRequest):
    
    # AI 2의 프롬프트에 '명세' 주입
    final_prompt = SIMULATION_PROMPT_TEMPLATE.format(
        CURRENT_STATE=request.current_state.model_dump_json(),
        RULES=request.rules.model_dump_json(),
        USER_MESSAGE=request.user_message
    )
    
    llm_response_json_str = call_llm(final_prompt)
    
    return SimulationResponse.model_validate_json(llm_response_json_str)

# --- API 2: (Phase 3-힌트, 4, 6) 분석/힌트/리포트 생성 ---
@app.post("/ai/generate_analysis")
async def generate_analysis(request: AnalysisRequest):
    
    final_prompt = ANALYSIS_PROMPT_TEMPLATE.format(
        ANALYSIS_TYPE=request.analysis_type,
        FULL_LOG=str(request.full_log),
        RULES=request.rules.model_dump_json()
    )
    
    llm_response_json_str = call_llm(final_prompt)
    
    if request.analysis_type == 'hint':
        return HintResponse.model_validate_json(llm_response_json_str)
    # (... reflection, report 응답 모델 분기 처리 ...)
    return HintResponse(hint="분석 로직 미구현") # 임시

if __name__ == "__main__":
    print("AI ENGINE(AI 1) 서버가 포트 8000에서 실행 중입니다.")
    uvicorn.run(app, host="0.0.0.0", port=8000)
