import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ScenarioBuilder from './pages/ScenarioBuilder';
import ChatRoom from './pages/ChatRoom';
import ReflectionPage from './pages/ReflectionPage';
import ReportPage from './pages/ReportPage';
import './App.css'; // App 전역 CSS

function App() {
  return (
    <Router>
      <div className="App">
        <header className="app-header">
          <nav>
            <Link to="/">타임머신AI</Link>
            {/* 로그인, 시작하기 버튼은 추후 구현 */}
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/build" element={<ScenarioBuilder />} />
            <Route path="/chat/:scenarioId" element={<ChatRoom />} />
            <Route path="/reflect/:scenarioId" element={<ReflectionPage />} />
            <Route path="/report/:scenarioId" element={<ReportPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
