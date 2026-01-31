
import React, { useState, useEffect } from 'react';
import { Lineup, TeamConfig, Position, TeamSide, PlayerRole, RoleMapping } from '../types';

interface SetupViewProps {
  initialConfig?: TeamConfig;
  initialMyLineup?: Lineup;
  initialOpLineup?: Lineup;
  initialMyRoles?: RoleMapping;
  initialOpRoles?: RoleMapping;
  initialMyLibero?: string;
  initialOpLibero?: string;
  onStart: (config: TeamConfig, myLineup: Lineup, opLineup: Lineup, myRoles: RoleMapping, opRoles: RoleMapping, myLibero: string, opLibero: string, firstServe: TeamSide) => void;
  onInstallApp?: () => void;
  onToggleFullScreen?: () => void;
  isGameActive: boolean;
  onResume: () => void;
  onNewMatch: () => void;
}

const ROLES: {code: PlayerRole, label: string, short: string, color: string, textColor: string}[] = [
    { code: 'S', label: '舉球', short: '舉', color: 'bg-yellow-600', textColor: 'text-white' },
    { code: 'OH', label: '大砲', short: '大', color: 'bg-blue-600', textColor: 'text-white' },
    { code: 'MB', label: '快攻', short: '快', color: 'bg-emerald-600', textColor: 'text-white' },
    { code: 'OP', label: '副攻', short: '副', color: 'bg-red-600', textColor: 'text-white' },
    { code: 'DS', label: '防守', short: '防', color: 'bg-purple-600', textColor: 'text-white' },
    { code: 'L', label: '自由', short: '自', color: 'bg-orange-500', textColor: 'text-black' },
    { code: '?', label: '未知', short: '?', color: 'bg-gray-600', textColor: 'text-white' },
];

const createEmptyLineup = (): Lineup => ({ 4: '', 3: '', 2: '', 5: '', 6: '', 1: '' });
const createEmptyRoles = (): RoleMapping => ({ 1: '?', 2: '?', 3: '?', 4: '?', 5: '?', 6: '?' });

export const SetupView: React.FC<SetupViewProps> = ({ 
  initialConfig, 
  initialMyLineup, 
  initialOpLineup, 
  initialMyRoles,
  initialOpRoles,
  initialMyLibero,
  initialOpLibero,
  onStart,
  onInstallApp,
  onToggleFullScreen,
  isGameActive,
  onResume,
  onNewMatch
}) => {
  const [matchName, setMatchName] = useState(initialConfig?.matchName || '');
  const [myName, setMyName] = useState(initialConfig?.myName || ''); 
  const [opName, setOpName] = useState(initialConfig?.opName || '');
  const [firstServe, setFirstServe] = useState<TeamSide>('me');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Use createEmptyLineup() as fallback if props are missing
  const [myLineup, setMyLineup] = useState<Lineup>(initialMyLineup || createEmptyLineup());
  const [opLineup, setOpLineup] = useState<Lineup>(initialOpLineup || createEmptyLineup());
  
  const [myRoles, setMyRoles] = useState<RoleMapping>(initialMyRoles || createEmptyRoles());
  const [opRoles, setOpRoles] = useState<RoleMapping>(initialOpRoles || createEmptyRoles());

  const [myLibero, setMyLibero] = useState(initialMyLibero || '');
  const [opLibero, setOpLibero] = useState(initialOpLibero || '');

  const [showRoleSelector, setShowRoleSelector] = useState<{isMyTeam: boolean, pos: number} | null>(null);
  
  // NEW: Custom Modal State
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Sync state if props change (Force sync when App.tsx resets state and remounts/updates props)
  useEffect(() => {
    setMatchName(initialConfig?.matchName || '');
    setMyName(initialConfig?.myName || '');
    setOpName(initialConfig?.opName || '');
    setMyLineup(initialMyLineup || createEmptyLineup());
    setOpLineup(initialOpLineup || createEmptyLineup());
    setMyRoles(initialMyRoles || createEmptyRoles());
    setOpRoles(initialOpRoles || createEmptyRoles());
    setMyLibero(initialMyLibero || '');
    setOpLibero(initialOpLibero || '');
  }, [initialConfig, initialMyLineup, initialOpLineup, initialMyRoles, initialOpRoles, initialMyLibero, initialOpLibero]);

  const sanitizeInput = (value: string) => {
      let numericValue = value.replace(/[^0-9]/g, '');
      if (numericValue.length > 2) numericValue = numericValue.slice(0, 2);
      if (numericValue.length > 0 && numericValue.startsWith('0')) return null; 
      return numericValue;
  }

  const handlePlayerChange = (isMyTeam: boolean, pos: string, value: string) => {
    const val = sanitizeInput(value);
    if (val === null) return;

    if (isMyTeam) {
      setMyLineup(prev => ({ ...prev, [parseInt(pos) as Position]: val }));
    } else {
      setOpLineup(prev => ({ ...prev, [parseInt(pos) as Position]: val }));
    }
  };
  
  const handleRoleSelect = (role: PlayerRole) => {
      if (!showRoleSelector) return;
      const { isMyTeam, pos } = showRoleSelector;
      const position = pos as Position;
      
      if (isMyTeam) {
          setMyRoles(prev => ({ ...prev, [position]: role }));
      } else {
          setOpRoles(prev => ({ ...prev, [position]: role }));
      }
      setShowRoleSelector(null);
  };

  const handleLiberoChange = (isMyTeam: boolean, value: string) => {
      const val = sanitizeInput(value);
      if (val === null) return;
      if (isMyTeam) setMyLibero(val);
      else setOpLibero(val);
  }

  const handleTestFill = () => {
    setMatchName('練習賽 G1');
    setMyName('主場隊伍');
    setOpName('客場隊伍');
    setMyLineup({ 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' });
    setOpLineup({ 1: '11', 2: '12', 3: '13', 4: '14', 5: '15', 6: '16' });
    setMyRoles({ 1: 'S', 2: 'OH', 3: 'MB', 4: 'OP', 5: 'OH', 6: 'MB' });
    setOpRoles({ 1: 'OH', 2: 'MB', 3: 'OP', 4: 'S', 5: 'MB', 6: 'OH' });
    setMyLibero('99');
    setOpLibero('88');
  };

  const executeReset = () => {
      console.log("Executing Reset");
      onNewMatch();
      
      // Force clear local state
      setMatchName('');
      setMyName('');
      setOpName('');
      setMyLineup(createEmptyLineup());
      setOpLineup(createEmptyLineup());
      setMyRoles(createEmptyRoles());
      setOpRoles(createEmptyRoles());
      setMyLibero('');
      setOpLibero('');
      setErrorMsg(null);
      
      setShowResetConfirm(false);
  };

  const handleClear = () => {
      if (isGameActive) {
          // Open the custom modal instead of window.confirm
          setShowResetConfirm(true);
      } else {
          // If no game is active, just clear the form fields
          setMatchName('');
          setMyName('');
          setOpName('');
          setMyLineup(createEmptyLineup());
          setOpLineup(createEmptyLineup());
          setMyRoles(createEmptyRoles());
          setOpRoles(createEmptyRoles());
          setMyLibero('');
          setOpLibero('');
          setErrorMsg(null);
      }
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
    return Object.values(lineup).some(val => val.trim() === '');
  };

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
    onStart({ matchName, myName: finalMyName, opName: finalOpName }, myLineup, opLineup, myRoles, opRoles, myLibero, opLibero, firstServe);
  };
  
  const handleConfirmNewMatch = () => {
      // Replaced window.confirm with state update
      setShowResetConfirm(true);
  };

  const renderInput = (isMyTeam: boolean, pos: number) => {
    const currentRoles = isMyTeam ? myRoles : opRoles;
    const role = currentRoles[pos as Position] || '?';
    const roleConfig = ROLES.find(r => r.code === role) || ROLES[ROLES.length - 1];

    return (
    <div key={pos} className="flex flex-col items-center">
        <div className="relative w-full">
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
            <button 
                onClick={() => setShowRoleSelector({isMyTeam, pos})}
                className={`absolute -right-2 -top-2 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-md border border-white/20 hover:scale-110 transition-transform ${roleConfig.color} ${roleConfig.textColor}`}
            >
                {roleConfig.short}
            </button>
        </div>
        <span className="text-[10px] text-gray-500 mt-1">pos {pos}</span>
    </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 relative">
      <div className="flex-1 overflow-y-auto pb-40 pt-[env(safe-area-inset-top)]">
        <div className="p-4 border-b border-neutral-800 space-y-3 relative">
             <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    比賽先發設定
                </h1>
                <div className="flex gap-2">
                    {onToggleFullScreen && (
                        <button onClick={onToggleFullScreen} className="text-[10px] bg-neutral-700 text-gray-300 font-bold px-3 py-1 rounded-full border border-neutral-600 hover:bg-neutral-600 transition-colors">
                            全螢幕
                        </button>
                    )}
                    {onInstallApp && (
                        <button onClick={onInstallApp} className="text-[10px] bg-accent text-white font-bold px-3 py-1 rounded-full animate-pulse shadow-lg hover:bg-blue-600 transition-colors">
                            安裝 APP
                        </button>
                    )}
                    <button onClick={handleClear} className="text-[10px] bg-red-900/50 text-red-200 px-3 py-1 rounded border border-red-800 hover:bg-red-800 hover:text-white transition-colors">
                      清空
                    </button>
                    <button onClick={handleTestFill} className="text-[10px] bg-neutral-800 text-gray-400 px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-colors">
                      測試填入
                    </button>
                </div>
             </div>
            <input type="text" value={matchName} onChange={(e) => setMatchName(e.target.value)} className="w-full bg-neutral-900/60 backdrop-blur-sm border border-neutral-700 text-center py-2 rounded-lg text-white focus:border-accent focus:outline-none placeholder-gray-500" placeholder="輸入比賽名稱 (選填)" />
        </div>

        {/* 1. Opponent Team (TOP) */}
        <section className="p-4 bg-neutral-900/50">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-6 bg-red-600 rounded-sm shrink-0"></span>
            <input type="text" value={opName} onChange={(e) => setOpName(e.target.value)} className="w-full bg-white border border-gray-300 text-center py-2 rounded-lg text-red-600 focus:border-red-600 focus:outline-none placeholder-red-300 font-bold shadow-sm" placeholder="輸入對手球隊" />
          </div>
          <div className="bg-neutral-900 p-2 rounded-xl border border-neutral-800/50">
             <div className="text-[10px] text-gray-500 text-center mb-1 font-bold">後排 (Back)</div>
             <div className="grid grid-cols-3 gap-4 px-2">{[1, 6, 5].map(pos => renderInput(false, pos))}</div>
             <div className="my-2"></div>
             <div className="grid grid-cols-3 gap-4 px-2">{[2, 3, 4].map(pos => renderInput(false, pos))}</div>
             <div className="text-[10px] text-red-500 text-center mt-1 font-bold">前排 (Front / Net)</div>
          </div>
           <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-xs font-bold text-yellow-500">自由 (L)</span>
              <input type="tel" value={opLibero} onChange={(e) => handleLiberoChange(false, e.target.value)} placeholder="L" className="w-16 text-center border border-yellow-900/50 bg-yellow-900/20 rounded-lg p-2 text-white focus:border-yellow-500 focus:outline-none text-xl font-bold" />
          </div>
        </section>

        {/* THE NET */}
        <div className="h-4 bg-[#111] flex items-center justify-center relative overflow-hidden">
            <div className="w-full h-[2px] bg-white/30"></div>
            <div className="absolute bg-[#111] px-4 text-[10px] text-white/50 font-bold tracking-widest uppercase border border-white/20 rounded-full">NET / 網子</div>
        </div>

        {/* 2. My Team (BOTTOM) */}
        <section className="p-4 bg-neutral-900/50">
          <div className="bg-neutral-900 p-2 rounded-xl border border-neutral-800/50">
             <div className="text-[10px] text-accent text-center mb-1 font-bold">前排 (Front / Net)</div>
             <div className="grid grid-cols-3 gap-4 px-2">{[4, 3, 2].map(pos => renderInput(true, pos))}</div>
             <div className="my-2"></div>
             <div className="grid grid-cols-3 gap-4 px-2">{[5, 6, 1].map(pos => renderInput(true, pos))}</div>
             <div className="text-[10px] text-gray-500 text-center mt-1 font-bold">後排 (Back)</div>
          </div>
           <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-xs font-bold text-yellow-500">自由 (L)</span>
              <input type="tel" value={myLibero} onChange={(e) => handleLiberoChange(true, e.target.value)} placeholder="L" className="w-16 text-center border border-yellow-900/50 bg-yellow-900/20 rounded-lg p-2 text-white focus:border-yellow-500 focus:outline-none text-xl font-bold" />
          </div>
          <div className="flex items-center gap-2 mt-4">
            <span className="w-2 h-6 bg-accent rounded-sm shrink-0"></span>
             <input type="text" value={myName} onChange={(e) => setMyName(e.target.value)} className="w-full bg-white border border-gray-300 text-center py-2 rounded-lg text-black focus:border-accent focus:outline-none placeholder-gray-400 font-bold shadow-sm" placeholder="輸入我方球隊" />
          </div>
        </section>

        <section className="px-4 py-2 pb-4">
             <h3 className="text-sm text-gray-400 font-bold mb-2 text-center uppercase tracking-wider">先發球權</h3>
             <div className="grid grid-cols-2 gap-4">
                 <button onClick={() => setFirstServe('me')} className={`py-3 rounded-lg font-bold border-2 transition-all ${firstServe === 'me' ? 'bg-accent border-accent text-white' : 'bg-neutral-800 border-neutral-700 text-gray-500'}`}>{myName || '我方'} 發球</button>
                 <button onClick={() => setFirstServe('op')} className={`py-3 rounded-lg font-bold border-2 transition-all ${firstServe === 'op' ? 'bg-red-600 border-red-600 text-white' : 'bg-neutral-800 border-neutral-700 text-gray-500'}`}>{opName || '對手'} 發球</button>
             </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-neutral-900 border-t border-neutral-800 flex flex-col items-center z-50 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        {errorMsg && (
          <div className="w-full mb-3 bg-red-900/80 backdrop-blur border border-red-500 text-white px-4 py-3 rounded-lg text-sm text-center font-bold animate-pulse shadow-lg flex items-center justify-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            {errorMsg}
          </div>
        )}
        
        {isGameActive ? (
            <div className="w-full max-w-[400px] flex gap-2">
                <button onClick={handleConfirmNewMatch} className="flex-1 bg-neutral-700 text-gray-300 font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 text-sm">結束並新比賽</button>
                <button onClick={onResume} className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 text-xl">繼續比賽</button>
            </div>
        ) : (
            <button onClick={startGame} disabled={!!errorMsg} className={`w-full max-w-[400px] font-bold py-4 rounded-xl text-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${errorMsg ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700' : 'bg-accent hover:bg-blue-600 text-white shadow-blue-900/50'}`}>開始比賽</button>
        )}
      </div>

      {showRoleSelector && (
          <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowRoleSelector(null)}>
              <div className="bg-neutral-800 rounded-2xl p-6 w-full max-w-sm border border-neutral-700 shadow-2xl transform transition-all scale-100" onClick={e => e.stopPropagation()}>
                  <h3 className="text-center text-white font-bold text-xl mb-6">選擇球員角色</h3>
                  <div className="grid grid-cols-3 gap-3">
                      {ROLES.map(role => (
                          <button key={role.code} onClick={() => handleRoleSelect(role.code)} className={`${role.color} ${role.textColor} py-4 rounded-xl font-bold shadow-lg hover:brightness-110 active:scale-95 flex flex-col items-center justify-center gap-1`}>
                              <span className="text-3xl mb-1">{role.short}</span>
                              <span className="text-xs opacity-80">{role.label}</span>
                          </button>
                      ))}
                  </div>
                  <button onClick={() => setShowRoleSelector(null)} className="w-full mt-6 py-3 bg-neutral-700 text-gray-300 rounded-lg font-bold">取消</button>
              </div>
          </div>
      )}

      {/* NEW: Custom Confirmation Modal */}
      {showResetConfirm && (
        <div className="absolute inset-0 z-[150] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowResetConfirm(false)}>
            <div className="bg-neutral-800 rounded-2xl p-6 w-full max-w-xs border border-neutral-700 shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="text-center text-white font-bold text-xl mb-3">結束比賽？</h3>
                <p className="text-center text-gray-400 mb-6 text-sm">
                    確定要結束當前比賽並開始新比賽嗎？<br/>
                    <span className="text-red-400">所有未儲存的紀錄將會遺失。</span>
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowResetConfirm(false)}
                        className="flex-1 py-3 bg-neutral-700 text-gray-300 rounded-lg font-bold hover:bg-neutral-600"
                    >
                        取消
                    </button>
                    <button 
                        onClick={executeReset}
                        className="flex-1 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-500 shadow-lg"
                    >
                        確認結束
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};
