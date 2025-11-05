import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import '../styles/ReflectionPage.css'; // 페이지 전용 CSS

function ReflectionPage() {
  const { scenarioId } = useParams();
  const navigate = useNavigate();
  const [reflectionText, setReflectionText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [reflectionResult, setReflectionResult] = useState(null); // AI 코치 분석 결과

  // (★ Week 4 ★) AI 코치로부터 성찰 가이드 요청
  useEffect(() => {
    const fetchReflectionGuide = async () => {
      setIsLoading(true);
      try {
        // 백엔드에 성찰 가이드 요청 API 호출 (AI 엔진 연동)
        const response = await axios.get(`/api/reflect/${scenarioId}`);
        setReflectionResult(response.data.reflection_guide); // AI 코치의 질문/가이드
      } catch (error) {
        console.error("성찰 가이드 로드 실패:", error);
        alert("성찰 가이드를 가져오는 데 실패했습니다.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchReflectionGuide();
  }, [scenarioId]);

  const handleSubmitReflection = async () => {
    setIsLoading(true);
    try {
      // 사용자의 성찰 내용을 백엔드에 저장
      await axios.post(`/api/reflect/${scenarioId}/save`, { user_reflection: reflectionText });
      alert("성찰 내용이 저장되었습니다. 이제 최종 리포트로 이동합니다.");
      navigate(`/report/${scenarioId}`); // 최종 리포트 페이지로 이동
    } catch (error) {
      console.error("성찰 내용 저장 실패:", error);
      alert("성찰 내용 저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="reflection-container">
      <div className="page-header">
        <h1>시뮬레이션 성찰</h1>
        <p>시뮬레이션 경험을 바탕으로 당신의 생각과 감정을 기록하고 AI 코치의 가이드를 받아보세요.</p>
      </div>

      <div className="reflection-content">
        <div className="ai-coach-guide">
          <h3>AI 코치의 성찰 가이드</h3>
          {isLoading ? (
            <p>AI 코치가 가이드를 준비 중입니다...</p>
          ) : reflectionResult ? (
            <p className="guide-text">{reflectionResult}</p>
          ) : (
            <p>가이드를 불러올 수 없습니다.</p>
          )}
        </div>

        <div className="user-reflection-input">
          <h3>당신의 성찰을 기록하세요</h3>
          <textarea
            value={reflectionText}
            onChange={(e) => setReflectionText(e.target.value)}
            placeholder="시뮬레이션을 통해 무엇을 느끼고 배웠나요? 다른 선택을 했다면 결과는 어떻게 달라졌을까요?"
            rows="10"
          />
          <button onClick={handleSubmitReflection} disabled={isLoading || !reflectionText.trim()}>
            {isLoading ? '저장 중...' : '성찰 내용 저장 및 리포트 보기'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReflectionPage;
