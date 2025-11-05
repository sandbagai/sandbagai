from fastapi import FastAPI, HTTPException, Request, status
from pydantic import BaseModel, Field
import json
import uvicorn
import os
import re
import google.generativeai as genai
from dotenv import load_dotenv
import asyncio # 비동기 재시도 로직을 위해 추가
import httpx # HTTP 클라이언트 (Gemini 라이브러리 내부에서 사용)

load_dotenv() # .env 파일에서 환경 변수 로드
# --- 프롬프트 템플릿 로드 ---
def load_prompt_template(filename: str) -> str:
    filepath = os.path.join(os.path.dirname(__file__), filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()

initial_simulation_prompt_template = load_prompt_template("master_prompt_initial_simulation.txt")
SIMULATION_PROMPT_TEMPLATE = load_prompt_template("master_prompt_simulation.txt")
HINT_PROMPT_TEMPLATE = load_prompt_template("master_prompt_hint.txt")
REFLECTION_GUIDE_PROMPT_TEMPLATE = load_prompt_template("master_prompt_reflection_guide.txt")
FINAL_REPORT_PROMPT_TEMPLATE = load_prompt_template("master_prompt_final_report.txt")
# --- 프롬프트 템플릿 로드 끝 ---
app = FastAPI()

# --- (★ 핵심 ★) '진짜 LLM' 설정 ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("FATAL: GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. .env 파일을 확인하세요.")
    # 실제 배포 환경에서는 이 대신에 애플리케이션 시작을 막거나 로그를 남기는 방식으로 처리
    # 개발 편의를 위해 일단 경고만 띄우고 빈 문자열로 진행 (호출 시 에러 발생)
    # raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="API Key not configured.")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(
    'gemini-1.5-pro-latest',
    system_instruction="You are a highly analytical AI assistant. You must always adhere to the requested JSON output format strictly."
)

# --- BE와 약속한 'JSON 명세' ---
class EmotionState(BaseModel):
    stability: int = Field(ge=0, le=100) # 0-100 범위 강제
    anger: int = Field(ge=0, le=100)
    sorrow: int = Field(ge=0, le=100)
    compassion: int = Field(ge=0, le=100)

class Message(BaseModel):
    sender: str
    text: str
    timestamp: str = None # BE에서 넘어올 때 타임스탬프가 있을 수 있음

class Rules(BaseModel):
    scene_description: str
    core_emotion: str
    actor_name: str
    actor_rules: str

# --- API 1: 시뮬레이션 응답 생성 요청 모델 ---
class SimulationRequest(BaseModel): # BE -> AI
    current_state: EmotionState 
    rules: Rules
    user_message: str

class SimulationResponse(BaseModel): # AI -> BE
    thought_process: str
    state_update: EmotionState 
    response: str

# --- API 2: 힌트 생성 요청 모델 ---
class HintRequest(BaseModel): # BE -> AI
    chat_log: list[Message]
    current_state: EmotionState
    rules: Rules

class HintResponse(BaseModel): # AI -> BE
    hint_message: str

# --- API 3: 분석/리포트 생성 요청 모델 ---
class AnalysisRequest(BaseModel): # BE -> AI
    analysis_type: str # "reflection_guide" 또는 "final_report"
    chat_log: list[Message]
    initial_state: EmotionState
    final_state: EmotionState
    user_reflection: str = "" # 리포트 생성 시 사용자 성찰 내용 포함 가능
    rules: Rules

class AnalysisResult(BaseModel):
    summary: str
    emotion_trend: str
    learning_points: list[str]
    next_steps: str

class AnalysisResponse(BaseModel): # AI -> BE (타입에 따라 다른 모델 반환)
    analysis_result: str | AnalysisResult # 성찰 가이드는 str, 리포트는 AnalysisResult

# --- (★ 핵심 ★) LLM JSON 파싱 및 재시도 로직 ---
async def call_llm_with_retry(prompt: str, response_model: BaseModel, max_retries: int = 3, retry_delay: int = 2):
    for attempt in range(max_retries):
        try:
            print(f"--- LLM 호출 시도 {attempt + 1} ---")
            llm_response = await model.generate_content_async(prompt)
            llm_output_text = llm_response.text

            # LLM이 뱉은 텍스트에서 JSON 부분만 추출 (예: ```json ... ```)
            match = re.search(r'```json\s*(\{.*?\})\s*```', llm_output_text, re.DOTALL)
            if match:
                json_str = match.group(1)
            else:
                json_str = llm_output_text # JSON 블록이 없으면 전체 텍스트를 JSON으로 시도

            parsed_json = json.loads(json_str)
            
            # Pydantic 모델로 유효성 검사
            validated_response = response_model.model_validate(parsed_json)
            return validated_response

        except json.JSONDecodeError as e:
            print(f"JSON 파싱 실패 (시도 {attempt + 1}): {e}\n원본 LLM 출력:\n{llm_output_text}")
        except ValueError as e: # Pydantic model_validate 실패
            print(f"Pydantic 모델 유효성 검사 실패 (시도 {attempt + 1}): {e}\n파싱된 JSON:\n{parsed_json}")
        except httpx.HTTPStatusError as e:
            print(f"Gemini API HTTP 오류 (시도 {attempt + 1}): {e.response.status_code} - {e.response.text}")
        except Exception as e:
            print(f"예상치 못한 LLM 호출 오류 (시도 {attempt + 1}): {e}")

        if attempt < max_retries - 1:
            print(f"재시도 {retry_delay}초 후...")
            await asyncio.sleep(retry_delay)
    
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="LLM 응답 처리 실패: 유효한 JSON을 얻지 못했습니다.")


# --- API 1: (Phase 3) 시뮬레이션 응답 생성 ---
@app.post("/ai/generate_simulation", response_model=SimulationResponse)
async def generate_simulation(request: SimulationRequest):
    
    final_prompt = SIMULATION_PROMPT_TEMPLATE.format(
        CURRENT_STATE=request.current_state.model_dump_json(),
        RULES=request.rules.model_dump_json(),
        USER_MESSAGE=request.user_message,
        CHAT_LOG=json.dumps([msg.model_dump() for msg in request.chat_log], ensure_ascii=False) if hasattr(request, 'chat_log') and request.chat_log else "[]"
    )
    # initial_message를 위한 특별 처리
    if request.user_message == "[시뮬레이션 시작]":
        final_prompt = initial_simulation_prompt_template.format(
            RULES=request.rules.model_dump_json()
        )

    try:
        response = await call_llm_with_retry(final_prompt, SimulationResponse)
        return response
        
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"generate_simulation API 오류: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"AI 시뮬레이션 생성 중 오류 발생: {e}")

# --- API 2: (Phase 3) 힌트 생성 ---
@app.post("/ai/generate_hint", response_model=HintResponse)
async def generate_hint(request: HintRequest):
    
    final_prompt = HINT_PROMPT_TEMPLATE.format(
        CHAT_LOG=json.dumps([msg.model_dump() for msg in request.chat_log], ensure_ascii=False),
        CURRENT_STATE=request.current_state.model_dump_json(),
        RULES=request.rules.model_dump_json()
    )

    try:
        response = await call_llm_with_retry(final_prompt, HintResponse)
        return response
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"generate_hint API 오류: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"AI 힌트 생성 중 오류 발생: {e}")

# --- API 3: (Phase 4, 5) 분석/리포트 생성 ---
@app.post("/ai/generate_analysis", response_model=AnalysisResponse)
async def generate_analysis(request: AnalysisRequest):
    
    if request.analysis_type == "reflection_guide":
        prompt_template = REFLECTION_GUIDE_PROMPT_TEMPLATE
        response_pydantic_model = BaseModel # 문자열 반환을 위해 유연하게 처리
    elif request.analysis_type == "final_report":
        prompt_template = FINAL_REPORT_PROMPT_TEMPLATE
        response_pydantic_model = AnalysisResult # 리포트 구조에 맞게
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효하지 않은 analysis_type입니다.")

    final_prompt = prompt_template.format(
        CHAT_LOG=json.dumps([msg.model_dump() for msg in request.chat_log], ensure_ascii=False),
        INITIAL_STATE=request.initial_state.model_dump_json(),
        FINAL_STATE=request.final_state.model_dump_json(),
        USER_REFLECTION=request.user_reflection,
        RULES=request.rules.model_dump_json()
    )

    try:
        if request.analysis_type == "reflection_guide":
            llm_response = await call_llm_with_retry(final_prompt, BaseModel) # 임시 BaseModel
            return AnalysisResponse(analysis_result=llm_response.text) # 텍스트 필드로 직접 할당
        else: # final_report
            response = await call_llm_with_retry(final_prompt, AnalysisResult)
            return AnalysisResponse(analysis_result=response)
            
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"generate_analysis API 오류: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"AI 분석/리포트 생성 중 오류 발생: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
