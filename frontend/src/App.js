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
            {/* Message Box */}
            <MessageBox message={message} type={messageType} onClose={closeMessage} />
            
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
                            <span>Admin</span>
                        </button>
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-6 bg-white rounded-tl-lg shadow-inner">
                    {loading && (
                        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-40">
                            <div className="bg-white p-6 rounded-lg shadow-lg text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                <p className="text-lg font-semibold text-gray-700">Processing...</p>
                            </div>
                        </div>
                    )}

                    {/* Data Upload Section */}
                    {activeSection === 'upload' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold text-blue-800 border-b pb-2">Data Upload</h2>
                            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                                <h3 className="text-xl font-semibold text-blue-700 mb-4">Upload Historical Data</h3>
                                <p className="text-gray-600 mb-4">
                                    Upload an Excel file (.xlsx) containing historical water level data with columns: Date and Level.
                                </p>
                                <input
                                    type="file"
                                    accept=".xlsx"
                                    onChange={handleFileUpload}
                                    ref={fileInputRef}
                                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                />
                                {selectedFile && (
                                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                                        <p className="text-green-700 font-semibold">File Selected: {selectedFile.name}</p>
                                        <p className="text-green-600">Data Points: {data.length}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Data Analysis Section */}
                    {activeSection === 'analysis' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold text-blue-800 border-b pb-2">Data Analysis</h2>
                            {data.length === 0 ? (
                                <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                                    <p className="text-yellow-700">Please upload data first to perform analysis.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <button
                                        onClick={handleAnalyzeData}
                                        className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition duration-300 font-semibold"
                                    >
                                        Analyze Data
                                    </button>
                                    
                                    {/* Historical Data Chart */}
                                    <div className="bg-gray-50 p-6 rounded-lg border">
                                        <h3 className="text-xl font-semibold text-blue-700 mb-4">Historical Data Visualization</h3>
                                        <ResponsiveContainer width="100%" height={400}>
                                            <LineChart data={combinedChartData}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="date" />
                                                <YAxis />
                                                <Tooltip />
                                                <Legend />
                                                <Line 
                                                    type="monotone" 
                                                    dataKey="level" 
                                                    stroke="#2563eb" 
                                                    strokeWidth={2}
                                                    name="Water Level"
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Analysis Results */}
                                    {analysisResults && (
                                        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                                            <h3 className="text-xl font-semibold text-blue-700 mb-4">Analysis Results</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="bg-white p-4 rounded-lg shadow">
                                                    <h4 className="font-semibold text-gray-700">Mean Level</h4>
                                                    <p className="text-2xl font-bold text-blue-600">{analysisResults.mean?.toFixed(2)} m</p>
                                                </div>
                                                <div className="bg-white p-4 rounded-lg shadow">
                                                    <h4 className="font-semibold text-gray-700">Standard Deviation</h4>
                                                    <p className="text-2xl font-bold text-blue-600">{analysisResults.std?.toFixed(2)} m</p>
                                                </div>
                                                <div className="bg-white p-4 rounded-lg shadow">
                                                    <h4 className="font-semibold text-gray-700">Minimum Level</h4>
                                                    <p className="text-2xl font-bold text-blue-600">{analysisResults.min?.toFixed(2)} m</p>
                                                </div>
                                                <div className="bg-white p-4 rounded-lg shadow">
                                                    <h4 className="font-semibold text-gray-700">Maximum Level</h4>
                                                    <p className="text-2xl font-bold text-blue-600">{analysisResults.max?.toFixed(2)} m</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Download Options */}
                                    <div className="bg-gray-50 p-6 rounded-lg border">
                                        <h3 className="text-xl font-semibold text-blue-700 mb-4">Download Data</h3>
                                        <div className="flex space-x-4">
                                            <button
                                                onClick={() => downloadCSV(data, 'historical_data.csv')}
                                                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition duration-300"
                                            >
                                                Download CSV
                                            </button>
                                            <button
                                                onClick={() => downloadExcel(data, 'historical_data.xlsx')}
                                                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition duration-300"
                                            >
                                                Download Excel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Forecasting Section */}
                    {activeSection === 'forecasting' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold text-blue-800 border-b pb-2">Water Level Forecasting</h2>
                            {data.length === 0 ? (
                                <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                                    <p className="text-yellow-700">Please upload data first to perform forecasting.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                                        <h3 className="text-xl font-semibold text-blue-700 mb-4">Forecast Settings</h3>
                                        <div className="flex items-center space-x-4">
                                            <label className="text-gray-700 font-semibold">Forecast Period (months):</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="24"
                                                value={forecastMonths}
                                                onChange={(e) => setForecastMonths(parseInt(e.target.value))}
                                                className="border border-gray-300 rounded-lg px-3 py-2 w-20"
                                            />
                                            <button
                                                onClick={handleForecast}
                                                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition duration-300 font-semibold"
                                            >
                                                Generate Forecast
                                            </button>
                                        </div>
                                    </div>

                                    {/* Forecast Chart */}
                                    {forecastResults && (
                                        <div className="bg-gray-50 p-6 rounded-lg border">
                                            <h3 className="text-xl font-semibold text-blue-700 mb-4">Forecast Results</h3>
                                            <ResponsiveContainer width="100%" height={400}>
                                                <LineChart data={combinedChartData}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="date" />
                                                    <YAxis />
                                                    <Tooltip />
                                                    <Legend />
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="level" 
                                                        stroke="#2563eb" 
                                                        strokeWidth={2}
                                                        name="Water Level"
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}

                                    {/* Forecast Metrics */}
                                    {forecastResults && forecastResults.metrics && (
                                        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                                            <h3 className="text-xl font-semibold text-green-700 mb-4">Forecast Metrics</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="bg-white p-4 rounded-lg shadow">
                                                    <h4 className="font-semibold text-gray-700">MAE</h4>
                                                    <p className="text-2xl font-bold text-green-600">{forecastResults.metrics.mae?.toFixed(4)}</p>
                                                </div>
                                                <div className="bg-white p-4 rounded-lg shadow">
                                                    <h4 className="font-semibold text-gray-700">RMSE</h4>
                                                    <p className="text-2xl font-bold text-green-600">{forecastResults.metrics.rmse?.toFixed(4)}</p>
                                                </div>
                                                <div className="bg-white p-4 rounded-lg shadow">
                                                    <h4 className="font-semibold text-gray-700">MAPE</h4>
                                                    <p className="text-2xl font-bold text-green-600">{forecastResults.metrics.mape?.toFixed(2)}%</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Download Forecast */}
                                    {forecastResults && (
                                        <div className="bg-gray-50 p-6 rounded-lg border">
                                            <h3 className="text-xl font-semibold text-blue-700 mb-4">Download Forecast</h3>
                                            <div className="flex space-x-4">
                                                <button
                                                    onClick={() => downloadCSV(forecastResults.forecast, 'forecast_data.csv')}
                                                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition duration-300"
                                                >
                                                    Download CSV
                                                </button>
                                                <button
                                                    onClick={() => downloadExcel(forecastResults.forecast, 'forecast_data.xlsx')}
                                                    className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition duration-300"
                                                >
                                                    Download Excel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Expert Report Section */}
                    {activeSection === 'report' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold text-blue-800 border-b pb-2">Expert Report Generation</h2>
                            {data.length === 0 ? (
                                <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                                    <p className="text-yellow-700">Please upload data first to generate a report.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                                        <h3 className="text-xl font-semibold text-blue-700 mb-4">Report Settings</h3>
                                        <div className="flex items-center space-x-4">
                                            <label className="text-gray-700 font-semibold">Language:</label>
                                            <select
                                                value={reportLanguage}
                                                onChange={(e) => setReportLanguage(e.target.value)}
                                                className="border border-gray-300 rounded-lg px-3 py-2"
                                            >
                                                <option value="en">English</option>
                                                <option value="fr">French</option>
                                                <option value="es">Spanish</option>
                                                <option value="ar">Arabic</option>
                                            </select>
                                            <button
                                                onClick={handleGenerateReport}
                                                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition duration-300 font-semibold"
                                            >
                                                Generate Report
                                            </button>
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 p-6 rounded-lg border">
                                        <h3 className="text-xl font-semibold text-blue-700 mb-4">Report Features</h3>
                                        <ul className="list-disc list-inside space-y-2 text-gray-700">
                                            <li>Comprehensive data analysis summary</li>
                                            <li>Forecast results and confidence intervals</li>
                                            <li>Professional charts and visualizations</li>
                                            <li>Expert recommendations and insights</li>
                                            <li>Multi-language support</li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* AI Chat Section */}
                    {activeSection === 'chat' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold text-blue-800 border-b pb-2">AI Assistant</h2>
                            {data.length === 0 ? (
                                <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                                    <p className="text-yellow-700">Please upload data first to chat with the AI assistant.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-gray-50 p-6 rounded-lg border h-96 overflow-y-auto">
                                        <h3 className="text-xl font-semibold text-blue-700 mb-4">Chat History</h3>
                                        {chatHistory.length === 0 ? (
                                            <p className="text-gray-500">Start a conversation with the AI assistant about your data...</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {chatHistory.map((chat, index) => (
                                                    <div key={index} className={`p-4 rounded-lg ${chat.role === 'user' ? 'bg-blue-100 ml-8' : 'bg-white mr-8'}`}>
                                                        <p className="font-semibold text-sm text-gray-600 mb-2">
                                                            {chat.role === 'user' ? 'You' : 'AI Assistant'}
                                                        </p>
                                                        <p className="text-gray-800">{chat.content}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <form onSubmit={handleChatSubmit} className="flex space-x-4">
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            placeholder="Ask about your data analysis or forecast..."
                                            className="flex-1 border border-gray-300 rounded-lg px-4 py-2"
                                        />
                                        <button
                                            type="submit"
                                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition duration-300 font-semibold"
                                        >
                                            Send
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Admin Section */}
                    {activeSection === 'admin' && (
                        <div className="space-y-6">
                            <h2 className="text-3xl font-bold text-blue-800 border-b pb-2">Admin Dashboard</h2>
                            {!isAdminLoggedIn ? (
                                <div className="bg-red-50 p-6 rounded-lg border border-red-200">
                                    <h3 className="text-xl font-semibold text-red-700 mb-4">Admin Login</h3>
                                    <div className="flex items-center space-x-4">
                                        <input
                                            type="password"
                                            value={adminPassword}
                                            onChange={(e) => setAdminPassword(e.target.value)}
                                            placeholder="Enter admin password"
                                            className="border border-gray-300 rounded-lg px-4 py-2"
                                        />
                                        <button
                                            onClick={handleAdminLogin}
                                            className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition duration-300 font-semibold"
                                        >
                                            Login
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                                        <h3 className="text-2xl font-semibold text-green-700 border-b pb-2 mb-4">Recent User Actions</h3>
                                        {userActions.length === 0 ? (
                                            <p className="text-gray-500">No actions recorded yet.</p>
                                        ) : (
                                            <ul className="space-y-3">
                                                {userActions.slice().reverse().map((action, index) => (
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

