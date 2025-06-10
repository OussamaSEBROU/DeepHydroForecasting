// App.js
// هذا الملف يحتوي على المكون الرئيسي لتطبيق React.
// تم التحقق من بناء الجملة لـ JSX بعناية فائقة لضمان توازن العلامات.

import React, { useState, useEffect, useRef } from 'react';
import { LuUpload, LuLineChart, LuLightbulb, LuFileText, LuMessageSquare, LuSettings } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

// أداة لمعالجة الرسائل (بدلاً من alert)
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
                    إغلاق
                </button>
            </div>
        </div>
    );
};

// متغير عالمي لتخزين إجراءات المستخدم للوحة تحكم المسؤول
let userActions = [];

const App = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [data, setData] = useState([]); // البيانات التاريخية الخام من الملف
    const [analysisResults, setAnalysisResults] = useState(null);
    const [forecastResults, setForecastResults] = useState(null);
    const [forecastMonths, setForecastMonths] = useState(1);
    const [reportLanguage, setReportLanguage] = useState('en');
    const [chatInput, setChatInput] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [activeSection, setActiveSection] = useState('upload'); // حالة التنقل
    const [adminPassword, setAdminPassword] = useState('');
    const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('info');

    const fileInputRef = useRef(null);

    // سيتم تعيين هذا بواسطة Render.com في الإنتاج، افتراضيًا إلى localhost للاختبار المحلي
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

    // دالة لإضافة إجراء المستخدم إلى السجل العالمي
    const addAction = (actionType, details = {}) => {
        const timestamp = new Date().toISOString();
        userActions.push({ timestamp, actionType, details });
        console.log("تم تسجيل إجراء المستخدم:", userActions); // لتصحيح الأخطاء
    };

    const showMessage = (msg, type = 'info') => {
        setMessage(msg);
        setMessageType(type);
    };

    const closeMessage = () => {
        setMessage('');
    };

    // --- معالجات الاتصال بالواجهة الخلفية ---

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setSelectedFile(file);
        setData([]); // مسح البيانات السابقة
        setAnalysisResults(null);
        setForecastResults(null);
        setChatHistory([]); // مسح سياق الدردشة

        if (file.name.endsWith('.xlsx')) {
            setLoading(true);
            showMessage('جاري تحميل الملف ومعالجته...', 'info');
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
                        date: parseISO(row.date), // تحليل سلسلة التاريخ إلى كائن Date
                        level: parseFloat(row.level)
                    }));
                    setData(parsedData);
                    showMessage('تم تحميل الملف وتحليله بنجاح!', 'success');
                    addAction('تحميل ملف', { fileName: file.name, rowCount: parsedData.length });
                } else {
                    showMessage(`فشل التحميل: ${result.error}`, 'error');
                }
            } catch (error) {
                setLoading(false);
                showMessage(`خطأ في الشبكة أثناء التحميل: ${error.message}`, 'error');
            }
        } else {
            showMessage('الرجاء تحميل ملف .xlsx صالح.', 'error');
        }
    };

    const handleAnalyzeData = async () => {
        if (data.length === 0) {
            showMessage('الرجاء تحميل البيانات أولاً.', 'error');
            return;
        }

        setLoading(true);
        showMessage('جاري تحليل البيانات...', 'info');
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
                showMessage('اكتمل تحليل البيانات!', 'success');
                addAction('تحليل البيانات');
            } else {
                showMessage(`فشل التحليل: ${result.error}`, 'error');
            }
        } catch (error) {
            setLoading(false);
            showMessage(`خطأ في الشبكة أثناء التحليل: ${error.message}`, 'error');
        }
    };

    const handleForecast = async () => {
        if (data.length === 0) {
            showMessage('الرجاء تحميل البيانات أولاً.', 'error');
            return;
        }

        setLoading(true);
        showMessage(`جاري إنشاء التنبؤ لـ ${forecastMonths} أشهر...`, 'info');
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
                showMessage('اكتمل التنبؤ!', 'success');
                addAction('التنبؤ', { months: forecastMonths, metrics: result.metrics });
            } else {
                showMessage(`فشل التنبؤ: ${result.error}`, 'error');
            }
        } catch (error) {
            setLoading(false);
            showMessage(`خطأ في الشبكة أثناء التنبؤ: ${error.message}`, 'error');
            }
        };

        const handleGenerateReport = async () => {
            if (data.length === 0) {
                showMessage('الرجاء تحميل البيانات أولاً.', 'error');
                return;
            }

            setLoading(true);
            showMessage('جاري إنشاء تقرير الخبراء...', 'info');
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
                    showMessage('تم إنشاء التقرير وتنزيله بنجاح!', 'success');
                    addAction('إنشاء تقرير', { language: reportLanguage });
                } else {
                    const errorText = await response.text();
                    showMessage(`فشل إنشاء التقرير: ${errorText}`, 'error');
                }
            } catch (error) {
                showMessage(`خطأ في الشبكة أثناء إنشاء التقرير: ${error.message}`, 'error');
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
            showMessage('الذكاء الاصطناعي يكتب...', 'info');

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
                    showMessage('تم استلام الرد!', 'success');
                    addAction('دردشة الذكاء الاصطناعي', { prompt: chatInput });
                } else {
                    showMessage(`خطأ في الدردشة: ${result.error}`, 'error');
                }
            } catch (error) {
                setLoading(false);
                showMessage(`خطأ في الشبكة أثناء الدردشة: ${error.message}`, 'error');
            }
        };

        const handleAdminLogin = () => {
            if (adminPassword === 'admin123') { // كلمة مرور ثابتة
                setIsAdminLoggedIn(true);
                showMessage('تم تسجيل دخول المسؤول بنجاح!', 'success');
            } else {
                showMessage('كلمة مرور المسؤول غير صحيحة.', 'error');
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
            showMessage('تم تنزيل ملف CSV.', 'success');
        };

        const downloadExcel = (dataToDownload, filename) => {
            const ws = XLSX.utils.json_to_sheet(dataToDownload.map(d => ({
                ...d,
                date: format(d.date, 'yyyy-MM-dd') // تنسيق التاريخ لـ Excel
            })));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
            XLSX.writeFile(wb, filename);
            showMessage('تم تنزيل ملف Excel.', 'success');
        };


        // دمج البيانات التاريخية والتنبؤ للرسم البياني
        const combinedChartData = data.map(d => ({
            date: d.date.getTime(), // استخدام الطابع الزمني لفرز فريد للمحور X
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
            date: format(new Date(item.date), 'MMM yy') // تنسيق التاريخ مرة أخرى للعرض
        }));

        // لعرض أفضل، تأكد من رسم فترات الثقة للتنبؤ فقط لبيانات التنبؤ
        const forecastPlotData = combinedChartData.filter(d => d.isForecast);


        return (
            <div className="min-h-screen flex flex-col font-inter bg-gradient-to-br from-blue-50 to-indigo-100">
                <header className="bg-white shadow-md p-4 text-center text-blue-800 text-3xl font-bold">
                    توقعات DeepHydro
                </header>

                <div className="flex flex-1 flex-col md:flex-row">
                    {/* الشريط الجانبي */}
                    <aside className="w-full md:w-64 bg-blue-700 text-white p-4 shadow-lg rounded-br-lg md:rounded-tr-none md:rounded-bl-lg">
                        <nav className="space-y-4">
                            <button
                                onClick={() => setActiveSection('upload')}
                                className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'upload' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                            >
                                <LuUpload className="w-5 h-5" />
                                <span>تحميل البيانات</span>
                            </button>
                            <button
                                onClick={() => setActiveSection('analysis')}
                                className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'analysis' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                                disabled={data.length === 0}
                            >
                                <LuLineChart className="w-5 h-5" />
                                <span>تحليل البيانات</span>
                            </button>
                            <button
                                onClick={() => setActiveSection('forecasting')}
                                className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'forecasting' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                                disabled={data.length === 0}
                            >
                                <LuLightbulb className="w-5 h-5" />
                                <span>التنبؤ</span>
                            </button>
                            <button
                                onClick={() => setActiveSection('report')}
                                className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'report' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                                disabled={data.length === 0}
                            >
                                <LuFileText className="w-5 h-5" />
                                <span>تقرير الخبراء</span>
                            </button>
                            <button
                                onClick={() => setActiveSection('chat')}
                                className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'chat' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                                disabled={data.length === 0}
                            >
                                <LuMessageSquare className="w-5 h-5" />
                                <span>دردشة الذكاء الاصطناعي</span>
                            </button>
                            <button
                                onClick={() => setActiveSection('admin')}
                                className={`flex items-center space-x-3 w-full p-3 rounded-lg transition duration-200 ease-in-out ${activeSection === 'admin' ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-600'}`}
                            >
                                <LuSettings className="w-5 h-5" />
                                <span>لوحة تحكم المسؤول</span>
                            </button>
                        </nav>
                    </aside>

                    {/* منطقة المحتوى الرئيسية */}
                    <main className="flex-1 p-6 bg-white rounded-tl-lg md:rounded-bl-none shadow-inner overflow-y-auto">
                        {loading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-200 bg-opacity-75 z-40">
                                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
                                <p className="ml-4 text-blue-700 text-lg">جاري التحميل...</p>
                            </div>
                        )}
                        <MessageBox message={message} type={messageType} onClose={closeMessage} />

                        {/* قسم تحميل البيانات */}
                        {activeSection === 'upload' && (
                            <div className="space-y-6">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">تحميل بيانات المياه الجوفية</h2>
                                <p className="text-gray-600">قم بتحميل بياناتك التاريخية عن مستوى المياه الجوفية بتنسيق `.xlsx`. يجب أن يحتوي الملف على عمودين: "date" و "level".</p>

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
                                        تحديد ملف .xlsx
                                    </label>
                                    {selectedFile && (
                                        <p className="text-gray-700">الملف المحدد: <span className="font-semibold">{selectedFile.name}</span></p>
                                    )}
                                    {data.length > 0 && (
                                        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
                                            <p className="text-green-800">تم تحميل {data.length} نقطة بيانات بنجاح.</p>
                                            <p className="text-sm text-gray-600">الصفوف القليلة الأولى:</p>
                                            <ul className="text-sm text-gray-700 list-disc ml-4">
                                                {data.slice(0, 3).map((d, i) => (
                                                    <li key={i}>{format(d.date, 'yyyy-MM-dd')}: {d.level.toFixed(2)}</li>
                                                ))}
                                                {data.length > 3 && <li>...</li>}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* قسم تحليل البيانات */}
                        {activeSection === 'analysis' && (
                            <div className="space-y-6">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">تحليل بيانات المياه الجوفية</h2>
                                <p className="text-gray-600">احصل على رؤى رئيسية لبيانات مستوى المياه الجوفية التاريخية، بما في ذلك الإحصائيات الموجزة والاتجاهات وأنماط الموسمية ورؤى ذكية.</p>
                                <button
                                    onClick={handleAnalyzeData}
                                    className="bg-blue-600 text-white py-3 px-6 rounded-md shadow-lg hover:bg-blue-700 transition duration-300 transform hover:scale-105"
                                    disabled={data.length === 0 || loading}
                                >
                                    {loading ? 'جاري التحليل...' : 'إجراء التحليل'}
                                </button>

                                {analysisResults && (
                                    <div className="bg-gray-50 p-6 rounded-lg shadow-inner mt-6 space-y-6">
                                        <h3 className="text-2xl font-semibold text-blue-700 border-b pb-2">نتائج التحليل</h3>

                                        {/* ملخص الإحصائيات */}
                                        <div>
                                            <h4 className="text-xl font-medium text-blue-600 mb-2">ملخص الإحصائيات</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {Object.entries(analysisResults.stats).map(([key, value]) => (
                                                    <div key={key} className="bg-white p-4 rounded-md shadow flex items-center justify-between">
                                                        <span className="text-gray-600 font-medium">{key.replace(/_/g, ' ').toUpperCase()}:</span>
                                                        <span className="text-blue-800 font-bold">{value.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* مخطط السلسلة الزمنية */}
                                        <div>
                                            <h4 className="text-xl font-medium text-blue-600 mb-2">مستوى المياه الجوفية بمرور الوقت</h4>
                                            <ResponsiveContainer width="100%" height={400}>
                                                <LineChart
                                                    data={data.map(d => ({ ...d, date: format(d.date, 'yyyy-MM-dd') }))}
                                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="date" />
                                                    <YAxis label={{ value: 'المستوى', angle: -90, position: 'insideLeft' }} />
                                                    <Tooltip labelFormatter={(label) => `التاريخ: ${label}`} formatter={(value) => `المستوى: ${value.toFixed(2)}`} />
                                                    <Legend />
                                                    <Line type="monotone" dataKey="level" stroke="#4F46E5" activeDot={{ r: 8 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* الاتجاهات والرؤى الموسمية */}
                                        <div>
                                            <h4 className="text-xl font-medium text-blue-600 mb-2">الاتجاهات والأنماط الموسمية</h4>
                                            <ul className="list-disc list-inside text-gray-700 space-y-2">
                                                <li><span className="font-semibold">الاتجاه:</span> {analysisResults.trend}</li>
                                                <li><span className="font-semibold">الموسمية:</span> {analysisResults.seasonality}</li>
                                                <li><span className="font-semibold">الرؤى الرئيسية:</span> {analysisResults.insights}</li>
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* قسم التنبؤ */}
                        {activeSection === 'forecasting' && (
                            <div className="space-y-6">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">التنبؤ بمستوى المياه الجوفية</h2>
                                <p className="text-gray-600">توقع مستويات المياه الجوفية المستقبلية باستخدام نموذج تعلم عميق مُدرب مسبقًا. حدد عدد الأشهر التي ترغب في التنبؤ بها.</p>

                                <div className="flex items-center space-x-4">
                                    <label htmlFor="forecast-months" className="text-gray-700 font-medium">أشهر التنبؤ:</label>
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
                                        {loading ? 'جاري التنبؤ...' : 'إنشاء التنبؤ'}
                                    </button>
                                </div>

                                {forecastResults && (
                                    <div className="bg-gray-50 p-6 rounded-lg shadow-inner mt-6 space-y-6">
                                        <h3 className="text-2xl font-semibold text-blue-700 border-b pb-2">نتائج التنبؤ</h3>

                                        {/* مخطط التنبؤ */}
                                        <div>
                                            <h4 className="text-xl font-medium text-blue-600 mb-2">التاريخي مقابل التنبؤ</h4>
                                            <ResponsiveContainer width="100%" height={400}>
                                                <LineChart
                                                    data={combinedChartData}
                                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="date" />
                                                    <YAxis label={{ value: 'المستوى', angle: -90, position: 'insideLeft' }} />
                                                    <Tooltip />
                                                    <Legend />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="level"
                                                        stroke="#4F46E5"
                                                        name="المستوى التاريخي"
                                                        dot={false}
                                                        filter={(entry) => entry.isHistorical} // تصفية مخصصة للتاريخي
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="level"
                                                        stroke="#10B981"
                                                        name="مستوى التنبؤ"
                                                        dot={false}
                                                        filter={(entry) => entry.isForecast} // تصفية مخصصة للتنبؤ
                                                    />
                                                    {/* خطوط فاصل الثقة للتنبؤ */}
                                                    <Line
                                                        type="monotone"
                                                        dataKey="lower_ci"
                                                        stroke="#EF4444"
                                                        strokeDasharray="5 5"
                                                        dot={false}
                                                        name="حد الثقة الأدنى"
                                                        filter={(entry) => entry.isForecast}
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="upper_ci"
                                                        stroke="#EF4444"
                                                        strokeDasharray="5 5"
                                                        dot={false}
                                                        name="حد الثقة الأعلى"
                                                        filter={(entry) => entry.isForecast}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* مقاييس التنبؤ */}
                                        <div>
                                            <h4 className="text-xl font-medium text-blue-600 mb-2">مقاييس دقة التنبؤ</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {Object.entries(forecastResults.metrics).map(([key, value]) => (
                                                    <div key={key} className="bg-white p-4 rounded-md shadow flex items-center justify-between">
                                                        <span className="text-gray-600 font-medium">{key.toUpperCase()}:</span>
                                                        <span className="text-blue-800 font-bold">{value.toFixed(4)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* خيارات التنزيل */}
                                        <div className="flex space-x-4 mt-4">
                                            <button
                                                onClick={() => downloadCSV(forecastResults.forecast, 'DeepHydro_Forecast.csv')}
                                                className="bg-gray-600 text-white py-2 px-4 rounded-md shadow-md hover:bg-gray-700 transition duration-300"
                                            >
                                                تنزيل التنبؤ (.csv)
                                            </button>
                                            <button
                                                onClick={() => downloadExcel(forecastResults.forecast, 'DeepHydro_Forecast.xlsx')}
                                                className="bg-gray-600 text-white py-2 px-4 rounded-md shadow-md hover:bg-gray-700 transition duration-300"
                                            >
                                                تنزيل التنبؤ (.xlsx)
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* قسم تقرير الخبراء بالذكاء الاصطناعي */}
                        {activeSection === 'report' && (
                            <div className="space-y-6">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">إنشاء تقرير خبير بالذكاء الاصطناعي</h2>
                                <p className="text-gray-600">قم بإنشاء تقرير شامل حول هيدروجيولوجيا المياه الجوفية بناءً على بياناتك التاريخية والمتوقعة، كتبه خبير بالذكاء الاصطناعي.</p>

                                <div className="flex items-center space-x-4">
                                    <label htmlFor="report-language" className="text-gray-700 font-medium">لغة التقرير:</label>
                                    <select
                                        id="report-language"
                                        value={reportLanguage}
                                        onChange={(e) => setReportLanguage(e.target.value)}
                                        className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="en">الإنجليزية</option>
                                        <option value="fr">الفرنسية</option>
                                    </select>
                                    <button
                                        onClick={handleGenerateReport}
                                        className="bg-purple-600 text-white py-3 px-6 rounded-md shadow-lg hover:bg-purple-700 transition duration-300 transform hover:scale-105"
                                        disabled={data.length === 0 || loading}
                                    >
                                        {loading ? 'جاري الإنشاء...' : 'إنشاء تقرير PDF'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* قسم دردشة الذكاء الاصطناعي */}
                        {activeSection === 'chat' && (
                            <div className="space-y-6 flex flex-col h-full">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">الدردشة مع خبير هيدروجيولوجيا بالذكاء الاصطناعي</h2>
                                <p className="text-gray-600">اطرح أسئلة حول بياناتك أو توقعاتك أو الهيدروجيولوجيا العامة. سيوفر الذكاء الاصطناعي رؤى خبراء.</p>

                                <div className="flex-1 bg-gray-50 p-4 rounded-lg shadow-inner overflow-y-auto flex flex-col space-y-4 mb-4" style={{ minHeight: '300px' }}>
                                    {chatHistory.length === 0 && (
                                        <p className="text-center text-gray-500 italic">ابدأ محادثة!</p>
                                    )}
                                    {chatHistory.map((msg, index) => (
                                        <div
                                            key={index}
                                            className={`p-3 rounded-lg max-w-[80%] ${msg.role === 'user' ? 'bg-blue-100 self-end text-blue-800' : 'bg-gray-200 self-start text-gray-800'}`}
                                        >
                                            <p className="font-semibold">{msg.role === 'user' ? 'أنت' : 'خبير الذكاء الاصطناعي'}</p>
                                            <p>{msg.content}</p>
                                        </div>
                                    ))}
                                </div>

                                <form onSubmit={handleChatSubmit} className="flex space-x-3">
                                    <input
                                        type="text"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        placeholder="اطرح سؤالك..."
                                        className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                        disabled={loading}
                                    />
                                    <button
                                        type="submit"
                                        className="bg-blue-600 text-white py-3 px-6 rounded-md shadow-lg hover:bg-blue-700 transition duration-300"
                                        disabled={loading}
                                    >
                                        إرسال
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* قسم لوحة تحكم المسؤول */}
                        {activeSection === 'admin' && (
                            <div className="space-y-6">
                                <h2 className="text-3xl font-bold text-blue-800 mb-4">لوحة تحكم المسؤول</h2>
                                <p className="text-gray-600">راقب جميع إجراءات المستخدمين على المنصة. يتطلب كلمة مرور المسؤول.</p>

                                {!isAdminLoggedIn ? (
                                    <div className="flex flex-col space-y-4 max-w-sm">
                                        <input
                                            type="password"
                                            placeholder="أدخل كلمة مرور المسؤول"
                                            value={adminPassword}
                                            onChange={(e) => setAdminPassword(e.target.value)}
                                            className="p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <button
                                            onClick={handleAdminLogin}
                                            className="bg-red-600 text-white py-3 px-6 rounded-md shadow-lg hover:bg-red-700 transition duration-300"
                                        >
                                            تسجيل الدخول
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-gray-50 p-6 rounded-lg shadow-inner mt-6">
                                        <h3 className="text-2xl font-semibold text-blue-700 border-b pb-2 mb-4">إجراءات المستخدم الأخيرة</h3>
                                        {userActions.length === 0 ? (
                                            <p className="text-gray-500">لم يتم تسجيل أي إجراءات بعد.</p>
                                        ) : (
                                            <ul className="space-y-3">
                                                {userActions.slice().reverse().map((action, index) => ( // عرض بترتيب زمني عكسي
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

                {/* تذييل الصفحة (فوتر) */}
                <footer className="bg-gray-800 text-white p-4 text-center text-sm rounded-t-lg shadow-inner">
                    تم التطوير بواسطة فريق DeepHydro
                    <a
                        href="mailto:oussama.sebrou@gmail.com?subject=DeepHydro.team.info"
                        className="ml-4 text-blue-300 hover:text-blue-100 transition duration-200"
                    >
                        اتصل بنا
                    </a>
                </footer>
            </div>
        </div>
    );
};

export default App;

