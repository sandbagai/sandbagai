import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

// Phase 3: 감정 대면 대화 (시뮬레이션)
function ChatRoom() {
  const { scenarioId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [hint, setHint] = useState(''); // 실시간 코칭 힌트
  const [isLoading, setIsLoading] = useState(false);

  // (API 2) 메시지 전송
  const handleSendMessage = async (e) => {
    e.preventDefault();
    const userMessage = userInput;
    setUserInput('');
    setIsLoading(true);
    
    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
    
    try {
      const response = await axios.post(`/api/chat/${scenarioId}/response`, {
        message: userMessage
      });
      
      const { ai_response } = response.data; // 게이밍 요소 없음
      setMessages(prev => [...prev, { sender: 'ai', text: ai_response }]);
      
    } catch (error) {
      console.error("메시지 전송 오류:", error);
    }
    setIsLoading(false);
  };

  // (API 3) 힌트 요청
  const handleGetHint = async () => {
    setHint('코칭을 생성 중입니다...');
    const response = await axios.post(`/api/chat/${scenarioId}/coaching_hint`);
    setHint(response.data.hint);
  };

  // Phase 4 (리플렉션)으로 이동
  const handleEndSimulation = () => {
    navigate(`/reflect/${scenarioId}`);
  };

  return (
    <div>
      <div className="chat-header">
        <button onClick={handleEndSimulation}>[ 시뮬레이션 종료 ]</button>
        <button onClick={handleGetHint}>[ 💡 힌트 / 코칭 ]</button>
      </div>
      
      {hint && <div className="hint-popup" onClick={() => setHint('')}>{hint}</div>}
      
      <div className="message-list">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            {msg.text}
          </div>
        ))}
      </div>
      
      <form onSubmit={handleSendMessage} className="input-form">
        <input 
          type="text" 
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>전송</button>
      </form>
    </div>
  );
}
export default ChatRoom;
