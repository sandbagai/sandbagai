import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// Phase 1: 감정 상황 입력 (일기 쓰기)
function ScenarioBuilder() {
  const [formData, setFormData] = useState({
    scene_description: '',
    core_emotion: '분노',
    actor_name: '',
    actor_rules: ''
  });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // BE 1에게 '시나리오 생성' API 호출
      const response = await axios.post('/api/scenario/create', formData);
      const { scenario_id } = response.data;
      
      // Phase 3 (채팅방)으로 이동
      navigate(`/chat/${scenario_id}`);
    } catch (error) {
      console.error("시나리오 생성 실패:", error);
    }
  };

  return (
    <div>
      <h1>감정일기: 그 순간을 기록해 주세요</h1>
      <form onSubmit={handleSubmit}>
        <textarea 
          name="scene_description" 
          placeholder="어떤 상황이었나요?" 
          onChange={handleChange} 
        />
        <select name="core_emotion" onChange={handleChange}>
          <option>분노</option>
          <option>후회</option>
          <option>슬픔</option>
          <option>미안함</option>
        </select>
        <input 
          name="actor_name" 
          placeholder="상대방의 이름" 
          onChange={handleChange} 
        />
        <textarea 
          name="actor_rules" 
          placeholder="상대방의 말투나 규칙 (예: #차갑게 말함)" 
          onChange={handleChange} 
        />
        <button type="submit">[ 시뮬레이션 시작하기 ]</button>
      </form>
    </div>
  );
}
export default ScenarioBuilder;
