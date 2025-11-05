import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import '../styles/ReportPage.css'; // 페이지 전용 CSS

function ReportPage() {
  const { scenarioId } = useParams();
  const navigate = useNavigate();
  const [reportData, setReportData] = useState(null); // AI 코치의 최종 분석 리포트
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        // 백엔드에 리포트 요청 API 호출 (AI 엔진 연동)
        const response = await axios.get(`/api/report/${scenarioId}`);
        setReportData(response.data.report);
      } catch (error) {
        console.error("리포트 로드 실패:", error);
        alert("리포트를 가져오는 데 실패했습니다.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchReport();
  }, [scenarioId]);

  if (isLoading) {
    return (
      <div className="report-container">
        <div className="page-header">
          <h1>최종 리포트 생성 중...</h1>
          <p>AI 코치가 당신의 시뮬레이션 데이터를 분석하고 있습니다.</p>
        </div>
        <div className="loading-spinner"></div> {/* 로딩 스피너 UI */}
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="report-container">
        <div className="page-header">
          <h1>리포트 없음</h1>
          <p>리포트를 불러올 수 없습니다. 다시 시도해 주세요.</p>
        </div>
        <button onClick={() => navigate('/')}>홈으로 돌아가기</button>
      </div>
    );
  }

  return (
    <div className="report-container">
      <div className="page-header">
        <h1>당신의 성찰 리포트</h1>
        <p>시뮬레이션 대화와 감정 변화에 대한 AI 코치의 분석입니다.</p>
      </div>

      <div className="report-sections">
        <div className="report-card">
          <h3>종합 분석</h3>
          <p>{reportData.summary}</p>
        </div>

        <div className="report-card">
          <h3>감정 변화 추이</h3>
          {/* (FE 2가 이 부분에 감정 변화 그래프 UI를 구현해야 함) */}
          <p>{reportData.emotion_trend}</p>
          <div className="emotion-chart-placeholder">
            {/* 여기에 차트 라이브러리 (예: Chart.js)로 실제 감정 변화 그래프 렌더링 */}
            <p>감정 변화 그래프 (구현 예정)</p>
          </div>
        </div>

        <div className="report-card">
          <h3>핵심 학습 포인트</h3>
          <ul>
            {reportData.learning_points.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </div>

        <div className="report-card">
          <h3>다음 시나리오 제안</h3>
          <p>{reportData.next_steps}</p>
        </div>
      </div>

      <button className="back-to-home-button" onClick={() => navigate('/')}>홈으로 돌아가기</button>
    </div>
  );
}

export default ReportPage;
