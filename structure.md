# Project Structure

## 개요
- 세 개의 주요 폴더(`ai/`, `back/`, `front/`)가 단계별 감정 시뮬레이션 서비스를 구성합니다.
- Phase 흐름: 사용자가 `front`에서 시나리오를 만들고 → `back`이 인메모리 DB와 AI 엔진을 통해 상태를 관리하며 → `ai`가 LLM 프롬프트를 생성했다고 가정하고 응답을 시뮬레이션합니다.

## ai/
- `main.py`: FastAPI 기반 AI 엔진 서버. 백엔드와 합의한 Pydantic 모델을 사용해 JSON 스키마를 검증하고, 시뮬레이션·분석 요청에 대해 하드코딩된 JSON을 반환합니다.
- `master_prompt_simulation.txt`: `GENERATE_SIMULATION` 프롬프트 템플릿. 현재 상태, 규칙, 사용자 메시지를 채워 넣어 LLM 호출에 사용합니다.
- `master_prompt_analysis.txt`: `GENERATE_ANALYSIS` 프롬프트 템플릿. 힌트·리포트 등 분석형 응답 생성을 위한 기본 문구를 담습니다.

## back/
- `server.js`: Express 기반 백엔드 서버.
  - `/api/scenario/create`: Phase 1. 사용자가 입력한 시나리오 정보를 인메모리 DB에 저장하고 고유 ID를 생성합니다.
  - `/api/chat/:scenarioId/response`: Phase 3. 누적 상태/규칙을 AI 엔진에 전달하고 응답과 상태 업데이트를 수신합니다.
  - `/api/chat/:scenarioId/coaching_hint`: Phase 3 힌트. 대화 로그 전체를 AI 엔진에 넘겨 코칭 문장을 받습니다.
  - `db` 객체: 간단한 인메모리 저장소. 실제 서비스에서는 외부 DB로 대체할 예정입니다.

## front/
- `src/pages/ScenarioBuilder.jsx`: Phase 1 UI. 사용자의 상황, 감정, 캐릭터 규칙을 입력받아 시나리오 생성 API를 호출하고 채팅방 라우트로 이동합니다.
- `src/pages/ChatRoom.jsx`: Phase 3 UI. 사용자 메시지를 전송해 AI 응답을 받고, 요청 시 코칭 힌트를 띄우며, 종료 시 리플렉션 페이지로 이동하도록 라우팅합니다.

## 데이터 흐름 요약
1. **시나리오 생성**: 프론트에서 폼 제출 → 백엔드 `/api/scenario/create` → 인메모리 DB에 저장 → 시나리오 ID 반환.
2. **시뮬레이션 대화**: 프론트가 메시지를 전송 → 백엔드 `/api/chat/:scenarioId/response` → AI 엔진 `/ai/generate_simulation` 호출 → 상태 갱신 후 응답 반환.
3. **코칭 힌트**: 프론트가 힌트를 요청 → 백엔드 `/coaching_hint` → AI 엔진 `/ai/generate_analysis` 호출 → 힌트 텍스트 반환.
4. **이후 단계 준비**: Phase 4/6(리플렉션·리포트)은 엔드포인트만 예고되어 있으며, 동일한 데이터 구조를 기반으로 확장될 예정입니다.
