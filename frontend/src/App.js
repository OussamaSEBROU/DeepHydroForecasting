// App.js 
import React, { useState, useEffect, useRef } from 'react';
import { LuUpload, LuLineChart, LuLightbulb, LuFileText, LuMessageSquare, LuSettings } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
                body: JSON.stringify({ data: data.map(d => ({ date: d.date.toISOString(), level: d.level })) }),
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
                setChatHistory([...newChatHistory, { role: 'model', content: result.response }]);
                showMessage('Response received!', 'success');
                addAction('AI Chat', { prompt: chatInput });
            } else {
                showMessage(`Chat error: ${result.error}`, 'error');
            }
        } catch (error) {
            setLoading(false);
            showMessage(`Network error during chat: ${error.message}`, 'error');
        }
    };

    const handleAdminLogin = () => {
        if (adminPassword === 'admin123') { // Hardcoded password
            setIsAdminLoggedIn(true);
            showMessage('Admin login successful!', 'success');
        } else {
            showMessage('Incorrect admin password.', 'error');
        }
    };

    const downloadCSV = (dataToDownload, filename) => {
        const csvHeader = Object.keys(dataToDownload[0]).join(',');
        const csvRows = dataToDownload.map(row =>
            Object.values(row).map(value => {
                if (value instanceof Date) {
                    return format(value, 'yyyy-MM-dd');
                }
                return value;
            }).join(',')
        );
        const csvContent = [csvHeader, ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        showMessage('CSV downloaded.', 'success');
    };

    const downloadExcel = (dataToDownload, filename) => {
        const ws = XLSX.utils.json_to_sheet(dataToDownload.map(d => ({
            ...d,
            date: format(d.date, 'yyyy-MM-dd') // Format date for Excel
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, filename);
        showMessage('Excel downloaded.', 'success');
    };


    // Combine historical and forecast data for plotting
    const combinedChartData = data.map(d => ({
        date: d.date.getTime(), // Use timestamp for unique X-axis sorting
        level: d.level,
        isHistorical: true
    }))
    .concat(forecastResults ? forecastResults.forecast.map(f => ({
        date: f.date.getTime(),
        level: f.level,
        lower_ci: f.lower_ci,
        upper_ci: f.upper_ci,
        isForecast: true
    })) : [])
    .sort((a, b) => a.date - b.date)
    .map(item => ({
        ...item,
        date: format(new Date(item.date), 'MMM yy') // Format back for display
    }));

    // For better display, ensure forecast confidence intervals are only plotted for forecast data
    const forecastPlotData = combinedChartData.filter(d => d.isForecast);


    return (
        <div className="min-h-screen flex flex-col font-inter bg-gradient-to-br from-blue-50 to-indigo-100">
            <header className="bg-white shadow-md p-4 text-center text-blue-800 text-3xl font-bold">
                DeepHydro Forecasting
            </header>

            <div className="flex flex-1 flex-col md:flex-row">
                {/* Sidebar */}
                <aside className="w-full md:w-64 bg-blue-700 text-white p-4 shadow-lg rounded-br-lg md:rounded-tr-none md:rounded-bl-lg">
                    <nav className="space-y-4">
                        <button
                            onClick={() => setActiveSection('upload')}
                            className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'upload' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                        >
                            <LuUpload className="w-5 h-5" />
                            <span>Data Upload</span>
                        </button>
                        <button
                            onClick={() => setActiveSection('analysis')}
                            className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'analysis' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                            disabled={data.length === 0}
                        >
                            <LuLineChart className="w-5 h-5" />
                            <span>Data Analysis</span>
                        </button>
                        <button
                            onClick={() => setActiveSection('forecasting')}
                            className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'forecasting' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                            disabled={data.length === 0}
                        >
                            <LuLightbulb className="w-5 h-5" />
                            <span>Forecasting</span>
                        </button>
                        <button
                            onClick={() => setActiveSection('report')}
                            className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'report' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                            disabled={data.length === 0}
                        >
                            <LuFileText className="w-5 h-5" />
                            <span>Expert Report</span>
                        </button>
                        <button
                            onClick={() => setActiveSection('chat')}
                            className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'chat' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                            disabled={data.length === 0}
                        >
                            <LuMessageSquare className="w-5 h-5" />
                            <span>AI Chat</span>
                        </button>
                        <button
                            onClick={() => setActiveSection('admin')}
                            className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'admin' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                        >
                            <LuSettings className="w-5 h-5" />
                            <span>Admin Dashboard</span>
                        </button>
                    </nav>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 p-6 bg-white rounded-tl-lg md:rounded-bl-none shadow-inner overflow-y-auto">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 bg-opacity-75 z-40">
                            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
                            <p className="ml-4 text-blue-700 text-lg">Loading...</p>
                        </div>
                    )}
                    <MessageBox message={message} type={messageType} onClose={closeMessage} />

                    {/* Data Upload Section */}
                    {activeSection === 'upload' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold text-blue-800 mb-4">Upload Groundwater Data</h2>
                            <p className="text-gray-600">Upload your historical groundwater level data in an `.xlsx` format. The file should contain two columns: "date" and "level".</p>

                            <div className="flex flex-col items-start space-y-4">
                                <label
                                    htmlFor="file-upload"
                                    className="cursor-pointer bg-blue-600 text-white py-3 px-6 rounded-md shadow-md hover:bg-blue-700 transition duration-300 transform hover:scale-105"
                                >
                                    <input
                                        id="file-upload"
                                        type="file"
                                        accept=".xlsx"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                        ref={fileInputRef}
                                    />
                                    Select .xlsx File
                                </label>
                                {selectedFile && (
                                    <p className="text-gray-700">Selected file: <span className="font-semibold">{selectedFile.name}</span></p>
                                )}
                                {data.length > 0 && (
                                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
                                        <p className="text-green-800">Successfully loaded {data.length} data points.</p>
                                        <p className="text-sm text-gray-600">First few rows:</p>
                                        <ul className="text-sm text-gray-700 list-disc ml-4">
                                            {data.slice(0, 3).map((d, i) => (
                                                <li key={i}>{format(d.date, 'yyyy-MM-dd')}: {d.level.toFixed(2)}</li>
                                            ))}
                                            {data.length > 3 && <li>...</li>}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Data Analysis Section */}
                        {activeSection === 'analysis' && (
                            <div className="space-y-6">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">Groundwater Data Analysis</h2>
                                <p className="text-gray-600">Get key insights into your historical groundwater level data, including summary statistics, trends, and seasonal patterns.</p>
                                <button
                                    onClick={handleAnalyzeData}
                                    className="bg-blue-600 text-white py-3 px-6 rounded-md shadow-lg hover:bg-blue-700 transition duration-300 transform hover:scale-105"
                                    disabled={data.length === 0 || loading}
                                >
                                    {loading ? 'Analyzing...' : 'Perform Analysis'}
                                </button>

                                {analysisResults && (
                                    <div className="bg-gray-50 p-6 rounded-lg shadow-inner mt-6 space-y-6">
                                        <h3 className="text-2xl font-semibold text-blue-700 border-b pb-2">Analysis Results</h3>

                                        {/* Summary Statistics */}
                                        <div>
                                            <h4 className="text-xl font-medium text-blue-600 mb-2">Summary Statistics</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {Object.entries(analysisResults.stats).map(([key, value]) => (
                                                    <div key={key} className="bg-white p-4 rounded-md shadow flex items-center justify-between">
                                                        <span className="text-gray-600 font-medium">{key.replace(/_/g, ' ').toUpperCase()}:</span>
                                                        <span className="text-blue-800 font-bold">{value.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Time Series Plot */}
                                        <div>
                                            <h4 className="text-xl font-medium text-blue-600 mb-2">Groundwater Level Over Time</h4>
                                            <ResponsiveContainer width="100%" height={400}>
                                                <LineChart
                                                    data={data.map(d => ({ ...d, date: format(d.date, 'yyyy-MM-dd') }))}
                                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="date" />
                                                    <YAxis label={{ value: 'Level', angle: -90, position: 'insideLeft' }} />
                                                    <Tooltip labelFormatter={(label) => `Date: ${label}`} formatter={(value) => `Level: ${value.toFixed(2)}`} />
                                                    <Legend />
                                                    <Line type="monotone" dataKey="level" stroke="#4F46E5" activeDot={{ r: 8 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Trends and Seasonal Insights */}
                                        <div>
                                            <h4 className="text-xl font-medium text-blue-600 mb-2">Trends & Seasonal Patterns</h4>
                                            <ul className="list-disc list-inside text-gray-700 space-y-2">
                                                <li><span className="font-semibold">Trend:</span> {analysisResults.trend}</li>
                                                <li><span className="font-semibold">Seasonality:</span> {analysisResults.seasonality}</li>
                                                <li><span className="font-semibold">Key Insights:</span> {analysisResults.insights}</li>
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Forecasting Section */}
                        {activeSection === 'forecasting' && (
                            <div className="space-y-6">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">Groundwater Level Forecasting</h2>
                                <p className="text-gray-600">Predict future groundwater levels using a pre-trained deep learning model. Select the number of months you wish to forecast.</p>

                                <div className="flex items-center space-x-4">
                                    <label htmlFor="forecast-months" className="text-gray-700 font-medium">Forecast Months:</label>
                                    <input
                                        type="number"
                                        id="forecast-months"
                                        min="1"
                                        max="12"
                                        value={forecastMonths}
                                        onChange={(e) => setForecastMonths(Math.max(1, Math.min(12, parseInt(e.target.value))))}
                                        className="w-24 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <button
                                        onClick={handleForecast}
                                        className="bg-green-600 text-white py-3 px-6 rounded-md shadow-lg hover:bg-green-700 transition duration-300 transform hover:scale-105"
                                        disabled={data.length === 0 || loading}
                                    >
                                        {loading ? 'Forecasting...' : 'Generate Forecast'}
                                    </button>
                                </div>

                                {forecastResults && (
                                    <div className="bg-gray-50 p-6 rounded-lg shadow-inner mt-6 space-y-6">
                                        <h3 className="text-2xl font-semibold text-blue-700 border-b pb-2">Forecast Results</h3>

                                        {/* Forecast Plot */}
                                        <div>
                                            <h4 className="text-xl font-medium text-blue-600 mb-2">Historical vs. Forecast</h4>
                                            <ResponsiveContainer width="100%" height={400}>
                                                <LineChart
                                                    data={combinedChartData}
                                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="date" />
                                                    <YAxis label={{ value: 'Level', angle: -90, position: 'insideLeft' }} />
                                                    <Tooltip />
                                                    <Legend />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="level"
                                                        stroke="#4F46E5"
                                                        name="Historical Level"
                                                        dot={false}
                                                        filter={(entry) => entry.isHistorical} // Custom filter for historical
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="level"
                                                        stroke="#10B981"
                                                        name="Forecast Level"
                                                        dot={false}
                                                        filter={(entry) => entry.isForecast} // Custom filter for forecast
                                                    />
                                                    {/* Confidence Interval Lines for Forecast */}
                                                    <Line
                                                        type="monotone"
                                                        dataKey="lower_ci"
                                                        stroke="#EF4444"
                                                        strokeDasharray="5 5"
                                                        dot={false}
                                                        name="Lower CI"
                                                        filter={(entry) => entry.isForecast}
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="upper_ci"
                                                        stroke="#EF4444"
                                                        strokeDasharray="5 5"
                                                        dot={false}
                                                        name="Upper CI"
                                                        filter={(entry) => entry.isForecast}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Forecast Metrics */}
                                        <div>
                                            <h4 className="text-xl font-medium text-blue-600 mb-2">Forecast Accuracy Metrics</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {Object.entries(forecastResults.metrics).map(([key, value]) => (
                                                    <div key={key} className="bg-white p-4 rounded-md shadow flex items-center justify-between">
                                                        <span className="text-gray-600 font-medium">{key.toUpperCase()}:</span>
                                                        <span className="text-blue-800 font-bold">{value.toFixed(4)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Download Options */}
                                        <div className="flex space-x-4 mt-4">
                                            <button
                                                onClick={() => downloadCSV(forecastResults.forecast, 'DeepHydro_Forecast.csv')}
                                                className="bg-gray-600 text-white py-2 px-4 rounded-md shadow-md hover:bg-gray-700 transition duration-300"
                                            >
                                                Download Forecast (.csv)
                                            </button>
                                            <button
                                                onClick={() => downloadExcel(forecastResults.forecast, 'DeepHydro_Forecast.xlsx')}
                                                className="bg-gray-600 text-white py-2 px-4 rounded-md shadow-md hover:bg-gray-700 transition duration-300"
                                            >
                                                Download Forecast (.xlsx)
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* AI Expert Report Section */}
                        {activeSection === 'report' && (
                            <div className="space-y-6">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">Generate AI Expert Report</h2>
                                <p className="text-gray-600">Generate a comprehensive hydrogeology report based on your historical and forecasted data, written by an expert AI.</p>

                                <div className="flex items-center space-x-4">
                                    <label htmlFor="report-language" className="text-gray-700 font-medium">Report Language:</label>
                                    <select
                                        id="report-language"
                                        value={reportLanguage}
                                        onChange={(e) => setReportLanguage(e.target.value)}
                                        className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="en">English</option>
                                        <option value="fr">French</option>
                                    </select>
                                    <button
                                        onClick={handleGenerateReport}
                                        className="bg-purple-600 text-white py-3 px-6 rounded-md shadow-lg hover:bg-purple-700 transition duration-300 transform hover:scale-105"
                                        disabled={data.length === 0 || loading}
                                    >
                                        {loading ? 'Generating...' : 'Generate PDF Report'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* AI Chat Section */}
                        {activeSection === 'chat' && (
                            <div className="space-y-6 flex flex-col h-full">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">Chat with AI Hydrogeology Expert</h2>
                                <p className="text-gray-600">Ask questions about your data, forecasts, or general hydrogeology. The AI will provide expert insights.</p>

                                <div className="flex-1 bg-gray-50 p-4 rounded-lg shadow-inner overflow-y-auto flex flex-col space-y-4 mb-4" style={{ minHeight: '300px' }}>
                                    {chatHistory.length === 0 && (
                                        <p className="text-center text-gray-500 italic">Start a conversation!</p>
                                    )}
                                    {chatHistory.map((msg, index) => (
                                        <div
                                            key={index}
                                            className={`p-3 rounded-lg max-w-[80%] ${msg.role === 'user' ? 'bg-blue-100 self-end text-blue-800' : 'bg-gray-200 self-start text-gray-800'}`}
                                        >
                                            <p className="font-semibold">{msg.role === 'user' ? 'You' : 'AI Expert'}</p>
                                            <p>{msg.content}</p>
                                        </div>
                                    ))}
                                </div>

                                <form onSubmit={handleChatSubmit} className="flex space-x-3">
                                    <input
                                        type="text"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        placeholder="Ask your question..."
                                        className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                        disabled={loading}
                                    />
                                    <button
                                        type="submit"
                                        className="bg-blue-600 text-white py-3 px-6 rounded-md shadow-lg hover:bg-blue-700 transition duration-300"
                                        disabled={loading}
                                    >
                                        Send
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* Admin Dashboard Section */}
                        {activeSection === 'admin' && (
                            <div className="space-y-6">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">Admin Dashboard</h2>
                                <p className="text-gray-600">Monitor all user actions on the platform. Requires admin password.</p>

                                {!isAdminLoggedIn ? (
                                    <div className="flex flex-col space-y-4 max-w-sm">
                                        <input
                                            type="password"
                                            placeholder="Enter admin password"
                                            value={adminPassword}
                                            onChange={(e) => setAdminPassword(e.target.value)}
                                            className="p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <button
                                            onClick={handleAdminLogin}
                                            className="bg-red-600 text-white py-3 px-6 rounded-md shadow-lg hover:bg-red-700 transition duration-300"
                                        >
                                            Login
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-gray-50 p-6 rounded-lg shadow-inner mt-6">
                                        <h3 className="text-2xl font-semibold text-blue-700 border-b pb-2 mb-4">Recent User Actions</h3>
                                        {userActions.length === 0 ? (
                                            <p className="text-gray-500">No actions recorded yet.</p>
                                        ) : (
                                            <ul className="space-y-3">
                                                {userActions.slice().reverse().map((action, index) => ( // Display in reverse chronological order
                                                    <li key={index} className="bg-white p-4 rounded-md shadow flex flex-col md:flex-row md:items-center md:justify-between">
                                                        <span className="font-semibold text-blue-800 text-lg md:w-1/3">{action.actionType}</span>
                                                        <span className="text-gray-600 text-sm md:w-1/3">{new Date(action.timestamp).toLocaleString()}</span>
                                                        <span className="text-gray-500 text-sm md:w-1/3 overflow-hidden text-ellipsis whitespace-nowrap">
                                                            {Object.keys(action.details).length > 0 && JSON.stringify(action.details)}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </main>
                </div>

                {/* Footer */}
                <footer className="bg-gray-800 text-white p-4 text-center text-sm rounded-t-lg shadow-inner">
                    Developed by DeepHydro Team
                    <a
                        href="mailto:oussama.sebrou@gmail.com?subject=DeepHydro.team.info"
                        className="ml-4 text-blue-300 hover:text-blue-100 transition duration-200"
                    >
                        Contact Us
                    </a>
                </footer>
            </div>
        );
    };

    export default App;
    ```
