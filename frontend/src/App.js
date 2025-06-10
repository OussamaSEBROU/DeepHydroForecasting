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