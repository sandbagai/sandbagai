import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../styles/ScenarioBuilder.css'; // 페이지 전용 CSS

function ScenarioBuilder() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    scene_description: '',
    core_emotion: '분노',
    actor_name: '',
    actor_rules: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post('/api/scenario/create', formData);
      const { scenario_id } = response.data;
      navigate(`/chat/${scenario_id}`);
    } catch (error) {
      console.error("시나리오 생성 실패:", error);
      alert("시나리오 생성에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div className="step-content">
            <h2>1. 상황 설정</h2>
            <p>어떤 스트레스 상황을 재현하고 싶으신가요? 최대한 구체적으로 설명해주세요.</p>
            <textarea 
              name="scene_description" 
              placeholder="예: 회의 시간에 제 아이디어를 팀장님이 가로채셨어요. 제가 발표를 마치자마자, 본인 아이디어인 것처럼 말했어요." 
              onChange={handleChange} 
              value={formData.scene_description}
              rows="5"
            />
            <button onClick={nextStep} disabled={!formData.scene_description}>다음</button>
          </div>
        );
      case 2:
        return (
          <div className="step-content">
            <h2>2. 감정 선택</h2>
            <p>그때 느꼈던 핵심적인 감정은 무엇이었나요?</p>
            <select name="core_emotion" onChange={handleChange} value={formData.core_emotion}>
              <option value="분노">분노</option>
              <option value="후회">후회</option>
              <option value="슬픔">슬픔</option>
              <option value="좌절">좌절</option>
              <option value="미안함">미안함</option>
              <option value="불안">불안</option>
            </select>
            <div className="button-group">
              <button onClick={prevStep}>이전</button>
              <button onClick={nextStep}>다음</button>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="step-content">
            <h2>3. 상대방 페르소나 설정</h2>
            <p>시뮬레이션 속 상대방의 이름과 특징(말투, 행동 패턴)을 알려주세요.</p>
            <input 
              name="actor_name" 
              type="text"
              placeholder="상대방의 이름 (예: 김 팀장)" 
              onChange={handleChange} 
              value={formData.actor_name}
            />
            <textarea 
              name="actor_rules" 
              placeholder="상대방의 말투나 행동 규칙을 자세히 설명해주세요. (예: #차갑게 말함 #본인 의견만 중요 #남탓 #권위적)" 
              onChange={handleChange} 
              value={formData.actor_rules}
              rows="5"
            />
            <div className="button-group">
              <button onClick={prevStep}>이전</button>
              <button onClick={handleSubmit} disabled={isLoading || !formData.actor_name || !formData.actor_rules}>
                {isLoading ? '시뮬레이션 생성 중...' : '시뮬레이션 시작하기'}
              </button>
            </div>
          </div>
        );
      default:
        return <div>알 수 없는 단계</div>;
    }
  }

  const stepNames = ["상황 설정", "감정 선택", "페르소나 설정"];

  return (
    <div className="scenario-builder-container">
      <div className="page-header">
        <h1>나만의 감정 시나리오 만들기</h1>
        <p>과거의 감정적 순간을 재현하여 새로운 대화 경험을 시작해보세요.</p>
      </div>
      
      <div className="step-indicator">
        {stepNames.map((name, index) => (
          <div key={index} className={`step-item ${index + 1 === step ? 'active' : ''} ${index + 1 < step ? 'completed' : ''}`}>
            <div className="step-number">{index + 1}</div>
            <div className="step-name">{name}</div>
          </div>
        ))}
      </div>

      <div className="scenario-form">
        {renderStep()}
      </div>
    </div>
  );
}

export default ScenarioBuilder;
