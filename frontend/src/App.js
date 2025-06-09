// App.js
import React, { useState, useEffect, useRef } from 'react';
import { Upload, LineChart, Lightbulb, FileText, MessageSquare, Settings } from 'lucide-react';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

// Utility for handling messages (instead of alert)
const MessageBox = ({ message, type, onClose }) => {
  if (!message) return null;

  return (
    <div className={`fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4`}>
      <div className={`bg-white rounded-lg shadow-xl p-6 max-w-sm w-full text-center ${type === 'error' ? 'border-red-500' : 'border-green-500'} border-t-4`}>
        <p className="text-lg font-semibold mb-4">{message}</p>
        <button
          onClick={onClose}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-300"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// Global variable to store user actions for the Admin Dashboard
let userActions = [];

const App = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [data, setData] = useState([]); // Raw historical data from file
  const [analysisResults, setAnalysisResults] = useState(null);
  const [forecastResults, setForecastResults] = useState(null);
  const [forecastMonths, setForecastMonths] = useState(1);
  const [reportLanguage, setReportLanguage] = useState('en');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [activeSection, setActiveSection] = useState('upload'); // State for navigation
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

  const fileInputRef = useRef(null);

  // This will be set by Render.com in production, default to localhost for local testing (if you can run it)
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

  // Function to add user action to the global log
  const addAction = (actionType, details = {}) => {
    const timestamp = new Date().toISOString();
    userActions.push({ timestamp, actionType, details });
    console.log("User Action Logged:", userActions); // For debugging
  };

  const showMessage = (msg, type = 'info') => {
    setMessage(msg);
    setMessageType(type);
  };

  const closeMessage = () => {
    setMessage('');
  };

  // --- Handlers for Backend Communication ---

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setData([]); // Clear previous data
    setAnalysisResults(null);
    setForecastResults(null);
    setChatHistory([]); // Clear chat context

    if (file.name.endsWith('.xlsx')) {
      setLoading(true);
      showMessage('Uploading file and processing...', 'info');

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${backendUrl}/upload`, {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        setLoading(false);

        if (response.ok) {
          const parsedData = result.data.map(row => ({
            date: parseISO(row.date), // Parse date string to Date object
            level: parseFloat(row.level)
          }));
          setData(parsedData);
          showMessage('File uploaded and parsed successfully!', 'success');
          addAction('File Upload', { fileName: file.name, rowCount: parsedData.length });
        } else {
          showMessage(`Upload failed: ${result.error}`, 'error');
        }
      } catch (error) {
        setLoading(false);
        showMessage(`Network error during upload: ${error.message}`, 'error');
      }
    } else {
      showMessage('Please upload a valid .xlsx file.', 'error');
    }
  };

  const handleAnalyzeData = async () => {
    if (data.length === 0) {
      showMessage('Please upload data first.', 'error');
      return;
    }

    setLoading(true);
    showMessage('Analyzing data...', 'info');

    try {
      const response = await fetch(`${backendUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: data.map(d => ({ date: d.date.toISOString(), level: d.level }))
        }),
      });

      const result = await response.json();
      setLoading(false);

      if (response.ok) {
        setAnalysisResults(result);
        showMessage('Data analysis complete!', 'success');
        addAction('Data Analysis');
      } else {
        showMessage(`Analysis failed: ${result.error}`, 'error');
      }
    } catch (error) {
      setLoading(false);
      showMessage(`Network error during analysis: ${error.message}`, 'error');
    }
  };

  const handleForecast = async () => {
    if (data.length === 0) {
      showMessage('Please upload data first.', 'error');
      return;
    }

    setLoading(true);
    showMessage(`Generating forecast for ${forecastMonths} months...`, 'info');

    try {
      const response = await fetch(`${backendUrl}/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: data.map(d => ({ date: d.date.toISOString(), level: d.level })),
          months: forecastMonths,
        }),
      });

      const result = await response.json();
      setLoading(false);

      if (response.ok) {
        const forecastedData = result.forecast.map(row => ({
          date: parseISO(row.date),
          level: parseFloat(row.level),
          lower_ci: parseFloat(row.lower_ci),
          upper_ci: parseFloat(row.upper_ci),
          isForecast: true,
        }));

        setForecastResults({
          forecast: forecastedData,
          metrics: result.metrics,
        });

        showMessage('Forecasting complete!', 'success');
        addAction('Forecasting', { months: forecastMonths, metrics: result.metrics });
      } else {
        showMessage(`Forecasting failed: ${result.error}`, 'error');
      }
    } catch (error) {
      setLoading(false);
      showMessage(`Network error during forecasting: ${error.message}`, 'error');
    }
  };

  const handleGenerateReport = async () => {
    if (data.length === 0) {
      showMessage('Please upload data first.', 'error');
      return;
    }

    setLoading(true);
    showMessage('Generating expert report...', 'info');

    try {
      const response = await fetch(`${backendUrl}/generate_report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historical_data: data.map(d => ({ date: d.date.toISOString(), level: d.level })),
          forecast_data: forecastResults ? forecastResults.forecast.map(f => ({ date: f.date.toISOString(), level: f.level })) : [],
          language: reportLanguage,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DeepHydro_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showMessage('Report generated and downloaded successfully!', 'success');
        addAction('Report Generation', { language: reportLanguage });
      } else {
        const errorText = await response.text();
        showMessage(`Report generation failed: ${errorText}`, 'error');
      }
    } catch (error) {
      showMessage(`Network error during report generation: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const newChatHistory = [...chatHistory, { role: 'user', content: chatInput }];
    setChatHistory(newChatHistory);
    setChatInput('');

    setLoading(true);
    showMessage('AI is typing...', 'info');

    try {
      const response = await fetch(`${backendUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_history: newChatHistory,
          historical_data: data.map(d => ({ date: d.date.toISOString(), level: d.level })),
          forecast_data: forecastResults ? forecastResults.forecast.map(f => ({ date: f.date.toISOString(), level: f.level })) : [],
        }),
      });

      const result = await response.json();
      setLoading(false);

      if (response.ok) {
        setChatHistory([...newChatHistory, { role: 'assistant', content: result.response }]);
        showMessage('', 'info'); // Clear the "AI is typing..." message
        addAction('Chat Interaction', { userMessage: chatInput, aiResponse: result.response });
      } else {
        showMessage(`Chat failed: ${result.error}`, 'error');
      }
    } catch (error) {
      setLoading(false);
      showMessage(`Network error during chat: ${error.message}`, 'error');
    }
  };

  const handleAdminLogin = () => {
    if (adminPassword === 'admin123') {
      setIsAdminLoggedIn(true);
      showMessage('Admin login successful!', 'success');
      addAction('Admin Login');
    } else {
      showMessage('Invalid admin password.', 'error');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    setAdminPassword('');
    showMessage('Admin logged out.', 'info');
    addAction('Admin Logout');
  };

  // --- Render Functions ---

  const renderUploadSection = () => (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center mb-4">
        <Upload className="text-blue-600 mr-2" size={24} />
        <h2 className="text-xl font-semibold text-gray-800">Upload Historical Data</h2>
      </div>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <input
          type="file"
          accept=".xlsx"
          onChange={handleFileUpload}
          ref={fileInputRef}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition duration-300"
        >
          Choose Excel File (.xlsx)
        </button>
        {selectedFile && (
          <p className="mt-4 text-gray-600">Selected: {selectedFile.name}</p>
        )}
      </div>
      {data.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-800 mb-2">Data Preview</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              Loaded {data.length} data points from {format(data[0].date, 'MMM yyyy')} to {format(data[data.length - 1].date, 'MMM yyyy')}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  const renderAnalysisSection = () => (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center mb-4">
        <LineChart className="text-green-600 mr-2" size={24} />
        <h2 className="text-xl font-semibold text-gray-800">Data Analysis</h2>
      </div>
      <button
        onClick={handleAnalyzeData}
        disabled={data.length === 0 || loading}
        className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition duration-300"
      >
        Analyze Data
      </button>
      {analysisResults && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">Analysis Results</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-medium text-blue-800">Statistics</h4>
              <p className="text-sm text-blue-600">Mean: {analysisResults.statistics?.mean?.toFixed(2)} m</p>
              <p className="text-sm text-blue-600">Std Dev: {analysisResults.statistics?.std?.toFixed(2)} m</p>
              <p className="text-sm text-blue-600">Min: {analysisResults.statistics?.min?.toFixed(2)} m</p>
              <p className="text-sm text-blue-600">Max: {analysisResults.statistics?.max?.toFixed(2)} m</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <h4 className="font-medium text-green-800">Trend Analysis</h4>
              <p className="text-sm text-green-600">Trend: {analysisResults.trend_analysis?.trend}</p>
              <p className="text-sm text-green-600">Slope: {analysisResults.trend_analysis?.slope?.toFixed(4)}</p>
              <p className="text-sm text-green-600">R²: {analysisResults.trend_analysis?.r_squared?.toFixed(3)}</p>
            </div>
          </div>
          {data.length > 0 && (
            <div className="mt-6">
              <h4 className="text-lg font-medium text-gray-800 mb-2">Historical Data Visualization</h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => format(new Date(date), 'MMM yyyy')}
                    />
                    <YAxis label={{ value: 'Water Level (m)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip 
                      labelFormatter={(date) => format(new Date(date), 'MMM dd, yyyy')}
                      formatter={(value) => [`${value.toFixed(2)} m`, 'Water Level']}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="level" 
                      stroke="#2563eb" 
                      strokeWidth={2}
                      name="Historical Data"
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderForecastSection = () => (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center mb-4">
        <Lightbulb className="text-purple-600 mr-2" size={24} />
        <h2 className="text-xl font-semibold text-gray-800">Forecasting</h2>
      </div>
      <div className="flex items-center space-x-4 mb-4">
        <label className="text-sm font-medium text-gray-700">Forecast Period:</label>
        <select
          value={forecastMonths}
          onChange={(e) => setForecastMonths(parseInt(e.target.value))}
          className="border border-gray-300 rounded-md px-3 py-2"
        >
          <option value={1}>1 Month</option>
          <option value={3}>3 Months</option>
          <option value={6}>6 Months</option>
          <option value={12}>12 Months</option>
        </select>
        <button
          onClick={handleForecast}
          disabled={data.length === 0 || loading}
          className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition duration-300"
        >
          Generate Forecast
        </button>
      </div>
      {forecastResults && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">Forecast Results</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-purple-50 rounded-lg p-4">
              <h4 className="font-medium text-purple-800">Model Performance</h4>
              <p className="text-sm text-purple-600">MAE: {forecastResults.metrics?.mae?.toFixed(3)}</p>
              <p className="text-sm text-purple-600">RMSE: {forecastResults.metrics?.rmse?.toFixed(3)}</p>
              <p className="text-sm text-purple-600">MAPE: {forecastResults.metrics?.mape?.toFixed(2)}%</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <h4 className="font-medium text-orange-800">Forecast Summary</h4>
              <p className="text-sm text-orange-600">
                Predicted range: {Math.min(...forecastResults.forecast.map(f => f.level)).toFixed(2)} - {Math.max(...forecastResults.forecast.map(f => f.level)).toFixed(2)} m
              </p>
              <p className="text-sm text-orange-600">
                Forecast period: {forecastMonths} month{forecastMonths > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={[...data, ...forecastResults.forecast]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => format(new Date(date), 'MMM yyyy')}
                />
                <YAxis label={{ value: 'Water Level (m)', angle: -90, position: 'insideLeft' }} />
                <Tooltip 
                  labelFormatter={(date) => format(new Date(date), 'MMM dd, yyyy')}
                  formatter={(value, name) => [`${value?.toFixed(2)} m`, name]}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="level" 
                  stroke="#2563eb" 
                  strokeWidth={2}
                  name="Historical Data"
                  connectNulls={false}
                />
                <Line 
                  type="monotone" 
                  dataKey={(entry) => entry.isForecast ? entry.level : null}
                  stroke="#dc2626" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Forecast"
                  connectNulls={false}
                />
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );

  const renderReportSection = () => (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center mb-4">
        <FileText className="text-red-600 mr-2" size={24} />
        <h2 className="text-xl font-semibold text-gray-800">Expert Report Generation</h2>
      </div>
      <div className="flex items-center space-x-4 mb-4">
        <label className="text-sm font-medium text-gray-700">Report Language:</label>
        <select
          value={reportLanguage}
          onChange={(e) => setReportLanguage(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2"
        >
          <option value="en">English</option>
          <option value="fr">French</option>
          <option value="ar">Arabic</option>
        </select>
        <button
          onClick={handleGenerateReport}
          disabled={data.length === 0 || loading}
          className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition duration-300"
        >
          Generate Report
        </button>
      </div>
      <div className="bg-yellow-50 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          The expert report will include detailed analysis, forecasting results, recommendations, and visualizations in your selected language.
        </p>
      </div>
    </div>
  );

  const renderChatSection = () => (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center mb-4">
        <MessageSquare className="text-indigo-600 mr-2" size={24} />
        <h2 className="text-xl font-semibold text-gray-800">AI Assistant</h2>
      </div>
      <div className="border rounded-lg h-64 overflow-y-auto p-4 mb-4 bg-gray-50">
        {chatHistory.length === 0 ? (
          <p className="text-gray-500 text-center">Start a conversation with the AI assistant about your water level data...</p>
        ) : (
          chatHistory.map((msg, index) => (
            <div key={index} className={`mb-3 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block p-3 rounded-lg max-w-xs ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white border border-gray-200'
              }`}>
                <p className="text-sm">{msg.content}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <form onSubmit={handleChatSubmit} className="flex space-x-2">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Ask about your data analysis or forecasting..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !chatInput.trim()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 transition duration-300"
        >
          Send
        </button>
      </form>
    </div>
  );

  const renderAdminSection = () => (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center mb-4">
        <Settings className="text-gray-600 mr-2" size={24} />
        <h2 className="text-xl font-semibold text-gray-800">Admin Dashboard</h2>
      </div>
      {!isAdminLoggedIn ? (
        <div className="space-y-4">
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Enter admin password"
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
          <button
            onClick={handleAdminLogin}
            className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition duration-300"
          >
            Login
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-800">User Activity Log</h3>
            <button
              onClick={handleAdminLogout}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition duration-300"
            >
              Logout
            </button>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            {userActions.length === 0 ? (
              <p className="text-gray-500">No user actions recorded yet.</p>
            ) : (
              userActions.map((action, index) => (
                <div key={index} className="mb-2 p-2 bg-white rounded border">
                  <p className="text-sm font-medium">{action.actionType}</p>
                  <p className="text-xs text-gray-500">{new Date(action.timestamp).toLocaleString()}</p>
                  {Object.keys(action.details).length > 0 && (
                    <p className="text-xs text-gray-600">{JSON.stringify(action.details)}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">DeepHydro Forecasting</h1>
            </div>
            <div className="text-sm text-gray-500">
              Advanced Water Level Analysis & Prediction
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'upload', label: 'Upload Data', icon: Upload },
              { id: 'analysis', label: 'Analysis', icon: LineChart },
              { id: 'forecast', label: 'Forecast', icon: Lightbulb },
              { id: 'report', label: 'Report', icon: FileText },
              { id: 'chat', label: 'AI Assistant', icon: MessageSquare },
              { id: 'admin', label: 'Admin', icon: Settings },
            ].map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center px-3 py-4 text-sm font-medium border-b-2 transition duration-300 ${
                    activeSection === section.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="mr-2" size={16} />
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-3"></div>
              <p className="text-blue-800">Processing...</p>
            </div>
          </div>
        )}

        {activeSection === 'upload' && renderUploadSection()}
        {activeSection === 'analysis' && renderAnalysisSection()}
        {activeSection === 'forecast' && renderForecastSection()}
        {activeSection === 'report' && renderReportSection()}
        {activeSection === 'chat' && renderChatSection()}
        {activeSection === 'admin' && renderAdminSection()}
      </main>

      {/* Message Box */}
      <MessageBox message={message} type={messageType} onClose={closeMessage} />
    </div>
  );
};

export default App;

