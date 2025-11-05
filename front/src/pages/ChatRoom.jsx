import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import '../styles/ChatRoom.css'; // 페이지 전용 CSS

// 감정 상태 패널 컴포넌트
function EmotionStatePanel({ emotionState }) {
  if (!emotionState) return <div className="emotion-panel">감정 상태 로딩 중...</div>;

  return (
    <div className="emotion-panel">
      <div className="panel-header">감정 상태</div>
      <div className="emotion-item">
        <span className="emotion-label">정서적 안정도</span>
        <div className="emotion-bar-container">
          <div className="emotion-bar stability" style={{ width: `${emotionState.stability}%` }}></div>
        </div>
        <span className="emotion-value">{emotionState.stability}%</span>
      </div>
      <div className="emotion-item">
        <span className="emotion-label">분노</span>
        <div className="emotion-bar-container">
          <div className="emotion-bar anger" style={{ width: `${emotionState.anger}%` }}></div>
        </div>
        <span className="emotion-value">{emotionState.anger}%</span>
      </div>
      <div className="emotion-item">
        <span className="emotion-label">슬픔</span>
        <div className="emotion-bar-container">
          <div className="emotion-bar sorrow" style={{ width: `${emotionState.sorrow}%` }}></div>
        </div>
        <span className="emotion-value">{emotionState.sorrow}%</span>
      </div>
      <div className="emotion-item">
        <span className="emotion-label">연민</span>
        <div className="emotion-bar-container">
          <div className="emotion-bar compassion" style={{ width: `${emotionState.compassion}%` }}></div>
        </div>
        <span className="emotion-value">{emotionState.compassion}%</span>
      </div>
      <div className="safety-notice">
        <strong>안전 안내</strong>
        <p>장시간 이용 시 휴식을 권장합니다. 불편함을 느끼시면 언제든 종료하세요.</p>
      </div>
    </div>
  );
}

// 채팅방 메인 컴포넌트
function ChatRoom() {
  const { scenarioId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [emotionState, setEmotionState] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aiName, setAiName] = useState('AI 페르소나'); // 시뮬레이션 상대 이름
  const messagesEndRef = useRef(null); // 스크롤 자동 내리기용

  // 메시지 스크롤 하단 고정
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 시나리오 정보 및 초기 감정 상태 로드
  useEffect(() => {
    const fetchInitialState = async () => {
      try {
        const response = await axios.get(`/api/scenario/${scenarioId}/initial_state`);
        setEmotionState(response.data.initial_state);
        setAiName(response.data.actor_name || 'AI 페르소나');

        // AI의 첫 마디 (시뮬레이션 시작 메시지)
        if (response.data.initial_message) {
          setMessages([{ sender: 'ai', text: response.data.initial_message }]);
        }
      } catch (error) {
        console.error("초기 상태 로드 실패:", error);
        alert("시뮬레이션 초기화에 실패했습니다. 홈으로 돌아갑니다.");
        navigate('/');
      }
    };
    fetchInitialState();
  }, [scenarioId, navigate]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (isLoading || !userInput.trim()) return;
    
    const userMessage = userInput.trim();
    setUserInput('');
    setIsLoading(true);
    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
    
    try {
      const response = await axios.post(`/api/chat/${scenarioId}/response`, {
        message: userMessage
      });
      
      const { ai_response, updated_state } = response.data;
      
      setMessages(prev => [...prev, { sender: 'ai', text: ai_response }]);
      setEmotionState(updated_state); 
      
    } catch (error) {
      console.error("메시지 전송 오류:", error);
      alert("대화 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleEndSimulation = () => {
    if (window.confirm("시뮬레이션을 종료하고 성찰 페이지로 이동하시겠습니까?")) {
      navigate(`/reflect/${scenarioId}`); 
    }
  };

  const handleGetHint = async () => {
    // 힌트 요청 로직 (미구현)
    alert("힌트 기능은 아직 준비 중입니다!");
    // try {
    //   setIsLoading(true);
    //   const response = await axios.get(`/api/chat/${scenarioId}/hint`);
    //   alert(`힌트: ${response.data.hint_message}`);
    // } catch (error) {
    //   console.error("힌트 로드 실패:", error);
    //   alert("힌트를 가져오는 데 실패했습니다.");
    // } finally {
    //   setIsLoading(false);
    // }
  };

  return (
    <div className="chatroom-container">
      <div className="chat-area">
        <div className="chat-header">
          <h2>{aiName}과의 시뮬레이션</h2>
          <div className="chat-actions">
            <button className="hint-button" onClick={handleGetHint} disabled={isLoading}>힌트</button>
            <button className="end-button" onClick={handleEndSimulation} disabled={isLoading}>종료</button>
          </div>
        </div>

        <div className="messages-display">
          {messages.map((msg, index) => (
            <div key={index} className={`message-bubble ${msg.sender}`}>
              <div className="message-sender">{msg.sender === 'user' ? '나' : aiName}</div>
              <div className="message-text">{msg.text}</div>
            </div>
          ))}
          {isLoading && (
            <div className="message-bubble ai loading">
              <div className="message-sender">{aiName}</div>
              <div className="message-text">AI가 생각 중...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="message-input-form" onSubmit={handleSendMessage}>
          <textarea 
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="상대방에게 할 말을 입력하세요..."
            rows="3"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !userInput.trim()}>
            전송
          </button>
        </form>
      </div>
      
      <div className="sidebar-area">
        <EmotionStatePanel emotionState={emotionState} />
      </div>
    </div>
  );
}
export default ChatRoom;
