
import React, { useState, useRef } from 'react';
import { Lineup, TeamConfig, LogEntry, Position, ActionType, ActionQuality, ResultType, Coordinate, TeamSide, SavedGame, GameState } from '../types';
import { Court } from './Court';
import { StatsOverlay } from './StatsOverlay';

interface GameViewProps {
  teamConfig: TeamConfig;
  currentSet: number;
  mySetWins: number;
  opSetWins: number;
  initialMyLineup: Lineup;
  initialOpLineup: Lineup;
  initialMyLibero: string;
  initialOpLibero: string;
  myScore: number;
  opScore: number;
  servingTeam: TeamSide;
  logs: LogEntry[];
  onGameAction: (
    newLog: LogEntry | null, 
    scoreUpdate: { myDelta: number, opDelta: number } | null,
    lineupUpdate: { isMyTeam: boolean, newLineup: Lineup, newLibero?: string } | null,
    servingTeamUpdate: TeamSide | null
  ) => void;
  onUndo: () => void;
  onRedo: () => void;
  onLoadGame: (savedState: GameState, config: TeamConfig) => void;
  onNewSet: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExit: () => void;
}

// 狀態機定義
type InteractionState = 'IDLE' | 'PLAYER_SELECTED' | 'DRAWING' | 'RESULT_PENDING';

const SAVE_PREFIX = 'volleyscout_save_';

// Action Dictionary for Chinese translation
const ACTION_LABELS: Record<string, string> = {
    [ActionType.SERVE]: '發球',
    [ActionType.ATTACK]: '攻擊',
    [ActionType.BLOCK]: '攔網',
    [ActionType.DIG]: '接扣',
    [ActionType.SET]: '舉球',
    [ActionType.RECEIVE]: '接發',
};

export const GameView: React.FC<GameViewProps> = ({
  teamConfig,
  currentSet,
  mySetWins,
  opSetWins,
  initialMyLineup,
  initialOpLineup,
  initialMyLibero,
  initialOpLibero,
  myScore,
  opScore,
  servingTeam,
  logs,
  onGameAction,
  onUndo,
  onRedo,
  onLoadGame,
  onNewSet,
  canUndo,
  canRedo,
  onExit
}) => {
  // --- State Machine & Data ---
  const [state, setState] = useState<InteractionState>('IDLE');
  const [activeSide, setActiveSide] = useState<TeamSide>('me'); // 目前操作哪一邊
  const [selectedPos, setSelectedPos] = useState<Position | 'L' | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  
  // Substitution State
  const [showSubModal, setShowSubModal] = useState(false);
  const [subNumber, setSubNumber] = useState('');
  const [subTarget, setSubTarget] = useState<{side: TeamSide, pos: Position | 'L'} | null>(null);

  // 畫線資料 (SVG 座標系)
  const [startCoord, setStartCoord] = useState<Coordinate | null>(null);
  const [endCoord, setEndCoord] = useState<Coordinate | null>(null);

  // UI States
  const [showOptions, setShowOptions] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [savedFiles, setSavedFiles] = useState<{key: string, name: string, date: string}[]>([]);
  const [modalConfig, setModalConfig] = useState<{show: boolean, title: string, message: string, onConfirm?: () => void}>({show: false, title: '', message: ''});

  // Long Press Refs
  const longPressTimer = useRef<number | null>(null);
  const isLongPress = useRef(false);

  // --- Helpers ---
  const getRotatedLineup = (lineup: Lineup): Lineup => ({
      1: lineup[2], 6: lineup[1], 5: lineup[6], 4: lineup[5], 3: lineup[4], 2: lineup[3],
  });

  const handleRotation = (isMyTeam: boolean) => {
    const currentLineup = isMyTeam ? initialMyLineup : initialOpLineup;
    const newLineup = getRotatedLineup(currentLineup);
    onGameAction(null, null, { isMyTeam, newLineup }, null);
  };

  const handleScoreAdjust = (isMyTeam: boolean, delta: number) => {
      // Manual score adjustment
      const scoreUpdate = { 
          myDelta: isMyTeam ? delta : 0, 
          opDelta: !isMyTeam ? delta : 0 
      };
      
      let lineupUpdate = null;
      let newServingTeam = null;

      if (delta > 0) {
        // Winning a point logic
        const pointWinner = isMyTeam ? 'me' : 'op';
        if (pointWinner !== servingTeam) {
            newServingTeam = pointWinner as TeamSide;
            const lineToRotate = pointWinner === 'me' ? initialMyLineup : initialOpLineup;
            lineupUpdate = { isMyTeam: pointWinner === 'me', newLineup: getRotatedLineup(lineToRotate) };
        }
      }

      // Create a manual log entry
      const newLog: LogEntry = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          setNumber: currentSet,
          myScore: isMyTeam ? myScore + delta : myScore,
          opScore: !isMyTeam ? opScore + delta : opScore,
          playerNumber: '', 
          position: 1 as Position, // Use type assertion to avoid "number not assignable to Position" error
          action: ActionType.ATTACK, 
          quality: ActionQuality.NORMAL,
          result: delta > 0 ? ResultType.POINT : ResultType.NORMAL,
          note: `Manual Adjust ${delta > 0 ? '+' : ''}${delta}`,
          servingTeam: newServingTeam || servingTeam
      };

      onGameAction(newLog, scoreUpdate, lineupUpdate, newServingTeam);
  };

  const handleExportCSV = () => {
    // BOM for Excel to read UTF-8 correctly
    const BOM = '\uFEFF';
    const headers = ['Set', 'Timestamp', 'Score (My)', 'Score (Op)', 'Serving', 'Player', 'Position', 'Action', 'Result', 'Note'];
    
    const rows = logs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString('zh-TW', {hour12: false});
      const serving = log.servingTeam === 'me' ? teamConfig.myName : teamConfig.opName;
      const actionName = ACTION_LABELS[log.action] || log.action;
      
      return [
        log.setNumber,
        time,
        log.myScore,
        log.opScore,
        serving,
        log.playerNumber,
        log.position,
        actionName,
        log.result,
        log.note || ''
      ].join(',');
    });

    const csvContent = BOM + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${teamConfig.matchName || 'match'}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowOptions(false);
  };

  const resetFlow = () => {
    setState('IDLE');
    setSelectedPos(null);
    setSelectedAction(null);
    setStartCoord(null);
    setEndCoord(null);
  };

  // --- Input Handlers (Sidebar) ---
  const handlePlayerDown = (side: TeamSide, pos: Position | 'L') => {
    isLongPress.current = false;
    longPressTimer.current = window.setTimeout(() => {
        isLongPress.current = true;
        // Trigger Sub Modal
        setSubTarget({side, pos});
        setSubNumber(''); // Reset input
        setShowSubModal(true);
    }, 1500); // 1.5s long press
  };

  const handlePlayerUp = (side: TeamSide, pos: Position | 'L') => {
      if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
      }
      if (!isLongPress.current) {
          // Normal Click
          handlePlayerSelect(side, pos);
      }
  };

  // --- Step 1: Player Selected (from Sidebar) ---
  const handlePlayerSelect = (side: TeamSide, pos: Position | 'L') => {
    setActiveSide(side);
    setSelectedPos(pos);
    // Move directly to action selection state, which triggers the Modal
    setState('PLAYER_SELECTED');
    
    // Clear previous partial data
    setSelectedAction(null);
    setStartCoord(null);
    setEndCoord(null);
  };

  // --- Substitution Confirm ---
  const handleSubConfirm = () => {
      if (!subTarget || !subNumber.trim()) {
          setShowSubModal(false);
          return;
      }

      const isMyTeam = subTarget.side === 'me';
      const currentLineup = isMyTeam ? { ...initialMyLineup } : { ...initialOpLineup };
      let newLiberoVal = undefined;

      if (subTarget.pos === 'L') {
          newLiberoVal = subNumber;
      } else {
          currentLineup[subTarget.pos] = subNumber;
      }

      // Update state via onGameAction (no log, just update)
      onGameAction(
          null, 
          null, 
          { 
              isMyTeam, 
              newLineup: currentLineup, 
              newLibero: newLiberoVal 
          }, 
          null
      );
      
      setShowSubModal(false);
      setSubTarget(null);
  };

  // --- Step 2: Action Selected (from Modal) ---
  const handleActionSelect = (action: ActionType) => {
    setSelectedAction(action);
    // Modal closes, now we ask user to draw on court
    setState('DRAWING');
  };

  // --- Step 3: Drawing Complete (from Court) ---
  const handleDrawingComplete = (start: Coordinate, end: Coordinate) => {
    setStartCoord(start);
    setEndCoord(end);
    setState('RESULT_PENDING');
  };

  // --- Step 4: Result (Right Panel) ---
  const handleResult = (result: ResultType) => {
    if (!selectedPos || !selectedAction) return;

    const isMyTeam = activeSide === 'me';
    const lineup = isMyTeam ? initialMyLineup : initialOpLineup;
    // Handle Libero number retrieval
    const playerNumber = selectedPos === 'L' 
        ? (isMyTeam ? initialMyLibero : initialOpLibero) 
        : lineup[selectedPos];

    let scoreUpdate: { myDelta: number, opDelta: number } | null = null;
    let newServingTeam: TeamSide | null = null;
    let lineupUpdate = null;

    if (result === ResultType.POINT) {
        // Point: The team that executed the action wins the point
        scoreUpdate = { 
            myDelta: isMyTeam ? 1 : 0, 
            opDelta: !isMyTeam ? 1 : 0 
        }; 
        
        const pointWinner = isMyTeam ? 'me' : 'op';
        if (pointWinner !== servingTeam) {
            newServingTeam = pointWinner;
            const lineToRotate = pointWinner === 'me' ? initialMyLineup : initialOpLineup;
            lineupUpdate = { isMyTeam: pointWinner === 'me', newLineup: getRotatedLineup(lineToRotate) };
        }
    } else if (result === ResultType.ERROR) {
        // Error: The OPPOSING team wins the point
        scoreUpdate = { 
            myDelta: !isMyTeam ? 1 : 0, 
            opDelta: isMyTeam ? 1 : 0 
        };
        
        const pointWinner = !isMyTeam ? 'me' : 'op';
        if (pointWinner !== servingTeam) {
            newServingTeam = pointWinner;
            const lineToRotate = pointWinner === 'me' ? initialMyLineup : initialOpLineup;
            lineupUpdate = { isMyTeam: pointWinner === 'me', newLineup: getRotatedLineup(lineToRotate) };
        }
    }

    const nextMyScore = scoreUpdate ? myScore + scoreUpdate.myDelta : myScore;
    const nextOpScore = scoreUpdate ? opScore + scoreUpdate.opDelta : opScore;

    const newLog: LogEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      setNumber: currentSet,
      myScore: nextMyScore,
      opScore: nextOpScore,
      playerNumber,
      position: selectedPos,
      action: selectedAction,
      quality: ActionQuality.NORMAL, // 簡化流程，預設 Normal
      result: result,
      startCoord: startCoord || undefined,
      endCoord: endCoord || undefined,
      note: isMyTeam ? teamConfig.myName : teamConfig.opName,
      servingTeam: newServingTeam || servingTeam
    };

    onGameAction(newLog, scoreUpdate, lineupUpdate, newServingTeam);
    resetFlow();
  };

  // --- Option Menu Handlers ---
  const handleOpenSave = () => {
    const dateStr = new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }).replace(/\//g, '');
    const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }).replace(/:/g, '');
    setSaveFileName(`${teamConfig.matchName || 'match'}_${dateStr}${timeStr}`);
    setShowSaveModal(true);
  };

  const handleConfirmSave = () => {
    const saveObject: SavedGame = {
      config: teamConfig,
      state: { 
          currentSet, mySetWins, opSetWins, 
          myLineup: initialMyLineup, opLineup: initialOpLineup, 
          myLibero: initialMyLibero, opLibero: initialOpLibero,
          myScore, opScore, servingTeam, logs 
      },
      savedAt: Date.now()
    };
    try {
      localStorage.setItem(`${SAVE_PREFIX}${saveFileName.trim()}`, JSON.stringify(saveObject));
      setShowSaveModal(false);
      setModalConfig({ show: true, title: '成功', message: '儲存完畢' });
    } catch (e) { 
      console.error(e);
      alert('儲存失敗'); 
    }
  };

  const handleLoadList = () => {
      const files: {key: string, name: string, date: string}[] = [];
      for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (typeof key === 'string' && key.startsWith(SAVE_PREFIX)) {
              const name = key.replace(SAVE_PREFIX, '');
              files.push({ key, name, date: '' });
          }
      }
      setSavedFiles(files);
      setShowLoadModal(true);
  };
  
  const handleLoadFile = (key: string) => {
      const data = localStorage.getItem(key);
      if (data) {
          try {
            const parsed = JSON.parse(data);
            onLoadGame(parsed.state, parsed.config);
            setShowLoadModal(false);
            setShowOptions(false);
          } catch (e) {
            console.error(e);
            alert('讀取失敗');
          }
      }
  };

  // --- Renders ---

  // Helper: Flip Card for Score
  const ScoreCard = ({ score }: { score: number }) => (
      <div className="relative bg-neutral-800 border-2 border-neutral-600 rounded-lg px-1 w-16 h-12 flex items-center justify-center shadow-[0_3px_0_rgba(0,0,0,0.5)] overflow-hidden shrink-0 mx-1">
          {/* Shine effect */}
          <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/5 pointer-events-none"></div>
          {/* Middle Line */}
          <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-black/60 w-full z-10"></div>
          <span className="font-mono text-4xl font-black text-white relative z-0 leading-none">
              {score.toString().padStart(2, '0')}
          </span>
      </div>
  );

  // Helper: Control Button in Header (Smaller for controls)
  const HeaderBtn = ({ onClick, children, disabled = false, color = 'neutral', size = 'normal' }: any) => {
      const bgColors: any = {
          neutral: 'bg-neutral-700 hover:bg-neutral-600 border-neutral-600',
          accent: 'bg-accent hover:bg-blue-600 border-blue-400',
          red: 'bg-red-600 hover:bg-red-500 border-red-400',
          green: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400',
          purple: 'bg-purple-600 hover:bg-purple-500 border-purple-400'
      };
      
      const sizeClasses = size === 'small' ? 'w-8 h-8' : 'w-10 h-10';
      
      return (
        <button 
            onClick={onClick}
            disabled={disabled}
            className={`${sizeClasses} flex items-center justify-center rounded-lg border-b-2 active:border-b-0 active:translate-y-[2px] transition-all
                ${bgColors[color]} text-white disabled:opacity-30 disabled:cursor-not-allowed shrink-0`}
        >
            {children}
        </button>
      );
  };
  
  // Option Button Component
  const OptionBtn = ({ onClick, title, desc, icon, color = 'neutral' }: any) => {
      const colors: any = {
          neutral: 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700',
          red: 'bg-red-900/40 border-red-500/30 hover:bg-red-900/60 text-red-400',
          purple: 'bg-purple-900/40 border-purple-500/30 hover:bg-purple-900/60 text-purple-400'
      };
      
      return (
          <button onClick={onClick} className={`${colors[color]} p-3 rounded-xl text-left border flex flex-col justify-center h-full active:scale-95 transition-transform`}>
              <div className="text-xl mb-1">{icon}</div>
              <div className={`text-lg font-bold ${color === 'neutral' ? 'text-white' : ''}`}>{title}</div>
              {desc && <div className="text-xs text-gray-500">{desc}</div>}
          </button>
      );
  };

  // 全螢幕選項選單 (Compact One Page)
  const renderOptionsMenu = () => (
      <div className="absolute inset-0 z-[100] bg-neutral-900/95 backdrop-blur flex flex-col p-6 animate-fade-in pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-2xl font-black text-white">選項</h2>
              <button onClick={() => setShowOptions(false)} className="bg-neutral-800 p-2 px-4 rounded-full text-white font-bold text-sm">✕ 關閉</button>
          </div>
          
          <div className="grid grid-cols-2 gap-3 flex-1">
              <OptionBtn 
                  icon="📊" 
                  title="數據統計" 
                  desc="攻守與落點分析" 
                  onClick={() => { setShowStats(true); setShowOptions(false); }} 
              />
              <OptionBtn 
                  icon="📤" 
                  title="匯出 CSV" 
                  desc="下載 Excel 報表" 
                  onClick={handleExportCSV} 
              />
              <OptionBtn 
                  icon="💾" 
                  title="儲存比賽" 
                  desc="保存進度" 
                  onClick={handleOpenSave} 
              />
              <OptionBtn 
                  icon="📂" 
                  title="讀取紀錄" 
                  desc="載入舊檔" 
                  onClick={handleLoadList} 
              />
              <OptionBtn 
                  icon="🏁" 
                  title="Next Set" 
                  desc="結束本局" 
                  color="purple"
                  onClick={() => { onNewSet(); setShowOptions(false); }} 
              />
              <OptionBtn 
                  icon="🚪" 
                  title="Exit" 
                  desc="結束比賽" 
                  color="red"
                  onClick={() => { onExit(); setShowOptions(false); }} 
              />
          </div>
      </div>
  );
  
  // ... Action Picker, Sub Modal, Sidebar helpers remain same ...
  const renderActionModal = () => {
    if (state !== 'PLAYER_SELECTED') return null;
    const lineup = activeSide === 'me' ? initialMyLineup : initialOpLineup;
    const playerNum = selectedPos === 'L' 
        ? (activeSide === 'me' ? initialMyLibero : initialOpLibero)
        : (selectedPos ? lineup[selectedPos] : '?');

    return (
      <div className="absolute inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-black/20 pointer-events-auto" onClick={resetFlow}></div>
          <div className="absolute bottom-4 left-4 w-52 bg-neutral-800/95 backdrop-blur-md border border-neutral-600 rounded-3xl p-4 shadow-2xl flex flex-col gap-3 pointer-events-auto animate-slide-up" style={{ left: 'max(1rem, env(safe-area-inset-left))' }}>
              <div className="text-center pb-2 border-b border-white/10">
                 <div className="text-4xl font-black text-white">{playerNum}</div>
                 <div className="text-gray-400 text-xs font-bold mt-1">請選擇動作</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                 {[ActionType.SERVE, ActionType.ATTACK, ActionType.BLOCK, ActionType.DIG, ActionType.SET, ActionType.RECEIVE].map(action => (
                    <button key={action} onClick={() => handleActionSelect(action)} className="bg-neutral-700 hover:bg-accent hover:text-white text-gray-200 py-3 rounded-xl font-bold text-lg transition-all active:scale-95 border border-white/5">
                        {ACTION_LABELS[action]}
                    </button>
                 ))}
              </div>
              <button onClick={resetFlow} className="mt-1 py-2 text-gray-500 font-bold hover:text-white transition-colors text-sm">取消</button>
          </div>
      </div>
    );
  };

  const renderSubModal = () => {
      if (!showSubModal || !subTarget) return null;
      return (
        <div className="absolute inset-0 z-[60] bg-black/80 flex items-center justify-center animate-fade-in">
            <div className="bg-neutral-800 p-6 rounded-2xl w-64 shadow-xl border border-neutral-700">
                <h3 className="text-white font-bold text-lg text-center mb-1">球員換人</h3>
                <p className="text-gray-400 text-xs text-center mb-4">更改 {subTarget.side === 'me' ? '我方' : '對方'} P{subTarget.pos} 的背號</p>
                <input type="tel" autoFocus value={subNumber} onChange={(e) => setSubNumber(e.target.value)} className="w-full text-center text-3xl font-black bg-neutral-900 border border-neutral-600 rounded-lg py-3 text-white mb-4 focus:border-accent focus:outline-none" placeholder="#" />
                <div className="flex gap-2">
                    <button onClick={() => setShowSubModal(false)} className="flex-1 py-3 rounded-lg font-bold bg-neutral-700 text-gray-300">取消</button>
                    <button onClick={handleSubConfirm} className="flex-1 py-3 rounded-lg font-bold bg-accent text-white">確認</button>
                </div>
            </div>
        </div>
      );
  }

  const renderSidebarItem = (side: TeamSide, pos: string | 'L', num: string) => {
      const isActive = activeSide === side && selectedPos == pos;
      const isLibero = pos === 'L';
      return (
        <button
            key={`${side}-${pos}`}
            onMouseDown={() => handlePlayerDown(side, pos as Position | 'L')}
            onMouseUp={() => handlePlayerUp(side, pos as Position | 'L')}
            onTouchStart={() => handlePlayerDown(side, pos as Position | 'L')}
            onTouchEnd={() => handlePlayerUp(side, pos as Position | 'L')}
            className={`w-full aspect-square mb-1 rounded-lg flex flex-col items-center justify-center transition-all border select-none
                ${isActive ? 'scale-105 shadow ring-2 ring-white z-10' : 'hover:bg-neutral-600'}
                ${isLibero 
                    ? (isActive ? 'bg-yellow-400 text-black border-yellow-200' : 'bg-yellow-600 text-black border-transparent opacity-90')
                    : isActive 
                        ? (side === 'me' ? 'bg-accent text-white border-white' : 'bg-red-500 text-white border-white')
                        : 'bg-neutral-700 text-gray-300 border-transparent'}
            `}
        >
            <span className="text-sm font-black">{num}</span>
            <span className="text-[8px] opacity-70 font-bold">{pos}</span>
        </button>
      );
  };

  return (
    <div className="w-full h-full bg-neutral-900 flex flex-row overflow-hidden relative select-none">
      
      {/* 1. LEFT COLUMN: Rosters */}
      {/* 使用 style 動態計算寬度，確保背景延伸到瀏海區域 (pl-safe-area) */}
      <div 
        className="bg-neutral-800 border-r border-neutral-700 flex flex-row shrink-0 z-20 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
        style={{ width: 'calc(90px + env(safe-area-inset-left))' }}
      >
          <div className="flex-1 flex flex-col items-center py-2 px-1 border-r border-neutral-700/50 bg-neutral-800/50 overflow-y-auto no-scrollbar pt-[env(safe-area-inset-top)]">
              <div className="text-[10px] text-accent font-bold mb-1">我方</div>
              {Object.entries(initialMyLineup).map(([pos, num]) => renderSidebarItem('me', pos, num as string))}
              <div className="my-1 w-full h-[1px] bg-white/10"></div>
              {renderSidebarItem('me', 'L', initialMyLibero)}
          </div>
          <div className="flex-1 flex flex-col items-center py-2 px-1 overflow-y-auto no-scrollbar pt-[env(safe-area-inset-top)]">
              <div className="text-[10px] text-red-500 font-bold mb-1">對手</div>
              {Object.entries(initialOpLineup).map(([pos, num]) => renderSidebarItem('op', pos, num as string))}
              <div className="my-1 w-full h-[1px] bg-white/10"></div>
              {renderSidebarItem('op', 'L', initialOpLibero)}
          </div>
      </div>

      {/* 2. CENTER COLUMN: TopBar + Court */}
      <div className="flex-1 flex flex-col relative bg-[#222]">
          
          {/* TOP BAR (Header) */}
          {/* 使用 style 處理高度，包含上方的安全區域 */}
          <div 
            className="bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-2 shrink-0 z-30 shadow-lg relative pt-[env(safe-area-inset-top)]"
            style={{ height: 'calc(60px + env(safe-area-inset-top))' }}
          >
              
              {/* LEFT SIDE */}
              <div className="flex-1 flex items-center justify-end gap-1 min-w-0 pr-1">
                  
                  {/* 1. Far Left: Controls & Undo */}
                  <div className="mr-auto flex items-center gap-1">
                     <HeaderBtn onClick={onUndo} disabled={!canUndo} size="small">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
                     </HeaderBtn>
                     <HeaderBtn onClick={() => handleRotation(true)} color="accent" size="small">
                         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                      </HeaderBtn>
                      <div className="flex items-center bg-neutral-900 rounded-lg p-0.5 border border-neutral-700">
                          <HeaderBtn onClick={() => handleScoreAdjust(true, -1)} color="red" size="small">
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
                          </HeaderBtn>
                          <HeaderBtn onClick={() => handleScoreAdjust(true, 1)} color="green" size="small">
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                          </HeaderBtn>
                      </div>
                  </div>

                  {/* 2. Team Name (Next to Score) */}
                  <div className="flex flex-col items-end min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-1 justify-end w-full">
                           <span className={`w-2 h-2 rounded-full shrink-0 ${servingTeam === 'me' ? 'bg-accent animate-pulse' : 'bg-transparent'}`}></span>
                           <span className={`text-2xl font-black truncate ${servingTeam === 'me' ? 'text-accent' : 'text-gray-300'}`}>{teamConfig.myName}</span>
                      </div>
                  </div>

                  {/* 3. Score (Next to Center SET) */}
                  <ScoreCard score={myScore} />
              </div>

              {/* CENTER: SET */}
              <div className="flex flex-col items-center justify-center shrink-0 mx-1">
                  <span className="text-[10px] text-gray-500 font-bold border border-gray-600 px-1 rounded bg-neutral-900/50">SET {currentSet}</span>
              </div>

              {/* RIGHT SIDE */}
              <div className="flex-1 flex items-center justify-start gap-1 min-w-0 pl-1">
                  
                  {/* 1. Score (Next to Center SET) */}
                  <ScoreCard score={opScore} />

                  {/* 2. Team Name (Next to Score) */}
                  <div className="flex flex-col items-start min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-1 w-full">
                           <span className={`text-2xl font-black truncate ${servingTeam === 'op' ? 'text-red-500' : 'text-gray-300'}`}>{teamConfig.opName}</span>
                           <span className={`w-2 h-2 rounded-full shrink-0 ${servingTeam === 'op' ? 'bg-red-500 animate-pulse' : 'bg-transparent'}`}></span>
                      </div>
                  </div>

                  {/* 3. Far Right: Controls & Redo */}
                  <div className="ml-auto flex items-center gap-1">
                       <div className="flex items-center bg-neutral-900 rounded-lg p-0.5 border border-neutral-700">
                          <HeaderBtn onClick={() => handleScoreAdjust(false, 1)} color="green" size="small">
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                          </HeaderBtn>
                          <HeaderBtn onClick={() => handleScoreAdjust(false, -1)} color="red" size="small">
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
                          </HeaderBtn>
                      </div>
                      <HeaderBtn onClick={() => handleRotation(false)} color="red" size="small">
                         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                      </HeaderBtn>
                      <HeaderBtn onClick={onRedo} disabled={!canRedo} size="small">
                         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg>
                      </HeaderBtn>
                  </div>

              </div>
          </div>

          {/* COURT AREA */}
          <div className="flex-1 relative overflow-hidden">
              {state === 'DRAWING' && (
                  <div className="absolute top-2 left-0 right-0 text-center pointer-events-none z-30">
                      <span className="bg-black/60 text-white px-3 py-1 rounded-full text-xs font-bold border border-white/20 animate-pulse shadow-lg backdrop-blur">
                          請在球場上滑動繪製球路
                      </span>
                  </div>
              )}
              <Court 
                  myLineup={initialMyLineup}
                  opLineup={initialOpLineup}
                  state={state}
                  activeSide={activeSide}
                  selectedPos={selectedPos}
                  action={selectedAction}
                  onDrawingComplete={handleDrawingComplete}
              />
          </div>
      </div>

      {/* 3. RIGHT COLUMN: Controls */}
      {/* 使用 style 動態計算寬度，確保背景延伸到安全區域 (pr-safe-area) */}
      <div 
        className="bg-neutral-800 border-l border-neutral-700 flex flex-col shrink-0 z-20 pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)]"
        style={{ width: 'calc(80px + env(safe-area-inset-right))' }}
      >
          <div className="flex-1 flex flex-col pt-[env(safe-area-inset-top)] h-full">
             <div className="flex-1 flex flex-col min-h-0">
                <button onClick={() => handleResult(ResultType.POINT)} disabled={state !== 'RESULT_PENDING'} className={`flex-1 min-h-0 flex flex-col items-center justify-center border-b border-neutral-700 transition-all ${state === 'RESULT_PENDING' ? 'bg-emerald-600 text-white opacity-100 hover:bg-emerald-500' : 'bg-neutral-800 text-gray-600 opacity-40 cursor-not-allowed'}`}>
                    <span className="text-lg font-black truncate">得分</span>
                    <span className="text-[9px] font-normal uppercase truncate">Point</span>
                </button>
                <button onClick={() => handleResult(ResultType.ERROR)} disabled={state !== 'RESULT_PENDING'} className={`flex-1 min-h-0 flex flex-col items-center justify-center border-b border-neutral-700 transition-all ${state === 'RESULT_PENDING' ? 'bg-red-600 text-white opacity-100 hover:bg-red-500' : 'bg-neutral-800 text-gray-600 opacity-40 cursor-not-allowed'}`}>
                    <span className="text-lg font-black truncate">失誤</span>
                    <span className="text-[9px] font-normal uppercase truncate">Error</span>
                </button>
                <button onClick={() => handleResult(ResultType.NORMAL)} disabled={state !== 'RESULT_PENDING'} className={`flex-1 min-h-0 flex flex-col items-center justify-center border-b border-neutral-700 transition-all ${state === 'RESULT_PENDING' ? 'bg-neutral-600 text-white opacity-100 hover:bg-neutral-500' : 'bg-neutral-800 text-gray-600 opacity-40 cursor-not-allowed'}`}>
                    <span className="text-sm font-bold truncate">繼續</span>
                    <span className="text-[9px] font-normal uppercase truncate">Play On</span>
                </button>
            </div>
            <button onClick={() => setShowOptions(true)} className="h-20 bg-neutral-900 border-t border-neutral-700 text-white font-bold flex flex-col items-center justify-center hover:bg-neutral-800 transition-colors shrink-0">
               <span className="text-2xl">☰</span>
               <span className="text-[9px] mt-1">選項</span>
            </button>
          </div>
      </div>

      {/* Modals & Overlays */}
      {renderActionModal()}
      {renderSubModal()}
      {showOptions && renderOptionsMenu()}
      {showStats && (
        <StatsOverlay 
            logs={logs} 
            teamConfig={teamConfig} 
            myScore={myScore} 
            opScore={opScore} 
            mySetWins={mySetWins} 
            opSetWins={opSetWins} 
            currentSet={currentSet} 
            onBack={() => setShowStats(false)} 
        />
      )}
      
      {/* Save Modal & Load Modal etc */}
      {showSaveModal && (
          <div className="absolute inset-0 z-[110] bg-black/80 flex items-center justify-center">
              <div className="bg-neutral-800 p-6 rounded-xl w-64">
                  <h3 className="text-white font-bold mb-4">儲存檔案</h3>
                  <input type="text" value={saveFileName} onChange={e => setSaveFileName(e.target.value)} className="w-full mb-4 p-2 rounded bg-neutral-700 text-white" />
                  <div className="flex gap-2">
                      <button onClick={() => setShowSaveModal(false)} className="flex-1 bg-gray-600 py-2 rounded text-white font-bold">取消</button>
                      <button onClick={handleConfirmSave} className="flex-1 bg-accent py-2 rounded text-white font-bold">確認</button>
                  </div>
              </div>
          </div>
      )}
      {showLoadModal && (
          <div className="absolute inset-0 z-[110] bg-black/90 p-8 overflow-y-auto">
              <h3 className="text-white font-bold text-xl mb-4">選擇紀錄檔</h3>
              <div className="grid gap-2">
                  {savedFiles.map(f => (
                      <button key={f.key} onClick={() => handleLoadFile(f.key)} className="bg-neutral-800 p-4 rounded text-left text-white border border-neutral-700">
                          {f.name}
                      </button>
                  ))}
                  <button onClick={() => setShowLoadModal(false)} className="mt-4 bg-gray-700 p-4 rounded text-white font-bold">取消</button>
              </div>
          </div>
      )}
      {modalConfig.show && (
          <div className="absolute inset-0 z-[120] bg-black/80 flex items-center justify-center" onClick={() => setModalConfig({...modalConfig, show: false})}>
               <div className="bg-neutral-800 p-6 rounded-xl text-center">
                   <h3 className="text-white font-bold mb-2">{modalConfig.title}</h3>
                   <p className="text-gray-400">{modalConfig.message}</p>
               </div>
          </div>
      )}
    </div>
  );
};
