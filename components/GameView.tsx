
import React, { useState, useRef, useEffect } from 'react';
import { Lineup, TeamConfig, LogEntry, Position, ActionType, ActionQuality, ResultType, Coordinate, TeamSide, SavedGame, GameState, RoleMapping } from '../types';
import { Court } from './Court';
import { StatsOverlay } from './StatsOverlay';

interface GameViewProps {
  teamConfig: TeamConfig;
  currentSet: number;
  mySetWins: number;
  opSetWins: number;
  initialMyLineup: Lineup;
  initialOpLineup: Lineup;
  initialMyRoles: RoleMapping;
  initialOpRoles: RoleMapping;
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
  onToggleFullScreen: () => void;
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
  initialMyRoles,
  initialOpRoles,
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
  onExit,
  onToggleFullScreen
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

  // Score Adjustment Modal State
  const [scoreAdjTarget, setScoreAdjTarget] = useState<{side: TeamSide, anchor: DOMRect} | null>(null);

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
      // Manual score adjustment with negative check
      const currentScore = isMyTeam ? myScore : opScore;
      if (currentScore + delta < 0) return; // Prevent negative score

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
          position: 1 as Position, 
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
    setScoreAdjTarget(null);
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
          // Fix: Type casting to ensure TS knows this key exists on Lineup
          const posIndex = subTarget.pos as Position;
          currentLineup[posIndex] = subNumber;
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
    // Logic: If 'L', get libero number. If Position (number), get from lineup.
    const playerNumber = selectedPos === 'L' 
        ? (isMyTeam ? initialMyLibero : initialOpLibero) 
        : (selectedPos ? lineup[selectedPos as Position] : '?');

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
          myRoles: initialMyRoles, opRoles: initialOpRoles, 
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

  // BIG Score Card (Interactive)
  const BigScoreCard = ({ score, side }: { score: number, side: TeamSide }) => {
      const handleClick = (e: React.MouseEvent) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setScoreAdjTarget({ side, anchor: rect });
      };

      return (
        <button 
            onClick={handleClick}
            className="relative bg-neutral-800 border border-neutral-600 rounded-lg h-full aspect-[4/3] min-w-[50px] flex items-center justify-center shadow-[0_4px_0_rgba(0,0,0,0.5)] overflow-hidden shrink-0 mx-1 active:translate-y-1 transition-transform"
        >
            {/* Shine effect */}
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/5 pointer-events-none"></div>
            {/* Middle Line */}
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-black/60 w-full z-10"></div>
            <span className="font-mono font-black text-white relative z-0 leading-none tracking-tighter text-4xl md:text-5xl lg:text-6xl">
                {score.toString().padStart(2, '0')}
            </span>
        </button>
      );
  };

  // Compact Header Button
  const HeaderBtn = ({ onClick, children, disabled = false, color = 'neutral' }: any) => {
      const bgColors: any = {
          neutral: 'bg-neutral-700 hover:bg-neutral-600 border-neutral-600',
          accent: 'bg-accent hover:bg-blue-600 border-blue-400',
          red: 'bg-red-600 hover:bg-red-500 border-red-400',
          green: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400',
          purple: 'bg-purple-600 hover:bg-purple-500 border-purple-400'
      };
      
      return (
        <button 
            onClick={onClick}
            disabled={disabled}
            className={`h-full px-2 min-w-[36px] flex items-center justify-center rounded-md border-b-2 active:border-b-0 active:translate-y-[2px] transition-all
                ${bgColors[color]} text-white disabled:opacity-30 disabled:cursor-not-allowed shrink-0 p-1`}
        >
             <div className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center">
                {children}
             </div>
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

  // 全螢幕選項選單
  const renderOptionsMenu = () => (
      <div className="absolute inset-0 z-[100] bg-neutral-900/95 backdrop-blur flex flex-col p-6 animate-fade-in pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-2xl font-black text-white">選項</h2>
              <button onClick={() => setShowOptions(false)} className="bg-neutral-800 p-2 px-4 rounded-full text-white font-bold text-sm">✕ 關閉</button>
          </div>
          
          <div className="grid grid-cols-2 gap-3 flex-1 overflow-y-auto pb-4">
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
                  icon="⛶" 
                  title="全螢幕" 
                  desc="切換顯示模式" 
                  onClick={() => { onToggleFullScreen(); setShowOptions(false); }} 
              />
              <OptionBtn 
                  icon="🏁" 
                  title="Next Set" 
                  desc="結束本局" 
                  color="purple"
                  onClick={() => { onNewSet(); setShowOptions(false); }} 
              />
              <OptionBtn 
                  icon="🏠" 
                  title="回到首頁" 
                  desc="暫離比賽" 
                  color="neutral"
                  onClick={() => { onExit(); setShowOptions(false); }} 
              />
          </div>
      </div>
  );
  
  // Score Adjustment Popover
  const renderScoreAdjModal = () => {
      if (!scoreAdjTarget) return null;
      
      const { side, anchor } = scoreAdjTarget;
      // Calculate position relative to viewport
      // Position clearly below the button, centered horizontally on it
      const top = anchor.bottom + 10;
      const left = anchor.left + (anchor.width / 2);
      const isMyTeam = side === 'me';

      return (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setScoreAdjTarget(null)}></div>
            <div 
                className="fixed z-[70] flex flex-col gap-2 bg-neutral-800 p-2 rounded-xl border border-neutral-600 shadow-2xl animate-fade-in origin-top"
                style={{ top: top, left: left, transform: 'translateX(-50%)' }}
            >
                <div className="text-white text-xs font-bold text-center mb-1">手動調整</div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => { handleScoreAdjust(isMyTeam, 1); }}
                        className="w-12 h-12 bg-green-600 hover:bg-green-500 rounded-lg text-white font-black text-2xl shadow flex items-center justify-center active:scale-95 active:brightness-110"
                    >
                        +
                    </button>
                    <button 
                        onClick={() => { handleScoreAdjust(isMyTeam, -1); }}
                        className="w-12 h-12 bg-red-600 hover:bg-red-500 rounded-lg text-white font-black text-2xl shadow flex items-center justify-center active:scale-95 active:brightness-110"
                    >
                        -
                    </button>
                </div>
                <button onClick={() => setScoreAdjTarget(null)} className="mt-1 w-full py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-xs font-bold text-gray-300">確認</button>
            </div>
          </>
      );
  };
  
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
      // Fix: Strictly check types or convert to string for comparison to avoid TS build errors
      const isActive = activeSide === side && String(selectedPos) === pos;
      const isLibero = pos === 'L';
      
      const handleTouchOrClick = () => {
         const numericPos = pos === 'L' ? 'L' : parseInt(pos) as Position;
         handlePlayerDown(side, numericPos);
      };

      const handleRelease = () => {
          const numericPos = pos === 'L' ? 'L' : parseInt(pos) as Position;
          handlePlayerUp(side, numericPos);
      }

      return (
        <button
            key={`${side}-${pos}`}
            onMouseDown={handleTouchOrClick}
            onMouseUp={handleRelease}
            onTouchStart={handleTouchOrClick}
            onTouchEnd={handleRelease}
            className={`w-full aspect-square mb-1 rounded-md flex flex-col items-center justify-center transition-all border select-none
                ${isActive ? 'scale-105 shadow ring-2 ring-white z-10' : 'hover:bg-neutral-600'}
                ${isLibero 
                    ? (isActive ? 'bg-yellow-400 text-black border-yellow-200' : 'bg-yellow-600 text-black border-transparent opacity-90')
                    : isActive 
                        ? (side === 'me' ? 'bg-accent text-white border-white' : 'bg-red-500 text-white border-white')
                        : 'bg-neutral-700 text-gray-300 border-transparent'}
            `}
        >
            <span className="font-black leading-none text-base md:text-xl">{num}</span>
            <span className="opacity-70 font-bold leading-none mt-[1px] text-[10px] md:text-xs">{pos}</span>
        </button>
      );
  };

  return (
    // SAFE ZONE WRAPPER: Maximized for Mobile (Full Width/Height)
    <div className="w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <div className="w-full h-full md:w-[95%] md:h-[95%] bg-neutral-900 border md:border-neutral-800 md:rounded-2xl flex flex-row overflow-hidden relative select-none shadow-2xl">
      
            {/* 1. LEFT COLUMN: Rosters (14% Width) - Added min-width to prevent squishing */}
            <div 
                className="bg-neutral-800 border-r border-neutral-700 flex flex-row shrink-0 z-20 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] w-[14%] min-w-[64px]"
            >
                <div className="flex-1 flex flex-col items-center py-1 px-0.5 border-r border-neutral-700/50 bg-neutral-800/50 overflow-y-auto no-scrollbar pt-2">
                    <div className="text-accent font-bold mb-0.5 text-xs md:text-sm">我方</div>
                    {Object.entries(initialMyLineup).map(([pos, num]) => renderSidebarItem('me', pos, num as string))}
                    <div className="my-0.5 w-full h-[1px] bg-white/10"></div>
                    {renderSidebarItem('me', 'L', initialMyLibero)}
                </div>
                <div className="flex-1 flex flex-col items-center py-1 px-0.5 overflow-y-auto no-scrollbar pt-2">
                    <div className="text-red-500 font-bold mb-0.5 text-xs md:text-sm">對手</div>
                    {Object.entries(initialOpLineup).map(([pos, num]) => renderSidebarItem('op', pos, num as string))}
                    <div className="my-0.5 w-full h-[1px] bg-white/10"></div>
                    {renderSidebarItem('op', 'L', initialOpLibero)}
                </div>
            </div>

            {/* 2. CENTER COLUMN: Header + Court */}
            <div className="flex-1 flex flex-col relative bg-[#222] min-w-0 overflow-hidden">
                
                {/* HEADER (18% Height) */}
                <div className="h-[18%] min-h-[64px] bg-neutral-800 border-b border-neutral-700 shrink-0 z-30 shadow-lg relative grid grid-cols-[auto_1fr_auto] items-center px-1 py-1">
                    
                    {/* LEFT BUTTONS */}
                    <div className="flex gap-1 pr-2">
                        <HeaderBtn onClick={onExit} color="neutral">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        </HeaderBtn>
                        <HeaderBtn onClick={onUndo} disabled={!canUndo} color="neutral">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
                        </HeaderBtn>
                    </div>

                    {/* CENTER SCOREBOARD */}
                    <div className="flex items-center justify-center gap-1 min-w-0">
                         {/* My Name */}
                         <div className="flex flex-col items-end justify-center min-w-0 flex-1">
                            <span className={`w-2 h-2 rounded-full mb-1 ${servingTeam === 'me' ? 'bg-accent animate-pulse' : 'bg-transparent'}`}></span>
                            <span className={`font-black truncate w-full text-right text-lg md:text-3xl leading-none ${servingTeam === 'me' ? 'text-accent' : 'text-gray-300'}`}>
                                {teamConfig.myName}
                            </span>
                         </div>
                         
                         {/* My Score */}
                         <BigScoreCard score={myScore} side="me" />
                         
                         {/* Sets Info */}
                         <div className="flex flex-col items-center justify-center shrink-0 w-[50px] md:w-[60px] gap-1 mx-1">
                            <span className="text-gray-500 font-bold border border-gray-600 px-1 py-0.5 rounded bg-neutral-900 text-[10px] md:text-xs whitespace-nowrap w-full text-center">SET {currentSet}</span>
                            <div className="flex items-center justify-center w-full bg-neutral-900 border border-gray-600 rounded h-[24px]">
                                <span className="text-gray-300 font-bold text-base leading-none">{mySetWins}</span>
                                <span className="text-gray-500 font-bold text-xs mx-1">-</span>
                                <span className="text-gray-300 font-bold text-base leading-none">{opSetWins}</span>
                            </div>
                        </div>

                         {/* Op Score */}
                         <BigScoreCard score={opScore} side="op" />

                         {/* Op Name */}
                         <div className="flex flex-col items-start justify-center min-w-0 flex-1">
                            <span className={`w-2 h-2 rounded-full mb-1 ${servingTeam === 'op' ? 'bg-red-500 animate-pulse' : 'bg-transparent'}`}></span>
                            <span className={`font-black truncate w-full text-left text-lg md:text-3xl leading-none ${servingTeam === 'op' ? 'text-red-500' : 'text-gray-300'}`}>
                                {teamConfig.opName}
                            </span>
                         </div>
                    </div>

                    {/* RIGHT BUTTONS */}
                    <div className="flex gap-1 pl-2">
                        <HeaderBtn onClick={onRedo} disabled={!canRedo} color="neutral">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg>
                        </HeaderBtn>
                         <HeaderBtn onClick={onToggleFullScreen} color="neutral">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
                        </HeaderBtn>
                    </div>

                </div>

                {/* COURT AREA - Scales perfectly because parents have strict % and flex-1 */}
                <div className="flex-1 relative w-full min-h-0">
                    <div className="absolute inset-0 overflow-hidden flex items-center justify-center bg-[#333]">
                        {state === 'DRAWING' && (
                            <div className="absolute top-2 left-0 right-0 text-center pointer-events-none z-30">
                                <span className="bg-black/60 text-white px-3 py-1 rounded-full text-[10px] font-bold border border-white/20 animate-pulse shadow-lg backdrop-blur">
                                    請在球場上滑動繪製球路
                                </span>
                            </div>
                        )}
                        <Court 
                            myLineup={initialMyLineup}
                            opLineup={initialOpLineup}
                            myRoles={initialMyRoles}
                            opRoles={initialOpRoles}
                            state={state}
                            activeSide={activeSide}
                            selectedPos={selectedPos}
                            action={selectedAction}
                            onDrawingComplete={handleDrawingComplete}
                            onRotate={handleRotation}
                        />
                    </div>
                </div>
            </div>

            {/* 3. RIGHT COLUMN: Controls (10% Width) - Added min-width and removed Icon */}
            <div 
                className="bg-neutral-800 border-l border-neutral-700 flex flex-col shrink-0 z-20 pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] w-[10%] min-w-[56px]"
            >
                <div className="flex-1 flex flex-col pt-2 h-full">
                    <div className="flex-1 flex flex-col min-h-0">
                        <button onClick={() => handleResult(ResultType.POINT)} disabled={state !== 'RESULT_PENDING'} className={`flex-1 min-h-0 flex flex-col items-center justify-center border-b border-neutral-700 transition-all gap-1 ${state === 'RESULT_PENDING' ? 'bg-emerald-600 text-white opacity-100 hover:bg-emerald-500' : 'bg-neutral-800 text-gray-600 opacity-40 cursor-not-allowed'}`}>
                            <div className="flex flex-col font-black leading-tight text-xl md:text-2xl">
                                <span>得</span>
                                <span>分</span>
                            </div>
                        </button>
                        <button onClick={() => handleResult(ResultType.ERROR)} disabled={state !== 'RESULT_PENDING'} className={`flex-1 min-h-0 flex flex-col items-center justify-center border-b border-neutral-700 transition-all gap-1 ${state === 'RESULT_PENDING' ? 'bg-red-600 text-white opacity-100 hover:bg-red-500' : 'bg-neutral-800 text-gray-600 opacity-40 cursor-not-allowed'}`}>
                            <div className="flex flex-col font-black leading-tight text-xl md:text-2xl">
                                <span>失</span>
                                <span>誤</span>
                            </div>
                        </button>
                        <button onClick={() => handleResult(ResultType.NORMAL)} disabled={state !== 'RESULT_PENDING'} className={`flex-1 min-h-0 flex flex-col items-center justify-center border-b border-neutral-700 transition-all gap-1 ${state === 'RESULT_PENDING' ? 'bg-neutral-600 text-white opacity-100 hover:bg-neutral-500' : 'bg-neutral-800 text-gray-600 opacity-40 cursor-not-allowed'}`}>
                             <div className="flex flex-col font-bold leading-tight text-base md:text-lg">
                                <span>繼</span>
                                <span>續</span>
                            </div>
                        </button>
                    </div>
                    {/* Option Button: Removed Icon, Increased Text Size, Vertical Layout */}
                    <button onClick={() => setShowOptions(true)} className="h-[20%] max-h-[70px] bg-neutral-900 border-t border-neutral-700 text-white font-bold flex flex-col items-center justify-center hover:bg-neutral-800 transition-colors shrink-0">
                        <div className="flex flex-col leading-tight text-gray-400 text-sm md:text-base font-bold">
                                <span>選</span>
                                <span>項</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Modals & Overlays */}
            {renderActionModal()}
            {renderSubModal()}
            {renderScoreAdjModal()}
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
            {/* Save/Load Modals ... (Rest of code is identical) */}
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
    </div>
  );
};
