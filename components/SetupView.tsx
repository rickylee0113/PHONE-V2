
import React, { useState, useEffect } from 'react';
import { Lineup, TeamConfig, Position, TeamSide } from '../types';

interface SetupViewProps {
  initialConfig?: TeamConfig;
  initialMyLineup?: Lineup;
  initialOpLineup?: Lineup;
  initialMyLibero?: string;
  initialOpLibero?: string;
  onStart: (config: TeamConfig, myLineup: Lineup, opLineup: Lineup, myLibero: string, opLibero: string, firstServe: TeamSide) => void;
  onInstallApp?: () => void;
  onToggleFullScreen?: () => void;
}

export const SetupView: React.FC<SetupViewProps> = ({ 
  initialConfig, 
  initialMyLineup, 
  initialOpLineup, 
  initialMyLibero,
  initialOpLibero,
  onStart,
  onInstallApp,
  onToggleFullScreen
}) => {
  const [matchName, setMatchName] = useState(initialConfig?.matchName || '');
  const [myName, setMyName] = useState(initialConfig?.myName || ''); 
  const [opName, setOpName] = useState(initialConfig?.opName || '');
  const [firstServe, setFirstServe] = useState<TeamSide>('me');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [myLineup, setMyLineup] = useState<Lineup>(initialMyLineup || {
    4: '', 3: '', 2: '', 5: '', 6: '', 1: ''
  });
  const [opLineup, setOpLineup] = useState<Lineup>(initialOpLineup || {
    4: '', 3: '', 2: '', 5: '', 6: '', 1: ''
  });
  
  const [myLibero, setMyLibero] = useState(initialMyLibero || '');
  const [opLibero, setOpLibero] = useState(initialOpLibero || '');

  const sanitizeInput = (value: string) => {
      let numericValue = value.replace(/[^0-9]/g, '');
      if (numericValue.length > 2) numericValue = numericValue.slice(0, 2);
      if (numericValue.length > 0 && numericValue.startsWith('0')) return null; // Invalid
      return numericValue;
  }

  const handlePlayerChange = (isMyTeam: boolean, pos: string, value: string) => {
    const val = sanitizeInput(value);
    if (val === null) return;

    // Use type assertion (as Position) to satisfy strict TypeScript checks
    if (isMyTeam) {
      setMyLineup(prev => ({ ...prev, [parseInt(pos) as Position]: val }));
    } else {
      setOpLineup(prev => ({ ...prev, [parseInt(pos) as Position]: val }));
    }
  };

  const handleLiberoChange = (isMyTeam: boolean, value: string) => {
      const val = sanitizeInput(value);
      if (val === null) return;
      if (isMyTeam) setMyLibero(val);
      else setOpLibero(val);
  }

  // --- DEBUG / TEST FILL ---
  const handleTestFill = () => {
    setMatchName('練習賽 G1');
    setMyName('主場隊伍');
    setOpName('客場隊伍');
    setMyLineup({ 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' });
    setOpLineup({ 1: '11', 2: '12', 3: '13', 4: '14', 5: '15', 6: '16' });
    setMyLibero('99');
    setOpLibero('88');
  };

  const getDuplicates = (lineup: Lineup, libero: string) => {
    const nums = [...Object.values(lineup), libero].filter(n => n.trim() !== '');
    const seen = new Set();
    const duplicates = new Set();
    nums.forEach(n => {
      if (seen.has(n)) duplicates.add(n);
      seen.add(n);
    });
    return Array.from(duplicates);
  };

  const hasEmptyFields = (lineup: Lineup) => {
    // Libero can technically be empty if they don't have one, but for this app flow let's say optional?
    // User requested "7 players", so let's check lineup strictly, Libero strictly? 
    // Usually standard app allows empty, but for safety lets warn if main 6 empty.
    return Object.values(lineup).some(val => val.trim() === '');
  };

  // Check for duplicates and empty fields whenever lineups change
  useEffect(() => {
    const myDups = getDuplicates(myLineup, myLibero);
    const opDups = getDuplicates(opLineup, opLibero);
    const myEmpty = hasEmptyFields(myLineup);
    const opEmpty = hasEmptyFields(opLineup);
    
    if (myEmpty) {
      setErrorMsg('請輸入我方所有先發背號');
    } else if (opEmpty) {
      setErrorMsg('請輸入對手所有先發背號');
    } else if (myDups.length > 0) {
      setErrorMsg(`我方隊伍背號重複: ${myDups.join(', ')}`);
    } else if (opDups.length > 0) {
      setErrorMsg(`對手隊伍背號重複: ${opDups.join(', ')}`);
    } else {
      setErrorMsg(null);
    }
  }, [myLineup, opLineup, myLibero, opLibero]);

  const startGame = () => {
    const finalMyName = myName.trim() || '我方球隊';
    const finalOpName = opName.trim() || '對手球隊';
    
    if (errorMsg) return;
    onStart({ matchName, myName: finalMyName, opName: finalOpName }, myLineup, opLineup, myLibero, opLibero, firstServe);
  };

  const renderInput = (isMyTeam: boolean, pos: number) => (
    <div key={pos} className="flex flex-col items-center">
        <input
            type="tel"
            pattern="[0-9]*"
            inputMode="numeric"
            placeholder={`P${pos}`}
            value={isMyTeam ? myLineup[pos as Position] : opLineup[pos as Position]}
            onChange={(e) => handlePlayerChange(isMyTeam, pos.toString(), e.target.value)}
            className={`w-full text-center border rounded-lg p-2 text-white focus:border-accent focus:outline-none text-xl font-bold placeholder-gray-600
            ${isMyTeam ? 'bg-neutral-800 border-neutral-600' : 'bg-red-900/20 border-red-900/50'}`}
        />
        <span className="text-[10px] text-gray-500 mt-1">pos {pos}</span>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950">
      
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto pb-32 pt-[env(safe-area-inset-top)]">
        
        <div className="p-4 border-b border-neutral-800 space-y-3 relative">
             <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    比賽先發設定
                </h1>
                <div className="flex gap-2">
                    {onToggleFullScreen && (
                        <button
                            onClick={onToggleFullScreen}
                            className="text-[10px] bg-neutral-700 text-gray-300 font-bold px-3 py-1 rounded-full border border-neutral-600 hover:bg-neutral-600 transition-colors"
                        >
                            全螢幕
                        </button>
                    )}
                    {onInstallApp && (
                        <button 
                            onClick={onInstallApp}
                            className="text-[10px] bg-accent text-white font-bold px-3 py-1 rounded-full animate-pulse shadow-lg hover:bg-blue-600 transition-colors"
                        >
                            安裝 APP
                        </button>
                    )}
                    <button 
                      onClick={handleTestFill} 
                      className="text-[10px] bg-neutral-800 text-gray-400 px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-colors"
                    >
                      測試填入
                    </button>
                </div>
             </div>
            <input 
                type="text" 
                value={matchName}
                onChange={(e) => setMatchName(e.target.value)}
                className="w-full bg-neutral-900/60 backdrop-blur-sm border border-neutral-700 text-center py-2 rounded-lg text-white focus:border-accent focus:outline-none placeholder-gray-500"
                placeholder="輸入比賽名稱 (選填)"
            />
        </div>

        {/* 1. Opponent Team (TOP) */}
        <section className="p-4 bg-neutral-900/50">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-6 bg-red-600 rounded-sm shrink-0"></span>
            <input 
                type="text" 
                value={opName}
                onChange={(e) => setOpName(e.target.value)}
                className="w-full bg-white border border-gray-300 text-center py-2 rounded-lg text-black focus:border-accent focus:outline-none placeholder-gray-400 font-bold shadow-sm"
                placeholder="輸入對手球隊"
            />
          </div>
          
          <div className="bg-neutral-900 p-2 rounded-xl border border-neutral-800/50">
             <div className="text-[10px] text-gray-500 text-center mb-1 font-bold">後排 (Back)</div>
             <div className="grid grid-cols-3 gap-2">
                 {[1, 6, 5].map(pos => renderInput(false, pos))}
             </div>
             
             <div className="my-2"></div>
             
             <div className="grid grid-cols-3 gap-2">
                 {[2, 3, 4].map(pos => renderInput(false, pos))}
             </div>
             <div className="text-[10px] text-red-400 text-center mt-1 font-bold">前排 (Front / Net)</div>
          </div>
          
           {/* Libero Input */}
           <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-xs font-bold text-yellow-500">自由 (L)</span>
              <input 
                  type="tel" 
                  value={opLibero} 
                  onChange={(e) => handleLiberoChange(false, e.target.value)}
                  placeholder="L"
                  className="w-16 text-center border border-yellow-900/50 bg-yellow-900/20 rounded-lg p-2 text-white focus:border-yellow-500 focus:outline-none text-xl font-bold"
              />
          </div>
        </section>

        {/* THE NET (Divider) */}
        <div className="h-4 bg-[#111] flex items-center justify-center relative overflow-hidden">
            <div className="w-full h-[2px] bg-white/30"></div>
            <div className="absolute bg-[#111] px-4 text-[10px] text-white/50 font-bold tracking-widest uppercase border border-white/20 rounded-full">
                NET / 網子
            </div>
        </div>

        {/* 2. My Team (BOTTOM) */}
        <section className="p-4 bg-neutral-900/50">
          <div className="bg-neutral-900 p-2 rounded-xl border border-neutral-800/50">
             <div className="text-[10px] text-accent text-center mb-1 font-bold">前排 (Front / Net)</div>
             <div className="grid grid-cols-3 gap-2">
                 {[4, 3, 2].map(pos => renderInput(true, pos))}
             </div>
             
             <div className="my-2"></div>
             
             <div className="grid grid-cols-3 gap-2">
                 {[5, 6, 1].map(pos => renderInput(true, pos))}
             </div>
             <div className="text-[10px] text-gray-500 text-center mt-1 font-bold">後排 (Back)</div>
          </div>

          {/* Libero Input */}
           <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-xs font-bold text-yellow-500">自由 (L)</span>
              <input 
                  type="tel" 
                  value={myLibero} 
                  onChange={(e) => handleLiberoChange(true, e.target.value)}
                  placeholder="L"
                  className="w-16 text-center border border-yellow-900/50 bg-yellow-900/20 rounded-lg p-2 text-white focus:border-yellow-500 focus:outline-none text-xl font-bold"
              />
          </div>

          <div className="flex items-center gap-2 mt-4">
            <span className="w-2 h-6 bg-accent rounded-sm shrink-0"></span>
             <input 
                type="text" 
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                className="w-full bg-white border border-gray-300 text-center py-2 rounded-lg text-black focus:border-accent focus:outline-none placeholder-gray-400 font-bold shadow-sm"
                placeholder="輸入我方球隊"
            />
          </div>
        </section>

        {/* First Serve Selection */}
        <section className="px-4 py-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
             <h3 className="text-sm text-gray-400 font-bold mb-2 text-center uppercase tracking-wider">先發球權</h3>
             <div className="grid grid-cols-2 gap-4">
                 <button
                    onClick={() => setFirstServe('me')}
                    className={`py-3 rounded-lg font-bold border-2 transition-all ${
                        firstServe === 'me' 
                        ? 'bg-accent border-accent text-white' 
                        : 'bg-neutral-800 border-neutral-700 text-gray-500'
                    }`}
                 >
                    {myName || '我方'} 發球
                 </button>
                 <button
                    onClick={() => setFirstServe('op')}
                    className={`py-3 rounded-lg font-bold border-2 transition-all ${
                        firstServe === 'op' 
                        ? 'bg-red-600 border-red-600 text-white' 
                        : 'bg-neutral-800 border-neutral-700 text-gray-500'
                    }`}
                 >
                    {opName || '對手'} 發球
                 </button>
             </div>
        </section>

      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-neutral-900 border-t border-neutral-800 flex flex-col items-center z-50 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {errorMsg && (
          <div className="w-full mb-3 bg-red-900/80 backdrop-blur border border-red-500 text-white px-4 py-3 rounded-lg text-sm text-center font-bold animate-pulse shadow-lg flex items-center justify-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {errorMsg}
          </div>
        )}
        <button 
          onClick={startGame}
          disabled={!!errorMsg}
          className={`w-full max-w-[400px] font-bold py-4 rounded-xl text-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2
            ${errorMsg 
              ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700' 
              : 'bg-accent hover:bg-blue-600 text-white shadow-blue-900/50'
            }`}
        >
          開始比賽
        </button>
      </div>
    </div>
  );
};
