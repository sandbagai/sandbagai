import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/HomePage.css'; // 페이지 전용 CSS

function HomePage() {
  const navigate = useNavigate();

  const handleStartSimulation = () => {
    navigate('/build'); // 시나리오 빌더 페이지로 이동
  };

  return (
    <div className="homepage-container">
      <div className="hero-section">
        <h1 className="hero-title">감정을 다시 마주하고, 다르게 선택하다</h1>
        <p className="hero-subtitle">
          타임머신AI는 상황을 재현하고 선택을 시뮬레이션하여, <br/> 더 나은 내일을 준비하도록 돕습니다.
        </p>
        <button className="start-button" onClick={handleStartSimulation}>
          빠른 체험
        </button>
        <button className="how-it-works-button">
          작동 방식 보기
        </button>
      </div>

      <div className="features-section">
        <div className="feature-card">
          <div className="feature-icon">🕒</div>
          <h3>상황 재현</h3>
          <p>실제 겪었던 스트레스 상황을 다시 불러와 대화를 재현합니다.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">📝</div>
          <h3>선택 실험</h3>
          <p>다양한 대화 선택지를 실험하며 감정의 변화를 경험합니다.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">📄</div>
          <h3>성찰 리포트</h3>
          <p>대화 종료 후 감정 변화와 선택의 영향을 분석한 리포트를 받습니다.</p>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
