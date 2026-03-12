import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TraceDetails from './pages/TraceDetails';

const App: React.FC = () => {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trace/:runId" element={<TraceDetails />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;